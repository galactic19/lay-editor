import { exitCode, setBlockType } from 'prosemirror-commands';
import type { Attrs, Node as PMNode, NodeType } from 'prosemirror-model';
import { Plugin, Selection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { DEFAULTS } from '../../core/defaults';
import { findParent, isNodeActive } from '../../core/state-utils';
import type { UIItem } from '../../core/types';
import { safeLanguage } from '../../io/sanitize';
import { blockExtension, sequence } from '../factories';

type CodeBlockOptions = { indent: string; exitBlankLines: number; plainLanguage: string; languages: readonly string[] };

const LANGUAGE_CLASS = /^language-/;
const NEWLINE = '\n';
const inCode = (state: EditorState) => findParent(state, (node) => node.type.name === 'codeBlock');

/** The caret when it sits at the very end of a code block. */
function caretAtCodeEnd(state: EditorState) {
  const { $from, empty } = state.selection;
  return empty && $from.parent.type.spec.code && $from.parentOffset === $from.parent.content.size ? $from : null;
}

/** Arrows at the end of a code block that nothing follows add a paragraph after it instead of trapping the caret. */
const exitAtEnd: Command = (state, dispatch) => {
  const $end = caretAtCodeEnd(state);
  return Boolean($end && !Selection.findFrom(state.doc.resolve($end.after()), 1)) && exitCode(state, dispatch);
};

/** Removes `count` empty trailing lines when Enter is pressed on the last of them. */
const trimBlankLines =
  (count: number): Command =>
  (state, dispatch) => {
    const $end = caretAtCodeEnd(state);
    if (!count || !$end?.parent.textContent.endsWith(NEWLINE.repeat(count))) return false;
    dispatch?.(state.tr.delete($end.pos - count, $end.pos));
    return true;
  };

/** Enter on the last of `count` empty trailing lines drops them and leaves the block. */
const exitAfterBlankLines = (count: number): Command => sequence(trimBlankLines(count), exitCode);

/** Joins neighbouring code blocks touched by [from, to] into one, a newline between each pair. */
function joinLines(tr: Transaction, code: NodeType, from: number, to: number): void {
  const seams: number[] = [];
  tr.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    const end = pos + node.nodeSize;
    if (node.type === code && end < to && parent?.maybeChild(index + 1)?.sameMarkup(node)) seams.push(end);
    return !node.isTextblock;
  });
  // Last seam first keeps earlier positions valid; the newline opens the later block so a caret there stays on its line.
  for (const seam of seams.reverse()) tr.insert(seam + 1, code.schema.text(NEWLINE)).join(seam);
}

/** Splits the code block at `pos` into one block per line, dropping the newlines. */
function splitLines(tr: Transaction, pos: number, node: PMNode): void {
  const text = node.textContent;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] !== NEWLINE) continue;
    const at = pos + 1 + i;
    tr.split(at + 1).delete(at, at + 1);
  }
}

/** Selected lines (paragraphs or line breaks) become one code block; each code line becomes a paragraph again. */
function toggleCodeLines(code: NodeType, paragraph: NodeType, attrs?: Attrs): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    if (!isNodeActive(state, code, attrs)) {
      return setBlockType(code, attrs)(state, dispatch && ((tr) => {
        joinLines(tr, code, tr.mapping.map(from), tr.mapping.map(to));
        dispatch(tr);
      }));
    }
    if (!setBlockType(paragraph)(state)) return false;
    if (!dispatch) return true;
    const blocks: Array<{ node: PMNode; pos: number }> = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === code) blocks.push({ node, pos });
      return !node.isTextblock;
    });
    const tr = state.tr;
    for (const { node, pos } of [...blocks].reverse()) splitLines(tr, pos, node);
    const last = blocks[blocks.length - 1]!;
    tr.setBlockType(tr.mapping.map(blocks[0]!.pos), tr.mapping.map(Math.max(to, last.pos + last.node.nodeSize)), paragraph);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

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
    commands: ({ schema }) => ({
      toggleCodeBlock: (attrs?: Attrs) => toggleCodeLines(schema.nodes.codeBlock!, schema.nodes.paragraph!, attrs),
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
      Enter: exitAfterBlankLines(options.exitBlankLines),
      ArrowDown: exitAtEnd,
      ArrowRight: exitAtEnd,
    }),
    plugins: ({ options }: { options: CodeBlockOptions }) => {
      const exit = exitAfterBlankLines(options.exitBlankLines);
      // Chrome on Android sends no Enter key inside <pre>; the newline arrives as typed text instead.
      return [new Plugin({ props: { handleTextInput: (view, _from, _to, text) => text === NEWLINE && exit(view.state, view.dispatch) } })];
    },
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
