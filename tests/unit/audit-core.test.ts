import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import { createHighlightPlugin } from '../../src/extensions/blocks/codeHighlight';
import { findKey } from '../../src/extensions/tools/findReplace';
import { defineExtension } from '../../src/extensions/factories';
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

  it('code highlighting still arrives when setHTML runs while the highlighter loads', async () => {
    let resolve!: (highlight: () => Array<{ from: number; to: number; className: string }>) => void;
    const highlighter = defineExtension({ name: 'testHighlight', plugins: () => [createHighlightPlugin(() => new Promise((r) => (resolve = r)))] });
    const ed = makeEditor({ content: '<pre><code>let a</code></pre>', extensions: [highlighter], disable: ['codeHighlight'] });
    ed.setHTML('<pre><code>const b</code></pre>');
    resolve(() => [{ from: 0, to: 5, className: 'hljs-keyword' }]);
    await flushPromises();
    expect(ed.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });

  it('keeps the DOM of unchanged blocks and embeds with the default extensions', () => {
    const ed = makeEditor({ content: '<p>keep</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><p>old</p>' });
    const paragraph = ed.view.dom.firstElementChild;
    const embed = ed.view.dom.querySelector('iframe');
    expect(embed).not.toBeNull();
    ed.setHTML(ed.getHTML().replace('old', 'new'));
    expect(ed.getHTML()).toContain('<p>new</p>');
    expect(ed.view.dom.firstElementChild).toBe(paragraph);
    expect(ed.view.dom.querySelector('iframe')).toBe(embed);
  });

  it('keeps the state of the other plugins, such as the search query', () => {
    const ed = makeEditor({ content: '<p>apple pie</p>' });
    ed.exec('setFindQuery', 'apple');
    ed.setHTML('<p>apple tart, apple jam</p>');
    expect(findKey.getState(ed.state)).toMatchObject({ query: 'apple', matches: [expect.anything(), expect.anything()] });
  });

  it('loads content without the history extension', () => {
    const ed = makeEditor({ content: '<p>A</p>', disable: ['history'] });
    ed.setHTML('<p>B</p>');
    expect(ed.getHTML()).toBe('<p>B</p>');
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

describe('audit core: a required textarea reports an empty editor visibly', () => {
  const invalidMark = (ed: Editor) => [ed.root.classList.contains('le-invalid'), ed.view.dom.getAttribute('aria-invalid')];

  it('blocks the submit, focuses the editor and marks it invalid until the content changes', () => {
    const { form, ed } = formEditor('<textarea name="body" required></textarea>');
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', onSubmit);
    let reported = true;
    form.querySelector('textarea')!.addEventListener('invalid', (event) => (reported = !event.defaultPrevented));
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(reported).toBe(false);
    expect(invalidMark(ed)).toEqual([true, 'true']);
    expect(ed.root.contains(document.activeElement)).toBe(true);
    expect(ed.root.querySelector('.le-toast-error')?.textContent).toBe(form.querySelector('textarea')!.validationMessage);
    typeText(ed, 'a');
    expect(invalidMark(ed)).toEqual([false, null]);
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('judges an editor emptied a moment ago, inside the change debounce', () => {
    vi.useFakeTimers();
    const { form, ed } = formEditor('<textarea name="body" required><p>원래 내용</p></textarea>');
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', onSubmit);
    ed.view.dispatch(ed.state.tr.delete(0, ed.state.doc.content.size));
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(invalidMark(ed)).toEqual([true, 'true']);
  });

  it('does not take focus from an earlier invalid field the browser reports first', () => {
    const { form, ed } = formEditor('<textarea name="body" required></textarea>', {}, '<input name="title" required>');
    form.requestSubmit();
    expect(invalidMark(ed)).toEqual([true, 'true']);
    expect(ed.root.contains(document.activeElement)).toBe(false);
  });

  it('does not take focus from a field the user is typing in when the app calls checkValidity()', () => {
    const { form, ed } = formEditor('<textarea name="body" required></textarea>', {}, '<input name="title" value="t">');
    const title = form.querySelector('input')!;
    title.focus();
    expect(form.checkValidity()).toBe(false);
    expect(document.activeElement).toBe(title);
    expect(ed.root.querySelector('.le-toast-error')).toBeNull();
  });
});

describe('audit core: invalid options fail at creation', () => {
  const create = (options: unknown) => () => createEditor(options as Parameters<typeof createEditor>[0]);
  const withElement = (bad: object) => {
    document.body.innerHTML = '<div id="e"></div>';
    return create({ element: '#e', ...bad });
  };
  const code = (expected: string) => expect.objectContaining({ code: expected });

  it.each([
    [{ onChange: 'x' }],
    [{ onReady: 'x' }],
    [{ content: {} }],
    [{ content: 5 }],
    [{ extensions: [null] }],
    [{ extensions: [{}] }],
    [{ image: { maxSize: '5MB' } }],
    [{ image: { maxSize: Number.NaN } }],
    [{ image: { accept: 'image/png' } }],
    [{ image: { widths: ['50'] } }],
    [{ image: 'big' }],
    [{ table: { maxGrid: '8' } }],
    [{ colors: { text: '#000000' } }],
    [{ codeBlock: { languages: [1] } }],
    [{ autosave: { debounce: '1s' } }],
  ])('throws INVALID_OPTION for %o', (bad) => {
    expect(withElement(bad)).toThrowError(code('INVALID_OPTION'));
  });

  it('names the offending option path in the message', () => {
    expect(withElement({ image: { maxSize: '5MB' } })).toThrowError(/image\.maxSize/);
  });

  it('accepts valid extension options, unknown keys and null content', () => {
    expect(withElement({ image: { maxSize: 5 * 1024 * 1024, accept: ['image/png'] }, autosave: { key: 'k' }, video: { allowedHosts: ['x'] }, content: null })).not.toThrow();
  });

  it('checks a user extension against its defaults, leaving null defaults open', () => {
    const mention = { name: 'mention', defaults: { limit: 5, onPick: null } };
    expect(withElement({ extensions: [mention], mention: { onPick: () => {} } })).not.toThrow();
    expect(withElement({ extensions: [mention], mention: { limit: 'five' } })).toThrowError(/mention\.limit/);
  });

  it('throws INVALID_OPTION without options at all', () => {
    expect(create(undefined)).toThrowError(code('INVALID_OPTION'));
  });

  it('throws ELEMENT_NOT_FOUND for a malformed selector', () => {
    expect(create({ element: '##x' })).toThrowError(code('ELEMENT_NOT_FOUND'));
  });

  it('explains that an element of another document (an iframe) is not supported', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const foreign = frame.contentDocument!.createElement('div');
    frame.contentDocument!.body.appendChild(foreign);
    expect(create({ element: foreign })).toThrowError(code('INVALID_OPTION'));
    expect(create({ element: foreign })).toThrowError(/another document/);
  });
});
