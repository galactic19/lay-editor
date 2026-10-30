import type { Editor } from '../core/Editor';
import { UI_CONTEXTS, type UIItem } from '../core/types';
import { c } from './classes';
import { createControl, syncControl } from './controls';
import { h } from './dom';
import type { EditorUI } from './EditorUI';
import { listPanel } from './panels/listPanel';
import { SEPARATOR } from './presets';
import { RovingFocus } from './roving';
import { UIComponent } from './UIComponent';

export type ToolbarEntry = UIItem | typeof SEPARATOR;

const MORE_ITEM: UIItem = { id: 'more', kind: 'panel', icon: 'ellipsis', label: 'toolbar.more', contexts: [...UI_CONTEXTS] };

/** Main toolbar. Items that do not fit move into a "more" menu. */
export class Toolbar extends UIComponent<HTMLDivElement> {
  private readonly controls: Array<{ item: UIItem; el: HTMLButtonElement }> = [];
  private readonly more: HTMLButtonElement;
  private readonly roving: RovingFocus;
  private overflow: UIItem[] = [];

  constructor(
    editor: Editor,
    private readonly ui: EditorUI,
    entries: ToolbarEntry[],
  ) {
    super(editor, h('div', { class: c('toolbar'), attrs: { role: 'toolbar', 'aria-label': editor.t('a11y.toolbar') } }));
    for (const entry of entries) {
      if (entry === SEPARATOR) {
        this.el.appendChild(h('span', { class: c('separator'), attrs: { role: 'separator', 'aria-orientation': 'vertical' } }));
        continue;
      }
      const el = createControl(entry, editor, ui);
      this.controls.push({ item: entry, el });
      this.el.appendChild(el);
    }
    this.more = createControl(MORE_ITEM, editor, ui, { onActivate: () => ui.panels.openPanel(listPanel(() => this.overflow), this.more) });
    this.more.hidden = true;
    this.el.appendChild(this.more);
    this.roving = new RovingFocus(this.el, `.${c('control')}`);
    this.addDisposer(() => this.roving.destroy());
    const observer = new ResizeObserver(() => this.layout());
    observer.observe(this.el);
    this.addDisposer(() => observer.disconnect());
  }

  /** The visible control for an item, used to anchor panels. */
  anchorFor(id: string): HTMLElement | null {
    const control = this.controls.find(({ item }) => item.id === id)?.el;
    return control && !control.hidden ? control : this.more.hidden ? null : this.more;
  }

  override update(): void {
    for (const { item, el } of this.controls) syncControl(el, item, this.editor, this.ui);
  }

  /** Shows as many entries as fit; the rest go to the more menu. */
  layout(): void {
    const children = Array.from(this.el.children).filter((el) => el !== this.more) as HTMLElement[];
    children.forEach((el) => (el.hidden = false));
    this.more.hidden = true;
    this.overflow = [];
    const available = this.el.clientWidth;
    const widths = children.map((el) => el.offsetWidth);
    const total = widths.reduce((sum, w) => sum + w, 0);
    if (available && total > available) {
      this.more.hidden = false;
      const budget = available - this.more.offsetWidth;
      let used = 0;
      children.forEach((el, i) => {
        if (this.overflow.length || used + widths[i]! > budget) {
          el.hidden = true;
          const control = this.controls.find((entry) => entry.el === el);
          if (control) this.overflow.push(control.item);
        } else used += widths[i]!;
      });
      const lastVisible = children.filter((el) => !el.hidden).pop();
      if (lastVisible?.classList.contains(c('separator'))) lastVisible.hidden = true;
    }
    this.roving.refresh();
  }
}
