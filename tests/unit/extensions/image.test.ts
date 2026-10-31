import type { UploadResult } from '../../../src/core/types';
import { flushPromises, makeEditor, select } from '../../helpers/editor';

const png = (size = 4) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgo=';

function deferredUpload() {
  let resolve!: (r: UploadResult) => void;
  let reject!: (e: unknown) => void;
  const upload = vi.fn((_file: File, ctx: { onProgress(r: number): void }) => {
    ctx.onProgress(0.5);
    return new Promise<UploadResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return { upload, resolve: (r: UploadResult) => resolve(r), reject: (e: unknown) => reject(e) };
}

describe('image node', () => {
  it('parses a bare img and rejects javascript: src', () => {
    expect(makeEditor({ content: '<img src="https://x.com/a.png" alt="x">' }).getHTML()).toBe(
      '<figure data-align="center"><img src="https://x.com/a.png" alt="x"><figcaption></figcaption></figure>',
    );
    expect(makeEditor({ content: '<img src="javascript:x">' }).getHTML()).toBe('');
  });

  it('insertImage validates the URL', () => {
    const ed = makeEditor();
    expect(ed.exec('insertImage', { src: 'javascript:alert(1)' })).toBe(false);
    expect(ed.exec('insertImage', { src: 'https://x.com/a.png', alt: 'a' })).toBe(true);
    expect(ed.getHTML()).toContain('<img src="https://x.com/a.png" alt="a">');
  });

  it('setImageWidth clamps; align and alt update the selected image', () => {
    const ed = makeEditor({ content: '<figure><img src="https://x.com/a.png"></figure>' });
    select(ed, 'node:0');
    ed.exec('setImageWidth', 150);
    ed.exec('setImageAlign', 'right');
    ed.exec('setImageAlt', '설명');
    expect(ed.getHTML()).toBe('<figure data-align="right" style="width: 100%;"><img src="https://x.com/a.png" alt="설명"><figcaption></figcaption></figure>');
    expect(ed.exec('setImageAlign', 'diagonal')).toBe(false);
    ed.exec('deleteImage');
    expect(ed.getHTML()).toBe('');
  });

  it('registers width buttons from DEFAULTS.image.widths in the image context', () => {
    const ed = makeEditor();
    const ids = [...ed.ui!.registry.values()].filter((i) => i.contexts.includes('image') && !i.contexts.includes('text')).map((i) => i.id);
    expect(ids).toEqual(['imageWidth25', 'imageWidth50', 'imageWidth75', 'imageWidth100', 'imageAlignLeft', 'imageAlignCenter', 'imageAlignRight', 'imageAlt', 'imageDelete']);
  });
});

describe('upload flow', () => {
  it('uploads: placeholder hidden from getHTML, then replaced without an undo step', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    const started = ed.exec('uploadImages', [png()]);
    expect(started).toBe(true);
    await flushPromises();
    expect(ed.view.dom.querySelector('.le-uploading')).not.toBeNull();
    expect(ed.getHTML()).toBe('');
    resolve({ url: 'https://cdn.x/a.png' });
    await flushPromises();
    expect(ed.getHTML()).toContain('src="https://cdn.x/a.png"');
    expect(ed.view.dom.querySelector('.le-uploading')).toBeNull();
    ed.exec('undo');
    expect(ed.getHTML()).toBe('');
  });

  it('emits uploadStart, uploadProgress and uploadSuccess in order', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    const events: string[] = [];
    ed.on('uploadStart', () => events.push('start'));
    ed.on('uploadProgress', (_f, r) => events.push(`progress:${r}`));
    ed.on('uploadSuccess', (_f, url) => events.push(`success:${url}`));
    ed.exec('uploadImages', [png()]);
    await flushPromises();
    resolve({ url: 'https://cdn.x/a.png' });
    await flushPromises();
    expect(events).toEqual(['start', 'progress:0.5', 'success:https://cdn.x/a.png']);
  });

  it.each([
    [{ maxSize: 1 }, png(4), 'size'],
    [{}, new File(['x'], 'a.svg', { type: 'image/svg+xml' }), 'type'],
  ])('rejects %o with UPLOAD_REJECTED and a toast', async (image, file, reason) => {
    const { upload } = deferredUpload();
    const ed = makeEditor({ upload, image });
    const onError = vi.fn();
    ed.on('uploadError', onError);
    ed.exec('uploadImages', [file]);
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UPLOAD_REJECTED', message: expect.stringContaining(reason) }), file);
    expect(upload).not.toHaveBeenCalled();
    expect(document.querySelector('.le-toast-error')).not.toBeNull();
  });

  it('removes the placeholder and emits uploadError(UPLOAD_FAILED) on failure', async () => {
    const { upload, reject } = deferredUpload();
    const ed = makeEditor({ upload });
    const onError = vi.fn();
    ed.on('uploadError', onError);
    ed.exec('uploadImages', [png()]);
    await flushPromises();
    reject(new Error('500'));
    await flushPromises();
    expect(ed.getHTML()).toBe('');
    expect(ed.state.doc.textContent).toBe('');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UPLOAD_FAILED' }), expect.any(File));
  });

  it('rejects an unsafe URL returned by the server', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    ed.exec('uploadImages', [png()]);
    await flushPromises();
    resolve({ url: 'javascript:alert(1)' });
    await flushPromises();
    expect(ed.getHTML()).toBe('');
  });

  it('ignores a result after destroy', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    ed.exec('uploadImages', [png()]);
    await flushPromises();
    ed.destroy();
    resolve({ url: 'https://cdn.x/a.png' });
    await expect(flushPromises()).resolves.toBeUndefined();
  });

  it('ignores a result whose node the user deleted', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    ed.exec('uploadImages', [png()]);
    await flushPromises();
    ed.exec('undo');
    resolve({ url: 'https://cdn.x/a.png' });
    await flushPromises();
    expect(ed.getHTML()).toBe('');
  });

  it('uploads pasted data: images', async () => {
    const { upload, resolve } = deferredUpload();
    const ed = makeEditor({ upload });
    ed.view.pasteHTML(`<img src="${PNG_DATA}">`);
    await flushPromises();
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }), expect.anything());
    expect(ed.getHTML()).toBe('');
    resolve({ url: 'https://cdn.x/p.png' });
    await flushPromises();
    expect(ed.getHTML()).toContain('src="https://cdn.x/p.png"');
  });

  it('drops pasted data: images with a toast when upload is missing', async () => {
    const ed = makeEditor();
    ed.view.pasteHTML(`<p>a</p><img src="${PNG_DATA}">`);
    await flushPromises();
    expect(ed.getHTML()).not.toContain('data:');
    expect(document.querySelector('.le-toasts')!.textContent).toBe(ed.t('toast.uploadNotConfigured'));
  });

  it('uploadImages without an upload function shows a toast', () => {
    const ed = makeEditor();
    ed.exec('uploadImages', [png()]);
    expect(document.querySelector('.le-toasts')!.textContent).toBe(ed.t('toast.uploadNotConfigured'));
  });
});

describe('image panel', () => {
  it('shows the file picker only when upload is configured, and inserts by URL', () => {
    const ed = makeEditor();
    ed.ui!.openPanelFor('image');
    const panel = document.querySelector('.le-dropdown')!;
    expect(panel.querySelector('input[type="file"]')).toBeNull();
    const input = panel.querySelector<HTMLInputElement>('input[type="url"]')!;
    input.value = 'https://x.com/a.png';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ed.getHTML()).toContain('src="https://x.com/a.png"');
    expect(document.querySelector('.le-dropdown')).toBeNull();
  });

  it('uploads files picked in the panel', async () => {
    const { upload } = deferredUpload();
    const ed = makeEditor({ upload });
    ed.ui!.openPanelFor('image');
    const file = document.querySelector<HTMLInputElement>('.le-dropdown input[type="file"]')!;
    Object.defineProperty(file, 'files', { value: [png()] });
    file.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
