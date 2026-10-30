import type { Mark } from 'prosemirror-model';
import { DEFAULTS } from '../../core/defaults';
import type { Extension } from '../../core/types';
import { safeColor } from '../../io/sanitize';
import { colorPanel } from '../../ui/panels/colorPanel';
import { applyMark, commandName, defineExtension, removeMark } from '../factories';

export type ColorOptions = { text: readonly string[]; highlight: readonly string[] };

interface ColorMarkConfig {
  name: 'textColor' | 'highlight';
  tag: 'span' | 'mark';
  cssProp: 'color' | 'background-color';
  paletteKey: keyof ColorOptions;
  icon: string;
}

const colorAttrs = (value: string | null | undefined) => {
  const color = safeColor(value);
  return color ? { color } : false;
};

/** Text color and highlight share everything but the tag, CSS property and palette. */
export function colorMarkExtension(cfg: ColorMarkConfig): Extension<ColorOptions> {
  const { name, tag, cssProp, icon } = cfg;
  const parseDOM =
    tag === 'span'
      ? [{ style: cssProp, getAttrs: colorAttrs }, { tag: 'font[color]', getAttrs: (dom: HTMLElement) => colorAttrs(dom.getAttribute('color')) }]
      : [
          { tag: `span[style*="${cssProp}"]`, getAttrs: (dom: HTMLElement) => colorAttrs(dom.style.getPropertyValue(cssProp)) },
          {
            tag,
            getAttrs: (dom: HTMLElement) => colorAttrs(dom.style.getPropertyValue(cssProp) || DEFAULTS.colors[cfg.paletteKey][0]),
          },
        ];
  return defineExtension<ColorOptions>({
    name,
    optionsKey: 'colors',
    defaults: DEFAULTS.colors,
    marks: {
      [name]: {
        attrs: { color: {} },
        parseDOM,
        toDOM: (mark: Mark) => [tag, { style: `${cssProp}: ${mark.attrs.color}` }, 0],
      },
    },
    commands: ({ schema }) => ({
      [commandName('set', name)]: (value: string) => {
        const color = safeColor(value);
        return color ? applyMark(schema.marks[name]!, { color }) : () => false;
      },
      [commandName('unset', name)]: () => removeMark(schema.marks[name]!),
    }),
    ui: ({ options }) => [
      {
        id: name,
        kind: 'panel',
        icon,
        label: `toolbar.${name}`,
        contexts: ['text', 'table'],
        isActive: (editor) => editor.isActive(name),
        panel: colorPanel(options[cfg.paletteKey], commandName('set', name), commandName('unset', name), name),
      },
    ],
  });
}

export const textColor = colorMarkExtension({ name: 'textColor', tag: 'span', cssProp: 'color', paletteKey: 'text', icon: 'baseline' });
export const highlight = colorMarkExtension({
  name: 'highlight',
  tag: 'mark',
  cssProp: 'background-color',
  paletteKey: 'highlight',
  icon: 'highlighter',
});
