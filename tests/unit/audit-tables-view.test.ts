import { TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { Editor } from '../../src/core/Editor';
import { DEFAULTS } from '../../src/core/defaults';
import { sanitizeHTML } from '../../src/io/sanitize';
import { findText, makeEditor, press, typeText } from '../helpers/editor';

const { maxColspan, maxRowspan, maxColumnWidth, maxFillerCells } = DEFAULTS.tableLimits;
const cell = (attrs: string): string => `<table><tbody><tr><td ${attrs}><p>a</p></td></tr></tbody></table>`;
const caretNear = (ed: Editor, pos: number): void => ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(pos))));
const selectRange = (ed: Editor, anchor: number, head: number): void =>
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, anchor, head)));

describe('audit #22: cell spans are parsed as clamped integers', () => {
  it('a huge colspan no longer materialises thousands of cells', () => {
    const ed = makeEditor();
    ed.setHTML('<table><tr><td colspan="20000">a</td></tr><tr><td>b</td></tr></table>');
    expect(ed.view.dom.querySelectorAll('td')).toHaveLength(maxColspan + 1);
  });

  it.each([
    ['colspan="abc"', '<td>'],
    ['colspan="0"', '<td>'],
    ['colspan="-3"', '<td>'],
    ['colspan="2.5"', '<td colspan="2">'],
    // Browsers read the leading digits only.
    ['colspan="5px"', '<td colspan="5">'],
    ['colspan="1e9"', '<td>'],
    ['colspan="0x10"', '<td>'],
    ['colspan="99999"', `<td colspan="${maxColspan}">`],
    ['rowspan="abc"', '<td>'],
    ['rowspan="70000"', `<td rowspan="${maxRowspan}">`],
    [`data-colwidth="${maxColumnWidth * 10}"`, `<td data-colwidth="${maxColumnWidth}"`],
  ])('sanitizeHTML normalises %s', (attrs, expected) => {
    expect(sanitizeHTML(cell(attrs))).toContain(expected);
  });

  it('malformed spans do not corrupt sibling cells or crash table commands', () => {
    const ed = makeEditor({ content: '<table><tr><td colspan="2.5">a</td></tr><tr><td>b</td></tr></table>' });
    caretNear(ed, findText(ed, 'b') + 1);
    ed.view.dispatch(ed.state.tr.insertText('X'));
    expect(() => ed.exec('addColumnAfter')).not.toThrow();
    expect(ed.getHTML()).not.toMatch(/colspan="(0|NaN)"/);
    expect(ed.view.dom.querySelectorAll('tr:last-child td')).toHaveLength(3);
  });
});

describe('audit #22: tables whose rows would need too many filler cells are read as plain blocks', () => {
  const row = (...cells: string[]): string => `<tr>${cells.join('')}</tr>`;
  const td = (text: string, attrs?: string): string => `<td${attrs ? ` ${attrs}` : ''}><p>${text}</p></td>`;
  const wideTable = (text: string, emptyRows: number): string => `<table>${row(td(text, `colspan="${maxColspan}"`))}${row().repeat(emptyRows)}</table>`;
  const STAIRCASE_ROWS = 6;
  const COLLIDING_ROWS = 12;
  const cellCount = (ed: Editor): number => ed.view.dom.querySelectorAll('td, th').length;
  const writtenCells = (html: string): number => html.match(/<t[dh][ >]/g)?.length ?? 0;
  const texts = (html: string): string[] => Array.from(html.matchAll(/<p>([^<]+)<\/p>/g), (match) => match[1]!);

  it.each([
    ['one wide row and many empty rows', wideTable('wide', 30)],
    ['many tables that each stay under the limit', Array.from({ length: 12 }, (_, i) => wideTable(`table${i}`, 1)).join('')],
    [
      'rowspans that widen every later row',
      `<table>${Array.from({ length: STAIRCASE_ROWS }, (_, i) => row(td(`step${i}`, `colspan="${maxColspan}" rowspan="${STAIRCASE_ROWS - i}"`))).join('')}</table>`,
    ],
    [
      'cells that collide with rowspans from above',
      `<table>${row(td('left', `rowspan="${COLLIDING_ROWS}"`), td('top'), td('right', `rowspan="${COLLIDING_ROWS}"`))}` +
        `${row(td('wide', `colspan="${maxColspan}"`)).repeat(COLLIDING_ROWS - 1)}</table>`,
    ],
  ])('%s', (_, html) => {
    const ed = makeEditor();
    ed.setHTML(html);
    expect(cellCount(ed)).toBeLessThanOrEqual(writtenCells(html) + maxFillerCells);
    for (const text of texts(html)) expect(ed.getText()).toContain(text);
  });

  it('an oversized table nested in a cell is unwrapped inside that cell', () => {
    const ed = makeEditor();
    ed.setHTML(`<table>${row(`<td><p>outer</p>${wideTable('inner', 30)}</td>`)}</table>`);
    expect(ed.view.dom.querySelectorAll('table')).toHaveLength(1);
    expect(ed.getHTML()).toContain('<td><p>outer</p><p>inner</p></td>');
  });

  it('pasting into a table cell cannot grow the table from one rowspan', () => {
    const ed = makeEditor({ content: `<table><tbody>${row(td('cell'), td('next'))}</tbody></table>` });
    caretNear(ed, findText(ed, 'cell') + 1);
    ed.view.pasteHTML(`<table>${row(td('tall', `rowspan="${maxFillerCells + 2}"`))}</table>`);
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(1);
    expect(ed.getText()).toContain('tall');
  });

  it('tables that need a few filler cells, or none, keep their shape', () => {
    const ragged = `<table><tbody>${row(td('a'), td('b'), td('c'))}${row(td('d'))}</tbody></table>`;
    expect(sanitizeHTML(ragged)).toBe(ragged);
    const ed = makeEditor({ content: ragged });
    ed.setHTML(ragged);
    expect(ed.view.dom.querySelectorAll('tr:last-child td')).toHaveLength(3);
  });

  it('a big table with every cell written is not limited', () => {
    const big = `<table>${row(...Array.from({ length: 100 }, () => '<td></td>')).repeat(maxFillerCells / 100 + 1)}</table>`;
    const ed = makeEditor();
    ed.setHTML(big);
    expect(cellCount(ed)).toBe(writtenCells(big));
  });

  it('a table merged in the editor reads back unchanged', () => {
    const ed = makeEditor();
    ed.exec('insertTable', 3, 3);
    const cells: number[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.spec.tableRole?.includes('cell')) cells.push(pos);
    });
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cells[0]!, cells.at(-1)!)));
    expect(ed.exec('mergeCells')).toBe(true);
    const merged = ed.getHTML();
    ed.setHTML(merged);
    expect(ed.getHTML()).toBe(merged);
    expect(ed.view.dom.querySelectorAll('table')).toHaveLength(1);
  });
});

const CELL_ROLES = new Set(['cell', 'header_cell']);

/** [row, column] of the cell holding the caret. */
function caretCell(ed: Editor): [number, number] {
  const { $from } = ed.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if (CELL_ROLES.has($from.node(depth).type.spec.tableRole)) return [$from.index(depth - 2), $from.index(depth - 1)];
  }
  throw new Error('caret is not in a table cell');
}

describe('audit #13/#62: inserting a table puts the caret in the first cell', () => {
  it.each([
    ['an empty document', '', 0],
    ['an empty paragraph after text', '<p>Intro</p><p></p>', 'end'],
    ['the middle of a paragraph', '<p>before after</p>', 'before'.length + 1],
    ['a paragraph followed by more content', '<p>a</p><p>b</p>', 2],
  ] as const)('in %s', (_, content, caret) => {
    const ed = makeEditor({ content });
    const pos = caret === 'end' ? ed.state.doc.content.size - 1 : Math.max(1, caret);
    caretNear(ed, pos);
    ed.exec('insertTable', 3, 3);
    expect(caretCell(ed)).toEqual([0, 0]);
  });

  it('typing then Tab fills the header row from the left', () => {
    const ed = makeEditor();
    ed.exec('insertTable', 2, 2);
    typeText(ed, 'Name');
    press(ed, 'Tab');
    typeText(ed, 'Age');
    expect(ed.getHTML()).toContain('<tr><th><p>Name</p></th><th><p>Age</p></th></tr>');
  });
});

describe('audit #14: column widths reach saved HTML', () => {
  const RESIZED =
    '<table><tbody><tr><th data-colwidth="350"><p>a</p></th><th colspan="2" data-colwidth="0,120"><p>b</p></th></tr>' +
    '<tr><td data-colwidth="350"><p>c</p></td><td><p>d</p></td><td data-colwidth="120"><p>e</p></td></tr></tbody></table>';
  const COLGROUP = '<colgroup><col style="width: 350px;"><col><col style="width: 120px;"></colgroup>';

  it('getHTML writes the first row widths as a colgroup and keeps data-colwidth for re-parsing', () => {
    const ed = makeEditor({ content: RESIZED });
    const html = ed.getHTML();
    expect(html).toContain(`<table>${COLGROUP}<tbody><tr><th data-colwidth="350">`);
    ed.setHTML(html);
    expect(ed.getHTML()).toBe(html);
  });

  it('tables without dragged widths keep the plain output', () => {
    expect(sanitizeHTML(cell(''))).toBe('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
  });

  it('sanitizeHTML and pasting saved HTML keep the widths', () => {
    expect(sanitizeHTML(RESIZED)).toContain(COLGROUP);
    const ed = makeEditor();
    ed.view.pasteHTML(sanitizeHTML(RESIZED));
    expect(ed.getHTML()).toContain(COLGROUP);
  });
});

describe('audit #44: a text selection across cells becomes a cell selection', () => {
  const TABLE = '<table><tbody><tr><td><p>aaaa</p></td><td><p>bbbb</p></td></tr></tbody></table>';

  it('spanning two cells, so Merge works', () => {
    const ed = makeEditor({ content: TABLE });
    selectRange(ed, findText(ed, 'aaaa') + 1, findText(ed, 'bbbb') + 2);
    expect(ed.state.selection).toBeInstanceOf(CellSelection);
    expect(ed.can('mergeCells')).toBe(true);
  });

  it('but a selection that ends at the start of the next cell (triple click) stays in its cell', () => {
    const ed = makeEditor({ content: TABLE });
    selectRange(ed, findText(ed, 'aaaa'), findText(ed, 'bbbb'));
    expect(ed.state.selection).toBeInstanceOf(TextSelection);
    expect(ed.state.selection.$to.parent.textContent).toBe('aaaa');
  });

  it('that keeps growing from the head cell (a handle dragged on) keeps its first cell', () => {
    const ed = makeEditor({ content: '<table><tbody><tr><td><p>aaaa</p></td><td><p>bbbb</p></td><td><p>cccc</p></td></tr></tbody></table>' });
    selectRange(ed, findText(ed, 'aaaa') + 1, findText(ed, 'bbbb') + 2);
    // The cell selection puts the native selection over the head cell, so the drag goes on from its start.
    selectRange(ed, findText(ed, 'bbbb'), findText(ed, 'cccc') + 2);
    expect(ed.state.selection.ranges).toHaveLength(3);
    expect(ed.exec('mergeCells')).toBe(true);
    expect(ed.getHTML()).toContain('<td colspan="3">');
  });

  it('and one that starts outside the table is left alone', () => {
    const ed = makeEditor({ content: `<p>intro</p>${TABLE}` });
    selectRange(ed, findText(ed, 'intro') + 1, findText(ed, 'bbbb') + 2);
    expect(ed.state.selection).toBeInstanceOf(TextSelection);
  });
});
