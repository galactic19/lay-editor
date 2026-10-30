import type { Node as PMNode } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { DEFAULTS } from '../../core/defaults';
import { findParent } from '../../core/state-utils';
import type { UIItem } from '../../core/types';
import { safeLanguage } from '../../io/sanitize';
import { blockExtension } from '../factories';

type CodeBlockOptions = { indent: string; plainLanguage: string; languages: readonly string[] };

const LANGUAGE_CLASS = /^language-/;
const inCode = (state: Parameters<Command>[0]) => findParent(state, (node) => node.type.name === 'codeBlock');

const languageOption = (language: string, plain: string): UIItem => {
  const value = language === plain ? null : language;
  return {
    id: `codeLanguage:${language}`,
    kind: 'button',
    icon: 'code',
    label: value ? 'option.codeLanguage.named' : 'option.codeLanguage.plain',
    labelParams: { name: language },
    command: 'setCodeLanguage',
    args: [value],
    contexts: ['codeBlock'],
    isActive: (editor) => editor.isActive('codeBlock', { language: value }),
  };
};

export const codeBlock = blockExtension({
  name: 'codeBlock',
  kind: 'textblock',
  tag: 'pre',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  attrs: { language: { default: null } },
  tagRule: {
    preserveWhitespace: 'full',
    getAttrs: (dom: HTMLElement) => {
      const cls = [...(dom.querySelector('code')?.classList ?? [])].find((name) => LANGUAGE_CLASS.test(name));
      return { language: safeLanguage(cls?.replace(LANGUAGE_CLASS, '')) };
    },
  },
  toDOM: (node: PMNode) => ['pre', ['code', { class: node.attrs.language ? `language-${node.attrs.language}` : null }, 0]],
  shortcut: 'Mod-Alt-c',
  icon: 'square-code',
  inputRule: { pattern: /^```([a-z0-9+#-]*)\s$/i, attrs: (match) => ({ language: safeLanguage(match[1]) }) },
  slash: { keywords: ['code', 'codeblock', '코드'] },
  extend: {
    // Above lists so Tab indents code inside a list item.
    priority: 250,
    defaults: DEFAULTS.codeBlock,
    commands: () => ({
      setCodeLanguage: (language: string | null): Command => (state, dispatch) => {
        const value = language === null ? null : safeLanguage(language);
        const block = inCode(state);
        if (!block || (language !== null && !value)) return false;
        dispatch?.(state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, language: value }));
        return true;
      },
    }),
    keymap: ({ options }: { options: CodeBlockOptions }) => ({
      Tab: (state, dispatch) => {
        if (!inCode(state)) return false;
        dispatch?.(state.tr.insertText(options.indent));
        return true;
      },
    }),
    ui: ({ options }: { options: CodeBlockOptions }) => [
      {
        id: 'codeLanguage',
        kind: 'dropdown',
        icon: 'file-code',
        label: 'toolbar.codeLanguage',
        contexts: ['codeBlock'],
        options: options.languages.map((language) => languageOption(language, options.plainLanguage)),
      },
    ],
  },
});
