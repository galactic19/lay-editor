import type { Editor } from '../core/Editor';
import { DEFAULTS } from '../core/defaults';
import { EditorError } from '../core/errors';
import { rafBatch } from '../core/timing';
import type { DeviceMode, UIContext, UIItem, UISlot } from '../core/types';
import { c } from './classes';
import { BubbleMenu } from './BubbleMenu';
import { resolveContext } from './context';
import { ContextToolbar } from './ContextToolbar';
import { DeviceWatcher, ViewportTracker } from './device';
import { h } from './dom';
import { MobileToolbar } from './MobileToolbar';
import { listPanel } from './panels/listPanel';
import { PanelHost } from './PanelHost';
import { PRESETS, SEPARATOR } from './presets';
import { ThemeController } from './theme';
import { Toaster } from './Toast';
import { Toolbar, type ToolbarEntry } from './Toolbar';
import type { UIComponent } from './UIComponent';

/** Drops leading, trailing and repeated separators. */
function tidySeparators(entries: ToolbarEntry[]): ToolbarEntry[] {
  return entries.filter((entry, i, all) => entry !== SEPARATOR || (i > 0 && i < all.length - 1 && all[i - 1] !== SEPARATOR));
}

/** Owns every piece of editor chrome and keeps it in sync with the editor state. */
export class EditorUI {
  readonly registry: Map<string, UIItem>;
  /** Toolbar items resolved from the preset or the `toolbar` option. */
  readonly entries: ToolbarEntry[];
  readonly panels: PanelHost;
  readonly toaster: Toaster;
  readonly device: DeviceWatcher;
  readonly viewport = new ViewportTracker();
  readonly theme: ThemeController;
  private readonly slots: Record<Exclude<UISlot, 'overlay'>, HTMLElement>;
  private readonly extensionComponents: UIComponent[] = [];
  private modeComponents: UIComponent[] = [];
  private toolbar: Toolbar | null = null;
  private readonly batch = rafBatch(() => this.updateAll());
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly editor: Editor) {
    this.registry = editor.manager.createUIRegistry(editor);
    this.entries = this.resolveEntries();
    this.slots = { top: h('div', { class: c('top') }), status: h('div', { class: c('status') }) };
    editor.root.prepend(this.slots.top);
    editor.root.append(this.slots.status);
    this.device = new DeviceWatcher(editor.root, DEFAULTS.mobileBreakpoint);
    this.theme = new ThemeController(() => [editor.root], editor.config.theme);
    this.panels = new PanelHost(editor, () => this.device.mode);
    this.toaster = new Toaster(editor.root);

    for (const spec of editor.manager.createComponents(editor)) {
      const component = spec.create(editor, this);
      (spec.slot === 'overlay' ? document.body : this.slots[spec.slot]).appendChild(component.el);
      this.extensionComponents.push(component);
    }
    this.mountMode(this.device.mode);
    this.disposers.push(
      editor.on('update', () => this.batch.schedule()),
      this.device.onChange((mode) => this.switchMode(mode)),
    );
    this.updateAll();
  }

  openPanelFor(itemId: string, anchor?: HTMLElement | null): void {
    const item = this.registry.get(itemId);
    if (!item) return;
    const at = anchor ?? this.toolbar?.anchorFor(itemId) ?? null;
    if (item.panel) this.panels.openPanel(item.panel, at);
    else if (item.options) this.panels.openPanel(listPanel(() => item.options!), at);
  }

  getContext(): UIContext {
    return resolveContext(this.editor.state);
  }

  /** Whether an item is temporarily unavailable regardless of state (e.g. while editing source). */
  isLocked(item: UIItem): boolean {
    const except = this.editor.root.dataset.lockedExcept;
    return except !== undefined && item.id !== except;
  }

  /** Runs pending UI updates now. */
  flush(): void {
    this.batch.cancel();
    this.updateAll();
  }

  destroy(): void {
    this.batch.cancel();
    this.disposers.splice(0).forEach((dispose) => dispose());
    [...this.modeComponents, ...this.extensionComponents].forEach((component) => component.destroy());
    this.modeComponents = [];
    this.panels.destroy();
    this.toaster.destroy();
    this.device.destroy();
    this.viewport.destroy();
    this.theme.destroy();
    Object.values(this.slots).forEach((slot) => slot.remove());
  }

  /** Desktop: top toolbar, context toolbar and bubble. Mobile: the keyboard bar. */
  private mountMode(mode: DeviceMode): void {
    this.editor.root.dataset.mode = mode;
    if (mode === 'mobile') {
      this.toolbar = null;
      this.modeComponents = [new MobileToolbar(this.editor, this)];
      return;
    }
    this.toolbar = new Toolbar(this.editor, this, this.entries);
    this.slots.top.prepend(this.toolbar.el);
    this.modeComponents = [this.toolbar, new ContextToolbar(this.editor, this), new BubbleMenu(this.editor, this)];
    this.toolbar.layout();
  }

  private switchMode(mode: DeviceMode): void {
    this.panels.close();
    this.modeComponents.splice(0).forEach((component) => component.destroy());
    this.mountMode(mode);
    this.editor.emit('modeChange', mode);
    this.flush();
  }

  private resolveEntries(): ToolbarEntry[] {
    const { toolbar, preset } = this.editor.config;
    const strict = toolbar !== null;
    const entries: ToolbarEntry[] = [];
    for (const id of toolbar ?? PRESETS[preset]) {
      const item = id === SEPARATOR ? SEPARATOR : this.registry.get(id);
      if (item) entries.push(item);
      else if (strict) console.warn(new EditorError('UNKNOWN_UI_ITEM', `"${id}"; available: ${[...this.registry.keys()].join(', ')}`).message);
    }
    return tidySeparators(entries);
  }

  private updateAll(): void {
    [...this.modeComponents, ...this.extensionComponents].forEach((component) => component.update());
  }
}
