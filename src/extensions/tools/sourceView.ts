import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Editor } from '../../core/Editor';
import { UI_CONTEXTS } from '../../core/types';
import { formatHTML, isTransient } from '../../io/html';
import { c } from '../../ui/classes';
import { h, outsideForms } from '../../ui/dom';
import { defineExtension } from '../factories';

const ITEM_ID = 'sourceView';

/** A node the source text cannot hold (an upload placeholder) and the number of top-level blocks before it. */
interface HeldNode {
  node: PMNode;
  index: number;
}

/** Transient nodes are left out of getHTML(), so applying source text would drop them; note where they were. */
function holdTransient(doc: PMNode): HeldNode[] {
  const held: HeldNode[] = [];
  let index = 0;
  doc.forEach((block) => {
    if (isTransient(block)) {
      held.push({ node: block, index });
      return;
    }
    index += 1;
    // A nested one goes back right after its top-level block.
    block.descendants((node) => {
      const transient = isTransient(node);
      if (transient) held.push({ node, index });
      return !transient;
    });
  });
  return held;
}

function restoreTransient(editor: Editor, held: HeldNode[]): void {
  if (!held.length) return;
  const { tr } = editor.state;
  held.forEach(({ node, index }, i) => tr.insert(tr.doc.resolve(0).posAtIndex(Math.min(index + i, tr.doc.childCount)), node));
  editor.view.dispatch(tr.setMeta('addToHistory', false));
}

/** Where an offset in `before` lands in `after`: it stays put before the changed text and moves with the text after it. */
function mapOffset(before: string, after: string, offset: number): number {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before[start] === after[start]) start++;
  let end = 0;
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  if (offset <= start) return offset;
  // An offset inside the changed text goes to the end of its replacement.
  return Math.max(offset, before.length - end) + after.length - before.length;
}

/** The raw HTML textarea shown in place of the content while the source view is on. */
class SourceEditor {
  private readonly textarea: HTMLTextAreaElement;
  /** The text the document matches; any other textarea value is an edit not applied yet. */
  private synced = '';
  private applying = false;

  constructor(private readonly editor: Editor) {
    this.textarea = outsideForms(
      h('textarea', {
        class: c('source'),
        attrs: { spellcheck: 'false', 'aria-label': editor.t('a11y.sourceEditor') },
        // Apply as the user types so getHTML(), onChange and form submits always see the source edits.
        on: { input: () => this.apply() },
      }),
    );
    this.update(editor.view);
    editor.content.hidden = true;
    editor.content.after(this.textarea);
    // Tells EditorUI to disable every other control while the HTML is edited directly.
    editor.root.dataset.lockedExcept = ITEM_ID;
    this.textarea.focus();
  }

  /**
   * Follows the editor: read-only mode locks the text, and changes made elsewhere (setHTML, finished uploads)
   * show up with the caret kept on the same text.
   */
  update(view: EditorView, prev?: EditorState): void {
    this.textarea.readOnly = !view.editable;
    if (this.applying || view.state.doc === prev?.doc) return;
    const { value, selectionStart, selectionEnd } = this.textarea;
    this.synced = this.textarea.value = formatHTML(this.editor.getHTML());
    this.textarea.setSelectionRange(mapOffset(value, this.synced, selectionStart), mapOffset(value, this.synced, selectionEnd));
  }

  /** Leaves the source view; the text is applied only if it was changed after the last sync. */
  close(): void {
    if (this.textarea.value !== this.synced) this.apply();
    delete this.editor.root.dataset.lockedExcept;
    this.textarea.remove();
    this.editor.content.hidden = false;
    this.editor.focus();
  }

  private apply(): void {
    // Read-only text cannot be typed into, but a script or autofill can still set it.
    if (!this.editor.isEditable) {
      this.textarea.value = this.synced;
      return;
    }
    const held = holdTransient(this.editor.state.doc);
    this.applying = true;
    try {
      this.editor.setHTML(this.textarea.value);
      restoreTransient(this.editor, held);
    } finally {
      this.applying = false;
    }
    this.synced = this.textarea.value;
  }
}

const sources = new WeakMap<Editor, SourceEditor>();

function closeSource(editor: Editor): void {
  sources.get(editor)?.close();
  sources.delete(editor);
}

export const sourceView = defineExtension({
  name: 'sourceView',
  commands: ({ editor }) => ({
    toggleSourceView: (): Command => (_state, dispatch) => {
      if (!dispatch) return true;
      if (sources.has(editor)) closeSource(editor);
      else sources.set(editor, new SourceEditor(editor));
      editor.ui?.flush();
      return true;
    },
  }),
  plugins: ({ editor }) => [new Plugin({ view: () => ({ update: (view, prev) => sources.get(editor)?.update(view, prev) }) })],
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
  // Runs before the editor tears down, so pending source edits reach getHTML() and the textarea.
  onCreate: ({ editor }) => editor.on('destroy', () => closeSource(editor)),
});
