import { history, redo, undo } from 'prosemirror-history';
import { UI_CONTEXTS, type UIItem } from '../../core/types';
import { defineExtension } from '../factories';

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
