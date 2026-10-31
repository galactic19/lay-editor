import type { Editor } from '../core/Editor';
import type { UIContext, UIItem } from '../core/types';
import { c, PORTAL_CLASS } from './classes';
import { contextAnchor, contextOnlyItems } from './context';
import { createControl, syncControl } from './controls';
import { h } from './dom';
import type { EditorUI } from './EditorUI';
import { RovingFocus } from './roving';
import { UIComponent } from './UIComponent';

/** Desktop floating toolbar for images, tables, links and code blocks. */
export class ContextToolbar extends UIComponent<HTMLDivElement> {
  private context: UIContext = 'text';
  private controls: Array<{ item: UIItem; el: HTMLButtonElement }> = [];
  private readonly roving: RovingFocus;
  private readonly float = this.floating('top', 'toolbar', () => this.ui.coveredTop);

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
    this.followEditorFocus();
  }

  override update(): void {
    const context = this.ui.getContext();
    // A range selection over a link belongs to the formatting bubble.
    const yields = context === 'link' && !this.editor.state.selection.empty;
    const items = context === 'text' || yields ? [] : contextOnlyItems(this.ui.registry, context);
    const anchor = items.length && this.hasFocusWithin() && this.ui.device.mode === 'desktop' ? contextAnchor(this.editor.view, context) : null;
    if (!anchor) return this.float.hide();
    if (context !== this.context || items.length !== this.controls.length) this.rebuild(context, items);
    this.controls.forEach(({ item, el }) => syncControl(el, item, this.editor, this.ui));
    this.el.dataset.theme = this.editor.root.dataset.theme;
    this.float.show(anchor);
  }

  private rebuild(context: UIContext, items: UIItem[]): void {
    this.context = context;
    this.el.replaceChildren();
    this.controls = items.map((item) => ({ item, el: createControl(item, this.editor, this.ui) }));
    this.controls.forEach(({ el }) => this.el.appendChild(el));
    this.roving.refresh();
  }
}
