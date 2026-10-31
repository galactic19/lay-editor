import { DEFAULTS } from '../../../core/defaults';
import { classLanguage, languageClass, safeColor } from '../../sanitize';
import { setStyle, styleDeclarations, withDocument, type StyleDeclaration } from '../dom';

/** An inline style that means a semantic tag; `implied` matches elements that already render that way. */
interface StyleTag {
  prop: string;
  test: RegExp;
  tag: string;
  implied?: RegExp;
}

const STYLE_TAGS: StyleTag[] = [
  { prop: 'font-weight', test: /^(bold(er)?|[6-9]\d{2})$/, tag: 'strong', implied: /^(H[1-6]|TH)$/ },
  { prop: 'font-style', test: /^italic$/, tag: 'em' },
  { prop: 'text-decoration', test: /underline/, tag: 'u' },
  { prop: 'text-decoration-line', test: /underline/, tag: 'u' },
  { prop: 'text-decoration', test: /line-through/, tag: 's' },
  { prop: 'text-decoration-line', test: /line-through/, tag: 's' },
];
/** Elements whose children are rows, cells or items: a wrapper cannot go inside them, so it goes into each child. */
const STRUCTURE_TAGS = /^(UL|OL|TABLE|THEAD|TBODY|TFOOT|TR|COLGROUP)$/;
const TEXT_COLOR = 'color';
const FILL_COLOR = 'background-color';
/** Elements whose background the schema keeps: a highlight or a table cell. */
const FILL_TAGS = ['span', 'mark', 'td', 'th'];
const FILL_ELEMENT = FILL_TAGS.join(',');
/** An ancestor with a kept fill; ancestors are cleaned first, so their style attribute holds only kept colors. */
const KEPT_FILL = FILL_TAGS.map((tag) => `${tag}[style*="${FILL_COLOR}"]`).join(',');
const { keepStyles, colorStyles, namedColors, keepDataAttrs, pageColors } = DEFAULTS.paste;
const includes = (list: readonly string[], value: string): boolean => list.includes(value);

/** Red, green and blue (0-255) of a color in safeColor's output format. */
function channels(color: string): number[] {
  if (!color.startsWith('#')) return color.slice(color.indexOf('(') + 1, -1).split(',').slice(0, 3).map(Number);
  const hex = color.length === 4 ? [...color.slice(1)].map((digit) => digit + digit).join('') : color.slice(1);
  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/** Chroma (channel spread) and lightness (0-255) of a color in safeColor's output format. */
function tone(color: string): { chroma: number; lightness: number } {
  const rgb = channels(color);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return { chroma: max - min, lightness: (max + min) / 2 };
}

/** Greys the source page used for its text or background; intentional colors keep a hue or a mid-grey shade. */
function isPageColor(prop: string, color: string): boolean {
  const { chroma, lightness } = tone(color);
  if (chroma > pageColors.maxChroma) return false;
  return prop === TEXT_COLOR || lightness <= pageColors.darkBackground || lightness >= pageColors.lightBackground;
}

/** Wraps the content of `el` in `tag`; rows, tables and lists pass it down to their cells and items. */
function wrapContent(el: Element, tag: string): void {
  if (STRUCTURE_TAGS.test(el.tagName)) {
    Array.from(el.children).forEach((child) => wrapContent(child, tag));
    return;
  }
  const wrapper = el.ownerDocument.createElement(tag);
  wrapper.append(...Array.from(el.childNodes));
  el.appendChild(wrapper);
}

/** Wraps an element's content in the tags its styles imply, so formatting set on a block or cell becomes marks. */
function stylesToTags(el: HTMLElement): void {
  const decls = styleDeclarations(el);
  const implies = ({ prop, test, implied }: StyleTag) =>
    !implied?.test(el.tagName) && decls.some(([p, v]) => p === prop && test.test(v));
  new Set(STYLE_TAGS.filter(implies).map((s) => s.tag)).forEach((tag) => wrapContent(el, tag));
}

/** The fill the paste keeps under `el`: its own, or the nearest ancestor's. */
function keptFill(el: HTMLElement): string | null {
  const own = el.matches(FILL_ELEMENT) ? cleanValue(el, FILL_COLOR) : null;
  return own ?? el.parentElement?.closest<HTMLElement>(KEPT_FILL)?.style.getPropertyValue(FILL_COLOR) ?? null;
}

/** Grey text lighter than its kept fill was chosen to read on it (white on a dark header cell); darker text reads like on any highlight. */
function readsOnFill(el: HTMLElement, color: string): boolean {
  const fill = keptFill(el);
  return fill !== null && tone(color).lightness > tone(fill).lightness;
}

/**
 * A kept style's value, read through the CSSOM so shorthands (`background:`), `!important` and every color syntax
 * arrive resolved; colors are validated and page colors dropped, except grey text that needs its fill.
 */
function cleanValue(el: HTMLElement, prop: string): string | null {
  const value = el.style.getPropertyValue(prop);
  if (!includes(colorStyles, prop)) return value || null;
  const color = safeColor((namedColors as Record<string, string>)[value.toLowerCase()] ?? value);
  return color && (!isPageColor(prop, color) || (prop === TEXT_COLOR && readsOnFill(el, color))) ? color : null;
}

/** Rewrites the style attribute with only the styles the schema reads. */
function cleanStyle(el: HTMLElement): void {
  setStyle(
    el,
    keepStyles.flatMap((prop): StyleDeclaration[] => {
      const value = cleanValue(el, prop);
      return value ? [[prop, value]] : [];
    }),
  );
}

/** Drops classes, ids and unknown data attributes; a code element keeps only the class naming its language. */
function cleanAttributes(el: HTMLElement): void {
  const language = el.tagName === 'CODE' ? classLanguage(el.classList) : null;
  for (const { name } of Array.from(el.attributes)) {
    if (name === 'class' || name === 'id' || (name.startsWith('data-') && !includes(keepDataAttrs, name))) {
      el.removeAttribute(name);
    }
  }
  if (language) el.className = languageClass(language);
}

/** Keeps only the styles the schema understands and converts semantic styles into tags. */
export function normalizeStyles(html: string): string {
  return withDocument(html, (doc) => {
    for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.hasAttribute('style')) {
        stylesToTags(el);
        cleanStyle(el);
      }
      cleanAttributes(el);
    }
  });
}
