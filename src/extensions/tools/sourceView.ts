import type { Command } from 'prosemirror-state';
import type { Editor } from '../../core/Editor';
import { UI_CONTEXTS } from '../../core/types';
import { formatHTML } from '../../io/html';
import { c } from '../../ui/classes';
import { h } from '../../ui/dom';
import { defineExtension } from '../factories';

const ITEM_ID = 'sourceView';
const sources = new WeakMap<Editor, HTMLTextAreaElement>();

function openSource(editor: Editor): void {
  const textarea = h('textarea', { class: c('source'), attrs: { spellcheck: 'false', 'aria-label': editor.t('a11y.sourceEditor') } });
  textarea.value = formatHTML(editor.getHTML());
  editor.content.hidden = true;
  editor.content.after(textarea);
  sources.set(editor, textarea);
  // Tells EditorUI to disable every other control while the HTML is edited directly.
  editor.root.dataset.lockedExcept = ITEM_ID;
  textarea.focus();
}

function closeSource(editor: Editor, textarea: HTMLTextAreaElement): void {
  sources.delete(editor);
  delete editor.root.dataset.lockedExcept;
  textarea.remove();
  editor.content.hidden = false;
  editor.setHTML(textarea.value);
  editor.focus();
}

export const sourceView = defineExtension({
  name: 'sourceView',
  commands: ({ editor }) => ({
    toggleSourceView: (): Command => (_state, dispatch) => {
      if (!dispatch) return true;
      const textarea = sources.get(editor);
      if (textarea) closeSource(editor, textarea);
      else openSource(editor);
      editor.ui?.flush();
      return true;
    },
  }),
  ui: ({ editor }) => [
    {
      id: ITEM_ID,
      kind: 'button',
      icon: 'code-xml',
      label: 'toolbar.sourceView',
      command: 'toggleSourceView',
      contexts: [...UI_CONTEXTS],
      isActive: () => sources.has(editor),
    },
  ],
  onCreate: ({ editor }) =>
    // Runs before the editor tears down, so pending source edits reach getHTML() and the textarea.
    editor.on('destroy', () => {
      const textarea = sources.get(editor);
      if (textarea) closeSource(editor, textarea);
    }),
});
