import type { Command } from 'prosemirror-state';
import type { Editor } from '../../core/Editor';
import { UI_CONTEXTS } from '../../core/types';
import { c } from '../../ui/classes';
import { listen } from '../../ui/dom';
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
      viewToggle: true,
    },
  ],
  // ProseMirror claims every Escape pressed in the editor, so it is handled here, after higher-priority
  // handlers such as the slash menu.
  keymap: ({ editor }) => ({ Escape: () => exitFullscreen(editor) }),
  onCreate: ({ editor }) => {
    /**
     * Escape from the toolbar reaches the root unhandled, and so does Escape on the page itself: read-only content
     * takes no focus, so a click on it leaves focus on the body. Keys another handler used are skipped.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as Node;
      const ours = editor.root.contains(target) || target === document.body || target === document.documentElement;
      if (event.key === 'Escape' && !event.defaultPrevented && ours) exitFullscreen(editor);
    };
    const stop = listen(document, 'keydown', onKeyDown);
    return () => {
      stop();
      if (isFullscreen(editor)) document.documentElement.classList.remove(SCROLL_LOCK);
    };
  },
});
