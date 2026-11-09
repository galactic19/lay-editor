import type { Attrs, Schema } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createTranslator, type Translate } from '../i18n';
import { getDefaultExtensions } from '../extensions';
import { withFreshHistory } from '../extensions/base/history';
import { parseHTML, serializeHTML, isDocEmpty } from '../io/html';
import { c } from '../ui/classes';
import { EditorUI } from '../ui/EditorUI';
import { EditorError, warn } from './errors';
import { EventEmitter } from './EventEmitter';
import { ExtensionManager } from './ExtensionManager';
import { isMarkActive, isNodeActive } from './state-utils';
import { TextareaBinding } from './TextareaBinding';
import { debounce, type Debounced } from './timing';
import type { CommandFactory, DeviceMode, EditorConfig, LocaleInput, ThemeMode } from './types';

export interface EditorEvents {
  update: [tr: Transaction];
  change: [html: string];
  selectionChange: [];
  focus: [];
  blur: [];
  uploadStart: [file: File];
  uploadProgress: [file: File, ratio: number];
  uploadSuccess: [file: File, url: string];
  uploadError: [file: File, error: EditorError];
  error: [error: EditorError];
  modeChange: [mode: DeviceMode];
  destroy: [];
}

export class Editor {
  readonly config: EditorConfig;
  readonly manager: ExtensionManager;
  readonly schema: Schema;
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  readonly view: EditorView;
  readonly commands: Map<string, CommandFactory>;
  t: Translate;
  ui: EditorUI | null = null;

  private readonly events: EventEmitter<EditorEvents>;
  private readonly changeDebounced: Debounced<[]>;
  private readonly textareaBinding: TextareaBinding | null;
  private editable = true;
  /** Set when destroy() starts, so a 'destroy' listener that calls destroy() again is ignored. */
  private destroying = false;
  private destroyed = false;
  /** Kept here, not only in the UI, so a rebuild (setLocale) keeps the theme set at runtime. */
  private themeMode: ThemeMode;

  constructor(config: EditorConfig) {
    this.config = config;
    this.t = createTranslator(config.locale);
    this.themeMode = config.theme;
    this.events = new EventEmitter<EditorEvents>({
      onListenerError: (cause, event) => {
        if (event === 'error') console.error(cause);
        else this.reportError(new EditorError('CALLBACK_FAILED', `"${String(event)}" listener`, { cause }));
      },
    });
    this.manager = new ExtensionManager([...getDefaultExtensions(), ...config.extensions], config, (e) => this.reportError(e));
    this.schema = this.manager.schema;
    this.changeDebounced = debounce(() => this.emitChange(), config.changeDebounce);

    this.root = document.createElement('div');
    this.root.className = c('editor');
    this.content = document.createElement('div');
    this.content.className = c('content');
    this.root.appendChild(this.content);
    this.textareaBinding = config.textarea ? new TextareaBinding(this, config.textarea) : null;
    if (this.textareaBinding) this.textareaBinding.mount(this.root);
    else config.element.appendChild(this.root);

    this.commands = this.manager.createCommands(this);
    this.view = new EditorView(this.content, {
      state: EditorState.create({ doc: parseHTML(this.schema, config.content), plugins: this.manager.createPlugins(this, this.commands) }),
      nodeViews: this.manager.createNodeViews(this),
      editable: () => this.editable,
      // A named multi-line textbox, so assistive technology announces it and the slash menu can point into it.
      attributes: () => ({
        class: c('prose'),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': this.t('a11y.editor'),
        'aria-readonly': String(!this.editable),
      }),
      dispatchTransaction: (tr) => this.dispatch(tr),
      handleDOMEvents: {
        focus: () => (this.events.emit('focus'), false),
        blur: () => {
          this.flushChange();
          this.events.emit('blur');
          return false;
        },
      },
    });
    this.manager.runCreate(this);
    this.ui = new EditorUI(this);
    // The form posts the textarea, so it must hold what the editor shows (the content option, sanitized) from the start.
    this.textareaBinding?.sync();
    this.safeCall('onReady', () => config.onReady?.(this));
  }

  get state(): EditorState {
    return this.view.state;
  }

  get isEditable(): boolean {
    return this.view.editable;
  }

  /** The current theme mode: the `theme` option until setTheme() changes it. */
  get theme(): ThemeMode {
    return this.themeMode;
  }

  getHTML(): string {
    return serializeHTML(this.schema, this.state.doc);
  }

  /**
   * Loads new content. Like the initial content it starts a fresh undo history and is not an
   * undo step itself, so Ctrl+Z can neither empty the editor nor bring back the previous document.
   * Other plugin state (an open search) and the DOM of unchanged blocks are kept.
   */
  setHTML(html: string): void {
    if (this.destroyed) return;
    const doc = parseHTML(this.schema, html);
    this.view.updateState(withFreshHistory(this.state));
    this.view.dispatch(this.state.tr.replaceWith(0, this.state.doc.content.size, doc.content).setMeta('addToHistory', false));
  }

  getText(): string {
    return this.state.doc.textBetween(0, this.state.doc.content.size, '\n', '\n');
  }

  isEmpty(): boolean {
    return isDocEmpty(this.state.doc);
  }

  exec(name: string, ...args: unknown[]): boolean {
    if (this.destroyed) return false;
    const factory = this.command(name);
    return factory ? factory(...args)(this.state, (tr) => this.view.dispatch(tr), this.view) : false;
  }

  can(name: string, ...args: unknown[]): boolean {
    if (this.destroyed) return false;
    const factory = this.command(name);
    return factory ? factory(...args)(this.state, undefined, this.view) : false;
  }

  isActive(name: string, attrs?: Attrs): boolean {
    const mark = this.schema.marks[name];
    if (mark) return isMarkActive(this.state, mark, attrs);
    const node = this.schema.nodes[name];
    return node ? isNodeActive(this.state, node, attrs) : false;
  }

  /**
   * Applies a DOM selection change ProseMirror has not read yet. Browsers report selection
   * changes asynchronously, so a fast shortcut (Shift+Home, then Mod-k) can otherwise act on
   * the old selection once focus moves into a panel.
   */
  syncSelection(): void {
    if (!this.destroyed) (this.view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush();
  }

  focus(): void {
    if (!this.destroyed) this.view.focus();
  }

  blur(): void {
    if (!this.destroyed) (this.view.dom as HTMLElement).blur();
  }

  setEditable(editable: boolean): void {
    if (this.destroyed) return;
    this.editable = editable;
    this.view.setProps({ editable: () => this.editable });
    this.root.classList.toggle(c('readonly'), !editable);
    this.ui?.flush();
  }

  setTheme(theme: ThemeMode): void {
    if (this.destroyed) return;
    this.themeMode = theme;
    this.ui?.theme.set(theme);
  }

  /** Swaps the language pack and rebuilds the UI so every label is re-translated. */
  setLocale(locale: LocaleInput): void {
    if (this.destroyed) return;
    this.t = createTranslator(locale);
    this.ui?.destroy();
    this.ui = new EditorUI(this);
    this.view.dispatch(this.state.tr.setMeta('localeChange', true));
  }

  /** Deletes the autosaved draft; call after the content was saved for real. */
  clearDraft(): void {
    if (this.commands.has('clearDraft')) this.exec('clearDraft');
  }

  on<K extends keyof EditorEvents>(event: K, fn: (...args: EditorEvents[K]) => void): () => void {
    return this.events.on(event, fn);
  }

  off<K extends keyof EditorEvents>(event: K, fn: (...args: EditorEvents[K]) => void): void {
    this.events.off(event, fn);
  }

  /** Internal: lets extensions and UI emit editor events. */
  emit<K extends keyof EditorEvents>(event: K, ...args: EditorEvents[K]): void {
    if (!this.destroyed) this.events.emit(event, ...args);
  }

  reportError(error: EditorError): void {
    if (this.events.listenerCount('error')) this.events.emit('error', error);
    else console.error(error);
  }

  flushChange(): void {
    this.changeDebounced.flush();
  }

  destroy(): void {
    if (this.destroying) return;
    this.destroying = true;
    this.events.emit('destroy');
    this.changeDebounced.cancel();
    this.textareaBinding?.sync();
    this.destroyed = true;
    this.ui?.destroy();
    this.manager.runDestroy();
    this.view.destroy();
    this.textareaBinding?.destroy();
    this.root.remove();
    this.events.clear();
  }

  private dispatch(tr: Transaction): void {
    if (this.destroyed) return;
    const previous = this.state;
    this.view.updateState(previous.apply(tr));
    this.events.emit('update', tr);
    if (!previous.selection.eq(this.state.selection)) this.events.emit('selectionChange');
    if (tr.docChanged) this.changeDebounced();
  }

  private emitChange(): void {
    if (this.destroyed) return;
    const html = this.getHTML();
    this.events.emit('change', html);
    this.safeCall('onChange', () => this.config.onChange?.(html));
  }

  private command(name: string): CommandFactory | undefined {
    const factory = this.commands.get(name);
    if (!factory) warn(`unknown command "${name}"`);
    return factory;
  }

  private safeCall(name: string, fn: () => void): void {
    try {
      fn();
    } catch (cause) {
      this.reportError(new EditorError('CALLBACK_FAILED', name, { cause }));
    }
  }
}
