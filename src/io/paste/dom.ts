/** Parses HTML, lets `mutate` edit the document, and returns the body HTML. */
export function withDocument(html: string, mutate: (doc: Document) => void): string {
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  mutate(doc);
  return doc.body.innerHTML;
}

export function removeComments(root: Node): void {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((comment) => comment.parentNode?.removeChild(comment));
}

export function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

export function styleDeclarations(el: HTMLElement): Array<[string, string]> {
  const style = el.style;
  return Array.from({ length: style.length }, (_, i) => {
    const prop = style.item(i);
    return [prop, style.getPropertyValue(prop)] as [string, string];
  });
}

/** A style declaration as [property, value]. */
export type StyleDeclaration = [string, string];

/**
 * Rewrites the style attribute declaration by declaration; `map` returns the declaration to write or null to drop it.
 * Reads the raw attribute so shorthands and vendor properties arrive exactly as the source wrote them.
 */
export function mapStyle(el: HTMLElement, map: (prop: string, value: string) => StyleDeclaration | null): void {
  const raw = el.getAttribute('style');
  if (raw === null) return;
  const kept = raw
    .split(';')
    .map((decl) => {
      const colon = decl.indexOf(':');
      const prop = decl.slice(0, Math.max(colon, 0)).trim().toLowerCase();
      return prop ? map(prop, decl.slice(colon + 1).trim()) : null;
    })
    .filter((decl): decl is StyleDeclaration => decl !== null)
    .map(([prop, value]) => `${prop}:${value}`);
  if (kept.length) el.setAttribute('style', kept.join(';'));
  else el.removeAttribute('style');
}

/** Rewrites the style attribute keeping only declarations for which `keep` is true. */
export function filterStyle(el: HTMLElement, keep: (prop: string, value: string) => boolean): void {
  mapStyle(el, (prop, value) => (keep(prop, value) ? [prop, value] : null));
}
