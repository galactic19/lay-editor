import { createEditor } from '../core/createEditor';
import type { Editor } from '../core/Editor';
import type { CoreEditorOptions } from '../core/types';

export type AdapterOptions = Omit<CoreEditorOptions, 'element' | 'content' | 'onChange'> & { [extensionOptions: string]: unknown };

export interface SyncedEditor {
  editor: Editor;
  /** Pushes an outside value in, unless it is what the editor itself last emitted. */
  applyValue(value: string | null | undefined): void;
  destroy(): void;
}

/** Shared by the framework wrappers: two-way value sync without echo loops. */
export function createSyncedEditor(
  element: HTMLElement,
  options: AdapterOptions,
  initial: string | null | undefined,
  emit: (html: string) => void,
): SyncedEditor {
  let last = initial ?? '';
  const editor = createEditor({
    ...options,
    element,
    content: last,
    onChange: (html) => {
      last = html;
      emit(html);
    },
  });
  return {
    editor,
    applyValue: (value) => {
      const next = value ?? '';
      if (next === last) return;
      last = next;
      editor.setHTML(next);
    },
    destroy: () => editor.destroy(),
  };
}
