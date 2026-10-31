import { DEFAULTS } from '../core/defaults';
import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';

export type ToastKind = 'info' | 'error';

/**
 * Short, polite, auto-dismissing notices announced to screen readers. They live in a body portal at
 * the bottom of the screen, so a long document cannot push them out of view.
 */
export class Toaster {
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
    this.region.dataset.theme = this.themeSource.dataset.theme;
    this.region.style.setProperty('--le-toast-offset', `${this.coveredBottom()}px`);
    const toast = h('div', { class: c('toast', `toast-${kind}`) }, message);
    this.region.appendChild(toast);
    const timer = setTimeout(() => {
      toast.remove();
      this.timers.delete(timer);
    }, DEFAULTS.toast.duration);
    this.timers.add(timer);
  }

  destroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.region.remove();
  }
}
