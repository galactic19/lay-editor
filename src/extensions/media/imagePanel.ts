import type { PanelFactory } from '../../core/types';
import { c } from '../../ui/classes';
import { h } from '../../ui/dom';
import { renderIcon } from '../../ui/icons';
import { inputForm } from '../../ui/panels/inputForm';
import type { UploadManager } from '../../io/upload';

/** File picker (when uploads are configured) and an image URL form. */
export function imagePanel(getUploads: () => UploadManager, accept: readonly string[]): PanelFactory {
  return ({ editor, t, close }) => {
    const uploads = getUploads();
    const picker = uploads.enabled
      ? (() => {
          const input = h('input', { attrs: { type: 'file', accept: accept.join(','), multiple: true, hidden: true } });
          input.addEventListener('change', () => {
            const files = Array.from(input.files ?? []);
            close();
            if (files.length) void uploads.uploadFiles(files);
          });
          return h(
            'label',
            { class: c('button', 'button-primary', 'file-button') },
            renderIcon('upload'),
            t('panel.image.file'),
            input,
          );
        })()
      : null;
    const urlForm = inputForm({
      t,
      type: 'url',
      labelKey: 'panel.image.url',
      placeholderKey: 'panel.link.placeholder',
      submitKey: 'panel.image.insert',
      onSubmit: (src) => {
        const ok = editor.exec('insertImage', { src });
        if (ok) close();
        return ok;
      },
    });
    return h('div', { class: c('panel') }, picker, urlForm);
  };
}

/** Edits the alt text of the selected image. */
export const altPanel: PanelFactory = ({ editor, t, close }) => {
  const selection = editor.state.selection as { node?: { attrs: { alt?: string } } };
  return h(
    'div',
    { class: c('panel') },
    inputForm({
      t,
      type: 'text',
      labelKey: 'panel.image.alt',
      submitKey: 'panel.image.apply',
      value: selection.node?.attrs.alt ?? '',
      onSubmit: (alt) => {
        const ok = editor.exec('setImageAlt', alt);
        if (ok) close();
        return ok;
      },
    }),
  );
};
