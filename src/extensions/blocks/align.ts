import { oneOf } from '../../io/sanitize';
import type { UIItem } from '../../core/types';
import { ATTR_BLOCK_TYPES, updateBlockAttr } from './textblockAttr';
import { defineExtension } from '../factories';

const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
type Alignment = (typeof ALIGNMENTS)[number];
/** Left is the default and is stored as null. */
const STORED = ['center', 'right', 'justify'] as const;
const SHORTCUTS: Record<Alignment, string> = { left: 'Mod-Shift-l', center: 'Mod-Shift-e', right: 'Mod-Shift-r', justify: 'Mod-Shift-j' };

const toStored = (value: Alignment) => oneOf(value, STORED);

const alignOption = (value: Alignment): UIItem => ({
  id: `align:${value}`,
  kind: 'button',
  icon: `align-${value === 'justify' ? 'justify' : value}`,
  label: `option.align.${value}`,
  command: 'setAlign',
  args: [toStored(value)],
  shortcut: SHORTCUTS[value],
  contexts: ['text', 'table'],
  isActive: (editor) =>
    editor.isActive('paragraph', { align: toStored(value) }) || editor.isActive('heading', { align: toStored(value) }),
});

export const align = defineExtension({
  name: 'align',
  globalAttributes: [
    {
      types: ATTR_BLOCK_TYPES,
      attrs: {
        align: {
          default: null,
          parse: (dom) => oneOf(dom.style.textAlign, STORED),
          render: (value) => (value ? { style: `text-align: ${value}` } : null),
        },
      },
    },
  ],
  commands: () => ({
    setAlign: (value: string | null) => {
      if (value !== null && !oneOf(value, ALIGNMENTS)) return () => false;
      return updateBlockAttr('align', () => toStored((value ?? 'left') as Alignment));
    },
  }),
  keymap: ({ editor }) => Object.fromEntries(ALIGNMENTS.map((value) => [SHORTCUTS[value], () => editor.exec('setAlign', toStored(value))])),
  ui: () => [
    { id: 'align', kind: 'dropdown', icon: 'align-left', label: 'toolbar.align', contexts: ['text', 'table'], options: ALIGNMENTS.map(alignOption) },
  ],
});
