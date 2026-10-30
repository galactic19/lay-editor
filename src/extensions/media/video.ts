import type { Node as PMNode, NodeType } from 'prosemirror-model';
import { Plugin, type Command } from 'prosemirror-state';
import { DEFAULTS } from '../../core/defaults';
import { c } from '../../ui/classes';
import { inputForm } from '../../ui/panels/inputForm';
import { defineExtension } from '../factories';
import { getVideoProvider, parseVideoUrl, registeredVideoProviders } from './video-providers';

type VideoOptions = { providers: readonly string[] };

function validAttrs(provider: string | undefined, id: string | undefined) {
  const p = provider ? getVideoProvider(provider) : undefined;
  return p && id && p.idPattern.test(id) ? { provider, id } : false;
}

const insertVideo =
  (type: NodeType, url: string, allowed: readonly string[]): Command =>
  (state, dispatch) => {
    const parsed = parseVideoUrl(String(url ?? ''), allowed);
    if (!parsed) return false;
    dispatch?.(state.tr.replaceSelectionWith(type.create(parsed)).scrollIntoView());
    return true;
  };

export const video = defineExtension<VideoOptions>({
  name: 'video',
  defaults: DEFAULTS.video,
  nodes: {
    video: {
      group: 'block',
      atom: true,
      draggable: true,
      attrs: { provider: {}, id: {} },
      parseDOM: [
        { tag: 'div[data-video]', getAttrs: (dom: HTMLElement) => validAttrs(dom.dataset.provider, dom.dataset.id) },
        { tag: 'iframe[src]', getAttrs: (dom: HTMLElement) => parseVideoUrl(dom.getAttribute('src') ?? '', registeredVideoProviders()) ?? false },
      ],
      toDOM: (node: PMNode) => {
        const provider = getVideoProvider(node.attrs.provider)!;
        return [
          'div',
          { 'data-video': '', 'data-provider': node.attrs.provider, 'data-id': node.attrs.id, class: c('video') },
          ['iframe', { src: provider.embedUrl(node.attrs.id), title: provider.title, frameborder: '0', allowfullscreen: 'true', loading: 'lazy' }],
        ];
      },
    },
  },
  commands: ({ schema, options }) => ({
    insertVideo: (url: string) => insertVideo(schema.nodes.video!, url, options.providers),
  }),
  plugins: ({ schema, options }) => [
    new Plugin({
      props: {
        // A lone video URL pasted into an empty paragraph becomes an embed.
        handlePaste: (view, _event, slice) => {
          const text = slice.content.textBetween(0, slice.content.size, '\n').trim();
          const { $from, empty } = view.state.selection;
          if (!empty || $from.parent.content.size > 0 || text.includes('\n')) return false;
          return insertVideo(schema.nodes.video!, text, options.providers)(view.state, view.dispatch);
        },
      },
    }),
  ],
  ui: () => [
    {
      id: 'video',
      kind: 'panel',
      icon: 'video',
      label: 'toolbar.video',
      contexts: ['text'],
      slash: { keywords: ['video', 'youtube', 'vimeo', '동영상', '영상', '유튜브'] },
      panel: ({ editor, t, close }) =>
        inputForm({
          t,
          type: 'url',
          labelKey: 'panel.video.url',
          submitKey: 'panel.video.insert',
          onSubmit: (url) => {
            const ok = editor.exec('insertVideo', url);
            if (ok) close();
            return ok;
          },
        }),
    },
  ],
});
