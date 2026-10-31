import { autoUpdate, computePosition, flip, offset, shift, type Placement, type ReferenceElement } from '@floating-ui/dom';
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
      const a = view.coordsAtPos(from);
      const b = view.coordsAtPos(to);
      const left = Math.min(a.left, b.left);
      const right = Math.max(a.right, b.right);
      const top = Math.min(a.top, b.top);
      const bottom = Math.max(a.bottom, b.bottom);
      return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top };
    },
  };
}
