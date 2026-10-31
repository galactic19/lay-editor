import { createElement, type IconNode } from 'lucide';
import { c } from './classes';
import { DEFAULT_ICONS } from './icon-set';

export const FALLBACK_ICON = 'circle-help';
const registry = new Map<string, string | IconNode>(Object.entries(DEFAULT_ICONS));
const warned = new Set<string>();

/** Registers or replaces an icon: an SVG markup string or a lucide IconNode. */
export function registerIcon(name: string, icon: string | IconNode): void {
  registry.set(name, icon);
}

/**
 * Icon markup is trusted developer input. It is parsed the way an HTML page parses inline SVG,
 * so markup copied from a page renders as it did there (no xmlns, a BOM, unclosed tags, &nbsp;)
 * and a strict XML parser never hands back its error page. Null when there is no <svg>.
 */
function fromMarkup(markup: string): SVGElement | null {
  const svg = new window.DOMParser().parseFromString(markup, 'text/html').querySelector('svg');
  return svg && document.importNode(svg, true);
}

/** The icon's element, or a warning (once per name) and the fallback icon. */
function resolve(name: string): SVGElement {
  const icon = registry.get(name);
  const svg = icon === undefined ? null : typeof icon === 'string' ? fromMarkup(icon) : createElement(icon);
  if (svg) return svg;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[laymaker] ${icon === undefined ? 'unknown icon' : 'no <svg> in the markup of icon'} "${name}"`);
  }
  return name === FALLBACK_ICON ? createElement(DEFAULT_ICONS[FALLBACK_ICON]!) : resolve(FALLBACK_ICON);
}

export function renderIcon(name: string): SVGElement {
  const svg = resolve(name);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add(c('icon'));
  return svg;
}
