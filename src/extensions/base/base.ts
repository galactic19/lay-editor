import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { defineExtension } from '../factories';

/** doc, paragraph, text and hard breaks plus ProseMirror's base keymap (lowest priority). */
export const base = defineExtension({
  name: 'base',
  priority: 0,
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  commands: ({ schema }) => {
    const insertBreak: Command = (state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hardBreak!.create()).scrollIntoView());
      return true;
    };
    return { insertHardBreak: () => chainCommands(exitCode, insertBreak) };
  },
  keymap: () => ({ 'Shift-Enter': 'insertHardBreak', 'Mod-Enter': 'insertHardBreak' }),
  plugins: () => [keymap(baseKeymap)],
});
