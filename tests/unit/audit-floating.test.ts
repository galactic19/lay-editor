import type { Editor } from '../../src/core/Editor';
import { h } from '../../src/ui/dom';
import { visibleOr, type Anchor } from '../../src/ui/floating';
import { setMedia, setViewport } from '../setup';
import { makeEditor, typeText } from '../helpers/editor';

const isFullscreen = (ed: Editor): boolean => ed.root.classList.contains('le-fullscreen');

/** A real Escape keydown dispatched on the ProseMirror element, so the view's own key handling runs. */
function pressEscapeInEditor(ed: Editor): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
  ed.view.dom.dispatchEvent(event);
  return event;
}

describe('audit #52: Escape leaves fullscreen while the caret is in the editor', () => {
  it('exits even though ProseMirror prevents the default of every Escape', () => {
    const ed = makeEditor();
    ed.exec('toggleFullscreen');
    const event = pressEscapeInEditor(ed);
    expect(event.defaultPrevented).toBe(true);
    expect(isFullscreen(ed)).toBe(false);
    expect(document.documentElement.classList.contains('le-scroll-locked')).toBe(false);
  });

  it('closes an open slash menu first and exits on the next Escape', () => {
    const ed = makeEditor();
    ed.exec('toggleFullscreen');
    typeText(ed, '/');
    ed.ui!.flush();
    const menu = document.querySelector<HTMLElement>('.le-slash-menu')!;
    expect(menu.hidden).toBe(false);
    pressEscapeInEditor(ed);
    ed.ui!.flush();
    expect(menu.hidden).toBe(true);
    expect(isFullscreen(ed)).toBe(true);
    pressEscapeInEditor(ed);
    expect(isFullscreen(ed)).toBe(false);
  });

  it('leaves Escape alone outside fullscreen', () => {
    const ed = makeEditor();
    pressEscapeInEditor(ed);
    expect(isFullscreen(ed)).toBe(false);
  });
});

describe('audit #29/#59: a panel anchor that hides or goes away hands over to the fallback', () => {
  const rect = (y: number): DOMRect => ({ x: 0, y, left: 0, top: y, right: 10, bottom: y + 10, width: 10, height: 10, toJSON: () => ({}) }) as DOMRect;
  const fallback: Anchor = { getBoundingClientRect: () => rect(300) };

  it('measures the element while it is shown, then the fallback once it is hidden or removed', () => {
    const el = h('button');
    document.body.appendChild(el);
    el.getBoundingClientRect = () => rect(100);
    const shown = vi.spyOn(el, 'getClientRects').mockReturnValue([rect(100)] as unknown as DOMRectList);
    const anchor = visibleOr(el, fallback);
    expect(anchor.contextElement).toBe(el);
    expect(anchor.getBoundingClientRect().top).toBe(100);
    shown.mockReturnValue([] as unknown as DOMRectList);
    expect(anchor.getBoundingClientRect().top).toBe(300);
    shown.mockReturnValue([rect(100)] as unknown as DOMRectList);
    el.remove();
    expect(anchor.getBoundingClientRect().top).toBe(300);
  });
});

describe('audit #45: toasts stay in view whatever the document length', () => {
  const region = () => document.querySelector<HTMLElement>('.le-toasts')!;

  it('renders in a themed body portal, not at the bottom of the editor', () => {
    const ed = makeEditor({ theme: 'dark' });
    ed.ui!.toaster.show('x', 'error');
    expect(region().parentElement).toBe(document.body);
    expect(region().classList.contains('le-portal')).toBe(true);
    expect(region().dataset.theme).toBe('dark');
    expect(ed.root.querySelector('.le-toasts')).toBeNull();
    ed.destroy();
    expect(document.querySelector('.le-toasts')).toBeNull();
  });

  it('sits above the on-screen keyboard and the mobile bar', () => {
    setMedia('(pointer: coarse)', true);
    const ed = makeEditor();
    ed.focus();
    ed.ui!.flush();
    const bar = document.querySelector<HTMLElement>('.le-mobile-bar')!;
    expect(bar.hidden).toBe(false);
    Object.defineProperty(bar, 'offsetHeight', { value: 52 });
    setViewport({ height: window.innerHeight - 300, offsetTop: 0 });
    ed.ui!.toaster.show('x', 'error');
    expect(region().style.getPropertyValue('--le-toast-offset')).toBe('352px');
  });
});

describe('audit #41: tapping the sheet backdrop only closes the sheet', () => {
  it('keeps the press from moving focus and closes on the click, while the backdrop still covers the page', () => {
    setMedia('(pointer: coarse)', true);
    const ed = makeEditor();
    ed.focus();
    ed.ui!.openPanelFor('textColor');
    const backdrop = document.querySelector<HTMLElement>('.le-sheet-backdrop')!;
    const press = new Event('pointerdown', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(document.querySelector('.le-sheet')).not.toBeNull();
    backdrop.click();
    expect(document.querySelector('.le-sheet')).toBeNull();
    expect(ed.view.hasFocus()).toBe(true);
  });
});
