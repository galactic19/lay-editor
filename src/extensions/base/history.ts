import { history, redo, undo } from 'prosemirror-history';
import type { EditorState, PluginKey } from 'prosemirror-state';
import { UI_CONTEXTS, type UIItem } from '../../core/types';
import { defineExtension } from '../factories';

/** prosemirror-history keys every history plugin with one PluginKey it does not export; its spec carries it. */
const historyKey = history().spec.key as PluginKey;

/**
 * The same state with an empty undo history. Only the history plugin is dropped and added back:
 * every other plugin keeps its state, so node views (table resizing) are not rebuilt and the
 * unchanged DOM, embeds included, stays in place.
 */
export function withFreshHistory(state: EditorState): EditorState {
  const historyPlugin = historyKey.get(state);
  if (!historyPlugin) return state;
  const { plugins } = state;
  return state.reconfigure({ plugins: plugins.filter((plugin) => plugin !== historyPlugin) }).reconfigure({ plugins });
}

const historyItem = (id: 'undo' | 'redo', shortcut: string): UIItem => ({
  id,
  kind: 'button',
  icon: id,
  label: `toolbar.${id}`,
  command: id,
  shortcut,
  contexts: [...UI_CONTEXTS],
  isEnabled: (editor) => editor.can(id),
});

export const historyExtension = defineExtension({
  name: 'history',
  commands: () => ({ undo: () => undo, redo: () => redo }),
  keymap: () => ({ 'Mod-z': 'undo', 'Mod-y': 'redo', 'Mod-Shift-z': 'redo' }),
  plugins: () => [history()],
  ui: () => [historyItem('undo', 'Mod-z'), historyItem('redo', 'Mod-Shift-z')],
});
