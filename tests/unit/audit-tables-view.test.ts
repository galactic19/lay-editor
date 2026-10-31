import { TextSelection } from 'prosemirror-state';
import { DEFAULTS } from '../../src/core/defaults';
import { sanitizeHTML } from '../../src/io/sanitize';
import { findText, makeEditor } from '../helpers/editor';

const { maxColspan, maxRowspan, maxColumnWidth } = DEFAULTS.tableLimits;
const cell = (attrs: string): string => `<table><tbody><tr><td ${attrs}><p>a</p></td></tr></tbody></table>`;

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
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(findText(ed, 'b') + 1))));
    ed.view.dispatch(ed.state.tr.insertText('X'));
    expect(() => ed.exec('addColumnAfter')).not.toThrow();
    expect(ed.getHTML()).not.toMatch(/colspan="(0|NaN)"/);
    expect(ed.view.dom.querySelectorAll('tr:last-child td')).toHaveLength(3);
  });
});
