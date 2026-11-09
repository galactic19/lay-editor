import type { Placement } from '@floating-ui/dom';
import type { Editor, EditorEvents } from '../core/Editor';
import { listen } from './dom';
import { FloatingFollower, type Covered, type FloatingGap } from './floating';

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

  /**
   * Floats this component's element next to an anchor, clear of the `covered` edges; stops following on destroy.
   * It shows and hides through setVisible(), so hiding hands focus back like any other component.
   */
  protected floating(placement: Placement, gap: FloatingGap, covered?: Covered): FloatingFollower {
    const follower = new FloatingFollower(this.el, placement, gap, covered, (visible) => this.setVisible(visible));
    this.addDisposer(() => follower.hide());
    return follower;
  }

  /** True while the editor, anything in the followed focus scope, or this component holds focus. */
  protected hasFocusWithin(): boolean {
    const active = document.activeElement;
    return this.editor.view.hasFocus() || this.el.contains(active) || Boolean(this.focusScope?.contains(active));
  }

  /**
   * For chrome shown while the editor (or anything inside `scope` when given) or the component has focus.
   * Re-runs update() on focus changes (a blur waits a tick so focus can land in this component first, and
   * focus leaving the component counts too); Escape inside hands focus back to the editor.
   */
  protected followEditorFocus(scope?: HTMLElement): void {
    const now = (): void => this.update();
    const later = (): void => queueMicrotask(() => this.update());
    if (scope) {
      this.focusScope = scope;
      this.listen(scope, 'focusin', now);
      this.listen(scope, 'focusout', later);
    } else {
      this.subscribe('focus', now);
      this.subscribe('blur', later);
    }
    this.listen(this.el, 'focusout', later);
    this.listen(this.el, 'keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      this.editor.focus();
    });
  }

  /** Shows or hides the component; hiding it while it holds focus hands focus back to the editor. */
  protected setVisible(visible: boolean): void {
    if (!visible && this.el.contains(document.activeElement)) this.editor.focus();
    this.el.hidden = !visible;
  }

  /** Runs `rebuild`; if that removed the focused control, focus moves to the new tab stop instead of being lost. */
  protected keepingFocus(rebuild: () => void): void {
    const hadFocus = this.el.contains(document.activeElement);
    rebuild();
    if (hadFocus && !this.el.contains(document.activeElement)) this.tabStop()?.focus();
  }

  /** The keyboard entry point (the roving tab stop), or null while the component is hidden. */
  tabStop(): HTMLElement | null {
    return this.el.hidden ? null : this.el.querySelector<HTMLElement>('[tabindex="0"]:not([hidden])');
  }

  /** Re-reads editor state; called once per frame after editor updates. */
  update(): void {}

  destroy(): void {
    this.disposers.splice(0).reverse().forEach((dispose) => dispose());
    this.el.remove();
  }
}
