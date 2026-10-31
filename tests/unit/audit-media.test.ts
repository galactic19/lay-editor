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
