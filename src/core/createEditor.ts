import { resolveConfig } from './config';
import { Editor } from './Editor';
import type { EditorOptions } from './types';

export function createEditor(options: EditorOptions): Editor {
  return new Editor(resolveConfig(options));
}
