export type Child = Node | string | null | false | undefined;
type Listeners = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface ElementProps {
  class?: string;
  attrs?: Record<string, string | boolean | null | undefined>;
  on?: Listeners;
  style?: Partial<CSSStyleDeclaration>;
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
