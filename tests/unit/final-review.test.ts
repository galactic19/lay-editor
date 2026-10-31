import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import type { EditorOptions } from '../../src/core/types';
import { normalizeHref } from '../../src/extensions/marks/link';
import { fillContainerStarts } from '../../src/io/html';
import { onCleanup, setMedia } from '../setup';
import { caretAfter, makeEditor, toolbarControl } from '../helpers/editor';

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
