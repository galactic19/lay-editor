import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { defineExtension } from '../factories';

export interface HighlightRange {
  from: number;
  to: number;
  className: string;
}
export type Highlighter = (code: string, language: string | null) => HighlightRange[];

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

/** Flattens lowlight's hast tree into text ranges with their class names. */
function toRanges(nodes: HastNode[], ranges: HighlightRange[] = [], start = 0): number {
  let offset = start;
  for (const node of nodes) {
    if (node.type === 'text') offset += node.value?.length ?? 0;
    else if (node.children) {
      const from = offset;
      offset = toRanges(node.children, ranges, offset);
      const className = node.properties?.className?.join(' ');
      if (className && offset > from) ranges.push({ from, to: offset, className });
    }
  }
  return offset;
}

/** Default highlighter: lowlight with its common languages, loaded on first use. */
export async function loadLowlight(): Promise<Highlighter> {
  const { createCommonLowlight } = await import('./lowlightLoader');
  const lowlight = createCommonLowlight();
  return (code, language) => {
    if (!language || !lowlight.registered(language)) return [];
    const ranges: HighlightRange[] = [];
    toRanges(lowlight.highlight(language, code).children as HastNode[], ranges);
    return ranges.sort((a, b) => a.from - b.from);
  };
}

const isCode = (node: PMNode): boolean => Boolean(node.type.spec.code);

function hasCode(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    found ||= isCode(node);
    return !found && !node.isTextblock;
  });
  return found;
}

/**
 * Decorates code blocks once `load` resolves. The highlighter is only requested when the
 * document first contains a code block, and results are cached per (immutable) block node.
 */
export function createHighlightPlugin(load: () => Promise<Highlighter>): Plugin {
  const key = new PluginKey<DecorationSet>('codeHighlight');
  const cache = new WeakMap<PMNode, HighlightRange[]>();
  let highlighter: Highlighter | null = null;
  let requested = false;

  const build = (doc: PMNode): DecorationSet => {
    if (!highlighter) return DecorationSet.empty;
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (!isCode(node)) return !node.isTextblock;
      let ranges = cache.get(node);
      if (!ranges) cache.set(node, (ranges = highlighter!(node.textContent, node.attrs.language ?? null)));
      for (const range of ranges) decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.className }));
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };

  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => build(state.doc),
      apply: (tr, previous, _old, state) => (tr.docChanged || tr.getMeta(key) ? build(state.doc) : previous),
    },
    props: { decorations: (state) => key.getState(state) },
    view: (view) => {
      const request = (): void => {
        if (requested || highlighter || !hasCode(view.state.doc)) return;
        requested = true;
        load()
          .then((loaded) => {
            highlighter = loaded;
            // Plugin views are rebuilt when setHTML resets the history plugin, so ask the editor view, not this one.
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true));
          })
          .catch((error) => {
            requested = false;
            console.error(error);
          });
      };
      request();
      return { update: request };
    },
  });
}

export const codeHighlight = defineExtension({
  name: 'codeHighlight',
  dependencies: ['codeBlock'],
  plugins: () => [createHighlightPlugin(loadLowlight)],
});
