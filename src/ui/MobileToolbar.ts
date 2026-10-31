import type { Editor } from '../core/Editor';
import { DEFAULTS } from '../core/defaults';
import type { UIContext, UIItem } from '../core/types';
import { c, PORTAL_CLASS } from './classes';
import { contextOnlyItems } from './context';
import { createControl, createSeparator, syncControl } from './controls';
import { h } from './dom';
import type { EditorUI } from './EditorUI';
import { SEPARATOR } from './presets';
import { RovingFocus } from './roving';
import type { ToolbarEntry } from './Toolbar';
import { UIComponent } from './UIComponent';

const { scrollGap } = DEFAULTS.mobileBar;

/** One-row toolbar pinned above the on-screen keyboard; its items follow the selection context. */
export class MobileToolbar extends UIComponent<HTMLDivElement> {
  private context: UIContext | null = null;
  private controls: Array<{ item: UIItem; el: HTMLButtonElement }> = [];
  private readonly roving: RovingFocus;
  private height = -1;

  constructor(
    editor: Editor,
    private readonly ui: EditorUI,
  ) {
    super(editor, h('div', { class: `${PORTAL_CLASS} ${c('mobile-bar')}`, attrs: { role: 'toolbar', 'aria-label': editor.t('a11y.toolbar'), hidden: true } }));
    document.body.appendChild(this.el);
    this.roving = new RovingFocus(this.el, `.${c('control')}`);
    this.addDisposer(() => this.roving.destroy());
    this.addDisposer(ui.viewport.onChange(() => this.place()));
    this.addDisposer(() => {
      editor.root.style.removeProperty('--le-mobile-bar-height');
      editor.view.setProps({ scrollMargin: undefined, scrollThreshold: undefined });
    });
    // The bar is the only chrome on mobile, so while editing, focus anywhere in the editor keeps it, the HTML source textarea included.
    this.followEditorFocus(editor.root);
  }

  /** Context-only tools first, then the regular tools that also work in this context. */
  private entries(context: UIContext): ToolbarEntry[] {
    if (context === 'text') return this.ui.entries;
    const shared = this.ui.entries.filter((entry): entry is UIItem => entry !== SEPARATOR && entry.contexts.includes(context));
    return [...contextOnlyItems(this.ui.registry, context), SEPARATOR, ...shared];
  }

  /** Screen height it and the on-screen keyboard cover at the bottom. */
  get coveredHeight(): number {
    return this.ui.viewport.bottomInset + (this.el.hidden ? 0 : this.el.offsetHeight);
  }

  override update(): void {
    // A read-only editor has nothing to edit, even when a link or task checkbox in the content takes focus.
    if (!this.editor.isEditable || !this.hasFocusWithin()) {
      this.setVisible(false);
      return;
    }
    this.el.dataset.theme = this.editor.root.dataset.theme;
    // Shown before rebuilding: a hidden bar has no layout, so it would ignore the scroll reset.
    this.setVisible(true);
    const context = this.ui.getContext();
    if (context !== this.context) this.keepingFocus(() => this.rebuild(context));
    this.controls.forEach(({ item, el }) => syncControl(el, item, this.editor, this.ui));
    this.place();
  }

  private rebuild(context: UIContext): void {
    this.context = context;
    this.controls = [];
    this.el.replaceChildren(
      ...this.entries(context).map((entry) => {
        if (entry === SEPARATOR) return createSeparator();
        const el = createControl(entry, this.editor, this.ui);
        this.controls.push({ item: entry, el });
        return el;
      }),
    );
    // The context-only tools lead the new set, so show the start instead of the old scroll position.
    this.el.scrollLeft = 0;
    this.roving.refresh();
  }

  /** Keeps the bar on top of the keyboard and the caret clear of the bar. */
  private place(): void {
    if (this.el.hidden) return;
    this.el.style.bottom = `${this.ui.viewport.bottomInset}px`;
    const height = this.el.offsetHeight;
    if (height === this.height) return;
    this.height = height;
    this.editor.root.style.setProperty('--le-mobile-bar-height', `${height}px`);
    const edge = { top: scrollGap, left: scrollGap, right: scrollGap, bottom: height + scrollGap };
    // ProseMirror applies the margin only to a caret past the threshold, so the bar must count for both.
    this.editor.view.setProps({ scrollMargin: edge, scrollThreshold: edge });
  }
}
