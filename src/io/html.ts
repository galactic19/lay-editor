import { DOMParser as PMDOMParser, DOMSerializer, Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { ExtNodeSpec } from '../core/types';

export function parseHTML(schema: Schema, html: string | null | undefined): PMNode {
  const dom = new window.DOMParser().parseFromString(`<!doctype html><body>${html ?? ''}</body>`, 'text/html');
  return PMDOMParser.fromSchema(schema).parse(dom.body);
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

function stripTransient(node: PMNode): PMNode {
  if (node.isLeaf) return node;
  const children: PMNode[] = [];
  node.forEach((child) => {
    if (!isTransient(child)) children.push(stripTransient(child));
  });
  return node.copy(Fragment.fromArray(children));
}

export function serializeHTML(schema: Schema, doc: PMNode): string {
  const clean = stripTransient(doc);
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
