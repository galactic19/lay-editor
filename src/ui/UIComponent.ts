import type { Placement } from '@floating-ui/dom';
import type { Editor, EditorEvents } from '../core/Editor';
import { FloatingFollower, type CoveredTop, type FloatingGap } from './floating';

/** Base for every UI piece: tracks listeners and editor subscriptions and releases them on destroy. */
export abstract class UIComponent<E extends HTMLElement = HTMLElement> {
  private readonly disposers: Array<() => void> = [];

  protected constructor(
    protected readonly editor: Editor,
    readonly el: E,
  ) {}

  protected listen(target: EventTarget, type: string, fn: (event: any) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, options);
    this.disposers.push(() => target.removeEventListener(type, fn, options));
  }

  protected subscribe<K extends keyof EditorEvents>(event: K, fn: (...args: EditorEvents[K]) => void): void {
    this.disposers.push(this.editor.on(event, fn));
  }

  protected addDisposer(fn: () => void): void {
    this.disposers.push(fn);
  }

  /** Floats this component's element next to an anchor, clear of `coveredTop`; stops following on destroy. */
  protected floating(placement: Placement, gap: FloatingGap, coveredTop?: CoveredTop): FloatingFollower {
    const follower = new FloatingFollower(this.el, placement, gap, coveredTop);
    this.addDisposer(() => follower.hide());
    return follower;
  }

  /** True while the editor or this component holds focus. */
  protected hasFocusWithin(): boolean {
    return this.editor.view.hasFocus() || this.el.contains(document.activeElement);
  }

  /** Re-runs update() on focus changes; blur waits a tick so focus can land in this component first. */
  protected followEditorFocus(): void {
    this.subscribe('focus', () => this.update());
    this.subscribe('blur', () => queueMicrotask(() => this.update()));
  }

  /** Re-reads editor state; called once per frame after editor updates. */
  update(): void {}

  destroy(): void {
    this.disposers.splice(0).reverse().forEach((dispose) => dispose());
    this.el.remove();
  }
}
