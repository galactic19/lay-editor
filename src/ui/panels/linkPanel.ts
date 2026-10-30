import type { PanelFactory } from '../../core/types';
import { c } from '../classes';
import { h } from '../dom';

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
  const error = h('div', { class: c('panel-error'), attrs: { role: 'alert', hidden: true } }, t('panel.link.invalid'));

  const form = h(
    'form',
    {
      class: c('panel'),
      on: {
        submit: (event) => {
          event.preventDefault();
          const ok = editor.exec('setLink', { href: input.value, newTab: newTab.checked });
          input.setAttribute('aria-invalid', String(!ok));
          error.hidden = ok;
          if (ok) close();
        },
      },
    },
    input,
    error,
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
  return form;
};
