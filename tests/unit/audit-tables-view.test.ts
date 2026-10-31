import { TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { Editor } from '../../src/core/Editor';
import { DEFAULTS } from '../../src/core/defaults';
import { sanitizeHTML } from '../../src/io/sanitize';
import { findText, makeEditor, press, typeText } from '../helpers/editor';

const { maxColspan, maxRowspan, maxColumnWidth } = DEFAULTS.tableLimits;
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
    ['colspan="1e9"', `<td colspan="${maxColspan}">`],
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

  it('and one that starts outside the table is left alone', () => {
    const ed = makeEditor({ content: `<p>intro</p>${TABLE}` });
    selectRange(ed, findText(ed, 'intro') + 1, findText(ed, 'bbbb') + 2);
    expect(ed.state.selection).toBeInstanceOf(TextSelection);
  });
});
