import type { Editor, EditorEvents } from '../core/Editor';

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

  /** True while the editor or this component holds focus. */
  protected hasFocusWithin(): boolean {
    return this.editor.view.hasFocus() || this.el.contains(document.activeElement);
  }

  /**
   * For floating chrome shown while the editor or the component has focus. Re-runs update() on
   * focus changes (a blur waits a tick so focus can land in this component first, and focus
   * leaving the component counts too); Escape inside hands focus back to the editor.
   */
  protected followEditorFocus(): void {
    const later = (): void => queueMicrotask(() => this.update());
    this.subscribe('focus', () => this.update());
    this.subscribe('blur', later);
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
