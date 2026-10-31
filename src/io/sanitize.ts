import type { Schema } from 'prosemirror-model';
import { DEFAULTS } from '../core/defaults';
import { ExtensionManager } from '../core/ExtensionManager';
import type { Extension } from '../core/types';
import { getDefaultExtensions } from '../extensions';
import { parseHTML, serializeHTML } from './html';

// Control characters and whitespace browsers ignore inside a URL scheme.
const IGNORED_IN_SCHEME = /[\u0000- \u007f-\u009f]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const BYTE = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = new RegExp(`^rgb\\(\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*${BYTE}\\s*\\)$`, 'i');
const RGBA = new RegExp(`^rgba\\(\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*(0|1|0?\\.\\d+|1\\.0+)\\s*\\)$`, 'i');
const PERCENT = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/;
const LANGUAGE = /^[a-z0-9+#-]{1,20}$/i;
/** Code blocks name their language with this class prefix (`<code class="language-js">`). */
const LANGUAGE_CLASS = 'language-';

function isDataImage(value: string): boolean {
  const match = /^data:([^;,]+);base64,[a-z0-9+/=\s]+$/i.exec(value);
  return Boolean(match && (DEFAULTS.url.dataImageTypes as readonly string[]).includes(match[1]!.toLowerCase()));
}

/** Returns the trimmed URL when its scheme is allowed (or it is relative), else null. */
export function safeUrl(value: string | null | undefined, opts: { allowDataImage?: boolean } = {}): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const scheme = SCHEME.exec(trimmed.replace(IGNORED_IN_SCHEME, ''))?.[1]?.toLowerCase();
  if (!scheme) return trimmed;
  if (scheme === 'data') return opts.allowDataImage && isDataImage(trimmed) ? trimmed : null;
  return (DEFAULTS.url.protocols as readonly string[]).includes(`${scheme}:`) ? trimmed : null;
}

export function safeColor(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (HEX_COLOR.test(v)) return v.toLowerCase();
  const rgb = RGB.exec(v);
  if (rgb) return `rgb(${rgb.slice(1, 4).join(',')})`;
  const rgba = RGBA.exec(v);
  return rgba ? `rgba(${rgba.slice(1, 5).join(',')})` : null;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Percentage width clamped to the image limits; anything else is null. */
export function clampWidth(value: string | number | null | undefined): number | null {
  const n = typeof value === 'number' ? value : Number(PERCENT.exec(value ?? '')?.[1] ?? NaN);
  if (!Number.isFinite(n)) return null;
  return Math.round(clamp(n, DEFAULTS.image.minWidth, DEFAULTS.image.maxWidth));
}

/**
 * Whole number clamped to [min, max]. Strings are read like HTML integer attributes, by their leading digits
 * ("5px" is 5, "1e9" is 1); anything without them becomes `min`.
 */
export function clampInteger(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? Math.trunc(value) : parseInt(String(value), 10);
  return Number.isFinite(n) ? clamp(n, min, max) : min;
}

export function safeLanguage(value: string | null | undefined): string | null {
  return value && LANGUAGE.test(value) ? value : null;
}

/** The safe language a `language-xxx` class in `classes` names, else null. */
export function classLanguage(classes: Iterable<string>): string | null {
  const cls = [...classes].find((name) => name.startsWith(LANGUAGE_CLASS));
  return safeLanguage(cls?.slice(LANGUAGE_CLASS.length));
}

export const languageClass = (language: string): string => `${LANGUAGE_CLASS}${language}`;

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

let defaultSchema: Schema | null = null;

/** Parses HTML with the editor schema and serializes it back; anything the schema does not allow is dropped. */
export function sanitizeHTML(html: string, opts: { extensions?: Extension[]; disable?: string[] } = {}): string {
  const custom = Boolean(opts.extensions?.length || opts.disable?.length);
  const schema = custom
    ? ExtensionManager.buildSchema([...getDefaultExtensions(), ...(opts.extensions ?? [])], opts.disable)
    : (defaultSchema ??= ExtensionManager.buildSchema(getDefaultExtensions()));
  return serializeHTML(schema, parseHTML(schema, html));
}
