import { DEFAULTS } from '../core/defaults';
import { warn } from '../core/errors';
import { deepMerge } from '../core/merge';
import { en } from './en';
import { ko } from './ko';

export type LocalePack = { [key: string]: string | LocalePack };
export type Translate = (key: string, params?: Record<string, string | number>) => string;

const FALLBACK = 'en';
const registry = new Map<string, LocalePack>([
  [FALLBACK, en],
  ['ko', ko],
]);

/** Language tags are case-insensitive (BCP 47). */
const normalizeTag = (code: string): string => code.toLowerCase();

export function registerLocale(code: string, pack: LocalePack): void {
  registry.set(normalizeTag(code), pack);
}

/**
 * Lookup order: requested pack (the most specific registered tag; an unknown tag gets the default
 * language with a warning) → en → the key itself. A pack passed as an object is a partial override
 * of the default language (e.g. just the placeholder).
 */
export function createTranslator(locale: string | LocalePack): Translate {
  const pack =
    typeof locale === 'string'
      ? deepMerge<LocalePack>(registry.get(FALLBACK)!, packFor(locale))
      : deepMerge<LocalePack>(registry.get(FALLBACK)!, registry.get(DEFAULTS.locale), locale);
  return (key, params) => interpolate(lookup(pack, key) ?? key, params);
}

/** The most specific registered pack for a tag ('ko-KR' → 'ko'); an unknown tag gets the default language. */
function packFor(code: string): LocalePack {
  const subtags = normalizeTag(code).split('-');
  for (let length = subtags.length; length > 0; length--) {
    const pack = registry.get(subtags.slice(0, length).join('-'));
    if (pack) return pack;
  }
  warn(`unknown locale "${code}"; using "${DEFAULTS.locale}". Registered: ${[...registry.keys()].join(', ')}. Call registerLocale() before createEditor().`);
  return registry.get(DEFAULTS.locale)!;
}

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
