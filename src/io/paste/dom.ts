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

/** A style declaration as [property, value]. */
export type StyleDeclaration = [string, string];

/** Writes `decls` as the style attribute, or removes the attribute when none are left. */
export function setStyle(el: HTMLElement, decls: StyleDeclaration[]): void {
  if (decls.length) el.setAttribute('style', decls.map(([prop, value]) => `${prop}:${value}`).join(';'));
  else el.removeAttribute('style');
}

/**
 * Rewrites the style attribute keeping only declarations for which `keep` is true.
 * Reads the raw attribute so vendor properties (mso-*) arrive exactly as the source wrote them.
 */
export function filterStyle(el: HTMLElement, keep: (prop: string, value: string) => boolean): void {
  const raw = el.getAttribute('style');
  if (raw === null) return;
  const decls = raw.split(';').map((decl): StyleDeclaration => {
    const colon = decl.indexOf(':');
    return [decl.slice(0, Math.max(colon, 0)).trim().toLowerCase(), decl.slice(colon + 1).trim()];
  });
  setStyle(el, decls.filter(([prop, value]) => prop && keep(prop, value)));
}
