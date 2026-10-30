import { filterStyle, removeComments, unwrap, withDocument } from '../dom';

const WORD_MARKER = /urn:schemas-microsoft-com:office|class="?Mso/i;
const LIST_LEVEL = /mso-list:\s*l\d+\s+level(\d+)/i;
const ORDERED_MARKER = /^\(?[0-9a-z]{1,4}[.)]$/i;

interface ListFrame {
  level: number;
  list: HTMLElement;
}

/** Turns Word's "mso-list" paragraphs into nested ul/ol and removes Office-only markup. */
export function cleanWord(html: string): string {
  if (!WORD_MARKER.test(html)) return html;
  return withDocument(html, (doc) => {
    removeComments(doc.body);
    doc.body.querySelectorAll('style, meta, link, xml').forEach((el) => el.remove());
    Array.from(doc.body.querySelectorAll('*'))
      .filter((el) => el.tagName.includes(':'))
      .forEach((el) => el.remove());
    convertLists(doc);
    doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => filterStyle(el, (prop) => !prop.startsWith('mso-')));
    doc.body.querySelectorAll('[class]').forEach((el) => {
      if (/^Mso/i.test(el.getAttribute('class') ?? '')) el.removeAttribute('class');
    });
  });
}

function convertLists(doc: Document): void {
  let stack: ListFrame[] = [];
  let lastItem: Element | null = null;
  for (const p of Array.from(doc.body.querySelectorAll<HTMLElement>('p'))) {
    const level = Number(LIST_LEVEL.exec(p.getAttribute('style') ?? '')?.[1] ?? 0);
    if (!level) {
      stack = [];
      continue;
    }
    const marker = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
    const ordered = ORDERED_MARKER.test(marker?.textContent?.replace(/\s| /g, '') ?? '');
    marker?.remove();
    // A list continues only if this paragraph directly follows the previous item.
    if (stack.length && !isAdjacent(stack[0]!.list, p)) stack = [];
    while (stack.length && stack[stack.length - 1]!.level > level) stack.pop();
    const top = stack[stack.length - 1];
    const tag = ordered ? 'ol' : 'ul';
    let list: HTMLElement;
    if (top && top.level === level && top.list.tagName.toLowerCase() === tag) list = top.list;
    else {
      list = doc.createElement(tag);
      if (top && top.level < level && lastItem) lastItem.appendChild(list);
      else {
        if (top && top.level === level) stack.pop();
        p.before(list);
      }
      stack.push({ level, list });
    }
    const li = doc.createElement('li');
    const para = doc.createElement('p');
    para.append(...Array.from(p.childNodes));
    li.appendChild(para);
    list.appendChild(li);
    lastItem = li;
    p.remove();
  }
  doc.body.querySelectorAll('span:empty').forEach((span) => unwrap(span));
}

/** True when only whitespace separates the root list from `p`. */
function isAdjacent(rootList: Element, p: Element): boolean {
  let node = rootList.nextSibling;
  while (node && node !== p) {
    if (node.nodeType !== Node.TEXT_NODE || node.textContent!.trim()) return false;
    node = node.nextSibling;
  }
  return node === p;
}
