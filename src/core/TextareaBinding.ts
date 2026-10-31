import type { Transaction } from 'prosemirror-state';
import { c } from '../ui/classes';
import { listen } from '../ui/dom';
import type { Editor } from './Editor';

/** A form control that takes part in constraint validation. */
type Validated = Element & Pick<HTMLTextAreaElement, 'willValidate' | 'validity'>;

const INVALID_CLASS = c('invalid');
/** Focus on one of these means the user is submitting, so the editor may take focus to report itself. */
const SUBMITTERS = 'button, input[type="submit"], input[type="image"]';

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
 * posts. Whenever the form is read (submit, form.submit(), new FormData) it holds the editor's HTML,
 * a form reset resets the editor too, and a failed check of the textarea (`required`) shows on the editor.
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
    this.disposers.push(
      () => (textarea.style.display = previousDisplay),
      this.editor.on('change', (html) => (textarea.value = html)),
      this.editor.on('update', this.onUpdate),
      listen(textarea, 'invalid', this.onInvalid),
    );
    if (!form) return;
    // Submit listeners may read the textarea directly; 'formdata' covers form.submit() and new FormData(form).
    this.disposers.push(
      listen(form, 'submit', this.commit, true),
      listen(form, 'formdata', this.onFormData),
      listen(form, 'reset', this.onReset),
    );
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

  /**
   * Clears the invalid mark on edits. The HTML reaches the textarea on the change debounce, but its
   * emptiness is synced at once so `required` judges what the editor shows (Ctrl+Enter right after typing).
   */
  private readonly onUpdate = (tr: Transaction): void => {
    if (!tr.docChanged) return;
    this.markInvalid(false);
    if ((this.textarea.value === '') !== this.editor.isEmpty()) this.sync();
  };

  /**
   * The browser cannot point its message at the hidden textarea (it only logs "not focusable"), so the
   * editor reports itself: an invalid style, aria-invalid and, when the browser would report this field,
   * focus and the browser's own message. Content changes clear the mark.
   */
  private readonly onInvalid = (event: Event): void => {
    event.preventDefault();
    this.markInvalid(true);
    if (!this.reportsFirst()) return;
    this.editor.focus();
    if (this.textarea.validationMessage) this.editor.ui?.toaster.show(this.textarea.validationMessage, 'error');
  };

  /**
   * Like the browser, report only the first invalid field, and never pull focus out of a field the user
   * is in (an app may call checkValidity() on every keystroke).
   */
  private reportsFirst(): boolean {
    const controls: Element[] = this.form ? [...this.form.elements] : [this.textarea];
    if (controls.find((el) => (el as Validated).willValidate && !(el as Validated).validity.valid) !== this.textarea) return false;
    const active = document.activeElement;
    return !active || active === document.body || this.editor.root.contains(active) || active.matches(SUBMITTERS);
  }

  private markInvalid(invalid: boolean): void {
    this.editor.root.classList.toggle(INVALID_CLASS, invalid);
    if (invalid) this.editor.view.dom.setAttribute('aria-invalid', 'true');
    else this.editor.view.dom.removeAttribute('aria-invalid');
  }

  /** Back to the content the editor was created with, like every other field of the form. */
  private readonly onReset = (event: Event): void => {
    if (event.defaultPrevented) return;
    this.editor.setHTML(this.editor.config.content);
    // The form puts the textarea's default value back after this event; the flushed change then overwrites it.
    setTimeout(() => this.editor.flushChange());
  };
}
