import {
  autoUpdate,
  computePosition,
  flip,
  getOverflowAncestors,
  offset,
  shift,
  size,
  type Placement,
  type ReferenceElement,
  type VirtualElement,
} from '@floating-ui/dom';
import type { EditorView } from 'prosemirror-view';
import { DEFAULTS } from '../core/defaults';

/** Anything a floating element can be positioned against: an element or a virtual box. */
export type Anchor = ReferenceElement;
export type FloatingGap = keyof typeof DEFAULTS.floating.gaps;

/** Set on every placed element: the height left on its side of the anchor. Tall panels cap themselves to it in CSS. */
const AVAILABLE_HEIGHT = '--le-available-height';

/** Heights of the viewport's edges hidden under the editor's own bars: the sticky top bar, the mobile keyboard bar. */
export interface CoveredEdges {
  top?: number;
  bottom?: number;
}
export type Covered = () => CoveredEdges;

/**
 * Places a fixed-position element next to `reference`, flipping and shifting to stay on screen. It also flips
 * rather than run under the `covered` edges, and its available height leaves them out.
 */
export async function placeFloating(reference: Anchor, el: HTMLElement, placement: Placement, gap: FloatingGap, covered: CoveredEdges = {}): Promise<void> {
  const padding = DEFAULTS.floating.viewportPadding;
  const { top = 0, bottom = 0 } = covered;
  const { x, y } = await computePosition(reference, el, {
    placement,
    strategy: 'fixed',
    middleware: [
      offset(DEFAULTS.floating.gaps[gap]),
      flip({ padding: { top, bottom } }),
      shift({ padding }),
      size({
        padding: { top: padding, left: padding, right: padding, bottom: padding + bottom },
        apply: ({ availableHeight }) => el.style.setProperty(AVAILABLE_HEIGHT, `${availableHeight}px`),
      }),
    ],
  });
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
}

/** Keeps `el` placed while the page scrolls or resizes. Returns the stop function. */
export function followFloating(reference: Anchor, el: HTMLElement, placement: Placement, gap: FloatingGap): () => void {
  return autoUpdate(reference, el, () => void placeFloating(reference, el, placement, gap));
}

type ScrollAncestors = ReturnType<typeof getOverflowAncestors>;

/** The element whose scroll containers and size a reference moves with. */
const contextOf = (anchor: Anchor): Element | undefined => (anchor instanceof Element ? anchor : anchor.contextElement);

/** Shows a floating bar or menu next to an anchor that changes with the editor state, following it on scroll. */
export class FloatingFollower {
  private anchor: Anchor | null = null;
  /** One autoUpdate per scroll context: its reference reads whichever anchor is current. */
  private following: { reference: VirtualElement; ancestors: ScrollAncestors; stop: () => void } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly placement: Placement,
    private readonly gap: FloatingGap,
    private readonly covered?: Covered,
    /** Shows or hides `el`; a UI component passes its own so hiding can hand focus back to the editor. */
    private readonly setVisible: (visible: boolean) => void = (visible) => (el.hidden = !visible),
  ) {}

  show(anchor: Anchor): void {
    this.anchor = anchor;
    this.setVisible(true);
    const contextElement = contextOf(anchor);
    // Scroll containers change too, e.g. the content area once the editor goes fullscreen.
    const ancestors = contextElement ? getOverflowAncestors(contextElement) : [];
    const current = this.following;
    if (current && current.reference.contextElement === contextElement && sameItems(current.ancestors, ancestors)) {
      void this.place(current.reference);
      return;
    }
    this.unfollow();
    const reference: VirtualElement = { contextElement, getBoundingClientRect: () => this.anchor!.getBoundingClientRect() };
    this.following = { reference, ancestors, stop: autoUpdate(reference, this.el, () => void this.place(reference)) };
  }

  hide(): void {
    this.unfollow();
    this.setVisible(false);
  }

  private place(reference: Anchor): Promise<void> {
    return placeFloating(reference, this.el, this.placement, this.gap, this.covered?.());
  }

  private unfollow(): void {
    this.following?.stop();
    this.following = null;
  }
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
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
