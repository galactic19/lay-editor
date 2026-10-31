import { createEditor } from '../../src/core/createEditor';
import type { Editor } from '../../src/core/Editor';
import type { EditorOptions } from '../../src/core/types';
import { onCleanup } from '../setup';

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
