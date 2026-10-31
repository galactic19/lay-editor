import type { PanelFactory, UIItem } from '../../core/types';
import { c } from '../classes';
import { activateItem, createControl } from '../controls';
import { h } from '../dom';
import { RovingFocus } from '../roving';

/** A vertical menu of items: dropdown options and the toolbar overflow menu. */
export function listPanel(getItems: () => UIItem[]): PanelFactory {
  return ({ editor, close }) => {
    const ui = editor.ui!;
    // A vertical toolbar, not role=menu: the items are toggle buttons (aria-pressed, aria-haspopup), not menu items.
    const menu = h('div', { class: c('menu'), attrs: { role: 'toolbar', 'aria-orientation': 'vertical' } });
    for (const item of getItems()) {
      menu.appendChild(
        createControl(item, editor, ui, {
          showLabel: true,
          // The menu closes either way, so a panel opened from it anchors where the toolbar shows the item.
          onActivate: (picked) => {
            if (picked.kind === 'button') close();
            activateItem(picked, editor, ui, null);
          },
        }),
      );
    }
    new RovingFocus(menu, `.${c('control')}`, 'vertical');
    return menu;
  };
}
