import { createElement, type IconNode } from 'lucide';
import { c } from './classes';
import { DEFAULT_ICONS } from './icon-set';

export const FALLBACK_ICON = 'circle-help';
const SVG_NS = 'http://www.w3.org/2000/svg';
const registry = new Map<string, string | IconNode>(Object.entries(DEFAULT_ICONS));
const warned = new Set<string>();

/** Registers or replaces an icon: an SVG markup string or a lucide IconNode. */
export function registerIcon(name: string, icon: string | IconNode): void {
  registry.set(name, icon);
}

/** Icon markup is trusted developer input; a missing xmlns is added so it renders as SVG. */
function fromMarkup(markup: string): SVGElement {
  const withNamespace = markup.replace(/<svg(?![^>]*\bxmlns=)/, `<svg xmlns="${SVG_NS}"`);
  const doc = new window.DOMParser().parseFromString(withNamespace, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

export function renderIcon(name: string): SVGElement {
  let icon = registry.get(name);
  if (!icon) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[laymaker] unknown icon "${name}"`);
    }
    icon = registry.get(FALLBACK_ICON)!;
  }
  const svg = typeof icon === 'string' ? fromMarkup(icon) : createElement(icon);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add(c('icon'));
  return svg;
}
