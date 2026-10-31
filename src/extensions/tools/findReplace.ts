import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { LEAF_CHAR } from '../../core/state-utils';
import { c } from '../../ui/classes';
import { findPanel } from '../../ui/panels/findPanel';
import { defineExtension } from '../factories';

export interface Match {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  /** Index of the selected match, -1 before the first findNext. */
  current: number;
}

type FindMeta = { type: 'query'; query: string; caseSensitive: boolean } | { type: 'current'; current: number } | { type: 'close' };

export const findKey = new PluginKey<FindState>('findReplace');
const EMPTY: FindState = { query: '', caseSensitive: false, matches: [], current: -1 };

/** Literal matches inside each textblock; a match never crosses a block boundary. */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    block.forEach((child, offset) => {
      const start = blockPos + 1 + offset;
      const chunk = child.isText ? child.text! : LEAF_CHAR;
      for (let i = 0; i < chunk.length; i++) positions.push(start + i);
      text += chunk;
    });
    const haystack = caseSensitive ? text : text.toLowerCase();
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      matches.push({ from: positions[i]!, to: positions[i + needle.length - 1]! + 1 });
    }
    return false;
  });
  return matches;
}

const getState = (state: EditorState): FindState => findKey.getState(state) ?? EMPTY;

/**
 * Dispatches a move to another match and brings it into view. ProseMirror drops tr.scrollIntoView()
 * while focus sits outside the editor (in the find panel), so the current match is scrolled directly too.
 */
function dispatchToMatch(tr: Transaction, dispatch: (tr: Transaction) => void, view?: EditorView): void {
  dispatch(tr.scrollIntoView());
  view?.dom.querySelector(`.${c('find-current')}`)?.scrollIntoView?.({ block: 'center' });
}

/** Selects match `index` and remembers it as current. */
const select =
  (index: number): Command =>
  (state, dispatch, view) => {
    const match = getState(state).matches[index];
    if (!match) return false;
    if (!dispatch) return true;
    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, match.from, match.to))
      .setMeta(findKey, { type: 'current', current: index } satisfies FindMeta);
    dispatchToMatch(tr, dispatch, view);
    return true;
  };

const step =
  (delta: 1 | -1): Command =>
  (state, dispatch, view) => {
    const { matches, current } = getState(state);
    if (!matches.length) return false;
    const start = current === -1 ? (delta === 1 ? -1 : 0) : current;
    return select((start + delta + matches.length) % matches.length)(state, dispatch, view);
  };

export const findReplace = defineExtension({
  name: 'findReplace',
  commands: ({ editor }) => ({
    openFind: (): Command => (_state, dispatch) => {
      if (dispatch) editor.ui?.openPanelFor('findReplace');
      return true;
    },
    setFindQuery: (query: string, caseSensitive?: boolean): Command => (state, dispatch) => {
      const meta: FindMeta = { type: 'query', query: String(query ?? ''), caseSensitive: caseSensitive ?? getState(state).caseSensitive };
      dispatch?.(state.tr.setMeta(findKey, meta));
      return true;
    },
    findNext: () => step(1),
    findPrev: () => step(-1),
    replaceCurrent: (text: string): Command => (state, dispatch, view) => {
      const { matches, current } = getState(state);
      const match = matches[current];
      if (!match) return step(1)(state, dispatch, view);
      if (!dispatch) return true;
      const tr = state.tr.insertText(text, match.from, match.to);
      // Move on to the match that now sits at the same index.
      const remaining = findMatches(tr.doc, getState(state).query, getState(state).caseSensitive);
      const next = Math.min(current, remaining.length - 1);
      if (next >= 0) {
        tr.setSelection(TextSelection.create(tr.doc, remaining[next]!.from, remaining[next]!.to)).setMeta(findKey, { type: 'current', current: next } satisfies FindMeta);
      }
      dispatchToMatch(tr, dispatch, view);
      return true;
    },
    replaceAll: (text: string): Command => (state, dispatch) => {
      const { matches } = getState(state);
      if (!matches.length) return false;
      if (dispatch) {
        const tr = state.tr;
        for (const match of [...matches].reverse()) tr.insertText(text, match.from, match.to);
        dispatch(tr);
      }
      return true;
    },
    closeFind: (): Command => (state, dispatch) => {
      dispatch?.(state.tr.setMeta(findKey, { type: 'close' } satisfies FindMeta));
      return true;
    },
  }),
  keymap: () => ({ 'Mod-f': 'openFind' }),
  plugins: () => [
    new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => EMPTY,
        apply: (tr, prev, _old, state) => {
          const meta = tr.getMeta(findKey) as FindMeta | undefined;
          if (meta?.type === 'close') return EMPTY;
          if (meta?.type === 'query') return { ...meta, matches: findMatches(state.doc, meta.query, meta.caseSensitive), current: -1 };
          let next = prev;
          if (tr.docChanged && prev.query) {
            const matches = findMatches(state.doc, prev.query, prev.caseSensitive);
            next = { ...prev, matches, current: Math.min(prev.current, matches.length - 1) };
          }
          return meta?.type === 'current' ? { ...next, current: meta.current } : next;
        },
      },
      props: {
        decorations: (state) => {
          const { matches, current } = getState(state);
          if (!matches.length) return null;
          return DecorationSet.create(
            state.doc,
            matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? c('find-match', 'find-current') : c('find-match') })),
          );
        },
      },
    }),
  ],
  ui: () => [{ id: 'findReplace', kind: 'panel', icon: 'search', label: 'toolbar.findReplace', shortcut: 'Mod-f', contexts: ['text', 'table', 'codeBlock'], panel: findPanel }],
});
