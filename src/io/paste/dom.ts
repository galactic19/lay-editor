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

/** Rewrites the style attribute keeping only declarations for which `keep` is true. */
export function filterStyle(el: HTMLElement, keep: (prop: string, value: string) => boolean): void {
  const raw = el.getAttribute('style');
  if (raw === null) return;
  const kept = raw
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const colon = decl.indexOf(':');
      return colon > 0 && keep(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim());
    });
  if (kept.length) el.setAttribute('style', kept.join(';'));
  else el.removeAttribute('style');
}
