import { DOMParser as PMDOMParser, DOMSerializer, Fragment, type Node as PMNode, type NodeType, type Schema, type TagParseRule } from 'prosemirror-model';
import { LEAF_CHAR, NEWLINE } from '../core/state-utils';
import type { ExtNodeSpec } from '../core/types';

const NBSP = '\u00a0';

/** Node types whose content must open with a textblock while other blocks may follow (a list item: `paragraph block*`). */
function textblockFirstTypes(schema: Schema): Set<NodeType> {
  const blocks = Object.values(schema.nodes).filter((type) => type.isBlock);
  const textblockFirst = (type: NodeType): boolean => {
    const start = type.contentMatch;
    const rest = start.defaultType?.isTextblock ? start.matchType(start.defaultType) : null;
    return Boolean(rest) && blocks.some((block) => rest!.matchType(block) && !start.matchType(block));
  };
  return new Set(blocks.filter(textblockFirst));
}

const contentChild = (node: ChildNode): boolean => node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent ?? ''));

/**
 * An element of such a type that starts with another block (`<li><h3>`, `<li><img>`) gets an empty textblock in front.
 * Without it the parser closes the list there, moves the block out and re-wraps the remaining items in another list type.
 */
export function fillContainerStarts(root: Element, schema: Schema): void {
  const types = textblockFirstTypes(schema);
  if (!types.size) return;
  const parser = PMDOMParser.fromSchema(schema);
  const tagRules = parser.rules.filter((rule): rule is TagParseRule => 'tag' in rule);
  const nodeOf = (rule?: TagParseRule): NodeType | undefined => (rule?.node ? schema.nodes[rule.node] : undefined);
  const selectorFor = (wanted: (type: NodeType) => boolean): string =>
    tagRules
      .filter((rule) => {
        const type = nodeOf(rule);
        return type !== undefined && wanted(type);
      })
      .map((rule) => rule.tag)
      .join(',');
  const containers = selectorFor((type) => types.has(type));
  // Fast path for the usual `<li><p>`: a node every such container accepts first.
  const fineStart = selectorFor((type) => [...types].every((container) => container.contentMatch.matchType(type)));
  /** The rule the parser would use for `el` (rules are in priority order). */
  const ruleFor = (el: Element) => tagRules.find((rule) => el.matches(rule.tag) && rule.getAttrs?.(el as HTMLElement) !== false);
  /** What `first` parses to: its own rule's node, or (no rule, or a skipped wrapper) the first node parsed from it. */
  const leadingType = (first: Element): NodeType | undefined => {
    const rule = ruleFor(first);
    if (rule && !rule.skip) return nodeOf(rule);
    const probe = first.ownerDocument.createElement('div');
    probe.append(first.cloneNode(true));
    return parser.parseSlice(probe).content.firstChild?.type;
  };
  for (const el of root.querySelectorAll(containers)) {
    const first = Array.from(el.childNodes).find(contentChild);
    if (!(first instanceof Element) || (fineStart && first.matches(fineStart))) continue;
    const type = nodeOf(ruleFor(el));
    const leading = leadingType(first);
    if (!type || !types.has(type) || !leading?.isBlock || type.contentMatch.matchType(leading)) continue;
    const filler = type.contentMatch.defaultType!.create();
    el.insertBefore(DOMSerializer.fromSchema(schema).serializeNode(filler, { document: el.ownerDocument }), first);
  }
}

export function parseHTML(schema: Schema, html: string | null | undefined): PMNode {
  const dom = new window.DOMParser().parseFromString(`<!doctype html><body>${html ?? ''}</body>`, 'text/html');
  fillContainerStarts(dom.body, schema);
  return mapProse(PMDOMParser.fromSchema(schema).parse(dom.body), restoreSpaces);
}

/** A document is empty when it holds only paragraphs with nothing but line breaks. */
export function isDocEmpty(doc: PMNode): boolean {
  let empty = true;
  doc.forEach((block) => {
    if (block.type.name !== 'paragraph') empty = false;
    else block.forEach((inline) => {
      if (inline.type.name !== 'hardBreak') empty = false;
    });
  });
  return empty;
}

const isTransient = (node: PMNode): boolean => Boolean((node.type.spec as ExtNodeSpec).transient?.(node));

const SPACE_PAIR = / {2}/g;
const LINE_START_SPACE = /(^|\n) /g;
const LINE_END_SPACE = / (\n|$)/g;
const ANY_NBSP = new RegExp(NBSP, 'g');

/** HTML collapses runs of spaces and drops them at line edges: those become no-break spaces, alternating like other editors. */
const keepSpaces = (text: string): string =>
  text.replace(SPACE_PAIR, ` ${NBSP}`).replace(LINE_START_SPACE, `$1${NBSP}`).replace(LINE_END_SPACE, `${NBSP}$1`);

/** A neighbour that makes a plain space collapse: a line edge or another space. */
const collapsesSpace = (char: string | undefined): boolean => char === undefined || char === NEWLINE || char === ' ' || char === NBSP;

/**
 * The inverse of keepSpaces on load: a no-break space where a plain one would collapse becomes a plain space again,
 * so a saved trailing space, a run or an indent is ordinary text in the editor. One between two words stays.
 */
const restoreSpaces = (text: string): string =>
  text.replace(ANY_NBSP, (nbsp, at: number) => (collapsesSpace(text[at - 1]) || collapsesSpace(text[at + 1]) ? ' ' : nbsp));

type TextRewrite = (text: string) => string;

/** Rewrites a textblock's inline content (marks and line breaks included) as one string, one character per inline node; `rewrite` keeps the length. */
function mapBlockText(block: PMNode, rewrite: TextRewrite): PMNode {
  const parts: string[] = [];
  block.forEach((child) => parts.push(child.isText ? child.text! : child.type === child.type.schema.linebreakReplacement ? NEWLINE : LEAF_CHAR));
  const text = parts.join('');
  const rewritten = rewrite(text);
  if (rewritten === text) return block;
  let offset = 0;
  const children = parts.map((part, index) => {
    const child = block.child(index);
    const value = rewritten.slice(offset, (offset += part.length));
    return child.isText ? block.type.schema.text(value, child.marks) : child;
  });
  return block.copy(Fragment.fromArray(children));
}

/** Copies `node` without the children `keep` rejects, rewriting the text of every textblock that collapses whitespace. */
function mapProse(node: PMNode, rewrite: TextRewrite, keep: (child: PMNode) => boolean = () => true): PMNode {
  if (node.isLeaf) return node;
  const children: PMNode[] = [];
  node.forEach((child) => {
    if (keep(child)) children.push(mapProse(child, rewrite, keep));
  });
  const copy = node.copy(Fragment.fromArray(children));
  return copy.isTextblock && copy.type.whitespace !== 'pre' ? mapBlockText(copy, rewrite) : copy;
}

export function serializeHTML(schema: Schema, doc: PMNode): string {
  // The document as saved: transient nodes dropped, typed spaces kept visible.
  const clean = mapProse(doc, keepSpaces, (child) => !isTransient(child));
  if (clean.childCount === 0 || isDocEmpty(clean)) return '';
  const container = document.createElement('div');
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(clean.content));
  return container.innerHTML;
}

/** Containers whose children go on their own lines in the source view. */
const LINE_CONTAINERS = new Set(['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'BLOCKQUOTE']);

function formatElement(el: Element): string {
  if (!LINE_CONTAINERS.has(el.tagName)) return el.outerHTML;
  const outer = el.outerHTML;
  const open = outer.slice(0, outer.indexOf('>') + 1);
  return [open, ...Array.from(el.children, formatElement), `</${el.tagName.toLowerCase()}>`].join('\n');
}

/** Readable HTML for the source view: one block per line. */
export function formatHTML(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.childNodes, (node) => (node instanceof Element ? formatElement(node) : (node.textContent ?? '')))
    .filter((line) => line.trim())
    .join('\n');
}
