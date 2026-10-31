import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import type { EditorOptions } from '../../src/core/types';
import { onCleanup, setMedia } from '../setup';
import { makeEditor, toolbarControl } from '../helpers/editor';

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
