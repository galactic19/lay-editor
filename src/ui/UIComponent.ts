import type { Placement } from '@floating-ui/dom';
import type { Editor, EditorEvents } from '../core/Editor';
import { listen } from './dom';
import { FloatingFollower, type CoveredTop, type FloatingGap } from './floating';

/** Base for every UI piece: tracks listeners and editor subscriptions and releases them on destroy. */
export abstract class UIComponent<E extends HTMLElement = HTMLElement> {
  private readonly disposers: Array<() => void> = [];
  private focusScope: HTMLElement | null = null;

  protected constructor(
    protected readonly editor: Editor,
    readonly el: E,
  ) {}

  protected listen(target: EventTarget, type: string, fn: (event: any) => void, options?: AddEventListenerOptions): void {
    this.disposers.push(listen(target, type, fn, options));
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

  /** True while the editor, anything in the followed focus scope, or this component holds focus. */
  protected hasFocusWithin(): boolean {
    const active = document.activeElement;
    return this.editor.view.hasFocus() || this.el.contains(active) || Boolean(this.focusScope?.contains(active));
  }

  /**
   * Re-runs update() on focus changes of the editor, or of anything inside `scope` when given.
   * Blur waits a tick so focus can land in this component first.
   */
  protected followEditorFocus(scope?: HTMLElement): void {
    const onFocus = (): void => this.update();
    const onBlur = (): void => queueMicrotask(() => this.update());
    if (!scope) {
      this.subscribe('focus', onFocus);
      this.subscribe('blur', onBlur);
      return;
    }
    this.focusScope = scope;
    this.listen(scope, 'focusin', onFocus);
    this.listen(scope, 'focusout', onBlur);
  }

  /** Re-reads editor state; called once per frame after editor updates. */
  update(): void {}

  destroy(): void {
    this.disposers.splice(0).reverse().forEach((dispose) => dispose());
    this.el.remove();
  }
}
