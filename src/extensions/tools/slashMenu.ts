import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import type { Editor } from '../../core/Editor';
import { DEFAULTS } from '../../core/defaults';
import { LEAF_CHAR } from '../../core/state-utils';
import type { UIItem } from '../../core/types';
import { itemLabel, type Translate } from '../../i18n';
import { SlashMenu } from '../../ui/SlashMenu';
import { defineExtension } from '../factories';

export interface SlashState {
  active: boolean;
  /** Position of the trigger character. */
  from: number;
  query: string;
  index: number;
}

type SlashMeta = { type: 'close' } | { type: 'index'; index: number };

export const slashKey = new PluginKey<SlashState>('slashMenu');
const INACTIVE: SlashState = { active: false, from: 0, query: '', index: 0 };
const { trigger, maxItems } = DEFAULTS.slash;

/** Every registered item (dropdown options included) that declares slash keywords. */
export function slashItems(editor: Editor): UIItem[] {
  const all = [...(editor.ui?.registry.values() ?? [])].flatMap((item) => [item, ...(item.options ?? [])]);
  return all.filter((item) => item.slash);
}

export function filterSlashItems(items: UIItem[], query: string, t: Translate): UIItem[] {
  const needle = query.trim().toLowerCase();
  const matches = (item: UIItem): boolean =>
    [itemLabel(t, item), ...(item.slash?.keywords ?? [])].some((text) => text.toLowerCase().includes(needle));
  return items.filter(matches).slice(0, maxItems);
}

export function currentSlashItems(editor: Editor): UIItem[] {
  const state = slashKey.getState(editor.state);
  return state?.active ? filterSlashItems(slashItems(editor), state.query, editor.t) : [];
}

/** Removes the typed "/query" and runs the item. */
export function runSlashItem(editor: Editor, item: UIItem): void {
  const state = slashKey.getState(editor.state);
  if (!state?.active) return;
  const { view } = editor;
  view.dispatch(view.state.tr.delete(state.from, view.state.selection.from).setMeta(slashKey, { type: 'close' } satisfies SlashMeta));
  if (item.kind === 'button') {
    if (item.command) editor.exec(item.command, ...(item.args ?? []));
  } else editor.ui?.openPanelFor(item.id);
}

export function closeSlash(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(slashKey, { type: 'close' } satisfies SlashMeta));
}

/** Starts a menu when the character before the cursor is a trigger at a word boundary. */
function opened(state: EditorState): SlashState | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.spec.code || !$from.parent.isTextblock) return null;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 2), $from.parentOffset, undefined, LEAF_CHAR);
  const atBoundary = before.length === 1 || /\s/.test(before[0]!);
  return before.endsWith(trigger) && atBoundary ? { active: true, from: $from.pos - trigger.length, query: '', index: 0 } : null;
}

/** Keeps an open menu while the cursor stays after the trigger in the same block. */
function continued(prev: SlashState, tr: Transaction, state: EditorState): SlashState {
  const from = tr.mapping.map(prev.from);
  const { $from, empty } = state.selection;
  if (!empty || $from.pos <= from || $from.parent.type.spec.code) return INACTIVE;
  if (state.doc.resolve(from).parent !== $from.parent) return INACTIVE;
  const text = state.doc.textBetween(from, $from.pos, undefined, LEAF_CHAR);
  if (!text.startsWith(trigger) || text.includes(LEAF_CHAR)) return INACTIVE;
  const query = text.slice(trigger.length);
  return { active: true, from, query, index: query === prev.query ? prev.index : 0 };
}

export const slashMenu = defineExtension({
  name: 'slashMenu',
  priority: 300,
  plugins: ({ editor }) => [
    new Plugin<SlashState>({
      key: slashKey,
      state: {
        init: () => INACTIVE,
        apply: (tr, prev, _old, state) => {
          const meta = tr.getMeta(slashKey) as SlashMeta | undefined;
          if (meta?.type === 'close') return INACTIVE;
          if (meta?.type === 'index') return { ...prev, index: meta.index };
          if (prev.active) {
            const next = continued(prev, tr, state);
            // A query with a space that matches nothing means the user is just typing prose.
            const abandoned = next.active && /\s/.test(next.query) && !filterSlashItems(slashItems(editor), next.query, editor.t).length;
            return abandoned ? INACTIVE : next;
          }
          return tr.docChanged ? (opened(state) ?? INACTIVE) : INACTIVE;
        },
      },
      props: {
        handleKeyDown: (view, event) => {
          const state = slashKey.getState(view.state);
          if (!state?.active) return false;
          if (event.key === 'Escape') {
            closeSlash(editor);
            return true;
          }
          const items = currentSlashItems(editor);
          if (!items.length) return false;
          const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          if (step) {
            const index = (state.index + step + items.length) % items.length;
            view.dispatch(view.state.tr.setMeta(slashKey, { type: 'index', index } satisfies SlashMeta));
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            runSlashItem(editor, items[Math.min(state.index, items.length - 1)]!);
            return true;
          }
          return false;
        },
      },
    }),
  ],
  components: () => [{ slot: 'overlay', create: (editor, ui) => new SlashMenu(editor, ui) }],
});
