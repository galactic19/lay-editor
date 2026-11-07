import type { Node as PMNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';

export const ATTR_BLOCK_TYPES = ['paragraph', 'heading'];

/** Textblocks in the selection that carry the alignment/indent attributes. */
export function selectedAttrBlocks(state: EditorState): Array<{ node: PMNode; pos: number }> {
  const blocks: Array<{ node: PMNode; pos: number }> = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (ATTR_BLOCK_TYPES.includes(node.type.name)) blocks.push({ node, pos });
    return !node.isTextblock;
  });
  return blocks;
}

/** Sets `attr` on every selected block to `next(current)`; fails if any result is invalid (undefined). */
export function updateBlockAttr(attr: string, next: (current: any) => unknown): Command {
  return (state, dispatch) => {
    const blocks = selectedAttrBlocks(state);
    const values = blocks.map(({ node }) => next(node.attrs[attr]));
    if (!blocks.length || values.some((v) => v === undefined)) return false;
    if (dispatch) {
      const tr = state.tr;
      blocks.forEach(({ node, pos }, i) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: values[i] }));
      dispatch(tr);
    }
    return true;
  };
}
