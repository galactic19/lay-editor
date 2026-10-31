import { makeEditor } from '../helpers/editor';

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
