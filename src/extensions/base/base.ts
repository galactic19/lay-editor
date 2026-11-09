import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { defineExtension } from '../factories';

/** doc, paragraph, text and hard breaks, Alt+F10 to the toolbar, plus ProseMirror's base keymap (lowest priority). */
export const base = defineExtension({
  name: 'base',
  priority: 0,
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    // linebreakReplacement: block type changes turn breaks into code newlines and back instead of dropping them.
    hardBreak: { inline: true, group: 'inline', selectable: false, linebreakReplacement: true, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  commands: ({ schema, editor }) => {
    const hardBreak = schema.nodes.hardBreak!;
    // Only where a break may go: forced into text-only content (a caption), it would split the block around it.
    const insertBreak: Command = (state, dispatch) => {
      const { $from } = state.selection;
      if (!$from.parent.canReplaceWith($from.index(), $from.index(), hardBreak)) return false;
      dispatch?.(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
      return true;
    };
    return {
      insertHardBreak: () => chainCommands(exitCode, insertBreak),
      focusToolbar: (): Command => (_state, dispatch) => Boolean(editor.ui?.focusToolbar(!dispatch)),
    };
  },
  keymap: () => ({ 'Shift-Enter': 'insertHardBreak', 'Mod-Enter': 'insertHardBreak', 'Alt-F10': 'focusToolbar' }),
  plugins: () => [keymap(baseKeymap)],
});
