import type { Node as PMNode, NodeType } from 'prosemirror-model';
import { NodeSelection, Plugin, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { c } from '../../ui/classes';
import { insertPoint } from 'prosemirror-transform';
import type { Editor } from '../../core/Editor';
import { DEFAULTS } from '../../core/defaults';
import { findParent } from '../../core/state-utils';
import type { ExtensionContext, UIItem } from '../../core/types';
import { clampWidth, oneOf, safeUrl } from '../../io/sanitize';
import { dataUrlToFile, UploadManager } from '../../io/upload';
import { defineExtension } from '../factories';
import { altPanel, imagePanel } from './imagePanel';
import { ImageView } from './ImageView';

type ImageOptions = { maxSize: number; accept: readonly string[]; widths: readonly number[]; aligns: readonly string[] };
type Align = (typeof DEFAULTS.image.aligns)[number];

export interface ImageInput {
  src: string;
  alt?: string;
  uploadId?: string;
}

const managers = new WeakMap<Editor, UploadManager>();

/** One upload manager per editor, created on first use (node views render before onCreate runs). */
function uploadsOf({ editor, options, config }: ExtensionContext<ImageOptions>): UploadManager {
  let manager = managers.get(editor);
  if (!manager) {
    manager = new UploadManager(editor, { upload: config.upload, maxSize: options.maxSize, accept: options.accept });
    managers.set(editor, manager);
  }
  return manager;
}

function imageAttrs(img: HTMLElement | null, figure?: HTMLElement) {
  const src = safeUrl(img?.getAttribute('src'), { allowDataImage: true });
  if (!img || !src) return false;
  return {
    src,
    alt: img.getAttribute('alt') ?? '',
    width: clampWidth(figure?.style.width || img.style.width || null),
    align: oneOf(figure?.dataset.align, DEFAULTS.image.aligns) ?? 'center',
  };
}

/** The image to act on: the node at `pos`, the selected image, or the image whose caption holds the cursor. */
function targetImage(state: EditorState, type: NodeType, pos?: number): { node: PMNode; pos: number } | null {
  if (pos !== undefined) {
    const node = state.doc.nodeAt(pos);
    return node?.type === type ? { node, pos } : null;
  }
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type === type) return { node: selection.node, pos: selection.from };
  return findParent(state, (node) => node.type === type);
}

const updateImage =
  (type: NodeType, attrs: (current: PMNode) => Record<string, unknown> | null, pos?: number): Command =>
  (state, dispatch) => {
    const target = targetImage(state, type, pos);
    const next = target && attrs(target.node);
    if (!target || !next) return false;
    dispatch?.(state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, ...next }));
    return true;
  };

function insertImage(type: NodeType, input: ImageInput, pos?: number): Command {
  return (state, dispatch) => {
    const src = input.uploadId ? input.src : safeUrl(input.src, { allowDataImage: true });
    if (!src) return false;
    const node = type.create({ src, alt: input.alt ?? '', uploadId: input.uploadId ?? null });
    if (!dispatch) return true;
    const at = pos === undefined ? null : insertPoint(state.doc, pos, type);
    dispatch((at === null ? state.tr.replaceSelectionWith(node) : state.tr.insert(at, node)).scrollIntoView());
    return true;
  };
}

const imageFiles = (data: DataTransfer | null): File[] => Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'));

/** After a paste or drop, hands data: images to the uploader (or drops them when uploads are off). */
function adoptDataImages(tr: Transaction, state: EditorState, type: NodeType, uploads: UploadManager): Transaction | null {
  const found: Array<{ pos: number; node: PMNode }> = [];
  state.doc.descendants((node, pos) => {
    if (node.type === type && node.attrs.uploadId === null && String(node.attrs.src).startsWith('data:')) found.push({ node, pos });
  });
  if (!found.length) return null;
  const next = state.tr.setMeta('addToHistory', tr.getMeta('addToHistory'));
  for (const { node, pos } of found.reverse()) {
    if (!uploads.enabled) {
      next.delete(pos, pos + node.nodeSize);
      continue;
    }
    const id = uploads.nextId();
    next.setNodeMarkup(pos, undefined, { ...node.attrs, uploadId: id });
    queueMicrotask(() => void uploads.uploadExisting(id, dataUrlToFile(node.attrs.src)));
  }
  if (!uploads.enabled) void uploads.uploadFiles([]);
  return next;
}

const sizeItem = (n: number): UIItem => ({
  id: `imageWidth${n}`,
  kind: 'button',
  icon: 'image',
  text: `${n}%`,
  label: 'toolbar.imageWidth',
  labelParams: { n },
  command: 'setImageWidth',
  args: [n],
  contexts: ['image'],
  isActive: (editor) => editor.isActive('image', { width: n }),
});

const alignItem = (align: Align): UIItem => ({
  id: `imageAlign${align[0]!.toUpperCase()}${align.slice(1)}`,
  kind: 'button',
  icon: `align-${align}`,
  label: `toolbar.imageAlign${align[0]!.toUpperCase()}${align.slice(1)}`,
  command: 'setImageAlign',
  args: [align],
  contexts: ['image'],
  isActive: (editor) => editor.isActive('image', { align }),
});

export const image = defineExtension<ImageOptions>({
  name: 'image',
  defaults: DEFAULTS.image,
  nodes: {
    image: {
      group: 'block',
      content: 'text*',
      marks: '',
      draggable: true,
      isolating: true,
      attrs: { src: {}, alt: { default: '' }, width: { default: null }, align: { default: 'center' }, uploadId: { default: null } },
      parseDOM: [
        {
          tag: 'figure',
          contentElement: (dom: HTMLElement) => dom.querySelector('figcaption') ?? document.createElement('figcaption'),
          getAttrs: (dom: HTMLElement) => imageAttrs(dom.querySelector('img'), dom),
        },
        { tag: 'img[src]', getAttrs: (dom: HTMLElement) => imageAttrs(dom) },
      ],
      toDOM: (node) => [
        'figure',
        { 'data-align': node.attrs.align, style: node.attrs.width ? `width: ${node.attrs.width}%` : null },
        ['img', { src: node.attrs.src, alt: node.attrs.alt }],
        ['figcaption', 0],
      ],
      transient: (node) => node.attrs.uploadId !== null,
    },
  },
  commands: (ctx) => {
    const { schema, editor } = ctx;
    const type = schema.nodes.image!;
    return {
      insertImage: (input: ImageInput, pos?: number) => insertImage(type, input, pos),
      setImageWidth: (percent: number | null, pos?: number) =>
        updateImage(type, () => ({ width: percent === null ? null : clampWidth(percent) }), pos),
      setImageAlign: (align: string, pos?: number) => updateImage(type, () => (oneOf(align, DEFAULTS.image.aligns) ? { align } : null), pos),
      setImageAlt: (alt: string, pos?: number) => updateImage(type, () => ({ alt: String(alt ?? '') }), pos),
      deleteImage: (pos?: number): Command => (state, dispatch) => {
        const target = targetImage(state, type, pos);
        if (!target) return false;
        dispatch?.(state.tr.delete(target.pos, target.pos + target.node.nodeSize));
        return true;
      },
      uploadImages: (files: File[], pos?: number): Command => (_state, dispatch) => {
        if (dispatch) void uploadsOf(ctx).uploadFiles(files, pos);
        return true;
      },
      openImagePanel: (): Command => (_state, dispatch) => {
        if (dispatch) editor.ui?.openPanelFor('image');
        return true;
      },
    };
  },
  plugins: (ctx) => {
    const type = ctx.schema.nodes.image!;
    const uploads = () => uploadsOf(ctx);
    return [
      new Plugin({
        props: {
          // Marks the image being worked on so its handles and caption hint show.
          decorations: (state) => {
            const target = targetImage(state, type);
            return target
              ? DecorationSet.create(state.doc, [Decoration.node(target.pos, target.pos + target.node.nodeSize, { class: c('image-active') })])
              : null;
          },
          handlePaste: (_view, event) => {
            const files = imageFiles(event.clipboardData);
            if (!files.length || event.clipboardData?.types.includes('text/html')) return false;
            void uploads().uploadFiles(files);
            return true;
          },
          handleDrop: (view, event) => {
            const files = imageFiles(event.dataTransfer);
            if (!files.length) return false;
            event.preventDefault();
            void uploads().uploadFiles(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
            return true;
          },
        },
        appendTransaction: (trs, _old, state) => {
          const pasted = trs.find((tr) => tr.docChanged && ['paste', 'drop'].includes(tr.getMeta('uiEvent')));
          return pasted ? adoptDataImages(pasted, state, type, uploads()) : null;
        },
      }),
    ];
  },
  nodeViews: (ctx) => ({ image: (node, view, getPos) => new ImageView(node, view, getPos, ctx.editor, uploadsOf(ctx)) }),
  ui: (ctx) => [
    {
      id: 'image',
      kind: 'panel',
      icon: 'image',
      label: 'toolbar.image',
      contexts: ['text'],
      panel: imagePanel(() => uploadsOf(ctx), ctx.options.accept),
      slash: { keywords: ['image', 'picture', 'photo', '이미지', '사진', '그림'] },
    },
    ...ctx.options.widths.map(sizeItem),
    ...(ctx.options.aligns as Align[]).map(alignItem),
    { id: 'imageAlt', kind: 'panel', icon: 'type', label: 'toolbar.imageAlt', contexts: ['image'], panel: altPanel },
    { id: 'imageDelete', kind: 'button', icon: 'trash', label: 'toolbar.imageDelete', command: 'deleteImage', contexts: ['image'] },
  ],
  onCreate: (ctx) => {
    const { editor } = ctx;
    const manager = uploadsOf(ctx);
    return () => {
      manager.destroy();
      managers.delete(editor);
    };
  },
});
