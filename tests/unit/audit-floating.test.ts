import type { Editor } from '../../src/core/Editor';
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
