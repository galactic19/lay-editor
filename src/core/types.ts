import type { MarkSpec, Node as PMNode, NodeSpec, Schema } from 'prosemirror-model';
import type { InputRule } from 'prosemirror-inputrules';
import type { Command, Plugin } from 'prosemirror-state';
import type { NodeViewConstructor } from 'prosemirror-view';
import type { Translate, LocalePack } from '../i18n';
import type { Editor } from './Editor';
import type { EditorUI } from '../ui/EditorUI';
import type { UIComponent } from '../ui/UIComponent';
import type { PresetName } from '../ui/presets';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type DeviceMode = 'desktop' | 'mobile';
export const UI_CONTEXTS = ['text', 'table', 'image', 'link', 'codeBlock'] as const;
export type UIContext = (typeof UI_CONTEXTS)[number];
export type UISlot = 'top' | 'status' | 'overlay';
export type LocaleInput = string | LocalePack;

export type CommandFactory = (...args: any[]) => Command;
export type PasteCleaner = (html: string) => string;

export interface UploadResult {
  url: string;
  alt?: string;
}
export type UploadFn = (file: File, ctx: { onProgress(ratio: number): void }) => Promise<UploadResult>;

export interface PanelContext {
  editor: Editor;
  t: Translate;
  close(): void;
}
export type PanelFactory = (ctx: PanelContext) => HTMLElement;

export interface GlobalAttributeSpec {
  types: string[];
  attrs: Record<
    string,
    {
      default: unknown;
      parse(dom: HTMLElement): unknown;
      render(value: unknown): Record<string, string> | null;
    }
  >;
}

export interface ExtensionContext<O = any> {
  editor: Editor;
  options: O;
  schema: Schema;
  config: EditorConfig;
  t: Translate;
}

export interface UIItem {
  id: string;
  kind: 'button' | 'dropdown' | 'panel';
  icon: string;
  label: string;
  command?: string;
  args?: unknown[];
  shortcut?: string;
  contexts: UIContext[];
  isActive?(editor: Editor): boolean;
  isEnabled?(editor: Editor): boolean;
  options?: UIItem[];
  panel?: PanelFactory;
  slash?: { keywords: string[] };
}

export interface ComponentSpec {
  slot: UISlot;
  create(editor: Editor, ui: EditorUI): UIComponent;
}

export type ExtNodeSpec = NodeSpec & { transient?(node: PMNode): boolean };

export interface Extension<O = any> {
  name: string;
  optionsKey?: string;
  defaults?: O;
  dependencies?: string[];
  /** Higher runs first for keymaps and plugins. Default 100. */
  priority?: number;
  nodes?: Record<string, ExtNodeSpec>;
  marks?: Record<string, MarkSpec>;
  globalAttributes?: GlobalAttributeSpec[];
  commands?(ctx: ExtensionContext<O>): Record<string, CommandFactory>;
  /** A string value is a command name. */
  keymap?(ctx: ExtensionContext<O>): Record<string, string | Command>;
  inputRules?(ctx: ExtensionContext<O>): InputRule[];
  plugins?(ctx: ExtensionContext<O>): Plugin[];
  nodeViews?(ctx: ExtensionContext<O>): Record<string, NodeViewConstructor>;
  pasteCleaners?: PasteCleaner[];
  ui?(ctx: ExtensionContext<O>): UIItem[];
  components?(ctx: ExtensionContext<O>): ComponentSpec[];
  /** The returned function runs on destroy. */
  onCreate?(ctx: ExtensionContext<O>): void | (() => void);
}

/** Public options. Extension options are passed under the extension name (or its optionsKey). */
export interface EditorOptions {
  element: string | HTMLElement;
  content?: string;
  preset?: PresetName;
  toolbar?: string[];
  locale?: LocaleInput;
  theme?: ThemeMode;
  placeholder?: string;
  upload?: UploadFn;
  changeDebounce?: number;
  extensions?: Extension[];
  disable?: string[];
  onChange?(html: string): void;
  onReady?(editor: Editor): void;
  [extensionOptions: string]: unknown;
}

export interface EditorConfig {
  element: HTMLElement;
  textarea: HTMLTextAreaElement | null;
  content: string;
  preset: PresetName;
  toolbar: string[] | null;
  locale: LocaleInput;
  theme: ThemeMode;
  placeholder: string | null;
  upload: UploadFn | null;
  changeDebounce: number;
  extensions: Extension[];
  disable: string[];
  raw: EditorOptions;
  onChange?(html: string): void;
  onReady?(editor: Editor): void;
}
