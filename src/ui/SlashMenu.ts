import type { Editor } from '../core/Editor';
import { itemLabel } from '../i18n';
import { currentSlashItems, runSlashItem, slashKey } from '../extensions/tools/slashMenu';
import { c, PORTAL_CLASS } from './classes';
import { h } from './dom';
import { rangeReference } from './floating';
import type { EditorUI } from './EditorUI';
import { renderIcon } from './icons';
import { copyTheme } from './theme';
import { UIComponent } from './UIComponent';

let menuCount = 0;

/** The "/" block menu, positioned under the trigger character. */
export class SlashMenu extends UIComponent<HTMLDivElement> {
  private readonly id = `le-slash-${++menuCount}`;
  private readonly float = this.floating('bottom-start', 'menu', () => ({ bottom: this.ui.coveredBottom }));
  private rendered = '';

  constructor(
    editor: Editor,
    private readonly ui: EditorUI,
  ) {
    super(editor, h('div', { class: `${PORTAL_CLASS} ${c('slash-menu')}`, attrs: { role: 'listbox', 'aria-label': editor.t('a11y.slashMenu'), hidden: true } }));
    this.el.id = this.id;
    this.addDisposer(() => this.setActiveDescendant(null));
  }

  override update(): void {
    const state = slashKey.getState(this.editor.state);
    const items = currentSlashItems(this.editor);
    if (!state?.active || this.ui.locked) return this.hide();
    const index = Math.min(state.index, Math.max(0, items.length - 1));
    const signature = `${state.query}|${index}|${items.map((i) => i.id).join(',')}`;
    if (signature !== this.rendered) this.render(items, index);
    this.rendered = signature;
    copyTheme(this.el, this.editor.root);
    this.float.show(rangeReference(this.editor.view, state.from));
  }

  private render(items: ReturnType<typeof currentSlashItems>, index: number): void {
    const t = this.editor.t;
    this.el.replaceChildren(
      ...(items.length
        ? items.map((item, i) =>
            h(
              'div',
              {
                class: c('slash-item'),
                attrs: { role: 'option', id: `${this.id}-${i}`, 'data-item': item.id, 'aria-selected': String(i === index) },
                on: {
                  pointerdown: (event) => {
                    event.preventDefault();
                    runSlashItem(this.editor, item);
                  },
                },
              },
              item.text ? h('span', { class: c('control-text') }, item.text) : renderIcon(item.icon),
              h('span', {}, itemLabel(t, item)),
            ),
          )
        : [h('div', { class: c('slash-empty') }, t('slash.empty'))]),
    );
    this.setActiveDescendant(items.length ? `${this.id}-${index}` : null);
    this.el.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  private hide(): void {
    this.float.hide();
    this.rendered = '';
    this.setActiveDescendant(null);
  }

  private setActiveDescendant(id: string | null): void {
    const dom = this.editor.view.dom;
    if (id) {
      dom.setAttribute('aria-activedescendant', id);
      dom.setAttribute('aria-controls', this.id);
    } else {
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-controls');
    }
  }
}
