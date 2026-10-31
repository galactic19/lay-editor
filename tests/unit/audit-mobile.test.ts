import { TextSelection } from 'prosemirror-state';
import { onCleanup, setMedia } from '../setup';
import { findText, flushPromises, makeEditor, selectText } from '../helpers/editor';

const COARSE = '(pointer: coarse)';
const DARK = '(prefers-color-scheme: dark)';
const bar = () => document.querySelector<HTMLElement>('.le-mobile-bar')!;
const barItem = (id: string) => bar().querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!;
const source = () => document.querySelector<HTMLTextAreaElement>('.le-source')!;

function mobileEditor(content = '<p>a</p>') {
  setMedia(COARSE, true);
  const ed = makeEditor({ content });
  ed.focus();
  ed.ui!.flush();
  return ed;
}

describe('audit: mobile keyboard bar', () => {
  it('stays visible while the HTML source textarea has focus, so source view can be closed again', async () => {
    const ed = mobileEditor();
    ed.exec('toggleSourceView');
    await flushPromises();
    expect(document.activeElement).toBe(source());
    expect(bar().hidden).toBe(false);
    expect(barItem('sourceView').getAttribute('aria-pressed')).toBe('true');
    expect(barItem('sourceView').getAttribute('aria-disabled')).toBe('false');

    source().blur();
    await flushPromises();
    expect(bar().hidden).toBe(true);
    source().focus();
    expect(bar().hidden).toBe(false);

    barItem('sourceView').click();
    expect(document.querySelector('.le-source')).toBeNull();
    expect(bar().hidden).toBe(false);
  });

  it('shows the bar when the device turns mobile while source view is open', () => {
    const ed = makeEditor();
    ed.focus();
    ed.exec('toggleSourceView');
    setMedia(COARSE, true);
    expect(ed.root.dataset.mode).toBe('mobile');
    expect(bar().hidden).toBe(false);
  });

  it('passes the bar height as scroll threshold too, so ProseMirror scrolls the caret clear of the bar', () => {
    const ed = mobileEditor();
    const margin = ed.view.someProp('scrollMargin');
    expect(margin).toBeDefined();
    expect(ed.view.someProp('scrollThreshold')).toEqual(margin);
    setMedia(COARSE, false);
    expect(ed.view.someProp('scrollMargin')).toBeUndefined();
    expect(ed.view.someProp('scrollThreshold')).toBeUndefined();
  });

  it('scrolls back to the start after a context switch so the new tools are in view', () => {
    const ed = mobileEditor('<p>text</p><table><tbody><tr><td><p>cell</p></td></tr></tbody></table>');
    bar().scrollLeft = 300;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, findText(ed, 'cell'))));
    ed.ui!.flush();
    expect(bar().querySelector('[data-item]')!.getAttribute('data-item')).toBe('tableAddRowAfter');
    expect(bar().scrollLeft).toBe(0);
  });

  it('follows a theme change right away, also in an open bottom sheet', () => {
    const ed = mobileEditor();
    expect(bar().dataset.theme).toBe('light');
    ed.setTheme('dark');
    expect(bar().dataset.theme).toBe('dark');
    setMedia(DARK, true);
    ed.setTheme('auto');
    expect(bar().dataset.theme).toBe('dark');
    setMedia(DARK, false);
    expect(bar().dataset.theme).toBe('light');

    ed.ui!.openPanelFor('textColor');
    const portals = () => [...document.querySelectorAll<HTMLElement>('.le-sheet, .le-sheet-backdrop')];
    expect(portals()).toHaveLength(2);
    ed.setTheme('dark');
    expect(portals().map((el) => el.dataset.theme)).toEqual(['dark', 'dark']);
  });
});

describe('audit: panel forms validate through the editor, not the browser', () => {
  const form = () => document.querySelector<HTMLFormElement>('.le-dropdown form')!;

  it('applies a link typed without a scheme', () => {
    const ed = makeEditor({ content: '<p>visit</p>' });
    selectText(ed, 'visit');
    ed.ui!.openPanelFor('link');
    form().querySelector<HTMLInputElement>('input[type="url"]')!.value = 'naver.com';
    form().requestSubmit();
    expect(ed.getHTML()).toBe('<p><a href="https://naver.com">visit</a></p>');
    expect(document.querySelector('.le-dropdown')).toBeNull();
  });

  it('inserts an image from a site-relative URL the browser would call invalid', () => {
    const ed = makeEditor();
    ed.ui!.openPanelFor('image');
    form().querySelector<HTMLInputElement>('input[type="url"]')!.value = '/uploads/a.png';
    form().requestSubmit();
    expect(ed.getHTML()).toContain('src="/uploads/a.png"');
  });
});

describe('audit: find scrolls to the match', () => {
  it('scrolls the current match into view even while focus sits in the find panel', () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    onCleanup(() => delete (Element.prototype as Partial<Element>).scrollIntoView);
    const ed = makeEditor({ content: '<p>NEEDLE one</p><p>two</p><p>NEEDLE three</p>' });
    ed.ui!.openPanelFor('findReplace');
    expect(ed.view.hasFocus()).toBe(false);
    const find = document.querySelector<HTMLInputElement>('[data-field="find"]')!;
    find.value = 'needle';
    find.dispatchEvent(new Event('input'));

    document.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
    expect(scrolled.map((el) => el.textContent)).toEqual(['NEEDLE', 'NEEDLE']);
    expect(scrolled.at(-1)).toBe(ed.view.dom.querySelector('.le-find-current'));
    expect(scrolled.at(-1)!.closest('p')!.textContent).toBe('NEEDLE three');

    (document.querySelector('[data-field="replace"]') as HTMLInputElement).value = 'pin';
    document.querySelector<HTMLButtonElement>('[data-action="replaceOne"]')!.click();
    expect(scrolled.at(-1)!.closest('p')!.textContent).toBe('NEEDLE one');
  });
});
