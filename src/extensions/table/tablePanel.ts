import type { PanelFactory } from '../../core/types';
import { c } from '../../ui/classes';
import { h } from '../../ui/dom';

const ARROWS: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };

/** Size picker: hover or arrow keys preview rows × columns, click or Enter inserts. */
export function tablePanel(getSize: () => number): PanelFactory {
  return ({ editor, t, close }) => {
    const size = getSize();
    const label = h('div', { class: c('grid-label'), attrs: { 'aria-live': 'polite' } });
    const cells: HTMLButtonElement[] = [];
    const highlight = (rows: number, cols: number): void => {
      cells.forEach((cell) => cell.classList.toggle(c('grid-on'), Number(cell.dataset.rows) <= rows && Number(cell.dataset.cols) <= cols));
      label.textContent = t('panel.table.size', { rows, cols });
    };
    for (let row = 1; row <= size; row++) {
      for (let col = 1; col <= size; col++) {
        const cell = h('button', {
          class: c('grid-cell'),
          attrs: { type: 'button', 'data-rows': String(row), 'data-cols': String(col), 'aria-label': t('panel.table.size', { rows: row, cols: col }), tabindex: row === 1 && col === 1 ? '0' : '-1' },
          on: {
            pointerenter: () => highlight(row, col),
            focus: () => highlight(row, col),
            click: () => {
              editor.exec('insertTable', row, col);
              close();
            },
          },
        });
        cells.push(cell);
      }
    }
    const grid = h('div', { class: c('grid'), attrs: { role: 'group', 'aria-label': t('a11y.tableGrid') }, style: { gridTemplateColumns: `repeat(${size}, var(--le-grid-cell))` } }, ...cells);
    grid.addEventListener('keydown', (event) => {
      const move = ARROWS[event.key];
      const index = cells.indexOf(event.target as HTMLButtonElement);
      if (!move || index === -1) return;
      event.preventDefault();
      const row = Math.min(size - 1, Math.max(0, Math.floor(index / size) + move[0]));
      const col = Math.min(size - 1, Math.max(0, (index % size) + move[1]));
      cells[row * size + col]!.focus();
    });
    highlight(1, 1);
    return h('div', { class: c('panel') }, grid, label);
  };
}
