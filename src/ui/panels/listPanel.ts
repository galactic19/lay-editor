import type { PanelFactory, UIItem } from '../../core/types';
import { c } from '../classes';
import { activateItem, createControl } from '../controls';
import { h } from '../dom';
import { RovingFocus } from '../roving';

/** A vertical menu of items: dropdown options and the toolbar overflow menu. */
export function listPanel(getItems: () => UIItem[]): PanelFactory {
  return ({ editor, close }) => {
    const ui = editor.ui!;
    const menu = h('div', { class: c('menu'), attrs: { role: 'menu' } });
    for (const item of getItems()) {
      menu.appendChild(
        createControl(item, editor, ui, {
          showLabel: true,
          onActivate: (picked, anchor) => {
            if (picked.kind === 'button') close();
            activateItem(picked, editor, ui, picked.kind === 'button' ? null : anchor);
          },
        }),
      );
    }
    new RovingFocus(menu, `.${c('control')}`, 'vertical');
    return menu;
  };
}
