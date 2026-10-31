import type { Mark, MarkType } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import type { Command } from 'prosemirror-state';
import { getMarkRange, isMarkActive, markApplies } from '../../core/state-utils';
import { safeUrl } from '../../io/sanitize';
import { completeScheme } from '../../io/url';
import { linkPanel } from '../../ui/panels/linkPanel';
import { canApplyMark, defineExtension } from '../factories';

export interface LinkInput {
  href: string;
  newTab?: boolean;
}

const AUTOLINK = /(?:^|\s)((?:https?:\/\/|www\.)[^\s]+)\s$/;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** Adds the scheme people leave out: https:// for hosts, mailto: for e-mail addresses. */
export function normalizeHref(input: string): string {
  const value = String(input ?? '').trim();
  return EMAIL.test(value) ? `mailto:${value}` : completeScheme(value);
}

/** The range a link command acts on: the selection, or the whole link around a bare cursor. */
function linkRange(state: Parameters<Command>[0], type: MarkType): { from: number; to: number } | null {
  const { from, to, empty } = state.selection;
  if (!empty) return { from, to };
  return isMarkActive(state, type) ? getMarkRange(state, type) : null;
}

const setLink =
  (type: MarkType, input: LinkInput): Command =>
  (state, dispatch) => {
    const href = safeUrl(normalizeHref(input?.href));
    if (!href || !markApplies(state, type)) return false;
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
      openLink: (): Command => (state, dispatch) => {
        const href = state.selection.$from.marks().find((mark) => mark.type === type)?.attrs.href;
        if (!href) return false;
        if (dispatch) window.open(href, '_blank', 'noopener');
        return true;
      },
      // Where no link can go (code blocks) Mod-k opens nothing, but still claims the key so the
      // browser's own Ctrl+K (address bar search) does not take focus away.
      openLinkPanel: (): Command => (state, dispatch) => {
        if (dispatch && markApplies(state, type)) editor.ui?.openPanelFor('link');
        return true;
      },
    };
  },
  keymap: () => ({ 'Mod-k': 'openLinkPanel' }),
  inputRules: ({ schema }) => [
    new InputRule(AUTOLINK, (state, match, start, end) => {
      const url = match[1]!;
      const href = safeUrl(normalizeHref(url));
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
      isEnabled: canApplyMark('link'),
      panel: linkPanel,
    },
    { id: 'linkEdit', kind: 'panel', icon: 'pencil', label: 'toolbar.linkEdit', contexts: ['link'], panel: linkPanel },
    { id: 'linkOpen', kind: 'button', icon: 'external-link', label: 'toolbar.linkOpen', command: 'openLink', contexts: ['link'] },
    { id: 'linkRemove', kind: 'button', icon: 'unlink', label: 'toolbar.linkRemove', command: 'unsetLink', contexts: ['link'] },
  ],
});
