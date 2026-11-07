import type { Translate } from '../../i18n';
import { completeScheme } from '../../io/url';
import { c } from '../classes';
import { h, type Child } from '../dom';

export interface InputFormOptions {
  t: Translate;
  type: 'url' | 'text';
  labelKey: string;
  submitKey: string;
  /** Shown under the input when `onSubmit` rejects the value. */
  errorKey?: string;
  /** Parameters for the label, placeholder and error texts. */
  params?: Record<string, string | number>;
  value?: string;
  placeholderKey?: string;
  /** Return false to keep the form open and flag the input as invalid. A URL arrives with the scheme of a bare host added. */
  onSubmit(value: string): boolean;
}

/** A hidden alert line for an input; `report(ok)` flags the input and shows the line when the value was rejected. */
export function inputError(input: HTMLInputElement, message?: string): { el: HTMLElement | null; report(ok: boolean): void } {
  const el = message ? h('div', { class: c('panel-error'), attrs: { role: 'alert', hidden: true } }, message) : null;
  return {
    el,
    report: (ok) => {
      input.setAttribute('aria-invalid', String(!ok));
      if (el) el.hidden = ok;
    },
  };
}

/**
 * A panel form submitted through `onSubmit`. The editor validates the values (completeScheme, safeUrl and
 * each command's checks), so the browser's own check stays off: it would reject "naver.com" or "/a.png".
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
  const t = (key: string): string => opts.t(key, opts.params);
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
  const error = inputError(input, opts.errorKey && t(opts.errorKey));
  const value = (): string => (opts.type === 'url' ? completeScheme(input.value) : input.value.trim());
  return panelForm(
    c('panel'),
    () => error.report(opts.onSubmit(value())),
    h('div', { class: c('panel-row') }, input, h('button', { class: c('button', 'button-primary'), attrs: { type: 'submit' } }, t(opts.submitKey))),
    error.el,
  );
}
