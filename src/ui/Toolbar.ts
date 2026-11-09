import type { Editor } from '../core/Editor';
import { UI_CONTEXTS, type UIItem } from '../core/types';
import { itemLabel } from '../i18n';
import { c } from './classes';
import { createControl, createSeparator, syncControl, syncMenuControl } from './controls';
import { h, observeResize } from './dom';
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
        this.el.appendChild(createSeparator());
        continue;
      }
      const el = createControl(entry, editor, ui);
      this.controls.push({ item: entry, el });
      this.el.appendChild(el);
    }
    this.more = createControl(MORE_ITEM, editor, ui, {
      onActivate: () => ui.panels.openPanel(listPanel(() => this.overflow), this.more, itemLabel(editor.t, MORE_ITEM)),
    });
    this.more.hidden = true;
    this.el.appendChild(this.more);
    this.roving = new RovingFocus(this.el, `.${c('control')}`);
    this.addDisposer(() => this.roving.destroy());
    this.addDisposer(observeResize(this.el, () => this.layout()));
  }

  /** The visible control for an item, used to anchor panels. */
  anchorFor(id: string): HTMLElement | null {
    const control = this.controls.find(({ item }) => item.id === id)?.el;
    if (!control) return null;
    return control.hidden ? (this.more.hidden ? null : this.more) : control;
  }

  override update(): void {
    for (const { item, el } of this.controls) syncControl(el, item, this.editor, this.ui);
    syncMenuControl(this.more, this.overflow, this.editor, this.ui);
  }

  /**
   * Shows as many entries as fit; the rest go to the more menu. Uses the real overflow
   * (scrollWidth) so gaps, padding and separator margins are all accounted for.
   */
  layout(): void {
    const children = Array.from(this.el.children).filter((el) => el !== this.more) as HTMLElement[];
    children.forEach((el) => (el.hidden = false));
    this.more.hidden = true;
    this.overflow = [];
    const overflowing = (): boolean => this.el.scrollWidth > this.el.clientWidth;
    if (overflowing()) {
      this.more.hidden = false;
      for (let i = children.length - 1; i >= 0 && overflowing(); i--) {
        const el = children[i]!;
        el.hidden = true;
        const control = this.controls.find((entry) => entry.el === el);
        if (control) this.overflow.unshift(control.item);
      }
      const lastVisible = children.filter((el) => !el.hidden).pop();
      if (lastVisible?.classList.contains(c('separator'))) lastVisible.hidden = true;
    }
    syncMenuControl(this.more, this.overflow, this.editor, this.ui);
    this.roving.refresh();
  }
}
