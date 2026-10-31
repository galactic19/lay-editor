import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LayEditor } from '../../src/adapters/react';
import type { Editor } from '../../src/core/Editor';
import { DEFAULTS } from '../../src/core/defaults';
import { createTranslator } from '../../src/i18n';
import { registerIcon, renderIcon } from '../../src/ui/icons';
import { flushPromises, makeEditor, select, typeText } from '../helpers/editor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const DRAFT = DEFAULTS.autosave.prefix + 'k';

describe('review fix #2: clearDraft cancels a pending save', () => {
  it('does not bring the draft back on destroy or after the debounce', () => {
    vi.useFakeTimers();
    const a = makeEditor({ autosave: { key: 'k' } });
    typeText(a, 'hello');
    a.clearDraft();
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(localStorage.getItem(DRAFT)).toBeNull();
    typeText(a, '!');
    a.clearDraft();
    a.destroy();
    expect(localStorage.getItem(DRAFT)).toBeNull();
  });
});

describe('review fix #3: source view edits are visible immediately', () => {
  it('getHTML and a textarea form submit see edits made in the source view', () => {
    document.body.innerHTML = '<form><textarea name="body"><p>a</p></textarea></form>';
    const ta = document.querySelector('textarea')!;
    const ed = makeEditor({ element: ta });
    ed.exec('toggleSourceView');
    const source = ed.root.querySelector<HTMLTextAreaElement>('textarea.le-source')!;
    source.value = '<p>b</p>';
    source.dispatchEvent(new Event('input'));
    expect(ed.getHTML()).toBe('<p>b</p>');
    ta.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ta.value).toBe('<p>b</p>');
    expect(source.isConnected).toBe(true);
  });
});

describe('review fix #4: panels without a toolbar control get an anchor', () => {
  it('passes a caret anchor when the item is not in the toolbar', () => {
    const ed = makeEditor({ preset: 'basic' });
    const open = vi.spyOn(ed.ui!.panels, 'openPanel');
    ed.ui!.openPanelFor('findReplace');
    expect(open.mock.calls[0]![1]).not.toBeNull();
  });
});

describe('review fix #5: pasted data: images are validated', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('rejects data images over maxSize without uploading', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.x/a.png' }));
    const ed = makeEditor({ upload, image: { maxSize: 10 } });
    const onError = vi.fn();
    ed.on('uploadError', onError);
    ed.view.pasteHTML(`<img src="${PNG}">`);
    await flushPromises();
    expect(upload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UPLOAD_REJECTED' }), expect.any(File));
    expect(ed.view.dom.querySelector('.le-image')).toBeNull();
  });

  it('drops malformed base64 without throwing or leaving a placeholder', async () => {
    const upload = vi.fn(async () => ({ url: 'https://cdn.x/a.png' }));
    const ed = makeEditor({ upload });
    ed.view.pasteHTML('<img src="data:image/png;base64,AAAAA">');
    await flushPromises();
    expect(upload).not.toHaveBeenCalled();
    expect(ed.view.dom.querySelector('.le-image')).toBeNull();
  });
});

describe('review fix #6: React value going back to undefined clears the editor', () => {
  it('treats a controlled value that becomes undefined as empty', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ref = createRef<Editor | null>();
    const root = createRoot(host);
    act(() => root.render(createElement(LayEditor, { ref, value: '<p>x</p>' })));
    act(() => root.render(createElement(LayEditor, { ref, value: undefined })));
    expect(ref.current!.getHTML()).toBe('');
    act(() => root.unmount());
  });
});

describe('review fix #7: read-only mode blocks image resizing', () => {
  it('ignores a handle drag when not editable', () => {
    const ed = makeEditor({ content: '<figure><img src="https://x.com/a.png"></figure>' });
    ed.setEditable(false);
    const handle = ed.view.dom.querySelector<HTMLElement>('.le-resize-right')!;
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10 }));
    expect(ed.getHTML()).not.toContain('width');
  });
});

describe('review fix #8: links typed without a scheme', () => {
  it.each([
    ['naver.com', 'https://naver.com'],
    ['www.a.com/x?y=1', 'https://www.a.com/x?y=1'],
    ['localhost:3000/x', 'https://localhost:3000/x'],
    ['me@example.com', 'mailto:me@example.com'],
    ['/docs', '/docs'],
    ['#top', '#top'],
  ])('%s → %s', (input, href) => {
    const ed = makeEditor({ content: '<p>ab</p>' });
    select(ed, 'text:ab');
    expect(ed.exec('setLink', { href: input })).toBe(true);
    expect(ed.getHTML()).toBe(`<p><a href="${href}">ab</a></p>`);
  });
});

describe('review fix #9: an object locale merges over the default language', () => {
  it('keeps Korean labels for a one-off override', () => {
    const t = createTranslator({ placeholder: '댓글을 입력하세요' });
    expect(t('placeholder')).toBe('댓글을 입력하세요');
    expect(t('toolbar.bold')).toBe('굵게');
  });
});

describe('review fix (minor 1): icon markup without xmlns', () => {
  it('renders in the SVG namespace', () => {
    registerIcon('plain', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>');
    const svg = renderIcon('plain');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.querySelector('circle')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});

describe('review fix (minor 4): setHTML is not an undo step', () => {
  it('Ctrl+Z after loading content keeps the content', () => {
    const ed = makeEditor();
    ed.setHTML('<p>loaded</p>');
    expect(ed.can('undo')).toBe(false);
    typeText(ed, 'x');
    ed.exec('undo');
    expect(ed.getHTML()).toBe('<p>loaded</p>');
  });
});
