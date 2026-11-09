export { createEditor } from './core/createEditor';
export { Editor } from './core/Editor';
export type { EditorEvents } from './core/Editor';
export { EditorError } from './core/errors';
export type { EditorErrorCode } from './core/errors';
export { DEFAULTS } from './core/defaults';
export { createTranslator, registerLocale } from './i18n';
export type { LocalePack, Translate } from './i18n';
export type {
  CoreEditorOptions,
  EditorOptions,
  Extension,
  ExtensionContext,
  UIItem,
  UIContext,
  ThemeMode,
  UploadFn,
  UploadResult,
} from './core/types';
export { sanitizeHTML } from './io/sanitize';
export { registerVideoProvider } from './extensions/media/video-providers';
export type { VideoProvider } from './extensions/media/video-providers';
export { blockExtension, defineExtension, markExtension } from './extensions/factories';
export { registerIcon } from './ui/icons';
export { PRESETS } from './ui/presets';
export type { PresetName } from './ui/presets';
export type { ComponentSpec, PanelContext, PanelFactory, PasteCleaner } from './core/types';
