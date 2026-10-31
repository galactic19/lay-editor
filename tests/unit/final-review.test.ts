import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import type { EditorOptions } from '../../src/core/types';
import { normalizeHref } from '../../src/extensions/marks/link';
import { fillContainerStarts } from '../../src/io/html';
import { onCleanup, setMedia } from '../setup';
import { caretAfter, caretAt, findText, makeEditor, press, toolbarControl, typeText } from '../helpers/editor';

/** An editor in a form: textarea mode, or (`textarea: false`) an element inside the form. */
function formEditor(content: string, { textarea = true, ...options }: Partial<EditorOptions> & { textarea?: boolean } = {}) {
  const form = document.createElement('form');
  form.innerHTML = textarea ? `<textarea name="body"></textarea>` : '<div></div>';
  if (textarea) form.querySelector('textarea')!.value = content;
  document.body.appendChild(form);
  const element = form.firstElementChild as HTMLElement;
  const editor: Editor = createEditor({ element, ...(textarea ? {} : { content }), ...options });
  onCleanup(() => editor.destroy());
  return { form, editor };
}

const sourceText = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>('.le-source');

describe('final review: a form reset leaves the editor-owned controls alone', () => {
  // Textarea mode resets the editor to its first content; an editor element merely inside a form keeps its own.
  it.each([
    [true, '<p>initial</p>'],
    [false, '<p>initial edited</p>'],
  ])('an open source view shows what the editor holds after the reset (textarea mode: %s)', (textarea, expected) => {
    const { form, editor } = formEditor('<p>initial</p>', { textarea });
    editor.exec('toggleSourceView');
    sourceText()!.value = '<p>initial edited</p>';
    sourceText()!.dispatchEvent(new Event('input'));
    form.reset();
    expect(sourceText()!.value).toBe(expected);
    expect(sourceText()!.form).toBeNull();
    editor.exec('toggleSourceView');
    expect(editor.getHTML()).toBe(expected);
  });

  it.each([true, false])('task checkboxes keep showing the document state (textarea mode: %s)', (textarea) => {
    const { form, editor } = formEditor('<ul data-type="taskList"><li data-checked="true"><p>done</p></li></ul>', { textarea });
    form.reset();
    const box = editor.view.dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    expect(box.form).toBeNull();
  });
});

const COARSE = '(pointer: coarse)';
const mobileBar = (): HTMLElement => document.querySelector<HTMLElement>('.le-mobile-bar')!;
const barItems = (): string[] => [...mobileBar().querySelectorAll<HTMLElement>('[data-item]')].map((el) => el.dataset.item!);
const barItem = (id: string): HTMLButtonElement => mobileBar().querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!;
const isFullscreen = (editor: Editor): boolean => editor.root.classList.contains('le-fullscreen');

function mobileEditor(content = '<p>a</p>'): Editor {
  setMedia(COARSE, true);
  const editor = makeEditor({ content });
  editor.focus();
  editor.ui!.flush();
  return editor;
}

describe('final review: read-only mode keeps the way out of a mode', () => {
  it('mobile: the keyboard bar keeps only the source view toggle, which closes the source view', () => {
    const editor = mobileEditor();
    editor.exec('toggleSourceView');
    editor.setEditable(false);
    expect(mobileBar().hidden).toBe(false);
    expect(barItems()).toEqual(['sourceView']);
    expect(barItem('sourceView').getAttribute('aria-disabled')).toBe('false');
    barItem('sourceView').click();
    expect(sourceText()).toBeNull();
    expect(mobileBar().hidden).toBe(true);
  });

  it('desktop: the fullscreen button stays usable and leaves fullscreen', () => {
    const editor = makeEditor();
    editor.exec('toggleFullscreen');
    editor.setEditable(false);
    const button = toolbarControl(editor, 'fullscreen');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(toolbarControl(editor, 'bold').getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(isFullscreen(editor)).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('desktop: Escape leaves fullscreen when focus fell back to the page (read-only content takes no focus)', () => {
    const editor = makeEditor();
    editor.exec('toggleFullscreen');
    editor.setEditable(false);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isFullscreen(editor)).toBe(false);
  });

  it('mobile: the keyboard bar shows the fullscreen toggle without focus, since read-only content cannot take it', () => {
    const editor = mobileEditor();
    editor.exec('toggleFullscreen');
    editor.setEditable(false);
    editor.blur();
    editor.ui!.flush();
    expect(mobileBar().hidden).toBe(false);
    expect(barItems()).toEqual(['fullscreen']);
    barItem('fullscreen').click();
    expect(isFullscreen(editor)).toBe(false);
    expect(mobileBar().hidden).toBe(true);
  });

  it('an editable editor keeps every tool, and a read-only one outside any mode shows no bar', () => {
    const editor = mobileEditor();
    expect(barItems().length).toBeGreaterThan(2);
    editor.setEditable(false);
    expect(mobileBar().hidden).toBe(true);
  });
});

const pasted = (html: string): string => {
  const editor = makeEditor();
  editor.view.pasteHTML(html);
  return editor.getHTML();
};

describe('final review: formatting whitespace between styled blocks', () => {
  it.each([
    ['<div style="font-weight: 700;">\n<p>bold a</p>\n<p>bold b</p>\n</div>', '<p><strong>bold a</strong></p><p><strong>bold b</strong></p>'],
    ['<div style="text-decoration: underline">\n  <h2>Title</h2>\n  <p>body</p>\n</div>', '<h2><u>Title</u></h2><p><u>body</u></p>'],
    ['<p>before</p>\n<div style="font-weight:700">\n<p>bold a</p>\n</div>\n<p>after</p>', '<p>before</p><p><strong>bold a</strong></p><p>after</p>'],
  ])('adds no empty paragraph: %j', (html, expected) => {
    expect(pasted(html)).toBe(expected);
  });

  it('still styles a space between inline runs', () => {
    expect(pasted('<p style="text-decoration: underline"><b>one</b> <i>two</i></p>')).toBe('<p><strong><u>one</u></strong><u> </u><em><u>two</u></em></p>');
  });
});

describe('final review: list items starting with a wrapper are checked without parsing their subtree', () => {
  const NESTED = '<ul><li><div>x'.repeat(150) + '</div></li></ul>'.repeat(150);
  const timed = (run: () => void): number => {
    const start = performance.now();
    run();
    return performance.now() - start;
  };

  it('costs about what one parse costs, not one parse per nesting level', () => {
    const schema = makeEditor().schema;
    const body = () => new window.DOMParser().parseFromString(NESTED, 'text/html').body;
    const parse = timed(() => PMDOMParser.fromSchema(schema).parse(body()));
    const fill = timed(() => fillContainerStarts(body(), schema));
    expect(fill).toBeLessThan(parse * 5);
  });

  it('still adds the paragraph a list item needs in front of a block inside a wrapper', () => {
    const editor = makeEditor({ content: '<ul><li><div><h3>Title</h3><p>text</p></div></li><li><span><img src="https://a.com/x.png"></span></li></ul>' });
    expect(editor.getHTML()).toBe(
      '<ul><li><p></p><h3>Title</h3><p>text</p></li><li><p></p><figure data-align="center"><img src="https://a.com/x.png" alt=""><figcaption></figcaption></figure></li></ul>',
    );
  });
});

describe('final review: links that already carry a scheme', () => {
  it.each(['mailto:a@b.co', 'mailto:a@b.co?subject=x', 'MAILTO:a@b.co'])('%s is kept as it is', (href) => {
    expect(normalizeHref(href)).toBe(href);
  });

  it('a bare address still gets mailto:', () => {
    expect(normalizeHref('a@b.co')).toBe('mailto:a@b.co');
  });

  it('applying an e-mail link again (the edit panel) keeps one scheme', () => {
    const editor = makeEditor({ content: '<p>write to <a href="mailto:a@b.co">me</a> now</p>' });
    caretAfter(editor, 'm');
    editor.exec('setLink', { href: 'mailto:a@b.co', newTab: true });
    expect(editor.getHTML()).toBe('<p>write to <a href="mailto:a@b.co" target="_blank" rel="noopener noreferrer">me</a> now</p>');
  });
});

/** getHTML() of a new editor loaded with `html`. */
const reloaded = (html: string): string => makeEditor({ content: html }).getHTML();

describe('final review: getHTML() is stable across a reload after pasting no-break spaces', () => {
  it.each([
    '<p>Hello&nbsp;&nbsp;world</p>',
    '<p>&nbsp;&nbsp;&nbsp;&nbsp;indented</p>',
    '<p class="MsoNormal">End.<span style="mso-spacerun:yes">&nbsp; </span>Next</p>',
    '<p>a&nbsp; b</p>',
  ])('%s', (html) => {
    const first = pasted(html);
    expect(reloaded(first)).toBe(first);
  });

  it('keeps a no-break space between two words', () => {
    expect(pasted('<p>10&nbsp;km</p>')).toBe('<p>10&nbsp;km</p>');
  });

  it('autosave offers no restore when the saved post is reopened unchanged', async () => {
    vi.useFakeTimers();
    const first = makeEditor({ autosave: { key: 'post-1' } });
    first.view.pasteHTML('<p>Hello&nbsp;&nbsp;world</p>');
    vi.runAllTimers();
    const saved = first.getHTML();
    first.destroy();
    const second = makeEditor({ content: saved, autosave: { key: 'post-1' } });
    expect(second.root.querySelector<HTMLElement>('.le-restore-bar')!.hidden).toBe(true);
  });
});

describe('final review: tabs in pasted plain text', () => {
  it('survive a reload and read the same on a view page', () => {
    const editor = makeEditor();
    editor.view.pasteText('Name\tScore\n\tindented line');
    const html = editor.getHTML();
    expect(html).not.toContain('\t');
    expect(reloaded(html)).toBe(html);
    expect(editor.getText()).toBe(makeEditor({ content: html }).getText());
  });
});

describe('final review: ordered list start numbers', () => {
  it.each([
    ['0', '<ol start="0">'],
    ['-2', '<ol start="-2">'],
    ['2.5', '<ol start="2">'],
    ['1e3', '<ol>'],
    ['3x', '<ol start="3">'],
    ['abc', '<ol>'],
  ])('start="%s" loads the way browsers read it', (start, expected) => {
    expect(reloaded(`<ol start="${start}"><li><p>a</p></li></ol>`)).toBe(`${expected}<li><p>a</p></li></ol>`);
  });

  it('a list typed as "0. " keeps its start through a reload', () => {
    const editor = makeEditor();
    typeText(editor, '0. item');
    const html = editor.getHTML();
    expect(html).toBe('<ol start="0"><li><p>item</p></li></ol>');
    expect(reloaded(html)).toBe(html);
  });
});

describe('final review: the slash menu and the HTML source view', () => {
  it('hides while the source view is open and comes back when it closes', () => {
    const editor = makeEditor();
    editor.focus();
    typeText(editor, '/');
    editor.ui!.flush();
    const menu = document.querySelector<HTMLElement>('.le-slash-menu')!;
    expect(menu.hidden).toBe(false);
    editor.exec('toggleSourceView');
    expect(menu.hidden).toBe(true);
    expect(editor.view.dom.hasAttribute('aria-activedescendant')).toBe(false);
    editor.exec('toggleSourceView');
    expect(menu.hidden).toBe(false);
  });
});

/** Types `value` into the open source view as a replacement of its whole text. */
function typeSource(value: string): void {
  sourceText()!.value = value;
  sourceText()!.dispatchEvent(new Event('input'));
}

describe('final review: edits in the HTML source view are undo steps', () => {
  it('undo after closing the source view takes back the source edit, then the earlier typing', () => {
    const editor = makeEditor({ content: '<p>First</p>' });
    caretAfter(editor, 'First');
    typeText(editor, ' typed');
    editor.exec('toggleSourceView');
    typeSource('<p>x</p>');
    editor.exec('toggleSourceView');
    expect(editor.getHTML()).toBe('<p>x</p>');
    expect(editor.can('undo')).toBe(true);
    editor.exec('undo');
    expect(editor.getHTML()).toBe('<p>First typed</p>');
    editor.exec('undo');
    expect(editor.getHTML()).toBe('<p>First</p>');
  });

  it('a source edit replaces only what changed', () => {
    const editor = makeEditor({ content: '<p>one</p><p>two</p>' });
    const first = editor.view.dom.firstElementChild;
    editor.exec('toggleSourceView');
    typeSource('<p>one</p>\n<p>two!</p>');
    expect(editor.getHTML()).toBe('<p>one</p><p>two!</p>');
    expect(editor.view.dom.firstElementChild).toBe(first);
  });
});

const FIGURE = '<figure data-align="center"><img src="https://a.com/x.png" alt=""><figcaption>capt</figcaption></figure>';

describe('final review: typing continues below an inserted video', () => {
  it.each([
    ['at the end of the document', '<p>intro</p><p></p>', '<p>Next line</p>'],
    ['before other text, which the caret moves to', '<p>intro</p><p></p><p>tail</p>', '<p>Next linetail</p>'],
  ])('%s', (_case, content, after) => {
    const editor = makeEditor({ content });
    caretAt(editor, findText(editor, 'intro') + 'intro'.length + 2);
    expect(editor.exec('insertVideo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    typeText(editor, 'Next line');
    expect(editor.getHTML()).toMatch(/^<p>intro<\/p><div data-video="" data-provider="youtube"/);
    expect(editor.getHTML().endsWith(`</div>${after}`)).toBe(true);
  });
});

describe('final review: Enter, Shift+Enter and Mod+Enter in an image caption', () => {
  it.each(['Enter', 'Shift-Enter', 'Mod-Enter'])('%s leaves the caption whole and starts a paragraph after the image', (key) => {
    const editor = makeEditor({ content: `<p>before</p>${FIGURE}` });
    caretAfter(editor, 'ca');
    expect(press(editor, key)).toBe(true);
    typeText(editor, 'next');
    expect(editor.getHTML()).toBe(`<p>before</p>${FIGURE}<p>next</p>`);
  });

  it('works for an image in a list item too', () => {
    const editor = makeEditor({ content: `<ul><li><p>item</p>${FIGURE}</li></ul>` });
    caretAfter(editor, 'capt');
    press(editor, 'Enter');
    typeText(editor, 'next');
    expect(editor.getHTML()).toBe(`<ul><li><p>item</p>${FIGURE}<p>next</p></li></ul>`);
  });

  it('a line break goes nowhere a line break cannot be', () => {
    const editor = makeEditor({ content: `<p>before</p>${FIGURE}` });
    caretAfter(editor, 'ca');
    expect(editor.can('insertHardBreak')).toBe(false);
  });
});

const TABLE = '<table><tbody><tr><th><p>Name</p></th><th><p>Score</p></th></tr><tr><td><p>Kim</p></td><td><p>90</p></td></tr><tr><td><p>Lee</p></td><td><p>85</p></td></tr></tbody></table>';
const contextControl = (editor: Editor, id: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`.le-context-toolbar [data-item="${id}"]`)!;

describe('final review: the header row tool', () => {
  it('turns the first row off and on from any cell, and shows its state', () => {
    const editor = makeEditor({ content: TABLE });
    caretAfter(editor, 'Lee');
    editor.focus();
    editor.ui!.flush();
    expect(contextControl(editor, 'tableHeaderRow').getAttribute('aria-pressed')).toBe('true');
    editor.exec('toggleHeaderRow');
    expect(editor.getHTML()).toBe(TABLE.replace(/<(\/?)th>/g, '<$1td>'));
    editor.ui!.flush();
    expect(contextControl(editor, 'tableHeaderRow').getAttribute('aria-pressed')).toBe('false');
    editor.exec('toggleHeaderRow');
    expect(editor.getHTML()).toBe(TABLE);
  });
});

describe('final review: Tab in the last table cell', () => {
  it('adds a row and moves into its first cell', () => {
    const editor = makeEditor({ content: '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>' });
    caretAfter(editor, 'b');
    expect(press(editor, 'Tab')).toBe(true);
    typeText(editor, 'c');
    expect(editor.getHTML()).toBe('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p></p></td></tr></tbody></table>');
  });
});

describe('final review: code block language aliases', () => {
  /** The language menu entries marked current. */
  const current = (editor: Editor): string[] =>
    editor.ui!.registry.get('codeLanguage')!.options!.filter((option) => option.isActive?.(editor)).map((option) => option.id);

  it.each([
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['py', 'python'],
    ['sh', 'bash'],
    ['JS', 'javascript'],
  ])('```%s keeps its class and marks %s current in the language menu', (alias, language) => {
    const editor = makeEditor();
    typeText(editor, `\`\`\`${alias} x = 1`);
    expect(editor.getHTML()).toBe(`<pre><code class="language-${alias}">x = 1</code></pre>`);
    expect(current(editor)).toEqual([`codeLanguage:${language}`]);
  });

  it('loaded short names count too; other names mark nothing', () => {
    const editor = makeEditor({ content: '<pre><code class="language-py">a</code></pre><pre><code class="language-rust">b</code></pre>' });
    caretAfter(editor, 'a');
    expect(current(editor)).toEqual(['codeLanguage:python']);
    caretAfter(editor, 'b');
    expect(current(editor)).toEqual([]);
    expect(editor.getHTML()).toBe('<pre><code class="language-py">a</code></pre><pre><code class="language-rust">b</code></pre>');
  });
});

describe('final review: autosave on leaving the page', () => {
  it.each([
    ['pagehide', () => window.dispatchEvent(new Event('pagehide'))],
    [
      'visibilitychange to hidden',
      () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      },
    ],
  ])('%s saves the draft at once', (_event, leave) => {
    vi.useFakeTimers();
    const editor = makeEditor({ content: '<p>server copy</p>', autosave: { key: 'leave' } });
    caretAfter(editor, 'copy');
    typeText(editor, ' last words');
    leave();
    expect(JSON.parse(localStorage.getItem('le-draft:leave')!).html).toBe('<p>server copy last words</p>');
  });
});

describe('final review: task checkboxes and pointer clicks', () => {
  it('a pointer press on a checkbox does not take focus from the text', () => {
    const editor = makeEditor({ content: '<ul data-type="taskList"><li data-checked="false"><p>task</p></li></ul>' });
    const box = editor.view.dom.querySelector('input')!;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    box.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });
});

describe('final review: the video panel names the providers the editor accepts', () => {
  it.each([
    ['ko', ['youtube'], '동영상 주소 (YouTube)', 'YouTube 동영상 주소를 입력하세요'],
    ['en', ['youtube'], 'Video URL (YouTube)', 'Enter a video address from YouTube'],
    ['en', ['vimeo', 'youtube'], 'Video URL (Vimeo, YouTube)', 'Enter a video address from Vimeo, YouTube'],
  ])('%s %j', (locale, providers, label, error) => {
    const editor = makeEditor({ locale, video: { providers } });
    editor.ui!.openPanelFor('video');
    const input = document.querySelector<HTMLInputElement>('.le-dropdown input[type="url"]')!;
    expect(input.getAttribute('aria-label')).toBe(label);
    input.value = 'https://example.com/clip';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.querySelector('.le-dropdown [role="alert"]')!.textContent).toBe(error);
  });
});

describe('final review: a tooltip that is showing follows the theme', () => {
  it('setTheme() and an OS scheme change repaint it at once', () => {
    const editor = makeEditor({ theme: 'auto' });
    toolbarControl(editor, 'bold').focus();
    const tooltip = document.querySelector<HTMLElement>('.le-tooltip')!;
    expect([tooltip.hidden, tooltip.dataset.theme]).toEqual([false, 'light']);
    setMedia('(prefers-color-scheme: dark)', true);
    expect(tooltip.dataset.theme).toBe('dark');
    editor.setTheme('light');
    expect(tooltip.dataset.theme).toBe('light');
  });
});

describe('final review: developer warnings', () => {
  it('an unknown toolbar id is reported through the shared warning helper', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    makeEditor({ toolbar: ['bold', 'nope'] });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[laymaker\] \[UNKNOWN_UI_ITEM\] "nope"/));
  });
});

describe('final review: the English status bar', () => {
  it('reads correctly for one word and one character', () => {
    const editor = makeEditor({ content: '<p>a</p>', locale: 'en' });
    editor.ui!.flush();
    expect(editor.root.querySelector('.le-statusbar')!.textContent).toBe('Characters 1 · Without spaces 1 · Words 1');
  });
});
