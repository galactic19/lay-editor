import { afterEach } from 'vitest';

type Listener = (event: { matches: boolean }) => void;

/** Mutable media-query state so tests can flip pointer/color-scheme queries. */
export const mediaState: Record<string, boolean> = {};
const mediaListeners = new Map<string, Set<Listener>>();

export function setMedia(query: string, matches: boolean): void {
  mediaState[query] = matches;
  mediaListeners.get(query)?.forEach((fn) => fn({ matches }));
}

window.matchMedia = ((query: string) => {
  const listeners = mediaListeners.get(query) ?? new Set<Listener>();
  mediaListeners.set(query, listeners);
  return {
    get matches() {
      return mediaState[query] ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
    addListener: (fn: Listener) => listeners.add(fn),
    removeListener: (fn: Listener) => listeners.delete(fn),
    dispatchEvent: () => true,
  };
}) as unknown as typeof window.matchMedia;

class ResizeObserverStub {
  static instances = new Set<ResizeObserverStub>();
  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.add(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    ResizeObserverStub.instances.delete(this);
  }
  /** Test hook: fire every live observer. */
  static trigger(): void {
    for (const ro of ResizeObserverStub.instances) ro.callback([], ro as unknown as ResizeObserver);
  }
}
(globalThis as any).ResizeObserver = ResizeObserverStub;
export const triggerResize = (): void => ResizeObserverStub.trigger();

if (typeof (globalThis as any).ClipboardEvent === 'undefined') {
  (globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;
    constructor(type: string, init: EventInit & { clipboardData?: DataTransfer | null } = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? null;
    }
  };
}

if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
  (globalThis as any).IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  };
}

const emptyRect = (): DOMRect =>
  ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
Range.prototype.getBoundingClientRect = emptyRect;
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
document.elementFromPoint = () => null;
// jsdom has no scrolling; tests spy on this no-op to see what was scrolled into view.
Element.prototype.scrollIntoView = () => {};

const viewportListeners = new Set<() => void>();
export const visualViewportStub = {
  height: window.innerHeight,
  width: window.innerWidth,
  offsetTop: 0,
  offsetLeft: 0,
  scale: 1,
  addEventListener: (_type: string, fn: () => void) => viewportListeners.add(fn),
  removeEventListener: (_type: string, fn: () => void) => viewportListeners.delete(fn),
};
Object.defineProperty(window, 'visualViewport', { value: visualViewportStub, configurable: true });
export function setViewport(patch: Partial<typeof visualViewportStub>): void {
  Object.assign(visualViewportStub, patch);
  viewportListeners.forEach((fn) => fn());
}

const cleanups: Array<() => void> = [];
export function onCleanup(fn: () => void): void {
  cleanups.push(fn);
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  for (const key of Object.keys(mediaState)) delete mediaState[key];
  Object.assign(visualViewportStub, { height: window.innerHeight, width: window.innerWidth, offsetTop: 0 });
  document.body.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
