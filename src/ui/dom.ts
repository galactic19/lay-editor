import { c } from './classes';

export type Child = Node | string | null | false | undefined;
type Listeners = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface ElementProps {
  class?: string;
  attrs?: Record<string, string | boolean | null | undefined>;
  on?: Listeners;
  style?: Partial<CSSStyleDeclaration>;
}

/** The form id editor-owned controls point at: no form has it, so they have no form owner. */
const NO_FORM = c('no-form');

/**
 * Takes an editor-owned control (the source textarea, a task checkbox) out of the page's form, which the editor
 * may sit in: a form reset, validation and the posted data then leave it alone, and it keeps showing the editor's state.
 */
export function outsideForms<E extends HTMLTextAreaElement | HTMLInputElement>(control: E): E {
  control.setAttribute('form', NO_FORM);
  return control;
}

/** Adds an event listener and returns the function that removes it. */
export function listen(target: EventTarget, type: string, fn: (event: any) => void, options?: AddEventListenerOptions | boolean): () => void {
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}

/**
 * Runs `fn` when the page may be going away: closed, reloaded or left (pagehide), or hidden, after which a mobile
 * browser may discard it without another event. Returns the function that stops listening.
 */
export function onPageLeave(fn: () => void): () => void {
  const stops = [
    listen(window, 'pagehide', fn),
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') fn();
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

/** A media query the UI follows; `stop()` ends the following. */
export interface MediaWatch {
  readonly matches: boolean;
  stop(): void;
}

/**
 * Reads `query` and calls `onChange` when it changes. Where matchMedia is missing (jsdom in an app's own tests)
 * the query never matches, so the editor runs in its desktop, light-theme defaults.
 */
export function watchMedia(query: string, onChange: () => void): MediaWatch {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  media?.addEventListener('change', onChange);
  return {
    get matches() {
      return media?.matches ?? false;
    },
    stop: () => media?.removeEventListener('change', onChange),
  };
}

/** Calls `onResize` when `target` changes size; nothing where ResizeObserver is missing (jsdom). Returns the stop function. */
export function observeResize(target: Element, onResize: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(() => onResize());
  observer.observe(target);
  return () => observer.disconnect();
}

/** Creates an element; `true` attributes are set empty, false/null ones are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === true) el.setAttribute(name, '');
    else if (typeof value === 'string') el.setAttribute(name, value);
  }
  for (const [type, fn] of Object.entries(props.on ?? {})) el.addEventListener(type, fn as EventListener);
  if (props.style) Object.assign(el.style, props.style);
  for (const child of children) if (child !== null && child !== false && child !== undefined) el.append(child);
  return el;
}
