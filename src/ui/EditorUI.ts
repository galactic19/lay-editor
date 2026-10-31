import type { Editor } from '../core/Editor';
import { DEFAULTS } from '../core/defaults';
import { EditorError } from '../core/errors';
import { rafBatch } from '../core/timing';
import type { DeviceMode, UIContext, UIItem, UISlot } from '../core/types';
import { itemLabel } from '../i18n';
import { c } from './classes';
import { BubbleMenu } from './BubbleMenu';
import { resolveContext } from './context';
import { ContextToolbar } from './ContextToolbar';
import { DeviceWatcher, ViewportTracker } from './device';
import { selectionReference, type Anchor } from './floating';
import { h } from './dom';
import { MobileToolbar } from './MobileToolbar';
import { listPanel } from './panels/listPanel';
import { PanelHost } from './PanelHost';
import { PRESETS, SEPARATOR } from './presets';
import { ThemeController } from './theme';
import { Toaster } from './Toast';
import { Toolbar, type ToolbarEntry } from './Toolbar';
import { Tooltip } from './Tooltip';
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
  readonly tooltip: Tooltip;
  private readonly slots: Record<Exclude<UISlot, 'overlay'>, HTMLElement>;
  private readonly extensionComponents: UIComponent[] = [];
  private modeComponents: UIComponent[] = [];
  private toolbar: Toolbar | null = null;
  private mobileBar: MobileToolbar | null = null;
  private readonly batch = rafBatch(() => this.updateAll());
  private readonly disposers: Array<() => void> = [];

  private get lockOwner(): string | undefined {
    return this.editor.root.dataset.lockedExcept;
  }

  constructor(private readonly editor: Editor) {
    this.registry = editor.manager.createUIRegistry(editor);
    this.entries = this.resolveEntries();
    this.slots = { top: h('div', { class: c('top') }), status: h('div', { class: c('status') }) };
    editor.root.prepend(this.slots.top);
    editor.root.append(this.slots.status);
    this.device = new DeviceWatcher(editor.root, DEFAULTS.mobileBreakpoint);
    this.panels = new PanelHost(editor, () => this.device.mode);
    this.theme = new ThemeController(() => [editor.root], editor.theme);
    this.toaster = new Toaster(editor.root, () => this.mobileBar?.coveredHeight ?? this.viewport.bottomInset);
    this.tooltip = new Tooltip(editor.root);

    for (const spec of editor.manager.createComponents(editor)) {
      const component = spec.create(editor, this);
      (spec.slot === 'overlay' ? document.body : this.slots[spec.slot]).appendChild(component.el);
      this.extensionComponents.push(component);
    }
    this.mountMode(this.device.mode);
    this.disposers.push(
      editor.on('update', () => this.batch.schedule()),
      this.device.onChange((mode) => this.switchMode(mode)),
      this.theme.onChange(() => this.syncTheme()),
      this.viewport.onChange(() => this.toaster.place()),
    );
    this.updateAll();
  }

  /** Opens an item's panel next to `anchor`, its toolbar control, or else the selection. */
  openPanelFor(itemId: string, anchor?: Anchor | null): void {
    const item = this.registry.get(itemId);
    if (!item) return;
    const at = anchor ?? this.toolbar?.anchorFor(itemId) ?? selectionReference(this.editor.view);
    const label = itemLabel(this.editor.t, item);
    if (item.panel) this.panels.openPanel(item.panel, at, label);
    else if (item.options) this.panels.openPanel(listPanel(() => item.options!), at, label);
  }

  /** Viewport height the sticky top bar covers; the bubble and the context toolbar flip below their target rather than cover it. */
  get coveredTop(): number {
    return Math.max(0, this.slots.top.getBoundingClientRect().bottom);
  }

  /**
   * Viewport height the mobile keyboard bar covers; the slash menu flips above the caret rather than run under it.
   * Floating elements are placed within the visual viewport, which already ends above the on-screen keyboard.
   */
  get coveredBottom(): number {
    return this.mobileBar?.barHeight ?? 0;
  }

  getContext(): UIContext {
    return resolveContext(this.editor.state);
  }

  /**
   * Alt+F10: moves focus to the floating toolbar next to the selection (context toolbar or
   * bubble), else the main toolbar. False when no toolbar is showing; `dryRun` only checks.
   * A real run first applies a selection change the editor or the UI has not caught up with,
   * so a key pressed in the same frame as the caret move reaches the toolbar for the new selection.
   */
  focusToolbar(dryRun = false): boolean {
    if (!dryRun) {
      this.editor.syncSelection();
      this.batch.flush();
    }
    const stop = this.modeComponents.map((component) => component.tabStop()).find(Boolean);
    if (stop && !dryRun) stop.focus();
    return Boolean(stop);
  }

  /** Whether an item is temporarily unavailable regardless of state (e.g. while editing source). */
  isLocked(item: UIItem): boolean {
    return this.lockOwner !== undefined && !this.holdsLock(item);
  }

  /** Whether an item set the lock (it alone stays usable while the lock holds). */
  holdsLock(item: UIItem): boolean {
    return item.id === this.lockOwner;
  }

  /** Whether an item is the way out of a mode the user is in (it set the lock, or it is a view toggle that is on); it stays usable in read-only mode. */
  isWayOut(item: UIItem): boolean {
    return this.holdsLock(item) || Boolean(item.viewToggle && item.isActive?.(this.editor));
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
    this.tooltip.destroy();
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
      this.mobileBar = new MobileToolbar(this.editor, this);
      this.modeComponents = [this.mobileBar];
      return;
    }
    this.mobileBar = null;
    this.toolbar = new Toolbar(this.editor, this, this.entries);
    this.slots.top.prepend(this.toolbar.el);
    // In focusToolbar() order: the floating toolbars next to the selection come first.
    this.modeComponents = [new ContextToolbar(this.editor, this), new BubbleMenu(this.editor, this), this.toolbar];
    this.toolbar.layout();
  }

  private switchMode(mode: DeviceMode): void {
    this.panels.close();
    this.tooltip.hide();
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

  /** Portals copy the root's theme only when they update, so repaint them now rather than on the next transaction. */
  private syncTheme(): void {
    this.panels.syncTheme();
    this.toaster.place();
    this.flush();
  }

  private updateAll(): void {
    [...this.modeComponents, ...this.extensionComponents].forEach((component) => component.update());
  }
}
