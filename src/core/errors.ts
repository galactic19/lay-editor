export type EditorErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'SCHEMA_CONFLICT'
  | 'MISSING_DEPENDENCY'
  | 'DUPLICATE_EXTENSION'
  | 'INVALID_OPTION'
  | 'UNKNOWN_UI_ITEM'
  | 'EXTENSION_FAILED'
  | 'CALLBACK_FAILED'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_REJECTED'
  | 'PASTE_FAILED'
  | 'STORAGE_UNAVAILABLE';

/** Developer-facing hints: how to fix each error. */
const HINTS: Record<EditorErrorCode, string> = {
  ELEMENT_NOT_FOUND: 'Pass an existing element or a selector that matches one.',
  SCHEMA_CONFLICT: 'Two extensions define the same node or mark name; rename or disable one.',
  MISSING_DEPENDENCY: 'Add the required extension or remove the dependent one.',
  DUPLICATE_EXTENSION: 'Each extension name must be unique; remove the duplicate.',
  INVALID_OPTION: 'Check the option value against the documented type.',
  UNKNOWN_UI_ITEM: 'Use one of the registered toolbar item ids.',
  EXTENSION_FAILED: 'The extension threw during setup and was skipped; check its code.',
  CALLBACK_FAILED: 'A user callback threw; the editor kept running.',
  UPLOAD_FAILED: 'The upload function rejected; check the server response.',
  UPLOAD_REJECTED: 'The file type or size is not allowed by the image options.',
  PASTE_FAILED: 'Paste cleanup failed; the content was pasted as plain text.',
  STORAGE_UNAVAILABLE: 'localStorage is not available; autosave is disabled.',
};

/**
 * Developer mistakes the editor can recover from: logged with the [laymaker] prefix each time they happen, never thrown.
 * A caller that runs often keeps its own once-only set (icons warn once per name).
 */
export function warn(message: string): void {
  console.warn(`[laymaker] ${message}`);
}

export class EditorError extends Error {
  readonly code: EditorErrorCode;

  constructor(code: EditorErrorCode, detail = '', options?: { cause?: unknown }) {
    super(`[${code}] ${detail} — ${HINTS[code]}`, options);
    this.name = 'EditorError';
    this.code = code;
  }
}
