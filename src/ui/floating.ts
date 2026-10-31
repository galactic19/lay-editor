import { autoUpdate, computePosition, flip, offset, shift, type Placement, type ReferenceElement, type VirtualElement } from '@floating-ui/dom';
import type { EditorView } from 'prosemirror-view';
import { DEFAULTS } from '../core/defaults';

/** Anything a floating element can be positioned against: an element or a virtual box. */
export type Anchor = ReferenceElement;
export type FloatingGap = keyof typeof DEFAULTS.floating.gaps;

/** Places a fixed-position element next to `reference`, flipping and shifting to stay on screen. */
export async function placeFloating(reference: Anchor, el: HTMLElement, placement: Placement, gap: FloatingGap): Promise<void> {
  const { x, y } = await computePosition(reference, el, {
    placement,
    strategy: 'fixed',
    middleware: [offset(DEFAULTS.floating.gaps[gap]), flip(), shift({ padding: DEFAULTS.floating.viewportPadding })],
  });
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
}

/** Keeps `el` placed while the page scrolls or resizes. Returns the stop function. */
export function followFloating(reference: Anchor, el: HTMLElement, placement: Placement, gap: FloatingGap): () => void {
  return autoUpdate(reference, el, () => void placeFloating(reference, el, placement, gap));
}

/** A virtual box covering document positions `from`..`to` (the caret when they are equal). */
export function rangeReference(view: EditorView, from: number, to = from): Anchor {
  return {
    contextElement: view.dom,
    getBoundingClientRect: () => {
      // A placement still in flight can outlive the view, and the document can shrink under a stored range.
      if (view.isDestroyed) return view.dom.getBoundingClientRect();
      const size = view.state.doc.content.size;
      const a = view.coordsAtPos(Math.min(from, size));
      const b = view.coordsAtPos(Math.min(to, size));
      const left = Math.min(a.left, b.left);
      const right = Math.max(a.right, b.right);
      const top = Math.min(a.top, b.top);
      const bottom = Math.max(a.bottom, b.bottom);
      return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top };
    },
  };
}

/** A virtual box around the current selection (the caret when it is empty). */
export function selectionReference(view: EditorView): Anchor {
  const { from, to } = view.state.selection;
  return rangeReference(view, from, to);
}

/** `el` while it is on screen; once it is hidden or removed (a bubble that hid, a closed menu), `fallback`. */
export function visibleOr(el: Element, fallback: Anchor): VirtualElement {
  return {
    contextElement: el,
    getBoundingClientRect: () => (el.isConnected && el.getClientRects().length ? el : fallback).getBoundingClientRect(),
  };
}
