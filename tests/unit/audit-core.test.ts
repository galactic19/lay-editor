import { createEditor } from '../../src/core/createEditor';
import { createTranslator, registerLocale } from '../../src/i18n';
import { onCleanup } from '../setup';
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

describe('audit core: locale codes are matched as language tags', () => {
  const bold = (code: string) => createTranslator(code)('toolbar.bold');

  it.each([
    ['ko-KR', '굵게'],
    ['KO', '굵게'],
    ['en-US', 'Bold'],
    ['en-GB', 'Bold'],
  ])('%s resolves to its language pack', (code, label) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(bold(code)).toBe(label);
    expect(warn).not.toHaveBeenCalled();
  });

  it('matches a registered region pack case-insensitively, then its language', () => {
    registerLocale('pt-BR', { placeholder: 'Escreva aqui' });
    expect(createTranslator('pt-br')('placeholder')).toBe('Escreva aqui');
    expect(createTranslator('pt-BR-x-test')('placeholder')).toBe('Escreva aqui');
  });

  it('an unknown code falls back to the default locale with a warning that lists the registered codes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(bold('kr')).toBe('굵게');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toEqual(expect.stringMatching(/"kr".*en, ko/));
  });

  it('createEditor and setLocale use the same fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ed = makeEditor({ locale: 'kr' });
    expect(ed.root.querySelector('[data-item="bold"]')!.getAttribute('aria-label')).toContain('굵게');
    ed.setLocale('en-US');
    expect(ed.root.querySelector('[data-item="bold"]')!.getAttribute('aria-label')).toContain('Bold');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

/** A form with one textarea-mode editor; extra markup goes before the textarea. */
function formEditor(textarea: string, options: Record<string, unknown> = {}, before = '') {
  document.body.innerHTML = `<form>${before}${textarea}<button>save</button></form>`;
  const form = document.querySelector('form')!;
  const ta = form.querySelector('textarea')!;
  const ed = createEditor({ element: ta, ...options });
  onCleanup(() => ed.destroy());
  return { form, ta, ed };
}

/** jsdom has no FormDataEvent: builds the entry list and fires 'formdata' the way browsers do. */
function readForm(form: HTMLFormElement): FormData {
  const formData = new FormData(form);
  form.dispatchEvent(Object.assign(new Event('formdata'), { formData }));
  return formData;
}

describe('audit core: the textarea holds what the editor shows', () => {
  it('writes the content option into the textarea at creation', () => {
    const { form, ta, ed } = formEditor('<textarea name="body">server value</textarea>', { content: '<p>from content option</p>' });
    expect(ed.getHTML()).toBe('<p>from content option</p>');
    expect(ta.value).toBe('<p>from content option</p>');
    expect(new FormData(form).get('body')).toBe('<p>from content option</p>');
  });

  it('writes the sanitized HTML, not the raw textarea value, before any edit', () => {
    const { ta } = formEditor('<textarea name="body"><p onclick="alert(1)">x</p><script>alert(2)</script></textarea>');
    expect(ta.value).toBe('<p>x</p>');
  });

  it('serializing the form right after typing includes the last keystrokes', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { form, ed } = formEditor('<textarea name="body"><p>orig</p></textarea>', { onChange });
    typeText(ed, 'new ');
    expect(readForm(form).get('body')).toBe('<p>new orig</p>');
    expect(onChange).toHaveBeenCalledWith('<p>new orig</p>');
  });

  it('keeps each entry of same-name textareas in place', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<form><textarea name="answers[]"></textarea><input name="x" value="1"><textarea name="answers[]"></textarea></form>';
    const form = document.querySelector('form')!;
    const [first, second] = [...form.querySelectorAll('textarea')].map((ta) => createEditor({ element: ta }));
    onCleanup(() => [first, second].forEach((ed) => ed!.destroy()));
    typeText(second!, 'two');
    typeText(first!, 'one');
    expect([...readForm(form).entries()]).toEqual([
      ['answers[]', '<p>one</p>'],
      ['x', '1'],
      ['answers[]', '<p>two</p>'],
    ]);
  });
});

describe('audit core: form.reset() resets the editor', () => {
  it('restores the content the editor was created with and syncs the textarea after the reset', () => {
    vi.useFakeTimers();
    const { form, ta, ed } = formEditor('<textarea name="body"><p>원래 내용</p></textarea>');
    typeText(ed, '추가 ');
    vi.advanceTimersByTime(300);
    form.reset();
    expect(ed.getHTML()).toBe('<p>원래 내용</p>');
    expect(ed.can('undo')).toBe(false);
    vi.runAllTimers();
    expect(ta.value).toBe('<p>원래 내용</p>');
  });

  it('restores the content option, not the textarea default', () => {
    vi.useFakeTimers();
    const { form, ta, ed } = formEditor('<textarea name="body"></textarea>', { content: '<p>loaded</p>' });
    typeText(ed, 'x');
    form.reset();
    vi.runAllTimers();
    expect(ed.getHTML()).toBe('<p>loaded</p>');
    expect(ta.value).toBe('<p>loaded</p>');
  });

  it('leaves the editor alone when the reset is cancelled', () => {
    document.body.innerHTML = '<form><textarea name="body"><p>a</p></textarea></form>';
    const form = document.querySelector('form')!;
    form.addEventListener('reset', (event) => event.preventDefault());
    const ed = createEditor({ element: form.querySelector('textarea')! });
    onCleanup(() => ed.destroy());
    typeText(ed, 'b');
    form.reset();
    expect(ed.getHTML()).toBe('<p>ba</p>');
  });
});
