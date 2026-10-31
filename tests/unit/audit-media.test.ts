import { TextSelection } from 'prosemirror-state';
import type { Editor } from '../../src/core/Editor';
import { findText, flushPromises, makeEditor } from '../helpers/editor';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OTHER_PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FIGURE = (src: string, caption = 'caption') => `<figure data-align="center"><img src="${src}" alt="logo"><figcaption>${caption}</figcaption></figure>`;

const toasts = (ed: Editor): string => ed.root.querySelector('.le-toasts')!.textContent ?? '';
const caretAfter = (ed: Editor, text: string): void => {
  const pos = findText(ed, text) + text.length;
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)));
};

describe('audit #21: paste and drop only touch the images they bring in', () => {
  const DOC = `<p>first</p>${FIGURE(PNG)}<p>last</p>`;

  it('keeps an existing data: image and shows no toast when text is pasted without upload', async () => {
    const ed = makeEditor({ content: DOC });
    caretAfter(ed, 'last');
    ed.view.pasteText('pasted words');
    await flushPromises();
    expect(ed.getHTML()).toBe(`<p>first</p>${FIGURE(PNG)}<p>lastpasted words</p>`);
    expect(toasts(ed)).toBe('');
  });

  it('does not re-upload existing data: images when text is pasted', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.x/a.png' }));
    const ed = makeEditor({ upload, content: DOC });
    caretAfter(ed, 'last');
    ed.view.pasteText('x');
    await flushPromises();
    expect(upload).not.toHaveBeenCalled();
    expect(ed.getHTML()).toContain(PNG);
  });

  it('keeps a data: image that a drop moves inside the document', async () => {
    const ed = makeEditor({ content: DOC });
    const image = ed.state.doc.child(1);
    const tr = ed.state.tr.delete(findText(ed, 'caption') - 1, findText(ed, 'caption') - 1 + image.nodeSize);
    tr.insert(tr.doc.content.size, image);
    ed.view.dispatch(tr.setMeta('uiEvent', 'drop'));
    await flushPromises();
    expect(ed.getHTML()).toBe(`<p>first</p><p>last</p>${FIGURE(PNG)}`);
    expect(toasts(ed)).toBe('');
  });

  it('uploads only the data: image inside the pasted content', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.x/new.png' }));
    const ed = makeEditor({ upload, content: DOC });
    caretAfter(ed, 'last');
    ed.view.pasteHTML(`<img src="${OTHER_PNG}">`);
    await flushPromises();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(ed.getHTML()).toContain(PNG);
    expect(ed.getHTML()).toContain('https://cdn.x/new.png');
  });
});

const file = (name = 'a.png') => new File([new Uint8Array(4)], name, { type: 'image/png' });
const source = (ed: Editor) => ed.root.querySelector<HTMLTextAreaElement>('textarea.le-source');
const sourceButton = (ed: Editor) => ed.root.querySelector<HTMLButtonElement>('.le-toolbar [data-item="sourceView"]')!;
const typeSource = (ed: Editor, html: string): void => {
  source(ed)!.value = html;
  source(ed)!.dispatchEvent(new Event('input'));
};

/** An upload that resolves when the test says so. */
function heldUpload() {
  const pending: Array<(url: string) => void> = [];
  const upload = vi.fn(() => new Promise<{ url: string }>((resolve) => pending.push((url) => resolve({ url }))));
  return { upload, finish: (url: string) => pending.shift()!(url) };
}

describe('audit #70: the source view keeps images that are still uploading', () => {
  it('opening and closing the source view without edits keeps the placeholder', async () => {
    const { upload, finish } = heldUpload();
    const ed = makeEditor({ upload, content: '<p>x</p>' });
    const success = vi.fn();
    ed.on('uploadSuccess', success);
    ed.exec('uploadImages', [file()]);
    await flushPromises();
    ed.exec('toggleSourceView');
    ed.exec('toggleSourceView');
    expect(ed.view.dom.querySelector('.le-uploading')).not.toBeNull();
    finish('https://cdn.x/a.png');
    await flushPromises();
    expect(ed.getHTML()).toContain('src="https://cdn.x/a.png"');
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('applying source edits keeps the placeholder in place', async () => {
    const { upload, finish } = heldUpload();
    const ed = makeEditor({ upload, content: '<p>x</p><p>y</p>' });
    caretAfter(ed, 'x');
    ed.exec('uploadImages', [file()]);
    await flushPromises();
    ed.exec('toggleSourceView');
    typeSource(ed, '<p>x!</p>\n<p>y</p>');
    expect(ed.view.dom.querySelector('.le-uploading')).not.toBeNull();
    ed.exec('toggleSourceView');
    finish('https://cdn.x/a.png');
    await flushPromises();
    expect(ed.getHTML()).toBe('<p>x!</p><figure data-align="center"><img src="https://cdn.x/a.png" alt=""><figcaption></figcaption></figure><p>y</p>');
  });

  it('shows an upload that finishes while the source view is open, so later edits keep it', async () => {
    const { upload, finish } = heldUpload();
    const ed = makeEditor({ upload, content: '<p>x</p>' });
    ed.exec('uploadImages', [file()]);
    await flushPromises();
    ed.exec('toggleSourceView');
    finish('https://cdn.x/a.png');
    await flushPromises();
    expect(source(ed)!.value).toContain('https://cdn.x/a.png');
    typeSource(ed, source(ed)!.value.replace('<p>x</p>', '<p>z</p>'));
    ed.exec('toggleSourceView');
    expect(ed.getHTML()).toContain('src="https://cdn.x/a.png"');
    expect(ed.getHTML()).toContain('<p>z</p>');
  });
});

describe('audit #8: content set while the source view is open is kept', () => {
  it('setHTML() shows in the source text and survives closing the source view', () => {
    const ed = makeEditor({ content: '<p>old</p>' });
    ed.exec('toggleSourceView');
    ed.setHTML('<p>loaded by app</p>');
    expect(source(ed)!.value).toBe('<p>loaded by app</p>');
    ed.exec('toggleSourceView');
    expect(ed.getHTML()).toBe('<p>loaded by app</p>');
  });

  it('destroy() keeps content set while the source view was open', () => {
    document.body.innerHTML = '<textarea><p>old</p></textarea>';
    const ta = document.querySelector('textarea')!;
    const ed = makeEditor({ element: ta });
    ed.exec('toggleSourceView');
    ed.setHTML('<p>new</p>');
    ed.destroy();
    expect(ta.value).toBe('<p>new</p>');
  });
});

describe('audit #9: read-only mode with the source view open', () => {
  it('makes the source text read-only and keeps the toggle usable to leave', () => {
    const ed = makeEditor({ content: '<p>abc</p>' });
    ed.exec('toggleSourceView');
    ed.setEditable(false);
    expect(source(ed)!.readOnly).toBe(true);
    expect(sourceButton(ed).getAttribute('aria-disabled')).toBe('false');
    expect(ed.root.querySelector('.le-toolbar [data-item="bold"]')!.getAttribute('aria-disabled')).toBe('true');
    sourceButton(ed).click();
    expect(source(ed)).toBeNull();
    expect(ed.getHTML()).toBe('<p>abc</p>');
    expect(sourceButton(ed).getAttribute('aria-disabled')).toBe('true');
  });

  it('opens read-only when the editor already is, and becomes editable again with it', () => {
    const ed = makeEditor({ content: '<p>abc</p>' });
    ed.setEditable(false);
    ed.exec('toggleSourceView');
    expect(source(ed)!.readOnly).toBe(true);
    ed.setEditable(true);
    expect(source(ed)!.readOnly).toBe(false);
  });
});
