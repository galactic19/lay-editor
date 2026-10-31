import { findKey } from '../../src/extensions/tools/findReplace';
import { makeEditor } from '../helpers/editor';

const dialog = (): HTMLElement => document.querySelector<HTMLElement>('.le-dropdown, .le-sheet')!;

describe('audit a11y #67: setLocale closes the find panel like Escape', () => {
  it('clears the find highlights and the panel listener when the UI is rebuilt', () => {
    const ed = makeEditor({ content: '<p>abc abc abc</p>' });
    ed.ui!.openPanelFor('findReplace');
    const find = dialog().querySelector<HTMLInputElement>('input[data-field="find"]')!;
    find.value = 'abc';
    find.dispatchEvent(new Event('input'));
    expect(ed.view.dom.querySelectorAll('.le-find-match')).toHaveLength(3);
    ed.setLocale('en');
    expect(document.querySelector('.le-dropdown')).toBeNull();
    expect(findKey.getState(ed.state)!.query).toBe('');
    expect(ed.view.dom.querySelectorAll('.le-find-match')).toHaveLength(0);
  });
});
