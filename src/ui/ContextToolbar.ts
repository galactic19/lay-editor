import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { Editor } from '../core/Editor';
import type { UIContext, UIItem } from '../core/types';
import { c, PORTAL_CLASS } from './classes';
import { contextAnchor, contextOnlyItems } from './context';
import { createControl, syncControl } from './controls';
import { h } from './dom';
import type { EditorUI } from './EditorUI';
import { RovingFocus } from './roving';
import { UIComponent } from './UIComponent';

const GAP = 8;
const VIEWPORT_PADDING = 8;

/** Desktop floating toolbar for images, tables, links and code blocks. */
export class ContextToolbar extends UIComponent<HTMLDivElement> {
  private context: UIContext = 'text';
  private controls: Array<{ item: UIItem; el: HTMLButtonElement }> = [];
  private readonly roving: RovingFocus;

  constructor(
    editor: Editor,
    private readonly ui: EditorUI,
  ) {
    super(
      editor,
      h('div', { class: `${PORTAL_CLASS} ${c('context-toolbar')}`, attrs: { role: 'toolbar', 'aria-label': editor.t('a11y.contextToolbar'), hidden: true } }),
    );
    document.body.appendChild(this.el);
    this.roving = new RovingFocus(this.el, `.${c('control')}`);
    this.addDisposer(() => this.roving.destroy());
    this.subscribe('focus', () => this.update());
    this.subscribe('blur', () => queueMicrotask(() => this.update()));
  }

  override update(): void {
    const context = this.ui.getContext();
    const items = context === 'text' ? [] : contextOnlyItems(this.ui.registry, context);
    const focused = this.editor.view.hasFocus() || this.el.contains(document.activeElement);
    const anchor = items.length && focused && this.ui.device.mode === 'desktop' ? contextAnchor(this.editor.view, context) : null;
    if (!anchor) {
      this.el.hidden = true;
      return;
    }
    if (context !== this.context || items.length !== this.controls.length) this.rebuild(context, items);
    this.controls.forEach(({ item, el }) => syncControl(el, item, this.editor, this.ui));
    this.el.dataset.theme = this.editor.root.dataset.theme;
    this.el.hidden = false;
    void computePosition(anchor, this.el, {
      placement: 'top',
      strategy: 'fixed',
      middleware: [offset(GAP), flip(), shift({ padding: VIEWPORT_PADDING })],
    }).then(({ x, y }) => Object.assign(this.el.style, { left: `${x}px`, top: `${y}px` }));
  }

  private rebuild(context: UIContext, items: UIItem[]): void {
    this.context = context;
    this.el.replaceChildren();
    this.controls = items.map((item) => ({ item, el: createControl(item, this.editor, this.ui) }));
    this.controls.forEach(({ el }) => this.el.appendChild(el));
    this.roving.refresh();
  }
}
