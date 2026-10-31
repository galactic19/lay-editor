import { DEFAULTS } from '../../../core/defaults';
import { classLanguage, languageClass, safeColor } from '../../sanitize';
import { mapStyle, styleDeclarations, withDocument, type StyleDeclaration } from '../dom';

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
const { keepStyles, colorStyles, styleAliases, namedColors, keepDataAttrs, pageColors } = DEFAULTS.paste;
const includes = (list: readonly string[], value: string): boolean => list.includes(value);

/** Red, green and blue (0-255) of a color in safeColor's output format. */
function channels(color: string): number[] {
  if (!color.startsWith('#')) return color.slice(color.indexOf('(') + 1, -1).split(',').slice(0, 3).map(Number);
  const hex = color.length === 4 ? [...color.slice(1)].map((digit) => digit + digit).join('') : color.slice(1);
  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/** Greys the source page used for its text or background; intentional colors keep a hue or a mid-grey shade. */
function isPageColor(prop: string, color: string): boolean {
  const rgb = channels(color);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  if (max - min > pageColors.maxChroma) return false;
  const lightness = (max + min) / 2;
  return prop === 'color' || lightness <= pageColors.darkBackground || lightness >= pageColors.lightBackground;
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

/** A declaration the schema can read: shorthand resolved, color validated, page colors and other styles dropped. */
function cleanDeclaration(prop: string, value: string): StyleDeclaration | null {
  const name = (styleAliases as Record<string, string>)[prop] ?? prop;
  if (!includes(keepStyles, name)) return null;
  if (!includes(colorStyles, name)) return [name, value];
  const color = safeColor((namedColors as Record<string, string>)[value.toLowerCase()] ?? value);
  return color && !isPageColor(name, color) ? [name, color] : null;
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
        mapStyle(el, cleanDeclaration);
      }
      cleanAttributes(el);
    }
  });
}
