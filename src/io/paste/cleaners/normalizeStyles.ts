import { DEFAULTS } from '../../../core/defaults';
import { safeColor } from '../../sanitize';
import { filterStyle, styleDeclarations, withDocument } from '../dom';

/** Inline styles that mean a semantic tag. */
const STYLE_TAGS: Array<{ prop: string; test: RegExp; tag: string }> = [
  { prop: 'font-weight', test: /^(bold(er)?|[6-9]\d{2})$/, tag: 'strong' },
  { prop: 'font-style', test: /^italic$/, tag: 'em' },
  { prop: 'text-decoration', test: /underline/, tag: 'u' },
  { prop: 'text-decoration-line', test: /underline/, tag: 'u' },
  { prop: 'text-decoration', test: /line-through/, tag: 's' },
  { prop: 'text-decoration-line', test: /line-through/, tag: 's' },
];
const BLOCK_TAGS = /^(P|H[1-6]|LI|UL|OL|DIV|TD|TH|TABLE|BLOCKQUOTE|PRE|BODY)$/;
const { keepStyles, keepDataAttrs, defaultColors } = DEFAULTS.paste;

function isDefaultColor(prop: string, value: string): boolean {
  const list = (defaultColors as Record<string, readonly string[]>)[prop];
  const normalized = safeColor(value);
  return Boolean(list && normalized && list.includes(normalized));
}

/** Wraps an inline element's children in the tags its styles imply. */
function stylesToTags(el: HTMLElement): void {
  if (BLOCK_TAGS.test(el.tagName)) return;
  const decls = styleDeclarations(el);
  const tags = new Set(STYLE_TAGS.filter(({ prop, test }) => decls.some(([p, v]) => p === prop && test.test(v))).map((s) => s.tag));
  for (const tag of tags) {
    const wrapper = el.ownerDocument.createElement(tag);
    wrapper.append(...Array.from(el.childNodes));
    el.appendChild(wrapper);
  }
}

function cleanAttributes(el: HTMLElement): void {
  for (const { name } of Array.from(el.attributes)) {
    if (name === 'class' || name === 'id' || (name.startsWith('data-') && !(keepDataAttrs as readonly string[]).includes(name))) {
      el.removeAttribute(name);
    }
  }
}

/** Keeps only the styles the schema understands and converts semantic styles into tags. */
export function normalizeStyles(html: string): string {
  return withDocument(html, (doc) => {
    for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.hasAttribute('style')) {
        stylesToTags(el);
        filterStyle(el, (prop, value) => (keepStyles as readonly string[]).includes(prop) && !isDefaultColor(prop, value));
      }
      cleanAttributes(el);
    }
  });
}
