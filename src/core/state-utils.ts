import type { Attrs, Mark, MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import { NodeSelection, type EditorState } from 'prosemirror-state';

/** Stand-in character for inline leaf nodes (images, breaks) when reading block text. */
export const LEAF_CHAR = '\ufffc';

/** A line break as text: a code block's line separator and a hard break when reading block text. */
export const NEWLINE = '\n';

export function attrsMatch(actual: Attrs, expected?: Attrs | null): boolean {
  if (!expected) return true;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

const markMatches = (mark: Mark, type: MarkType, attrs?: Attrs | null): boolean =>
  mark.type === type && attrsMatch(mark.attrs, attrs);

export function isMarkActive(state: EditorState, type: MarkType, attrs?: Attrs | null): boolean {
  const { empty, $from, from, to } = state.selection;
  if (empty) return (state.storedMarks ?? $from.marks()).some((m) => markMatches(m, type, attrs));
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (node.isText && node.marks.some((m) => markMatches(m, type, attrs))) found = true;
    return !found;
  });
  return found;
}

/** Whether `type` can go on some text in the selection; code blocks, for one, allow no marks. */
export function markApplies(state: EditorState, type: MarkType): boolean {
  const { from, to } = state.selection;
  let applies = false;
  state.doc.nodesBetween(from, to, (node) => {
    applies ||= node.inlineContent && node.type.allowsMarkType(type);
    return !applies;
  });
  return applies;
}

export function isNodeActive(state: EditorState, type: NodeType, attrs?: Attrs | null): boolean {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type === type) return attrsMatch(selection.node.attrs, attrs);
  return findParent(state, (node) => node.type === type && attrsMatch(node.attrs, attrs)) !== null;
}

export interface FoundNode {
  node: PMNode;
  pos: number;
  depth: number;
}

/** Nearest ancestor of the selection head matching `pred` (depth 0 = doc is excluded). */
export function findParent(state: EditorState, pred: (node: PMNode) => boolean): FoundNode | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (pred(node)) return { node, pos: $from.before(depth), depth };
  }
  return null;
}

/** Extent of the mark of `type` around the cursor, within its textblock. */
export function getMarkRange(state: EditorState, type: MarkType): { from: number; to: number } | null {
  const { $from } = state.selection;
  const parent = $from.parent;
  const start = $from.start();
  let mark: Mark | undefined;
  let from = -1;
  let to = -1;
  let offset = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childFrom = start + offset;
    const childTo = childFrom + child.nodeSize;
    const childMark = type.isInSet(child.marks);
    if (childMark && (from === -1 || (mark && childMark.eq(mark) && childFrom === to))) {
      if (from === -1 || !mark || !childMark.eq(mark)) {
        from = childFrom;
        mark = childMark;
      }
      to = childTo;
    } else if (from !== -1) {
      if ($from.pos >= from && $from.pos <= to) return { from, to };
      from = to = -1;
      mark = undefined;
    }
    offset += child.nodeSize;
  }
  if (from !== -1 && $from.pos >= from && $from.pos <= to) return { from, to };
  return null;
}

export function findNodeByAttr(doc: PMNode, attr: string, value: unknown): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.attrs[attr] === value) result = { node, pos };
    return !result;
  });
  return result;
}
