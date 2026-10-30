import { DEFAULTS } from './defaults';
import { EditorError } from './errors';
import type { EditorConfig, EditorOptions, ThemeMode } from './types';
import { PRESET_NAMES, type PresetName } from '../ui/presets';

export const THEME_MODES = ['light', 'dark', 'auto'] as const satisfies readonly ThemeMode[];

function invalid(name: string, value: unknown): never {
  throw new EditorError('INVALID_OPTION', `${name}: ${JSON.stringify(value) ?? String(value)}`);
}

function check(ok: boolean, name: string, value: unknown): void {
  if (!ok) invalid(name, value);
}

function resolveElement(target: EditorOptions['element']): HTMLElement {
  const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!(element instanceof HTMLElement)) throw new EditorError('ELEMENT_NOT_FOUND', String(target));
  return element;
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** Validates user options and fills defaults. Throws EditorError on developer mistakes. */
export function resolveConfig(options: EditorOptions): EditorConfig {
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
  check(upload === undefined || typeof upload === 'function', 'upload', upload);
  check(toolbar === undefined || isStringArray(toolbar), 'toolbar', toolbar);
  check(Array.isArray(extensions), 'extensions', extensions);
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
