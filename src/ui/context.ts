import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { findParent, isMarkActive } from '../core/state-utils';
import type { UIContext, UIItem } from '../core/types';

type Predicate = (node: PMNode) => boolean;

/** How each non-text context is recognised, in priority order. */
const CONTEXT_NODES: Array<[Exclude<UIContext, 'text' | 'link'>, Predicate]> = [
  ['image', (node) => node.type.name === 'image'],
  ['table', (node) => node.type.spec.tableRole === 'table'],
  ['codeBlock', (node) => Boolean(node.type.spec.code)],
];

function contextNode(state: EditorState, predicate: Predicate): { node: PMNode; pos: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && predicate(selection.node)) return { node: selection.node, pos: selection.from };
  // A CellSelection's $from sits in the first selected cell, so the table is still an ancestor.
  return findParent(state, predicate);
}

export function resolveContext(state: EditorState): UIContext {
  for (const [context, predicate] of CONTEXT_NODES) if (contextNode(state, predicate)) return context;
  const link = state.schema.marks.link;
  return link && isMarkActive(state, link) ? 'link' : 'text';
}

/** The element a context toolbar should point at. */
export function contextAnchor(view: EditorView, context: UIContext): HTMLElement | null {
  const entry = CONTEXT_NODES.find(([name]) => name === context);
  if (entry) {
    const found = contextNode(view.state, entry[1]);
    return found ? (view.nodeDOM(found.pos) as HTMLElement | null) : null;
  }
  if (context !== 'link') return null;
  const { node } = view.domAtPos(view.state.selection.from);
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element?.closest('a') ?? null;
}

/** Items that only make sense in `context` (not general text formatting). */
export function contextOnlyItems(registry: Map<string, UIItem>, context: UIContext): UIItem[] {
  return [...registry.values()].filter((item) => item.contexts.includes(context) && !item.contexts.includes('text'));
}
