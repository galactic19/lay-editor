import { DEFAULTS } from '../core/defaults';
import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';
import { copyTheme, type ThemedPortal } from './theme';

export type ToastKind = 'info' | 'error';

/**
 * Short, polite, auto-dismissing notices announced to screen readers. They live in a body portal at
 * the bottom of the screen, so a long document cannot push them out of view.
 */
export class Toaster implements ThemedPortal {
  private readonly region: HTMLElement;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  /** `coveredBottom()` is the screen height hidden at the bottom (on-screen keyboard, mobile bar). */
  constructor(
    private readonly themeSource: HTMLElement,
    private readonly coveredBottom: () => number,
  ) {
    this.region = h('div', { class: `${PORTAL_CLASS} ${c('toasts')}`, attrs: { role: 'status', 'aria-live': 'polite' } });
    document.body.appendChild(this.region);
  }

  show(message: string, kind: ToastKind = 'info'): void {
    const toast = h('div', { class: c('toast', `toast-${kind}`) }, message);
    this.removeTwins(toast);
    this.region.appendChild(toast);
    this.place();
    const timer = setTimeout(() => {
      toast.remove();
      this.timers.delete(timer);
    }, DEFAULTS.toast.duration);
    this.timers.add(timer);
  }

  /** A repeated notice replaces its twin still on screen: it is announced again but never stacks up. */
  private removeTwins(toast: HTMLElement): void {
    [...this.region.children].filter((shown) => shown.isEqualNode(toast)).forEach((twin) => twin.remove());
  }

  syncTheme(): void {
    this.place();
  }

  /** Follows the theme and keeps the toasts clear of whatever covers the bottom; a no-op while none shows. */
  place(): void {
    if (!this.region.childElementCount) return;
    copyTheme(this.region, this.themeSource);
    this.region.style.setProperty('--le-toast-offset', `${this.coveredBottom()}px`);
  }

  destroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.region.remove();
  }
}
