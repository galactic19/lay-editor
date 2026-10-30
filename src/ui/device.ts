import type { DeviceMode } from '../core/types';

const COARSE_POINTER = '(pointer: coarse)';

type Listener<T> = (value: T) => void;

/** Small subscription helper shared by the watchers below. */
class Signal<T> {
  private readonly listeners = new Set<Listener<T>>();
  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(value: T): void {
    this.listeners.forEach((fn) => fn(value));
  }
  clear(): void {
    this.listeners.clear();
  }
}

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
