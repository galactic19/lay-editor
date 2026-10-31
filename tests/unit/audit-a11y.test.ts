import { AllSelection } from 'prosemirror-state';
import type { Editor } from '../../src/core/Editor';
import { findKey } from '../../src/extensions/tools/findReplace';
import { focusables } from '../../src/ui/focus';
import { makeEditor, press, selectText } from '../helpers/editor';
import { triggerResize } from '../setup';

const toolbarControl = (ed: Editor, id: string): HTMLButtonElement => ed.root.querySelector<HTMLButtonElement>(`.le-toolbar [data-item="${id}"]`)!;
const dialog = (): HTMLElement => document.querySelector<HTMLElement>('.le-dropdown, .le-sheet')!;

/** Squeezes the toolbar so only `visible` controls fit (each 40px wide); returns the "more" button. */
function squeeze(ed: Editor, visible: number): HTMLButtonElement {
  const bar = ed.root.querySelector<HTMLElement>('.le-toolbar')!;
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => (visible + 1) * 40 });
  Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => Array.from(bar.children).filter((el) => !(el as HTMLElement).hidden).length * 40 });
  triggerResize();
  return bar.querySelector<HTMLButtonElement>('[data-item="more"]')!;
}

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

describe('audit a11y #36: the overflow button follows the editor state', () => {
  const TOOLBAR = ['bold', 'italic', 'underline', 'strike', 'code', 'sourceView'];

  it('is enabled again after setLocale ran while read-only', () => {
    const ed = makeEditor({ toolbar: TOOLBAR });
    ed.setEditable(false);
    ed.setLocale('en');
    ed.setEditable(true);
    const more = squeeze(ed, 4);
    expect(more.hidden).toBe(false);
    expect(more.getAttribute('aria-disabled')).toBe('false');
    more.click();
    expect(dialog()).not.toBeNull();
  });

  it('is disabled while read-only and stays usable when the source view toggle sits inside it', () => {
    const ed = makeEditor({ toolbar: TOOLBAR });
    const more = squeeze(ed, 4);
    ed.setEditable(false);
    expect(more.getAttribute('aria-disabled')).toBe('true');
    ed.setEditable(true);
    ed.exec('toggleSourceView');
    expect(more.getAttribute('aria-disabled')).toBe('false');
    more.click();
    dialog().querySelector<HTMLButtonElement>('[data-item="sourceView"]')!.click();
    expect(ed.root.dataset.lockedExcept).toBeUndefined();
  });
});

describe('audit a11y #34: the image panel file picker works from the keyboard', () => {
  it('is a focusable button in the panel tab cycle that opens the file dialog', () => {
    const ed = makeEditor({ upload: async () => ({ url: 'https://cdn.x/a.png' }) });
    ed.ui!.openPanelFor('image');
    const picker = dialog().querySelector<HTMLButtonElement>('button.le-file-button')!;
    expect(picker).not.toBeNull();
    expect(picker.type).toBe('button');
    expect(focusables(dialog())[0]).toBe(picker);
    expect(document.activeElement).toBe(picker);
    const input = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
    const open = vi.spyOn(input, 'click');
    picker.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('audit a11y #66: mark panels are disabled where the mark cannot apply', () => {
  const MARK_ITEMS = ['textColor', 'highlight', 'link'];
  const LINK = { href: 'https://a.com' };

  it('disables text color, highlight and link inside a code block, and Mod-k opens nothing', () => {
    const ed = makeEditor({ content: '<pre><code>some code</code></pre>' });
    selectText(ed, 'some code');
    ed.ui!.flush();
    for (const id of MARK_ITEMS) expect(toolbarControl(ed, id).getAttribute('aria-disabled')).toBe('true');
    expect(ed.can('setTextColor', '#e03131')).toBe(false);
    expect(ed.can('setHighlight', '#ffec99')).toBe(false);
    expect(ed.can('setLink', LINK)).toBe(false);
    expect(press(ed, 'Mod-k')).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('stays enabled for text, an empty cursor and a selection that also covers a paragraph', () => {
    const ed = makeEditor({ content: '<p>text</p><pre><code>code</code></pre>' });
    selectText(ed, 'text');
    ed.ui!.flush();
    for (const id of MARK_ITEMS) expect(toolbarControl(ed, id).getAttribute('aria-disabled')).toBe('false');
    expect(ed.can('setLink', LINK)).toBe(true);
    ed.view.dispatch(ed.state.tr.setSelection(new AllSelection(ed.state.doc)));
    expect(ed.can('setTextColor', '#e03131')).toBe(true);
    ed.exec('setTextColor', '#e03131');
    expect(ed.getHTML()).toBe('<p><span style="color: rgb(224, 49, 49);">text</span></p><pre><code>code</code></pre>');
  });
});
