import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';
import type { Anchor } from './floating';
import { focusFirst, trapFocus } from './focus';
import type { PanelContainer } from './PanelHost';

export interface PortalParts {
  /** The focus-trapped dialog element. */
  dialog: HTMLElement;
  /** Other portal elements (e.g. a backdrop), inserted before the dialog. */
  extras?: HTMLElement[];
  cleanups?: Array<() => void>;
}

/** Shared plumbing for panels rendered in body portals: theme, focus trap, Escape, close bookkeeping. */
export abstract class PortalPanel implements PanelContainer {
  private elements: HTMLElement[] = [];
  private dialog: HTMLElement | null = null;
  private cleanups: Array<() => void> = [];
  private onClose: ((hadFocus: boolean) => void) | null = null;

  /** `root` is the editor root: the panel copies its theme and may publish layout variables on it. */
  constructor(protected readonly root: HTMLElement) {}

  get isOpen(): boolean {
    return this.dialog !== null;
  }

  open(content: HTMLElement, anchor: Anchor | null, label: string | null, onClose: (hadFocus: boolean) => void): void {
    this.close();
    const parts = this.render(content, anchor);
    if (label) parts.dialog.setAttribute('aria-label', label);
    this.dialog = parts.dialog;
    this.elements = [...(parts.extras ?? []), parts.dialog];
    this.onClose = onClose;
    this.syncTheme();
    document.body.append(...this.elements);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.close();
    };
    parts.dialog.addEventListener('keydown', onKeyDown);
    this.cleanups = [...(parts.cleanups ?? []), trapFocus(parts.dialog)];
    focusFirst(parts.dialog);
  }

  /** Copies the editor's current theme onto the portal elements. */
  syncTheme(): void {
    this.elements.forEach((el) => (el.dataset.theme = this.root.dataset.theme));
  }

  close(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const hadFocus = dialog.contains(document.activeElement);
    this.cleanups.splice(0).forEach((fn) => fn());
    this.elements.forEach((el) => el.remove());
    this.elements = [];
    this.dialog = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.(hadFocus);
  }

  /** A UI rebuild (setLocale) closes like Escape, so panel cleanups such as clearing find highlights still run. */
  destroy(): void {
    this.close();
  }

  protected portal(name: string, attrs: Record<string, string> = {}, ...children: HTMLElement[]): HTMLElement {
    return h('div', { class: `${PORTAL_CLASS} ${c(name)}`, attrs }, ...children);
  }

  protected abstract render(content: HTMLElement, anchor: Anchor | null): PortalParts;
}
