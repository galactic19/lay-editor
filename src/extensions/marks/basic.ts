import { markExtension } from '../factories';

const BOLD_WEIGHT = /^(bold(er)?|[6-9]\d{2})$/;

export const bold = markExtension({
  name: 'bold',
  tags: ['strong'],
  parse: [
    { tag: 'b', getAttrs: (dom) => (dom as HTMLElement).style.fontWeight !== 'normal' && null },
    { style: 'font-weight', getAttrs: (value) => BOLD_WEIGHT.test(value) && null },
  ],
  shortcut: 'Mod-b',
  icon: 'bold',
  inputRule: /\*\*([^*]+)\*\*$/,
});

export const italic = markExtension({
  name: 'italic',
  tags: ['em', 'i'],
  parse: [{ style: 'font-style=italic' }],
  shortcut: 'Mod-i',
  icon: 'italic',
  inputRule: /(?:^|\s)\*([^*\s][^*]*)\*$/,
});

export const underline = markExtension({
  name: 'underline',
  tags: ['u'],
  parse: [{ style: 'text-decoration', getAttrs: (value) => value.includes('underline') && null }],
  shortcut: 'Mod-u',
  icon: 'underline',
});

export const strike = markExtension({
  name: 'strike',
  tags: ['s', 'del', 'strike'],
  parse: [{ style: 'text-decoration', getAttrs: (value) => value.includes('line-through') && null }],
  shortcut: 'Mod-Shift-s',
  icon: 'strikethrough',
  inputRule: /~~([^~]+)~~$/,
});

export const code = markExtension({
  name: 'code',
  tags: ['code'],
  excludes: '_',
  shortcut: 'Mod-e',
  icon: 'code',
  inputRule: /`([^`]+)`$/,
});

export const basicMarks = [bold, italic, underline, strike, code];
