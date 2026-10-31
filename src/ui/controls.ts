import type { Editor } from '../core/Editor';
import type { UIItem } from '../core/types';
import { c } from './classes';
import { h } from './dom';
import type { EditorUI } from './EditorUI';
import { renderIcon } from './icons';
import { formatShortcut } from './shortcut';

export interface ControlOptions {
  /** Menu style: icon + label + shortcut hint, no tooltip. */
  showLabel?: boolean;
  /** Replaces the default activation (exec for buttons, open panel otherwise). */
  onActivate?(item: UIItem, anchor: HTMLButtonElement): void;
}

const isDisabled = (el: Element): boolean => el.getAttribute('aria-disabled') === 'true';

/** Default action: run the command, or open the item's panel / option list. */
export function activateItem(item: UIItem, editor: Editor, ui: EditorUI, anchor: HTMLElement | null): void {
  if (item.kind === 'button') {
    if (item.command) editor.exec(item.command, ...(item.args ?? []));
  } else {
    ui.openPanelFor(item.id, anchor);
  }
}

/** One button for a UI item. Shared by the toolbar, menus, bubble and mobile bars. */
export function createControl(item: UIItem, editor: Editor, ui: EditorUI, options: ControlOptions = {}): HTMLButtonElement {
  const label = editor.t(item.label, item.labelParams);
  const shortcut = item.shortcut ? formatShortcut(item.shortcut) : null;
  const button: HTMLButtonElement = h(
    'button',
    {
      class: c('control'),
      attrs: {
        type: 'button',
        'data-item': item.id,
        'aria-label': label,
        'aria-haspopup': item.kind === 'button' ? null : 'dialog',
        'data-tooltip': options.showLabel ? null : shortcut ? `${label} (${shortcut})` : label,
      },
      on: {
        pointerdown: (event) => event.preventDefault(),
        click: () => {
          if (isDisabled(button)) return;
          if (options.onActivate) options.onActivate(item, button);
          else activateItem(item, editor, ui, button);
        },
      },
    },
    item.text ? h('span', { class: c('control-text') }, item.text) : renderIcon(item.icon),
    options.showLabel ? h('span', { class: c('control-label') }, label) : null,
    options.showLabel && shortcut ? h('span', { class: c('control-hint') }, shortcut) : null,
  );
  if (item.kind === 'dropdown' && !options.showLabel) button.appendChild(renderIcon('chevron-down')).classList.add(c('caret'));
  syncControl(button, item, editor, ui);
  return button;
}

/** Vertical divider between toolbar groups. */
export function createSeparator(): HTMLSpanElement {
  return h('span', { class: c('separator'), attrs: { role: 'separator', 'aria-orientation': 'vertical' } });
}

function isItemEnabled(item: UIItem, editor: Editor, ui: EditorUI): boolean {
  if (ui.holdsLock(item)) return true;
  if (!editor.isEditable || ui.isLocked(item)) return false;
  if (item.isEnabled) return item.isEnabled(editor);
  // The current state (e.g. "Normal text" while in a paragraph) never looks disabled.
  if (item.isActive?.(editor)) return true;
  return item.kind === 'button' && item.command ? editor.can(item.command, ...(item.args ?? [])) : true;
}

export function syncControl(el: HTMLElement, item: UIItem, editor: Editor, ui: EditorUI): void {
  if (item.isActive) el.setAttribute('aria-pressed', String(item.isActive(editor)));
  el.setAttribute('aria-disabled', String(!isItemEnabled(item, editor, ui)));
}
