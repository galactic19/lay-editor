import { listen } from '../ui/dom';
import type { Editor } from './Editor';

/** Browsers may hand a textarea's line breaks to form data as CRLF. */
const sameText = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

/**
 * Swaps the entry a field contributed (found by its old value) for a new value. Other entries
 * with the same name (`answers[]`) keep their order, and the first one keeps its position.
 */
function replaceEntry(data: FormData, name: string, from: string, to: string): void {
  const values = data.getAll(name);
  const index = values.findIndex((value) => typeof value === 'string' && sameText(value, from));
  if (index === -1 || sameText(from, to)) return;
  values[index] = to;
  const [first, ...rest] = values;
  data.set(name, first!);
  rest.forEach((value) => data.append(name, value));
}

/**
 * Textarea mode: the editor takes the place of a form's <textarea>, which stays the field the form
 * posts. Whenever the form is read (submit, form.submit(), new FormData) it holds the editor's HTML.
 */
export class TextareaBinding {
  private readonly form: HTMLFormElement | null;
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly textarea: HTMLTextAreaElement,
  ) {
    this.form = textarea.form;
  }

  /** Hides the textarea and shows `root` in its place. */
  mount(root: HTMLElement): void {
    const { textarea, form } = this;
    const previousDisplay = textarea.style.display;
    textarea.style.display = 'none';
    textarea.after(root);
    this.disposers.push(() => (textarea.style.display = previousDisplay), this.editor.on('change', (html) => (textarea.value = html)));
    if (!form) return;
    // Submit listeners may read the textarea directly; 'formdata' covers form.submit() and new FormData(form).
    this.disposers.push(listen(form, 'submit', this.commit, true), listen(form, 'formdata', this.onFormData));
  }

  /** Writes the editor's HTML into the textarea. */
  sync(): void {
    this.textarea.value = this.editor.getHTML();
  }

  destroy(): void {
    this.disposers.splice(0).forEach((dispose) => dispose());
  }

  /** Delivers a pending change (onChange included) and brings the textarea up to date. */
  private readonly commit = (): void => {
    this.editor.flushChange();
    this.sync();
  };

  /** The entry list is built before this event, so the stale textarea value is replaced in it too. */
  private readonly onFormData = (event: FormDataEvent): void => {
    const stale = this.textarea.value;
    this.commit();
    if (this.textarea.name) replaceEntry(event.formData, this.textarea.name, stale, this.textarea.value);
  };
}
