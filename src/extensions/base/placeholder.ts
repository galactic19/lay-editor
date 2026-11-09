import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isDocEmpty } from '../../io/html';
import { c } from '../../ui/classes';
import { defineExtension } from '../factories';

export const placeholder = defineExtension({
  name: 'placeholder',
  plugins: ({ config, t }) => [
    new Plugin({
      props: {
        decorations: ({ doc }) => {
          const first = doc.firstChild;
          if (doc.childCount !== 1 || !first || !isDocEmpty(doc)) return null;
          const text = config.placeholder ?? t('placeholder');
          return DecorationSet.create(doc, [Decoration.node(0, first.nodeSize, { class: c('placeholder'), 'data-placeholder': text })]);
        },
      },
    }),
  ],
});
