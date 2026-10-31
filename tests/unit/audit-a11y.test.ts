import type { Editor } from '../../src/core/Editor';
import { findKey } from '../../src/extensions/tools/findReplace';
import { makeEditor } from '../helpers/editor';
import { triggerResize } from '../setup';

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
