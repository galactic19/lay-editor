import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Editor } from '../../core/Editor';
import type { UploadManager } from '../../io/upload';
import { c } from '../../ui/classes';
import { h } from '../../ui/dom';

const PERCENT = 100;
const HANDLE_SIDES = ['left', 'right'] as const;

/** Renders the figure with resize handles and upload progress; the caption stays editable content. */
export class ImageView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly progress: HTMLElement;
  private readonly unsubscribe: () => void;

  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly editor: Editor,
    uploads: UploadManager,
  ) {
    this.img = h('img', { attrs: { draggable: 'false' } });
    this.contentDOM = h('figcaption', { attrs: { 'data-placeholder': editor.t('panel.image.caption') } });
    this.progress = h('div', { class: c('upload-progress'), attrs: { role: 'progressbar', 'aria-label': editor.t('a11y.uploading') } });
    const handles = HANDLE_SIDES.map((side) =>
      h('span', {
        class: c('resize-handle', `resize-${side}`),
        attrs: { 'aria-hidden': 'true', title: editor.t('a11y.resizeImage') },
        on: { pointerdown: (event) => this.startResize(event, side) },
      }),
    );
    this.dom = h('figure', { class: c('image') }, h('div', { class: c('image-frame') }, this.img, this.progress, ...handles), this.contentDOM);
    this.unsubscribe = uploads.onProgress((id, ratio) => {
      if (id === this.node.attrs.uploadId) this.progress.style.setProperty('--le-progress', String(ratio));
    });
    this.render();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return (event.target as HTMLElement).classList?.contains(c('resize-handle'));
  }

  ignoreMutation(mutation: { type: string; target: Node }): boolean {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.unsubscribe();
  }

  private render(): void {
    const { src, alt, width, align, uploadId } = this.node.attrs;
    if (this.img.getAttribute('src') !== src) this.img.src = src;
    this.img.alt = alt;
    this.dom.dataset.align = align;
    this.dom.style.width = width ? `${width}%` : '';
    this.dom.classList.toggle(c('uploading'), uploadId !== null);
    // An empty caption still holds ProseMirror's trailing <br>, so CSS :empty cannot tell.
    this.dom.classList.toggle(c('caption-empty'), this.node.content.size === 0);
  }

  private startResize(event: PointerEvent, side: (typeof HANDLE_SIDES)[number]): void {
    event.preventDefault();
    if (!this.view.editable) return;
    const content = this.view.dom as HTMLElement;
    const startX = event.clientX;
    const startWidth = this.dom.getBoundingClientRect().width;
    const total = content.clientWidth || startWidth || 1;
    // Centered images grow on both sides, so the pointer moves half as far.
    const factor = (this.node.attrs.align === 'center' ? 2 : 1) * (side === 'left' ? -1 : 1);
    let percent = this.node.attrs.width as number | null;
    const onMove = (move: PointerEvent): void => {
      percent = Math.round(((startWidth + (move.clientX - startX) * factor) / total) * PERCENT);
      this.dom.style.width = `${percent}%`;
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const pos = this.getPos();
      if (pos !== undefined && percent !== null) this.editor.exec('setImageWidth', percent, pos);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
}
