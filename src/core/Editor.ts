import type { Attrs, Schema } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createTranslator, type Translate } from '../i18n';
import { getDefaultExtensions } from '../extensions';
import { parseHTML, serializeHTML, isDocEmpty } from '../io/html';
import { c } from '../ui/classes';
import type { EditorUI } from '../ui/EditorUI';
import { EditorError } from './errors';
import { EventEmitter } from './EventEmitter';
import { ExtensionManager } from './ExtensionManager';
import { isMarkActive, isNodeActive } from './state-utils';
import { debounce, type Debounced } from './timing';
import type { CommandFactory, DeviceMode, EditorConfig } from './types';

export interface EditorEvents {
  update: [tr: Transaction];
  change: [html: string];
  selectionChange: [];
  focus: [];
  blur: [];
  uploadStart: [file: File];
  uploadProgress: [file: File, ratio: number];
  uploadSuccess: [file: File, url: string];
  uploadError: [error: EditorError, file: File];
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
  private readonly disposers: Array<() => void> = [];
  private editable = true;
  private destroyed = false;

  constructor(config: EditorConfig) {
    this.config = config;
    this.t = createTranslator(config.locale);
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
    this.content.className = c('content', 'prose');
    this.root.appendChild(this.content);
    this.mount();

    this.commands = this.manager.createCommands(this);
    this.view = new EditorView(this.content, {
      state: EditorState.create({ doc: parseHTML(this.schema, config.content), plugins: this.manager.createPlugins(this, this.commands) }),
      nodeViews: this.manager.createNodeViews(this),
      editable: () => this.editable,
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
    this.safeCall('onReady', () => config.onReady?.(this));
  }

  get state(): EditorState {
    return this.view.state;
  }

  get isEditable(): boolean {
    return this.view.editable;
  }

  getHTML(): string {
    return serializeHTML(this.schema, this.state.doc);
  }

  setHTML(html: string): void {
    if (this.destroyed) return;
    const doc = parseHTML(this.schema, html);
    this.view.dispatch(this.state.tr.replaceWith(0, this.state.doc.content.size, doc.content));
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

  focus(): void {
    if (!this.destroyed) this.view.focus();
  }

  blur(): void {
    (this.view.dom as HTMLElement).blur();
  }

  setEditable(editable: boolean): void {
    this.editable = editable;
    this.view.setProps({ editable: () => this.editable });
    this.root.classList.toggle(c('readonly'), !editable);
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
    if (this.destroyed) return;
    this.events.emit('destroy');
    this.changeDebounced.cancel();
    if (this.config.textarea) this.config.textarea.value = this.getHTML();
    this.destroyed = true;
    this.ui?.destroy();
    this.manager.runDestroy();
    this.view.destroy();
    this.disposers.forEach((dispose) => dispose());
    this.root.remove();
    this.events.clear();
  }

  private mount(): void {
    const { element, textarea } = this.config;
    if (!textarea) {
      element.appendChild(this.root);
      return;
    }
    const previousDisplay = textarea.style.display;
    textarea.style.display = 'none';
    textarea.after(this.root);
    const onSubmit = (): void => this.flushChange();
    textarea.form?.addEventListener('submit', onSubmit, true);
    this.disposers.push(() => {
      textarea.form?.removeEventListener('submit', onSubmit, true);
      textarea.style.display = previousDisplay;
    });
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
    if (this.config.textarea) this.config.textarea.value = html;
    this.events.emit('change', html);
    this.safeCall('onChange', () => this.config.onChange?.(html));
  }

  private command(name: string): CommandFactory | undefined {
    const factory = this.commands.get(name);
    if (!factory) console.warn(`[laymaker] unknown command "${name}"`);
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
