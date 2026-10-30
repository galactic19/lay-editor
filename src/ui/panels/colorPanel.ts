import type { PanelFactory } from '../../core/types';
import { c } from '../classes';
import { h } from '../dom';

/** Palette grid plus a reset button. */
export function colorPanel(palette: readonly string[], setCommand: string, unsetCommand: string, markName: string): PanelFactory {
  return ({ editor, t, close }) => {
    const run = (command: string, ...args: unknown[]) => () => {
      editor.exec(command, ...args);
      close();
    };
    const swatches = palette.map((color) =>
      h('button', {
        class: c('swatch'),
        attrs: { type: 'button', title: color, 'aria-label': color, 'aria-pressed': String(editor.isActive(markName, { color })) },
        style: { background: color },
        on: { click: run(setCommand, color) },
      }),
    );
    return h(
      'div',
      { class: c('panel') },
      h('div', { class: c('swatches') }, ...swatches),
      h('button', { class: c('button'), attrs: { type: 'button', 'data-action': 'reset' }, on: { click: run(unsetCommand) } }, t('panel.color.reset')),
    );
  };
}
