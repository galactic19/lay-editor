import { setBlockType } from 'prosemirror-commands';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { DEFAULTS } from '../../core/defaults';
import { isNodeActive } from '../../core/state-utils';
import type { UIItem } from '../../core/types';
import { blockExtension } from '../factories';

const LEVELS = DEFAULTS.heading.levels;
const MAX_LEVEL = LEVELS[LEVELS.length - 1]!;
const HTML_LEVELS = [1, 2, 3, 4, 5, 6];

function toggleHeading(schema: Schema, level: number): Command {
  const type = schema.nodes.heading!;
  return (state, dispatch) =>
    isNodeActive(state, type, { level })
      ? setBlockType(schema.nodes.paragraph!)(state, dispatch)
      : setBlockType(type, { level })(state, dispatch);
}

const levelItem = (level: number): UIItem => ({
  id: `heading:${level}`,
  kind: 'button',
  icon: `heading-${level}`,
  label: `option.heading.h${level}`,
  command: 'setHeading',
  args: [level],
  contexts: ['text'],
  isActive: (editor) => editor.isActive('heading', { level }),
  slash: { keywords: [`h${level}`, `heading${level}`, `제목${level}`] },
});

export const heading = blockExtension({
  name: 'heading',
  kind: 'textblock',
  tag: 'h1',
  defining: true,
  attrs: { level: { default: 1 } },
  parse: HTML_LEVELS.slice(1).map((level) => ({ tag: `h${level}`, attrs: { level: Math.min(level, MAX_LEVEL) } })),
  toDOM: (node: PMNode) => [`h${node.attrs.level}`, 0],
  extend: {
    commands: ({ schema }) => ({
      setHeading: (level: number) => setBlockType(schema.nodes.heading!, { level }),
      toggleHeading: (level: number) => toggleHeading(schema, level),
      setParagraph: () => setBlockType(schema.nodes.paragraph!),
    }),
    keymap: ({ schema }) => ({
      'Mod-Alt-0': 'setParagraph',
      ...Object.fromEntries(LEVELS.map((level) => [`Mod-Alt-${level}`, toggleHeading(schema, level)])),
    }),
    inputRules: ({ schema }) => [
      textblockTypeInputRule(new RegExp(`^(#{1,${MAX_LEVEL}})\\s$`), schema.nodes.heading!, (match) => ({ level: match[1]!.length })),
    ],
    ui: () => [
      {
        id: 'heading',
        kind: 'dropdown',
        icon: 'heading',
        label: 'toolbar.heading',
        contexts: ['text'],
        isActive: (editor) => editor.isActive('heading'),
        options: [
          {
            id: 'heading:paragraph',
            kind: 'button',
            icon: 'pilcrow',
            label: 'option.heading.paragraph',
            command: 'setParagraph',
            contexts: ['text'],
            isActive: (editor) => editor.isActive('paragraph'),
          },
          ...LEVELS.map(levelItem),
        ],
      },
    ],
  },
});
