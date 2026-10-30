import type { Mark, MarkType } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import type { Command } from 'prosemirror-state';
import { getMarkRange, isMarkActive } from '../../core/state-utils';
import { safeUrl } from '../../io/sanitize';
import { defineExtension } from '../factories';

export interface LinkInput {
  href: string;
  newTab?: boolean;
}

const AUTOLINK = /(?:^|\s)((?:https?:\/\/|www\.)[^\s]+)\s$/;
const withScheme = (url: string): string => (url.startsWith('www.') ? `https://${url}` : url);

/** The range a link command acts on: the selection, or the whole link around a bare cursor. */
function linkRange(state: Parameters<Command>[0], type: MarkType): { from: number; to: number } | null {
  const { from, to, empty } = state.selection;
  if (!empty) return { from, to };
  return isMarkActive(state, type) ? getMarkRange(state, type) : null;
}

const setLink =
  (type: MarkType, input: LinkInput): Command =>
  (state, dispatch) => {
    const href = safeUrl(input?.href);
    if (!href) return false;
    const mark = type.create({ href, target: input.newTab ? '_blank' : null });
    if (!dispatch) return true;
    const range = linkRange(state, type);
    const tr = state.tr;
    if (range) tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark);
    else tr.insert(state.selection.from, state.schema.text(href, [mark]));
    dispatch(tr.scrollIntoView());
    return true;
  };

const unsetLink =
  (type: MarkType): Command =>
  (state, dispatch) => {
    const range = linkRange(state, type);
    if (!range) return false;
    dispatch?.(state.tr.removeMark(range.from, range.to, type));
    return true;
  };

export const link = defineExtension({
  name: 'link',
  marks: {
    link: {
      attrs: { href: {}, target: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const href = safeUrl((dom as HTMLElement).getAttribute('href'));
            return href ? { href, target: (dom as HTMLElement).getAttribute('target') === '_blank' ? '_blank' : null } : false;
          },
        },
      ],
      toDOM: (mark: Mark) => ['a', { href: mark.attrs.href, target: mark.attrs.target, rel: mark.attrs.target ? 'noopener noreferrer' : null }, 0],
    },
  },
  commands: ({ schema, editor }) => {
    const type = schema.marks.link!;
    return {
      setLink: (input: LinkInput) => setLink(type, input),
      unsetLink: () => unsetLink(type),
      openLinkPanel: (): Command => (_state, dispatch) => {
        if (dispatch) editor.ui?.openPanelFor('link');
        return true;
      },
    };
  },
  keymap: () => ({ 'Mod-k': 'openLinkPanel' }),
  inputRules: ({ schema }) => [
    new InputRule(AUTOLINK, (state, match, start, end) => {
      const url = match[1]!;
      const href = safeUrl(withScheme(url));
      if (!href) return null;
      const type = schema.marks.link!;
      const urlStart = start + match[0].indexOf(url);
      return state.tr
        .addMark(urlStart, urlStart + url.length, type.create({ href }))
        .insertText(' ', end)
        .removeStoredMark(type);
    }),
  ],
  ui: () => [
    {
      id: 'link',
      kind: 'panel',
      icon: 'link',
      label: 'toolbar.link',
      shortcut: 'Mod-k',
      contexts: ['text', 'table'],
      isActive: (editor) => editor.isActive('link'),
    },
  ],
});
