import type { Command } from 'prosemirror-state';
import { defineExtension } from '../factories';

/** Marks that survive "clear formatting". */
const KEPT_MARKS = new Set(['link']);

export const clearFormat = defineExtension({
  name: 'clearFormat',
  commands: () => ({
    clearFormat: (): Command => (state, dispatch) => {
      const { from, to, empty } = state.selection;
      if (!dispatch) return true;
      const tr = state.tr;
      if (empty) tr.setStoredMarks((state.storedMarks ?? state.selection.$from.marks()).filter((m) => KEPT_MARKS.has(m.type.name)));
      else for (const type of Object.values(state.schema.marks)) if (!KEPT_MARKS.has(type.name)) tr.removeMark(from, to, type);
      dispatch(tr);
      return true;
    },
  }),
  ui: () => [{ id: 'clearFormat', kind: 'button', icon: 'remove-formatting', label: 'toolbar.clearFormat', command: 'clearFormat', contexts: ['text', 'table'] }],
});
