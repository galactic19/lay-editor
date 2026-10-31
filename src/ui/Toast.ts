import { DEFAULTS } from '../core/defaults';
import { c } from './classes';
import { h } from './dom';

export type ToastKind = 'info' | 'error';

/** Short, polite, auto-dismissing notices announced to screen readers. */
export class Toaster {
  private readonly region: HTMLElement;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(host: HTMLElement) {
    this.region = h('div', { class: c('toasts'), attrs: { role: 'status', 'aria-live': 'polite' } });
    host.appendChild(this.region);
  }

  show(message: string, kind: ToastKind = 'info'): void {
    const toast = h('div', { class: c('toast', `toast-${kind}`) }, message);
    this.removeTwins(toast);
    this.region.appendChild(toast);
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

  destroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.region.remove();
  }
}
