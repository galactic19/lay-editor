import { createEditor } from '../../../src/core/createEditor';
import { makeEditor, typeText } from '../../helpers/editor';

describe('createEditor', () => {
  it('throws ELEMENT_NOT_FOUND for a missing selector', () => {
    expect(() => createEditor({ element: '#nope' })).toThrowError(expect.objectContaining({ code: 'ELEMENT_NOT_FOUND' }));
  });

  it.each([
    [{ theme: 'blue' }],
    [{ preset: 'huge' }],
    [{ changeDebounce: -1 }],
    [{ upload: 'x' }],
  ])('throws INVALID_OPTION for %o', (bad) => {
    document.body.innerHTML = '<div id="e"></div>';
    expect(() => createEditor({ element: '#e', ...(bad as object) })).toThrowError(expect.objectContaining({ code: 'INVALID_OPTION' }));
  });

  it('accepts a selector and mounts a root with a content area', () => {
    document.body.innerHTML = '<div id="e"></div>';
    const ed = createEditor({ element: '#e' });
    expect(document.querySelector('#e > .le-editor > .le-content .ProseMirror')).not.toBeNull();
    ed.destroy();
  });
});

describe('Editor', () => {
  it('round-trips content and returns "" when empty', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    expect(ed.getHTML()).toBe('<p>a</p>');
    for (const v of ['', '<div><br></div>', '<p></p>', '<p><br></p>']) {
      ed.setHTML(v);
      expect(ed.getHTML()).toBe('');
      expect(ed.isEmpty()).toBe(true);
    }
  });

  it('treats a null-ish setHTML as empty', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.setHTML(undefined as unknown as string);
    expect(ed.getHTML()).toBe('');
  });

  it('emits change once after the debounce', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ed = makeEditor({ onChange });
    const listener = vi.fn();
    ed.on('change', listener);
    typeText(ed, 'ab');
    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('<p>ab</p>');
    expect(listener).toHaveBeenCalledWith('<p>ab</p>');
  });

  it('survives a throwing onChange and reports CALLBACK_FAILED', () => {
    vi.useFakeTimers();
    const ed = makeEditor({ onChange: () => { throw new Error('boom'); } });
    const onError = vi.fn();
    ed.on('error', onError);
    typeText(ed, 'a');
    vi.advanceTimersByTime(300);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'CALLBACK_FAILED' }));
    typeText(ed, 'b');
    expect(ed.getHTML()).toBe('<p>ab</p>');
  });

  it('reports a throwing event listener as CALLBACK_FAILED', () => {
    const ed = makeEditor();
    const onError = vi.fn();
    ed.on('error', onError);
    ed.on('update', () => { throw new Error('x'); });
    typeText(ed, 'a');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'CALLBACK_FAILED' }));
  });

  it('exec returns false and warns for unknown commands', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(makeEditor().exec('nope')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'));
  });

  it('can/isActive/getText/setEditable/focus events', () => {
    const ed = makeEditor({ content: '<p>a</p><p>b</p>' });
    expect(ed.can('undo')).toBe(false);
    typeText(ed, 'x');
    expect(ed.can('undo')).toBe(true);
    expect(ed.isActive('paragraph')).toBe(true);
    expect(ed.isActive('nope')).toBe(false);
    expect(ed.getText()).toBe('xa\nb');
    ed.setEditable(false);
    expect(ed.isEditable).toBe(false);
    expect(ed.view.dom.getAttribute('contenteditable')).toBe('false');
    ed.setEditable(true);
    const onFocus = vi.fn();
    ed.on('focus', onFocus);
    ed.focus();
    expect(onFocus).toHaveBeenCalled();
  });

  it('undo/redo via exec', () => {
    const ed = makeEditor();
    typeText(ed, 'a');
    ed.exec('undo');
    expect(ed.getHTML()).toBe('');
    ed.exec('redo');
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('emits update with the transaction and selectionChange', () => {
    const ed = makeEditor({ content: '<p>ab</p>' });
    const onUpdate = vi.fn();
    const onSel = vi.fn();
    ed.on('update', onUpdate);
    ed.on('selectionChange', onSel);
    typeText(ed, 'x');
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ docChanged: true }));
    expect(onSel).toHaveBeenCalled();
  });

  it('does nothing after destroy, including a pending change', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onDestroy = vi.fn();
    const ed = makeEditor({ onChange });
    ed.on('destroy', onDestroy);
    typeText(ed, 'a');
    ed.destroy();
    vi.runAllTimers();
    expect(onChange).not.toHaveBeenCalled();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(ed.exec('undo')).toBe(false);
    ed.setHTML('<p>z</p>');
    ed.destroy();
    expect(document.querySelector('.le-editor')).toBeNull();
  });

  it('calls onReady with the editor', () => {
    const onReady = vi.fn();
    const ed = makeEditor({ onReady });
    expect(onReady).toHaveBeenCalledWith(ed);
  });
});
