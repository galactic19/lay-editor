import { DEFAULTS } from './defaults';
import { EditorError } from './errors';
import { isPlainObject } from './merge';
import type { EditorConfig, EditorOptions, Extension, ThemeMode } from './types';
import { PRESET_NAMES, type PresetName } from '../ui/presets';

export const THEME_MODES = ['light', 'dark', 'auto'] as const satisfies readonly ThemeMode[];
const FUNCTION_OPTIONS = ['upload', 'onChange', 'onReady'] as const;

function describe(value: unknown): string {
  try {
    return typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? String(value));
  } catch {
    return String(value);
  }
}

function check(ok: boolean, name: string, value: unknown): void {
  if (!ok) throw new EditorError('INVALID_OPTION', `${name}: ${describe(value)}`);
}

/** A malformed selector cannot match anything. */
function query(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function resolveElement(target: unknown): HTMLElement {
  const element = typeof target === 'string' ? query(target) : (target as Element | null | undefined);
  if (element instanceof HTMLElement) return element;
  if (element?.nodeType === Node.ELEMENT_NODE && element.ownerDocument !== document) {
    throw new EditorError('INVALID_OPTION', `element: <${element.localName}> belongs to another document (an iframe); load the editor in that document`);
  }
  throw new EditorError('ELEMENT_NOT_FOUND', String(target));
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isExtension = (value: unknown): value is Extension =>
  typeof value === 'object' && value !== null && typeof (value as Extension).name === 'string' && (value as Extension).name !== '';
/** Comparable kinds of option values; NaN is not a usable number. */
const kindOf = (value: unknown): string => (Number.isNaN(value) ? 'NaN' : Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

/**
 * Checks extension options against the shape of the extension's defaults: a number stays a number,
 * a list a list of the same kind, a group an object. Keys without a default (or a null one) are left
 * to the extension.
 */
export function checkOptionShape(name: string, defaults: unknown, value: unknown): void {
  if (value === undefined || defaults == null) return;
  check(kindOf(value) === kindOf(defaults), name, value);
  if (Array.isArray(defaults) && defaults.length) (value as unknown[]).forEach((item, i) => checkOptionShape(`${name}[${i}]`, defaults[0], item));
  if (isPlainObject(defaults)) Object.entries(value as object).forEach(([key, item]) => checkOptionShape(`${name}.${key}`, defaults[key], item));
}

/** Validates user options and fills defaults. Throws EditorError on developer mistakes. */
export function resolveConfig(options: EditorOptions): EditorConfig {
  check(typeof options === 'object' && options !== null, 'options', options);
  const element = resolveElement(options.element);
  const textarea = element instanceof HTMLTextAreaElement ? element : null;
  const {
    preset = DEFAULTS.preset,
    theme = DEFAULTS.theme,
    locale = DEFAULTS.locale,
    changeDebounce = DEFAULTS.changeDebounce,
    toolbar,
    upload,
    extensions = [],
    disable = [],
    placeholder,
  } = options;

  check(PRESET_NAMES.includes(preset as PresetName), 'preset', preset);
  check(THEME_MODES.includes(theme), 'theme', theme);
  check(typeof changeDebounce === 'number' && Number.isFinite(changeDebounce) && changeDebounce >= 0, 'changeDebounce', changeDebounce);
  for (const name of FUNCTION_OPTIONS) check(options[name] === undefined || typeof options[name] === 'function', name, options[name]);
  check(options.content == null || typeof options.content === 'string', 'content', options.content);
  check(toolbar === undefined || isStringArray(toolbar), 'toolbar', toolbar);
  check(Array.isArray(extensions) && extensions.every(isExtension), 'extensions', extensions);
  check(isStringArray(disable), 'disable', disable);
  check(typeof locale === 'string' || (typeof locale === 'object' && locale !== null), 'locale', locale);
  check(placeholder === undefined || typeof placeholder === 'string', 'placeholder', placeholder);

  const config: EditorConfig = {
    element,
    textarea,
    content: options.content ?? textarea?.value ?? '',
    preset: preset as PresetName,
    toolbar: toolbar ?? null,
    locale,
    theme,
    placeholder: placeholder ?? null,
    upload: upload ?? null,
    changeDebounce,
    extensions,
    disable,
    raw: options,
  };
  if (options.onChange) config.onChange = options.onChange;
  if (options.onReady) config.onReady = options.onReady;
  return config;
}
