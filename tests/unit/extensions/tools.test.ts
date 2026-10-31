import { countText } from '../../../src/extensions/tools/wordCount';
import { formatHTML } from '../../../src/io/html';
import { makeEditor, toolbarControl, typeText } from '../../helpers/editor';


describe('countText', () => {
  it.each([
    ['한글 abc', { chars: 6, charsNoSpace: 5, words: 2 }],
    ['👍🏽a', { chars: 2, charsNoSpace: 2, words: 1 }],
    ['', { chars: 0, charsNoSpace: 0, words: 0 }],
    ['a\nb', { chars: 3, charsNoSpace: 2, words: 2 }],
  ])('countText(%j)', (text, out) => {
    expect(countText(text, 'ko')).toEqual(out);
  });
});

describe('status bar', () => {
  it('shows counts after the debounce', () => {
    vi.useFakeTimers();
    const ed = makeEditor({ content: '<p>ab</p>' });
    const bar = ed.root.querySelector('.le-statusbar')!;
    expect(bar.textContent).toBe(ed.t('status.count', { chars: 2, charsNoSpace: 2, words: 1 }));
    typeText(ed, '한글 ');
    vi.advanceTimersByTime(200);
    expect(bar.textContent).toBe(ed.t('status.count', { chars: 5, charsNoSpace: 4, words: 2 }));
  });
});

describe('fullscreen', () => {
  it('toggles classes and exits on Escape', () => {
    const ed = makeEditor();
    toolbarControl(ed, 'fullscreen').click();
    expect(ed.root.classList.contains('le-fullscreen')).toBe(true);
    expect(document.documentElement.classList.contains('le-scroll-locked')).toBe(true);
    expect(toolbarControl(ed, 'fullscreen').getAttribute('aria-pressed')).toBe('true');
    ed.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ed.root.classList.contains('le-fullscreen')).toBe(false);
    expect(document.documentElement.classList.contains('le-scroll-locked')).toBe(false);
  });

  it('ignores an Escape another handler already used', () => {
    const ed = makeEditor();
    ed.exec('toggleFullscreen');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    ed.root.dispatchEvent(event);
    expect(ed.root.classList.contains('le-fullscreen')).toBe(true);
  });

  it('releases the scroll lock on destroy', () => {
    const ed = makeEditor();
    ed.exec('toggleFullscreen');
    ed.destroy();
    expect(document.documentElement.classList.contains('le-scroll-locked')).toBe(false);
  });
});

describe('source view', () => {
  it('round-trips through the sanitizer', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('toggleSourceView');
    const ta = ed.root.querySelector<HTMLTextAreaElement>('textarea.le-source')!;
    expect(ta.value).toBe('<p>a</p>');
    expect(ed.content.hidden).toBe(true);
    ta.value = '<p>b<img src=x onerror=alert(1)></p><script>alert(1)</script>';
    ed.exec('toggleSourceView');
    expect(ed.root.querySelector('textarea.le-source')).toBeNull();
    expect(ed.content.hidden).toBe(false);
    expect(ed.getHTML()).not.toMatch(/onerror|script/);
    expect(ed.getHTML()).toContain('<p>b</p>');
  });

  it('locks toolbar items except sourceView while active', () => {
    const ed = makeEditor();
    toolbarControl(ed, 'sourceView').click();
    expect(toolbarControl(ed, 'bold').getAttribute('aria-disabled')).toBe('true');
    expect(toolbarControl(ed, 'sourceView').getAttribute('aria-disabled')).toBe('false');
    expect(toolbarControl(ed, 'sourceView').getAttribute('aria-pressed')).toBe('true');
    toolbarControl(ed, 'sourceView').click();
    expect(toolbarControl(ed, 'bold').getAttribute('aria-disabled')).toBe('false');
  });

  it('applies pending source edits on destroy', () => {
    document.body.innerHTML = '<textarea></textarea>';
    const ed = makeEditor({ element: document.querySelector('textarea')! });
    ed.exec('toggleSourceView');
    ed.root.querySelector<HTMLTextAreaElement>('textarea.le-source')!.value = '<p>z</p>';
    ed.destroy();
    expect(document.querySelector('textarea')!.value).toBe('<p>z</p>');
  });
});

describe('formatHTML', () => {
  it('puts each block on its own line', () => {
    expect(formatHTML('<p>a</p><ul><li><p>b</p></li></ul><hr><p>c</p>')).toBe('<p>a</p>\n<ul>\n<li><p>b</p></li>\n</ul>\n<hr>\n<p>c</p>');
  });
});
