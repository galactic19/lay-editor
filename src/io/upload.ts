import type { Editor } from '../core/Editor';
import { EditorError } from '../core/errors';
import { findNodeByAttr } from '../core/state-utils';
import type { UploadFn } from '../core/types';
import { safeUrl } from './sanitize';

export interface UploadOptions {
  upload: UploadFn | null;
  maxSize: number;
  accept: readonly string[];
}

const BYTES_PER_MB = 1024 * 1024;
const REJECTION_TOAST = { type: 'toast.uploadBadType', size: 'toast.uploadTooLarge' } as const;
type Rejection = keyof typeof REJECTION_TOAST;

/** Decodes a base64 data: URL; throws on malformed data. */
export function dataUrlToFile(dataUrl: string, name = 'pasted-image'): File {
  const [header, base64 = ''] = dataUrl.split(',');
  const type = /^data:([^;]+)/.exec(header ?? '')?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new File([bytes], `${name}.${type.split('/')[1] ?? 'bin'}`, { type });
}

/**
 * Validates files, shows a placeholder image while the user's upload function runs,
 * then swaps in the returned URL (outside the undo history) or removes the placeholder.
 */
export class UploadManager {
  private readonly listeners = new Set<(id: string, ratio: number) => void>();
  private readonly objectUrls = new Map<string, string>();
  private destroyed = false;
  private counter = 0;

  constructor(
    private readonly editor: Editor,
    private readonly options: UploadOptions,
  ) {}

  get enabled(): boolean {
    return this.options.upload !== null;
  }

  validate(file: File): EditorError | null {
    const reason = this.rejection(file);
    return reason ? new EditorError('UPLOAD_REJECTED', `${reason}: ${file.name}`) : null;
  }

  onProgress(fn: (id: string, ratio: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Inserts a placeholder per file at `pos` (or the selection), each after the previous one, and uploads them. */
  uploadFiles(files: File[], pos?: number): Promise<void> {
    if (!this.enabled) {
      this.notifyDisabled();
      return Promise.resolve();
    }
    let at = pos;
    const uploads = files.map((file) => {
      const id = this.insertPlaceholder(file, at);
      if (id === null) return Promise.resolve();
      const placed = this.find(id);
      if (placed) at = placed.pos + placed.node.nodeSize;
      return this.run(id, file);
    });
    return Promise.all(uploads).then(() => undefined);
  }

  /** Starts an upload for an image node that already carries `uploadId` (e.g. a pasted data: image). */
  uploadExisting(id: string, file: File): Promise<void> {
    return this.run(id, file);
  }

  nextId(): string {
    this.counter += 1;
    return `upload-${Date.now().toString(36)}-${this.counter}`;
  }

  destroy(): void {
    this.destroyed = true;
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.listeners.clear();
  }

  /** Emits uploadError and shows why a file was refused; false when the file is acceptable. */
  reject(file: File): boolean {
    const reason = this.rejection(file);
    if (!reason) return false;
    this.editor.emit('uploadError', file, this.validate(file)!);
    this.toast(REJECTION_TOAST[reason], { max: `${Math.round(this.options.maxSize / BYTES_PER_MB)}MB` });
    return true;
  }

  /** Tells the user an image could not be read at all (e.g. corrupt pasted data). */
  rejectUnreadable(): void {
    this.toast(REJECTION_TOAST.type);
  }

  /** Tells the user uploads are not set up. */
  notifyDisabled(): void {
    this.toast('toast.uploadNotConfigured');
  }

  /** Inserts a preview for an accepted file; returns its upload id, or null when the file was refused. */
  private insertPlaceholder(file: File, pos?: number): string | null {
    if (this.reject(file)) return null;
    const id = this.nextId();
    const url = URL.createObjectURL(file);
    this.objectUrls.set(id, url);
    this.editor.exec('insertImage', { src: url, uploadId: id }, pos);
    return id;
  }

  private async run(id: string, file: File): Promise<void> {
    this.editor.emit('uploadStart', file);
    try {
      const result = await this.options.upload!(file, {
        onProgress: (ratio) => {
          if (this.destroyed) return;
          this.listeners.forEach((fn) => fn(id, ratio));
          this.editor.emit('uploadProgress', file, ratio);
        },
      });
      if (this.destroyed) return;
      const src = safeUrl(result?.url);
      if (!src) throw new Error(`unsafe or missing url: ${String(result?.url)}`);
      if (this.replace(id, { src, ...(result.alt ? { alt: result.alt } : {}), uploadId: null })) this.editor.emit('uploadSuccess', file, src);
    } catch (cause) {
      if (this.destroyed) return;
      this.replace(id, null);
      this.editor.emit('uploadError', file, new EditorError('UPLOAD_FAILED', file.name, { cause }));
      this.toast('toast.uploadFailed');
    } finally {
      const url = this.objectUrls.get(id);
      if (url) URL.revokeObjectURL(url);
      this.objectUrls.delete(id);
    }
  }

  private rejection(file: File): Rejection | null {
    if (!this.options.accept.includes(file.type)) return 'type';
    return file.size > this.options.maxSize ? 'size' : null;
  }

  private find(id: string): ReturnType<typeof findNodeByAttr> {
    return findNodeByAttr(this.editor.state.doc, 'uploadId', id);
  }

  /** Updates (or with null removes) the placeholder; false if the user already removed it. */
  private replace(id: string, attrs: Record<string, unknown> | null): boolean {
    const { state, view } = this.editor;
    const found = this.find(id);
    if (!found) return false;
    const tr = attrs
      ? state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...attrs })
      : state.tr.delete(found.pos, found.pos + found.node.nodeSize);
    view.dispatch(tr.setMeta('addToHistory', false));
    return true;
  }

  private toast(key: string, params?: Record<string, string>): void {
    this.editor.ui?.toaster.show(this.editor.t(key, params), 'error');
  }
}
