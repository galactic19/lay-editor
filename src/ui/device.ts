import type { DeviceMode } from '../core/types';
import { Signal, type Listener } from './signal';

const COARSE_POINTER = '(pointer: coarse)';

/** Mobile = coarse pointer and a container no wider than the breakpoint. */
export class DeviceWatcher {
  private current: DeviceMode;
  private readonly signal = new Signal<DeviceMode>();
  private readonly media = window.matchMedia(COARSE_POINTER);
  private readonly observer: ResizeObserver;
  private readonly onMedia = (): void => this.check();

  constructor(
    private readonly container: HTMLElement,
    private readonly breakpoint: number,
  ) {
    this.current = this.compute();
    this.media.addEventListener('change', this.onMedia);
    this.observer = new ResizeObserver(() => this.check());
    this.observer.observe(container);
  }

  get mode(): DeviceMode {
    return this.compute();
  }

  onChange(fn: Listener<DeviceMode>): () => void {
    return this.signal.on(fn);
  }

  destroy(): void {
    this.media.removeEventListener('change', this.onMedia);
    this.observer.disconnect();
    this.signal.clear();
  }

  private compute(): DeviceMode {
    return this.media.matches && this.container.clientWidth <= this.breakpoint ? 'mobile' : 'desktop';
  }

  private check(): void {
    const next = this.compute();
    if (next === this.current) return;
    this.current = next;
    this.signal.emit(next);
  }
}

/** Height hidden at the bottom of the layout viewport (the on-screen keyboard). */
export class ViewportTracker {
  private readonly signal = new Signal<number>();
  private readonly onViewport = (): void => this.signal.emit(this.bottomInset);

  constructor() {
    window.visualViewport?.addEventListener('resize', this.onViewport);
    window.visualViewport?.addEventListener('scroll', this.onViewport);
  }

  get bottomInset(): number {
    const vv = window.visualViewport;
    return vv ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))) : 0;
  }

  onChange(fn: Listener<number>): () => void {
    return this.signal.on(fn);
  }

  destroy(): void {
    window.visualViewport?.removeEventListener('resize', this.onViewport);
    window.visualViewport?.removeEventListener('scroll', this.onViewport);
    this.signal.clear();
  }
}
