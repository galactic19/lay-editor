import { InputRule } from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';
import { TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { defineExtension } from '../factories';

/** Replaces the block range [from, to) with an hr and an empty paragraph, cursor in the paragraph. */
function replaceWithRule(tr: Transaction, schema: Schema, from: number, to: number): Transaction {
  tr.replaceWith(from, to, [schema.nodes.horizontalRule!.create(), schema.nodes.paragraph!.create()]);
  return tr.setSelection(TextSelection.create(tr.doc, from + 2)).scrollIntoView();
}

export const horizontalRule = defineExtension({
  name: 'horizontalRule',
  nodes: { horizontalRule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] } },
  commands: ({ schema }) => ({
    insertHorizontalRule: (): Command => (state, dispatch) => {
      if (!state.selection.$from.parent.isTextblock) return false;
      if (!dispatch) return true;
      const tr = state.tr.deleteSelection();
      const $pos = tr.selection.$from;
      const empty = $pos.parent.content.size === 0;
      const from = empty ? $pos.before() : $pos.after();
      dispatch(replaceWithRule(tr, schema, from, empty ? $pos.after() : from));
      return true;
    },
  }),
  inputRules: ({ schema }) => [
    new InputRule(/^(?:---|___|\*\*\*)$/, (state, match, start) => {
      const $start = state.doc.resolve(start);
      if ($start.parent.type !== schema.nodes.paragraph || $start.parent.textContent.length !== match[0].length - 1) return null;
      return replaceWithRule(state.tr, schema, $start.before(), $start.after());
    }),
  ],
  ui: () => [
    {
      id: 'horizontalRule',
      kind: 'button',
      icon: 'minus',
      label: 'toolbar.horizontalRule',
      command: 'insertHorizontalRule',
      contexts: ['text'],
      slash: { keywords: ['hr', 'divider', 'line', '구분선'] },
    },
  ],
});
