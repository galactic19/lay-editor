import type { Command } from 'prosemirror-state';
import type { Editor } from '../../core/Editor';
import { UI_CONTEXTS } from '../../core/types';
import { c } from '../../ui/classes';
import { defineExtension } from '../factories';

const FULLSCREEN = c('fullscreen');
const SCROLL_LOCK = c('scroll-locked');

const isFullscreen = (editor: Editor): boolean => editor.root.classList.contains(FULLSCREEN);

function setFullscreen(editor: Editor, on: boolean): void {
  editor.root.classList.toggle(FULLSCREEN, on);
  document.documentElement.classList.toggle(SCROLL_LOCK, on);
  editor.ui?.flush();
}

/** Leaves fullscreen; false when it was off, so Escape stays free for other handlers. */
function exitFullscreen(editor: Editor): boolean {
  if (!isFullscreen(editor)) return false;
  setFullscreen(editor, false);
  return true;
}

export const fullscreen = defineExtension({
  name: 'fullscreen',
  commands: ({ editor }) => ({
    toggleFullscreen: (): Command => (_state, dispatch) => {
      if (dispatch) setFullscreen(editor, !isFullscreen(editor));
      return true;
    },
  }),
  ui: () => [
    {
      id: 'fullscreen',
      kind: 'button',
      icon: 'maximize',
      label: 'toolbar.fullscreen',
      command: 'toggleFullscreen',
      contexts: [...UI_CONTEXTS],
      isActive: isFullscreen,
    },
  ],
  // ProseMirror claims every Escape pressed in the editor, so it is handled here, after higher-priority
  // handlers such as the slash menu.
  keymap: ({ editor }) => ({ Escape: () => exitFullscreen(editor) }),
  onCreate: ({ editor }) => {
    // Escape from the toolbar reaches the root unhandled; skip keys another handler used.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) exitFullscreen(editor);
    };
    editor.root.addEventListener('keydown', onKeyDown);
    return () => {
      editor.root.removeEventListener('keydown', onKeyDown);
      if (isFullscreen(editor)) document.documentElement.classList.remove(SCROLL_LOCK);
    };
  },
});
