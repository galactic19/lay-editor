import type { Translate } from '../../i18n';
import { c } from '../classes';
import { h, type Child } from '../dom';

export interface InputFormOptions {
  t: Translate;
  type: 'url' | 'text';
  labelKey: string;
  submitKey: string;
  value?: string;
  placeholderKey?: string;
  /** Return false to keep the form open and flag the input as invalid. */
  onSubmit(value: string): boolean;
}

/**
 * A panel form submitted through `onSubmit`. The editor commands validate the values (safeUrl,
 * normalizeHref), so the browser's own check stays off: it would reject "naver.com" or "/a.png".
 */
export function panelForm(className: string, onSubmit: () => void, ...children: Child[]): HTMLFormElement {
  return h(
    'form',
    {
      class: className,
      attrs: { novalidate: true },
      on: {
        submit: (event) => {
          event.preventDefault();
          onSubmit();
        },
      },
    },
    ...children,
  );
}

/** One input plus a submit button; shared by the image, video and alt-text panels. */
export function inputForm(opts: InputFormOptions): HTMLFormElement {
  const { t } = opts;
  const input = h('input', {
    class: c('input'),
    attrs: {
      type: opts.type,
      inputmode: opts.type === 'url' ? 'url' : null,
      'aria-label': t(opts.labelKey),
      placeholder: opts.placeholderKey ? t(opts.placeholderKey) : t(opts.labelKey),
      autocomplete: 'off',
    },
  });
  input.value = opts.value ?? '';
  return panelForm(
    c('panel-row'),
    () => input.setAttribute('aria-invalid', String(!opts.onSubmit(input.value.trim()))),
    input,
    h('button', { class: c('button', 'button-primary'), attrs: { type: 'submit' } }, t(opts.submitKey)),
  );
}
