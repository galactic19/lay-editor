import { flushPromises, makeEditor, typeText } from '../helpers/editor';

describe('audit core: every public method is safe after destroy', () => {
  it('setEditable, setTheme and the other methods are no-ops on a destroyed editor', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.destroy();
    expect(() => ed.setEditable(false)).not.toThrow();
    expect(() => ed.setEditable(true)).not.toThrow();
    expect(() => ed.setTheme('dark')).not.toThrow();
    expect(ed.root.dataset.theme).not.toBe('dark');
    expect(() => {
      ed.setHTML('<p>b</p>');
      ed.setLocale('en');
      ed.focus();
      ed.blur();
      ed.syncSelection();
      ed.flushChange();
      ed.clearDraft();
      ed.exec('toggleBold');
      ed.can('undo');
      ed.isActive('bold');
      ed.destroy();
    }).not.toThrow();
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('destroy() called from a destroy listener runs the teardown once', () => {
    const ed = makeEditor();
    const onError = vi.fn();
    const onDestroy = vi.fn(() => ed.destroy());
    ed.on('error', onError);
    ed.on('destroy', onDestroy);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    ed.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(document.querySelector('.le-editor')).toBeNull();
  });
});

describe('audit core: setHTML starts a fresh undo history', () => {
  it('undo after loading cannot bring back a deleted paragraph of the previous document', () => {
    const ed = makeEditor({ content: '<p>first A</p><p>second A</p>' });
    ed.view.dispatch(ed.state.tr.delete(0, ed.state.doc.firstChild!.nodeSize));
    ed.setHTML('<p>B only</p>');
    expect(ed.can('undo')).toBe(false);
    ed.exec('undo');
    expect(ed.getHTML()).toBe('<p>B only</p>');
  });

  it('undo after loading cannot replace the new document with a cleared one', () => {
    const ed = makeEditor({ content: '<p>old post A</p><p>more A</p>' });
    ed.view.dispatch(ed.state.tr.delete(0, ed.state.doc.content.size));
    ed.setHTML('<p>post B</p>');
    ed.exec('undo');
    expect(ed.getHTML()).toBe('<p>post B</p>');
  });

  it('edits after loading are still undoable, back to the loaded content', () => {
    const ed = makeEditor({ content: '<p>A</p>' });
    typeText(ed, 'x');
    ed.setHTML('<p>B</p>');
    typeText(ed, 'y');
    expect(ed.getHTML()).toBe('<p>By</p>');
    ed.exec('undo');
    expect(ed.getHTML()).toBe('<p>B</p>');
    expect(ed.can('undo')).toBe(false);
  });

  it('still emits update and change for the load', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ed = makeEditor({ content: '<p>A</p>', onChange });
    const onUpdate = vi.fn();
    ed.on('update', onUpdate);
    ed.setHTML('<p>B</p>');
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ docChanged: true }));
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith('<p>B</p>');
  });
});

describe('audit core: every upload event passes the file first', () => {
  const photo = (type = 'image/png') => new File([new Uint8Array(4)], 'photo.png', { type });

  it.each([
    ['UPLOAD_FAILED', photo(), async () => Promise.reject(new Error('server 500'))],
    ['UPLOAD_REJECTED', photo('image/svg+xml'), async () => ({ url: 'https://cdn.example.com/a.png' })],
  ])('uploadError is (file, error) for %s', async (code, file, upload) => {
    const ed = makeEditor({ upload });
    const onError = vi.fn();
    ed.on('uploadError', onError);
    ed.exec('uploadImages', [file]);
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(file, expect.objectContaining({ code }));
  });
});
