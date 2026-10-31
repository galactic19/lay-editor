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
