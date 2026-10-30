import type { LocalePack } from './index';

export const en = {
  placeholder: 'Start writing…',
  toolbar: {
    heading: 'Heading',
    blockquote: 'Quote',
    bulletList: 'Bulleted list',
    orderedList: 'Numbered list',
    taskList: 'Checklist',
    horizontalRule: 'Divider',
    align: 'Align',
    indent: 'Indent',
    outdent: 'Outdent',
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
  option: {
    heading: { paragraph: 'Normal text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4' },
    align: { left: 'Align left', center: 'Align center', right: 'Align right', justify: 'Justify' },
  },
  panel: {
    color: { reset: 'Default' },
    link: {
      url: 'Link URL',
      newTab: 'Open in new tab',
      apply: 'Apply',
      remove: 'Remove link',
      placeholder: 'https://',
      invalid: 'Enter a valid link address',
    },
  },
  a11y: {
    taskCheckbox: 'Mark task done',
    toolbar: 'Formatting tools',
  },
} satisfies LocalePack;
