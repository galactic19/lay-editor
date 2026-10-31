import { DEFAULTS } from '../core/defaults';
import { deepMerge } from '../core/merge';
import type { UIItem } from '../core/types';
import { en } from './en';
import { ko } from './ko';

export type LocalePack = { [key: string]: string | LocalePack };
export type Translate = (key: string, params?: Record<string, string | number>) => string;

const FALLBACK = 'en';
const registry = new Map<string, LocalePack>([
  [FALLBACK, en],
  ['ko', ko],
]);

export function registerLocale(code: string, pack: LocalePack): void {
  registry.set(code, pack);
}

/**
 * Lookup order: requested pack → en → the key itself. A pack passed as an object is a
 * partial override of the default language (e.g. just the placeholder).
 */
export function createTranslator(locale: string | LocalePack): Translate {
  const pack =
    typeof locale === 'string'
      ? deepMerge<LocalePack>(registry.get(FALLBACK)!, registry.get(locale))
      : deepMerge<LocalePack>(registry.get(FALLBACK)!, registry.get(DEFAULTS.locale), locale);
  return (key, params) => interpolate(lookup(pack, key) ?? key, params);
}

/** The translated label of a UI item, for its control, the dialog it opens and the slash menu. */
export const itemLabel = (t: Translate, item: Pick<UIItem, 'label' | 'labelParams'>): string => t(item.label, item.labelParams);

export function flattenKeys(pack: LocalePack, prefix = ''): string[] {
  return Object.entries(pack).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : flattenKeys(value, `${prefix}${key}.`),
  );
}

function lookup(pack: LocalePack, key: string): string | undefined {
  let node: string | LocalePack | undefined = pack;
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
