import type { Fragment, Node as PMNode, NodeType, Slice } from 'prosemirror-model';
import { NodeSelection, Plugin, Selection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { c } from '../../ui/classes';
import { insertPoint } from 'prosemirror-transform';
import type { Editor } from '../../core/Editor';
import { DEFAULTS } from '../../core/defaults';
import { findParent, openParagraph } from '../../core/state-utils';
import type { ExtensionContext, UIItem } from '../../core/types';
import { clampWidth, oneOf, safeUrl } from '../../io/sanitize';
import { dataUrlToFile, UploadManager } from '../../io/upload';
import { capitalize, defineExtension } from '../factories';
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

/** Where a new image goes: near `pos`, after the image whose caption holds the cursor, or null for the selection. */
function insertPos(state: EditorState, type: NodeType, pos?: number): number | null {
  if (pos !== undefined) return insertPoint(state.doc, pos, type);
  // A caption only holds text; replacing the selection there would split its image in two.
  const captioned = findParent(state, (node) => node.type === type);
  return captioned ? captioned.pos + captioned.node.nodeSize : null;
}

function insertImage(type: NodeType, input: ImageInput, pos?: number): Command {
  return (state, dispatch) => {
    const src = input.uploadId ? input.src : safeUrl(input.src, { allowDataImage: true });
    if (!src) return false;
    const node = type.create({ src, alt: input.alt ?? '', uploadId: input.uploadId ?? null });
    if (!dispatch) return true;
    const at = insertPos(state, type, pos);
    dispatch((at === null ? state.tr.replaceSelectionWith(node) : state.tr.insert(at, node)).scrollIntoView());
    return true;
  };
}

/**
 * Enter (and the line break keys) in a caption: a caption is one line of text, so the caret leaves it for a new
 * paragraph after the image and the caption stays whole. Without this Enter did nothing, and on a touch keyboard
 * an image at the end of the document had no way past it.
 */
const leaveCaption =
  (type: NodeType): Command =>
  (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.parent.type !== type) return false;
    dispatch?.(openParagraph(state.tr, $from.after()).scrollIntoView());
    return true;
  };

/** The pasted content inside the wrappers it was cut from, so a copied line of text is just its text. */
function openContent(slice: Slice): Fragment {
  let { content } = slice;
  for (let depth = 0; depth < Math.min(slice.openStart, slice.openEnd) && content.childCount === 1; depth++) content = content.firstChild!.content;
  return content;
}

/**
 * A caption holds plain text only. Pasting more there (an image, several paragraphs) would split
 * the captioned image, so it goes right after that image instead.
 */
function pasteAfterCaption(view: EditorView, slice: Slice, type: NodeType): boolean {
  const at = insertPos(view.state, type);
  if (at === null || type.contentMatch.matchFragment(openContent(slice))) return false;
  const tr = view.state.tr.replace(at, at, slice);
  // As with any paste, the cursor ends up after the pasted content.
  tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(at)), -1));
  view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
  return true;
}

const imageFiles = (data: DataTransfer | null): File[] => Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'));

function readDataImage(src: string): File | null {
  try {
    return dataUrlToFile(src);
  } catch {
    return null;
  }
}

/** Images whose src is still an inline data: URL (not uploaded, not being uploaded). */
function dataImages(doc: PMNode, type: NodeType): Array<{ pos: number; node: PMNode }> {
  const found: Array<{ pos: number; node: PMNode }> = [];
  doc.descendants((node, pos) => {
    if (node.type === type && node.attrs.uploadId === null && String(node.attrs.src).startsWith('data:')) found.push({ node, pos });
  });
  return found;
}

/**
 * After a paste or drop, hands the data: images it brought in to the uploader. Images that cannot
 * be decoded, fail validation, or arrive while uploads are off are removed with a notice.
 * Images the document already had (including ones a drop only moved) are left alone.
 */
function adoptDataImages(tr: Transaction, old: EditorState, state: EditorState, type: NodeType, uploads: UploadManager): Transaction | null {
  const existing = new Set(dataImages(old.doc, type).map(({ node }) => node.attrs.src));
  const found = dataImages(state.doc, type).filter(({ node }) => !existing.has(node.attrs.src));
  if (!found.length) return null;
  const next = state.tr.setMeta('addToHistory', tr.getMeta('addToHistory'));
  const notices: Array<() => void> = [];
  for (const { node, pos } of found.reverse()) {
    const file = uploads.enabled ? readDataImage(node.attrs.src) : null;
    const accepted = file !== null && uploads.validate(file) === null;
    if (!accepted) {
      next.delete(pos, pos + node.nodeSize);
      if (uploads.enabled) notices.push(() => (file ? uploads.reject(file) : uploads.rejectUnreadable()));
      continue;
    }
    const id = uploads.nextId();
    next.setNodeMarkup(pos, undefined, { ...node.attrs, uploadId: id });
    notices.push(() => void uploads.uploadExisting(id, file));
  }
  if (!uploads.enabled) notices.push(() => uploads.notifyDisabled());
  // Side effects run after the transaction is applied.
  queueMicrotask(() => notices.forEach((notice) => notice()));
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
  id: `imageAlign${capitalize(align)}`,
  kind: 'button',
  icon: `align-${align}`,
  label: `toolbar.imageAlign${capitalize(align)}`,
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
  keymap: ({ schema }) => {
    const leave = leaveCaption(schema.nodes.image!);
    return { Enter: leave, 'Shift-Enter': leave, 'Mod-Enter': leave };
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
          // The caption makes the image a non-leaf node, which ProseMirror does not select on a plain click.
          handleClickOn: (view, _pos, node, nodePos, event, direct) => {
            if (!direct || node.type !== type || !(event.target as Element).closest(`.${c('image-frame')}`)) return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            return true;
          },
          handlePaste: (view, event, slice) => {
            const files = imageFiles(event.clipboardData);
            // Files alone (a screenshot) are uploaded; with HTML (an image copied from a page) the HTML is pasted.
            if (files.length && !event.clipboardData?.types.includes('text/html')) {
              void uploads().uploadFiles(files);
              return true;
            }
            return pasteAfterCaption(view, slice, type);
          },
          handleDrop: (view, event) => {
            const files = imageFiles(event.dataTransfer);
            if (!files.length) return false;
            event.preventDefault();
            void uploads().uploadFiles(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
            return true;
          },
        },
        appendTransaction: (trs, old, state) => {
          const pasted = trs.find((tr) => tr.docChanged && ['paste', 'drop'].includes(tr.getMeta('uiEvent')));
          return pasted ? adoptDataImages(pasted, old, state, type, uploads()) : null;
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
