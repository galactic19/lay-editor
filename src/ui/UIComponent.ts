import type { Editor, EditorEvents } from '../core/Editor';
import { listen } from './dom';

/** Base for every UI piece: tracks listeners and editor subscriptions and releases them on destroy. */
export abstract class UIComponent<E extends HTMLElement = HTMLElement> {
  private readonly disposers: Array<() => void> = [];

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
