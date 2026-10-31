import type { Command } from 'prosemirror-state';
import { DEFAULTS } from '../../core/defaults';
import { findParent } from '../../core/state-utils';
import { clampInteger } from '../../io/sanitize';
import { ATTR_BLOCK_TYPES, updateBlockAttr } from './textblockAttr';
import { defineExtension } from '../factories';

const MAX = DEFAULTS.indent.max;
const LIST_ITEMS = new Set(['listItem', 'taskItem']);

const parseIndent = (dom: HTMLElement): number => clampInteger(dom.dataset.indent, 0, MAX);

/** In a list, delegates to the list command; elsewhere changes the indent attribute by `delta`. */
const shift =
  (delta: 1 | -1, listCommand: string, run: (name: string) => boolean): Command =>
  (state, dispatch) => {
    if (findParent(state, (node) => LIST_ITEMS.has(node.type.name))) return dispatch ? run(listCommand) : true;
    return updateBlockAttr('indent', (current: number) => {
      const next = current + delta;
      return next < 0 || next > MAX ? undefined : next;
    })(state, dispatch);
  };

export const indent = defineExtension({
  name: 'indent',
  globalAttributes: [
    {
      types: ATTR_BLOCK_TYPES,
      attrs: {
        indent: { default: 0, parse: parseIndent, render: (value) => ((value as number) > 0 ? { 'data-indent': String(value) } : null) },
      },
    },
  ],
  commands: ({ editor }) => ({
    indent: () => shift(1, 'sinkListItem', (name) => editor.exec(name)),
    outdent: () => shift(-1, 'liftListItem', (name) => editor.exec(name)),
  }),
  keymap: () => ({ 'Mod-]': 'indent', 'Mod-[': 'outdent' }),
  ui: () => [
    { id: 'indent', kind: 'button', icon: 'indent-increase', label: 'toolbar.indent', command: 'indent', shortcut: 'Mod-]', contexts: ['text', 'table'] },
    { id: 'outdent', kind: 'button', icon: 'indent-decrease', label: 'toolbar.outdent', command: 'outdent', shortcut: 'Mod-[', contexts: ['text', 'table'] },
  ],
});
