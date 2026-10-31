import { TextSelection } from 'prosemirror-state';
import type { Editor } from '../core/Editor';
import type { UIItem } from '../core/types';
import { c, PORTAL_CLASS } from './classes';
import { createControl, syncControl } from './controls';
import { h } from './dom';
import { placeFloating, rangeReference } from './floating';
import type { EditorUI } from './EditorUI';
import { BUBBLE_ITEMS } from './presets';
import { RovingFocus } from './roving';
import { UIComponent } from './UIComponent';

const BUBBLE_CONTEXTS = new Set(['text', 'link']);

/** Desktop formatting bubble above a text selection. */
export class BubbleMenu extends UIComponent<HTMLDivElement> {
  private readonly controls: Array<{ item: UIItem; el: HTMLButtonElement }>;
  private pointerDown = false;

  constructor(
    editor: Editor,
    private readonly ui: EditorUI,
  ) {
    super(editor, h('div', { class: `${PORTAL_CLASS} ${c('bubble')}`, attrs: { role: 'toolbar', 'aria-label': editor.t('a11y.bubbleMenu'), hidden: true } }));
    document.body.appendChild(this.el);
    this.controls = BUBBLE_ITEMS.flatMap((id) => {
      const item = ui.registry.get(id);
      return item ? [{ item, el: createControl(item, editor, ui) }] : [];
    });
    this.controls.forEach(({ el }) => this.el.appendChild(el));
    const roving = new RovingFocus(this.el, `.${c('control')}`);
    this.addDisposer(() => roving.destroy());
    // Wait for the drag to finish before showing, so the bubble does not chase the pointer.
    this.listen(editor.view.dom, 'pointerdown', () => {
      this.pointerDown = true;
      this.update();
    });
    this.listen(window, 'pointerup', () => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.update();
    });
    this.followEditorFocus();
  }

  /** Whether the current state calls for the bubble. */
  static wanted(editor: Editor, ui: EditorUI): boolean {
    const { selection } = editor.state;
    return (
      ui.device.mode === 'desktop' &&
      selection instanceof TextSelection &&
      !selection.empty &&
      BUBBLE_CONTEXTS.has(ui.getContext()) &&
      editor.root.dataset.lockedExcept === undefined
    );
  }

  override update(): void {
    if (this.pointerDown || !this.hasFocusWithin() || !BubbleMenu.wanted(this.editor, this.ui)) {
      this.setVisible(false);
      return;
    }
    this.controls.forEach(({ item, el }) => syncControl(el, item, this.editor, this.ui));
    this.el.dataset.theme = this.editor.root.dataset.theme;
    this.setVisible(true);
    const { from, to } = this.editor.state.selection;
    void placeFloating(rangeReference(this.editor.view, from, to), this.el, 'top', 'toolbar');
  }
}
