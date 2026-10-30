import type { LocalePack } from './index';

export const en = {
  placeholder: 'Start writing…',
  toolbar: {
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strike: 'Strikethrough',
    code: 'Inline code',
    textColor: 'Text color',
    highlight: 'Highlight',
    link: 'Link',
    clearFormat: 'Clear formatting',
    undo: 'Undo',
    redo: 'Redo',
    more: 'More',
  },
  panel: {
    color: { reset: 'Default' },
    link: { url: 'Link URL', newTab: 'Open in new tab', apply: 'Apply', remove: 'Remove link' },
  },
  a11y: {
    toolbar: 'Formatting tools',
  },
} satisfies LocalePack;
