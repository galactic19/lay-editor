import { createTranslator } from '../../src/i18n';
import { defineExtension } from '../../src/extensions/factories';
import { ExtensionManager } from '../../src/core/ExtensionManager';
import type { Editor } from '../../src/core/Editor';
import type { EditorConfig, Extension, ExtensionContext } from '../../src/core/types';

/** Minimal doc/paragraph/text extension for tests that run before the base extension exists. */
export const coreNodes = defineExtension({
  name: 'testCore',
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

export function fakeConfig(raw: Record<string, unknown> = {}, disable: string[] = []): EditorConfig {
  return { raw, disable } as unknown as EditorConfig;
}

export function fakeEditor(): Editor {
  return { t: createTranslator('en') } as unknown as Editor;
}

export function fakeCtx<O>(ext: Extension<O>, options = {} as O): ExtensionContext<O> {
  const schema = ExtensionManager.buildSchema([coreNodes, ext]);
  return { editor: fakeEditor(), options, schema, config: fakeConfig(), t: createTranslator('en') };
}
