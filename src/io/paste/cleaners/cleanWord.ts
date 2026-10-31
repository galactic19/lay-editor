import { filterStyle, removeComments, unwrap, withDocument } from '../dom';

const WORD_MARKER = /urn:schemas-microsoft-com:office|class="?Mso/i;
/** `mso-list:l0 level2 lfo1`: the list definition, the level, and the numbering instance (a restart is a new lfo). */
const LIST_STYLE = /mso-list:\s*(l\d+)\s+level(\d+)(?:\s+(lfo\d+))?/i;
/**
 * Numbering markers: anything with a number (1. 1.1 ① ⑴ Ⅳ.), letters closed by "." or ")" (a. 가) (ㄱ) xviii.),
 * or one enclosed letter (Enclosed Alphanumerics and Enclosed CJK blocks: ⓐ ㉮). Bullets are single symbols
 * or symbol-font letters (· § o Ø).
 */
const ORDERED_MARKER = /\p{N}|^\(?\p{L}+[.)]$|^[\u2460-\u24ff\u3200-\u32ff]$/u;

interface ListFrame {
  /** Word list and numbering instance; another instance is another list even right after this one. */
  id: string;
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
  const top = (): ListFrame | undefined => stack[stack.length - 1];
  for (const p of Array.from(doc.body.querySelectorAll<HTMLElement>('p'))) {
    const match = LIST_STYLE.exec(p.getAttribute('style') ?? '');
    if (!match) {
      stack = [];
      continue;
    }
    const id = `${match[1]}${match[3] ?? ''}`;
    const level = Number(match[2]);
    const marker = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
    const tag = ORDERED_MARKER.test(marker?.textContent?.replace(/\s/g, '') ?? '') ? 'OL' : 'UL';
    marker?.remove();
    // A list continues only if this paragraph directly follows the previous item.
    if (stack.length && !isAdjacent(stack[0]!.list, p)) stack = [];
    while ((top()?.level ?? 0) > level) stack.pop();
    // At the same level only the same Word list of the same kind continues; anything else starts a new list there.
    if (top()?.level === level && (top()!.id !== id || top()!.list.tagName !== tag)) stack.pop();
    if (top()?.level !== level) {
      const list = doc.createElement(tag);
      const parent = top();
      if (parent) parent.list.lastElementChild!.appendChild(list);
      else p.before(list);
      stack.push({ id, level, list });
    }
    const li = doc.createElement('li');
    const para = doc.createElement('p');
    para.append(...Array.from(p.childNodes));
    li.appendChild(para);
    top()!.list.appendChild(li);
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
