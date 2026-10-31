import type { Transaction } from 'prosemirror-state';
import { c } from '../ui/classes';
import { listen } from '../ui/dom';
import type { Editor } from './Editor';

/** A form control that takes part in constraint validation. */
type Validated = Element & Pick<HTMLTextAreaElement, 'willValidate' | 'validity'>;

const INVALID_CLASS = c('invalid');
/** Events that show the user acting on the page; a click or Enter may also be a submit attempt. */
const USER_ACTIONS = ['click', 'keydown'] as const;
/** Button types whose activation submits their form. */
const SUBMIT_TYPES = ['submit', 'image'];

/** The form an element belongs to: a form control's owner (it may sit outside the form), else the enclosing form. */
const formOf = (element: Element): HTMLFormElement | null =>
  'form' in element ? (element.form as HTMLFormElement | null) : element.closest('form');

/**
 * A user's attempt to submit `form`: a click on one of its submit buttons, or Enter in any of its
 * fields but a textarea (implicit submission in an input, an app's Ctrl+Enter shortcut in the editor).
 */
function isSubmitAttempt(event: Event, form: HTMLFormElement): boolean {
  if (!(event.target instanceof Element)) return false;
  if (event instanceof KeyboardEvent) {
    return event.key === 'Enter' && !event.isComposing && !(event.target instanceof HTMLTextAreaElement) && formOf(event.target) === form;
  }
  const button = event.target.closest('button, input');
  return (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) && SUBMIT_TYPES.includes(button.type) && formOf(button) === form;
}

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
  /** Until the user acts on the page a failed check is an app's (checkValidity() at load) and shows nothing. */
  private interacted = false;
  /** Set for the rest of the task by a submit attempt; only then does a failed check take focus and show a message. */
  private submitting = false;

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
      // The window's capture phase runs before any app shortcut registered on the document.
      ...USER_ACTIONS.map((type) => listen(window, type, this.onUserAction, true)),
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

  private readonly onUserAction = (event: Event): void => {
    this.interacted = true;
    if (!this.form || !isSubmitAttempt(event, this.form)) return;
    this.submitting = true;
    setTimeout(() => (this.submitting = false));
  };

  /**
   * The browser cannot point its message at the hidden textarea (it only logs "not focusable"), so the
   * editor reports itself: an invalid style and aria-invalid once the user has acted on the page, and on
   * a submit attempt also focus and a message. Content changes clear the mark.
   */
  private readonly onInvalid = (event: Event): void => {
    event.preventDefault();
    if (!this.interacted) return;
    this.markInvalid(true);
    if (this.submitting && this.isFirstInvalid()) this.report();
  };

  /** Like the browser, report only the first invalid field of the form. */
  private isFirstInvalid(): boolean {
    const controls: Element[] = this.form ? [...this.form.elements] : [this.textarea];
    return controls.find((el) => (el as Validated).willValidate && !(el as Validated).validity.valid) === this.textarea;
  }

  /** Focus (unless the user is already in the editor) and a message in the editor's language, or the app's own one. */
  private report(): void {
    if (!this.editor.root.contains(document.activeElement)) this.editor.focus();
    const { validity, validationMessage } = this.textarea;
    this.editor.ui?.toaster.show(validity.customError ? validationMessage : this.editor.t('toast.required'), 'error');
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
