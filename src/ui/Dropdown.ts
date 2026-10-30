import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';
import { focusFirst, trapFocus } from './focus';
import type { PanelContainer } from './PanelHost';

const GAP = 4;
const VIEWPORT_PADDING = 8;

/** Floating panel anchored to a toolbar control, rendered in a body portal. */
export class Dropdown implements PanelContainer {
  private el: HTMLElement | null = null;
  private cleanups: Array<() => void> = [];
  private onClose: ((hadFocus: boolean) => void) | null = null;

  constructor(private readonly themeSource: HTMLElement) {}

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(content: HTMLElement, anchor: HTMLElement | null, onClose: (hadFocus: boolean) => void): void {
    this.close();
    const el = h('div', { class: `${PORTAL_CLASS} ${c('dropdown')}`, attrs: { role: 'dialog', 'data-theme': this.themeSource.dataset.theme } }, content);
    document.body.appendChild(el);
    this.el = el;
    this.onClose = onClose;
    if (anchor) this.cleanups.push(autoUpdate(anchor, el, () => void this.position(anchor, el)));
    this.cleanups.push(trapFocus(el));
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.close();
    };
    const onPointerDown = (event: Event): void => {
      const target = event.target as Node;
      if (!el.contains(target) && !anchor?.contains(target)) this.close();
    };
    el.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    this.cleanups.push(() => document.removeEventListener('pointerdown', onPointerDown, true));
    focusFirst(el);
  }

  close(): void {
    const el = this.el;
    if (!el) return;
    const hadFocus = el.contains(document.activeElement);
    this.cleanups.splice(0).forEach((fn) => fn());
    el.remove();
    this.el = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.(hadFocus);
  }

  destroy(): void {
    this.onClose = null;
    this.close();
  }

  private async position(anchor: HTMLElement, el: HTMLElement): Promise<void> {
    const { x, y } = await computePosition(anchor, el, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [offset(GAP), flip(), shift({ padding: VIEWPORT_PADDING })],
    });
    Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  }
}
