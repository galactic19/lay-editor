import type { PanelFactory } from '../../core/types';
import { c } from '../classes';
import { h } from '../dom';
import { inputError, panelForm } from './inputForm';

function currentLink(editor: Parameters<PanelFactory>[0]['editor']): { href: string; newTab: boolean } | null {
  const { $from, from, to } = editor.state.selection;
  const marks = from === to ? $from.marks() : (editor.state.doc.nodeAt(from)?.marks ?? []);
  const link = marks.find((mark) => mark.type.name === 'link');
  return link ? { href: link.attrs.href, newTab: link.attrs.target === '_blank' } : null;
}

/** URL input, new-tab toggle, apply and remove. */
export const linkPanel: PanelFactory = ({ editor, t, close }) => {
  const existing = currentLink(editor);
  const input = h('input', {
    class: c('input'),
    attrs: { type: 'url', inputmode: 'url', placeholder: t('panel.link.placeholder'), 'aria-label': t('panel.link.url'), autocomplete: 'off' },
  });
  input.value = existing?.href ?? '';
  const newTab = h('input', { attrs: { type: 'checkbox' } });
  newTab.checked = existing?.newTab ?? false;
  const error = inputError(input, t('panel.link.invalid'));

  return panelForm(
    c('panel'),
    () => {
      const ok = editor.exec('setLink', { href: input.value, newTab: newTab.checked });
      error.report(ok);
      if (ok) close();
    },
    input,
    error.el,
    h('label', {}, newTab, t('panel.link.newTab')),
    h(
      'div',
      { class: c('panel-row') },
      h('button', { class: c('button', 'button-primary'), attrs: { type: 'submit' } }, t('panel.link.apply')),
      existing
        ? h(
            'button',
            {
              class: c('button'),
              attrs: { type: 'button', 'data-action': 'remove' },
              on: {
                click: () => {
                  editor.exec('unsetLink');
                  close();
                },
              },
            },
            t('panel.link.remove'),
          )
        : null,
    ),
  );
};
