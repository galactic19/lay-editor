import { TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { findText, makeEditor, press } from '../../helpers/editor';

const TABLE = '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

function selectCells(ed: ReturnType<typeof makeEditor>, from: string, to: string): void {
  const $a = ed.state.doc.resolve(findText(ed, from) - 2);
  const $b = ed.state.doc.resolve(findText(ed, to) - 2);
  ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, $a.pos, $b.pos)));
}

function cursorIn(ed: ReturnType<typeof makeEditor>, text: string): void {
  const pos = findText(ed, text);
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(pos))));
}

describe('table', () => {
  it('insertTable creates rows x cols with a header row', () => {
    const ed = makeEditor();
    ed.exec('insertTable', 2, 3);
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(2);
    expect(ed.view.dom.querySelectorAll('th')).toHaveLength(3);
    expect(ed.view.dom.querySelectorAll('td')).toHaveLength(3);
  });

  it('insertTable without header and with defaults', () => {
    const ed = makeEditor();
    ed.exec('insertTable', undefined, undefined, false);
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(3);
    expect(ed.view.dom.querySelectorAll('th')).toHaveLength(0);
  });

  it('merges and splits a cell selection', () => {
    const ed = makeEditor({ content: TABLE });
    selectCells(ed, 'a', 'b');
    expect(ed.exec('mergeCells')).toBe(true);
    expect(ed.getHTML()).toContain('colspan="2"');
    expect(ed.exec('splitCell')).toBe(true);
    expect(ed.getHTML()).not.toContain('colspan');
  });

  it('adds and deletes rows and columns', () => {
    const ed = makeEditor({ content: TABLE });
    cursorIn(ed, 'a');
    ed.exec('addRowAfter');
    ed.exec('addColumnAfter');
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(3);
    expect(ed.view.dom.querySelectorAll('tr:first-child > *')).toHaveLength(3);
    ed.exec('deleteRow');
    ed.exec('deleteColumn');
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(2);
    expect(ed.view.dom.querySelectorAll('tr:first-child > *')).toHaveLength(2);
    ed.exec('deleteTable');
    expect(ed.getHTML()).toBe('');
  });

  it('toggles the header row', () => {
    const ed = makeEditor({ content: TABLE });
    cursorIn(ed, 'a');
    ed.exec('toggleHeaderRow');
    expect(ed.view.dom.querySelectorAll('th')).toHaveLength(2);
  });

  it('setCellBackground validates color and clearCellBackground removes it', () => {
    const ed = makeEditor({ content: TABLE });
    cursorIn(ed, 'a');
    expect(ed.exec('setCellBackground', 'red')).toBe(false);
    expect(ed.exec('setCellBackground', '#ffec99')).toBe(true);
    expect(ed.getHTML()).toContain('<td style="background-color: rgb(255, 236, 153);"><p>a</p></td>');
    ed.exec('clearCellBackground');
    expect(ed.getHTML()).toBe(TABLE);
  });

  it('Tab moves to the next cell', () => {
    const ed = makeEditor({ content: TABLE });
    cursorIn(ed, 'a');
    press(ed, 'Tab');
    expect(ed.state.selection.$from.parent.textContent).toBe('b');
  });

  it('Tab in a list inside a cell indents the list instead', () => {
    const ed = makeEditor({ content: '<table><tbody><tr><td><ul><li><p>x</p></li><li><p>y</p></li></ul></td><td><p>b</p></td></tr></tbody></table>' });
    cursorIn(ed, 'y');
    press(ed, 'Tab');
    expect(ed.getHTML()).toContain('<ul><li><p>x</p><ul><li><p>y</p></li></ul></li></ul>');
  });

  it('table panel inserts the picked size', () => {
    const ed = makeEditor();
    ed.ui!.openPanelFor('table');
    const cells = document.querySelectorAll<HTMLButtonElement>('.le-dropdown [data-rows]');
    expect(cells.length).toBe(100);
    document.querySelector<HTMLButtonElement>('.le-dropdown [data-rows="2"][data-cols="4"]')!.click();
    expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(2);
    expect(ed.view.dom.querySelectorAll('tr:first-child > *')).toHaveLength(4);
    expect(document.querySelector('.le-dropdown')).toBeNull();
  });

  it('registers table context items', () => {
    const ed = makeEditor();
    const ids = [...ed.ui!.registry.values()].filter((i) => i.contexts.includes('table') && !i.contexts.includes('text')).map((i) => i.id);
    expect(ids).toEqual([
      'tableAddRowAfter',
      'tableAddColumnAfter',
      'tableDeleteRow',
      'tableDeleteColumn',
      'tableMerge',
      'tableSplit',
      'tableHeaderRow',
      'tableCellColor',
      'tableDelete',
    ]);
  });
});
