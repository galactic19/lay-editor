import type { PanelFactory } from '../../core/types';
import { findKey } from '../../extensions/tools/findReplace';
import { c } from '../classes';
import { h } from '../dom';
import { renderIcon } from '../icons';

/** Find / replace form; keeps its match counter in sync with the document. */
export const findPanel: PanelFactory = ({ editor, t, onClose }) => {
  const field = (name: string, labelKey: string) =>
    h('input', { class: c('input'), attrs: { type: 'text', 'data-field': name, 'aria-label': t(labelKey), placeholder: t(labelKey), autocomplete: 'off' } });
  const find = field('find', 'panel.find.find');
  const replace = field('replace', 'panel.find.replace');
  const matchCase = h('input', { attrs: { type: 'checkbox', 'data-field': 'case' } });
  const status = h('span', { class: c('find-status'), attrs: { 'data-field': 'status', 'aria-live': 'polite' } });

  const refresh = (): void => {
    const state = findKey.getState(editor.state);
    const total = state?.matches.length ?? 0;
    status.textContent = !find.value ? '' : total ? t('status.matchCount', { current: (state?.current ?? -1) + 1, total }) : t('status.noMatch');
  };
  const search = (): void => {
    editor.exec('setFindQuery', find.value, matchCase.checked);
    refresh();
  };
  const run = (command: string, ...args: unknown[]) => () => {
    editor.exec(command, ...args);
    refresh();
  };
  const button = (action: string, labelKey: string, onClick: () => void, icon?: string) =>
    h(
      'button',
      { class: c('button'), attrs: { type: 'button', 'data-action': action, 'aria-label': t(labelKey), title: t(labelKey) }, on: { click: onClick } },
      icon ? renderIcon(icon) : t(labelKey),
    );

  find.addEventListener('input', search);
  matchCase.addEventListener('change', search);
  find.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    run(event.shiftKey ? 'findPrev' : 'findNext')();
  });
  const unsubscribe = editor.on('update', refresh);
  onClose(() => {
    unsubscribe();
    editor.exec('closeFind');
  });

  return h(
    'div',
    { class: c('panel', 'find-panel') },
    h('div', { class: c('panel-row') }, find, status),
    h('div', { class: c('panel-row') }, replace),
    h(
      'div',
      { class: c('panel-row') },
      h('label', {}, matchCase, t('panel.find.caseSensitive')),
      button('prev', 'panel.find.prev', run('findPrev'), 'chevron-up'),
      button('next', 'panel.find.next', run('findNext'), 'chevron-down'),
    ),
    h(
      'div',
      { class: c('panel-row') },
      button('replaceOne', 'panel.find.replaceOne', () => run('replaceCurrent', replace.value)()),
      button('replaceAll', 'panel.find.replaceAll', () => run('replaceAll', replace.value)()),
    ),
  );
};
