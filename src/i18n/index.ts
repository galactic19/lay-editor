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

export function registerLocale(code: string, pack: LocalePack): void {
  registry.set(code, pack);
}

/** Lookup order: requested pack → en → the key itself. */
export function createTranslator(locale: string | LocalePack): Translate {
  const requested = typeof locale === 'string' ? registry.get(locale) : locale;
  const pack = deepMerge<LocalePack>(registry.get(FALLBACK)!, requested);
  return (key, params) => interpolate(lookup(pack, key) ?? key, params);
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
