import { Schema, type DOMOutputSpec, type MarkSpec, type Node as PMNode, type NodeSpec, type TagParseRule } from 'prosemirror-model';
import type { Command, Plugin } from 'prosemirror-state';
import { inputRules as inputRulesPlugin, type InputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { NodeViewConstructor } from 'prosemirror-view';
import { checkOptionShape } from './config';
import type { Editor } from './Editor';
import { EditorError } from './errors';
import { deepMerge, isPlainObject } from './merge';
import type {
  CommandFactory,
  ComponentSpec,
  EditorConfig,
  Extension,
  ExtensionContext,
  ExtNodeSpec,
  GlobalAttributeSpec,
  PasteCleaner,
  UIItem,
} from './types';

const DEFAULT_PRIORITY = 100;

export interface ResolvedExtension {
  ext: Extension;
  options: unknown;
}

/** Collects extensions into a schema, plugins, commands and UI registries. */
export class ExtensionManager {
  readonly schema: Schema;
  readonly resolved: ReadonlyArray<ResolvedExtension>;
  private readonly failed = new Set<string>();
  private cleanups: Array<() => void> = [];

  constructor(
    extensions: Extension[],
    private readonly config: EditorConfig,
    private readonly report: (error: EditorError) => void,
  ) {
    const ordered = sortExtensions(extensions.filter((ext) => !config.disable.includes(ext.name)));
    this.resolved = ordered.map((ext) => ({ ext, options: resolveOptions(ext, config) }));
    this.schema = buildSchemaFrom(ordered);
  }

  /** Schema without an editor (used by sanitizeHTML). */
  static buildSchema(extensions: Extension[], disable: string[] = []): Schema {
    return buildSchemaFrom(sortExtensions(extensions.filter((ext) => !disable.includes(ext.name))));
  }

  createCommands(editor: Editor): Map<string, CommandFactory> {
    const commands = new Map<string, CommandFactory>();
    for (const [ext, ctx] of this.contexts(editor)) {
      const record = this.safely(ext, () => ext.commands?.(ctx), undefined);
      for (const [name, factory] of Object.entries(record ?? {})) commands.set(name, factory);
    }
    return commands;
  }

  createPlugins(editor: Editor, commands: Map<string, CommandFactory>): Plugin[] {
    const byPriority = [...this.contexts(editor)].sort(([a], [b]) => priorityOf(b) - priorityOf(a));
    const rules: InputRule[] = [];
    const plugins: Plugin[] = [];
    for (const [ext, ctx] of byPriority) {
      rules.push(...this.safely(ext, () => ext.inputRules?.(ctx) ?? [], []));
      const bindings = this.safely(ext, () => ext.keymap?.(ctx), undefined);
      if (bindings && Object.keys(bindings).length) plugins.push(keymap(resolveBindings(bindings, commands)));
      plugins.push(...this.safely(ext, () => ext.plugins?.(ctx) ?? [], []));
    }
    return rules.length ? [inputRulesPlugin({ rules }), ...plugins] : plugins;
  }

  createNodeViews(editor: Editor): Record<string, NodeViewConstructor> {
    const views: Record<string, NodeViewConstructor> = {};
    for (const [ext, ctx] of this.contexts(editor)) Object.assign(views, this.safely(ext, () => ext.nodeViews?.(ctx), undefined));
    return views;
  }

  pasteCleaners(): PasteCleaner[] {
    return this.active().flatMap(({ ext }) => ext.pasteCleaners ?? []);
  }

  createUIRegistry(editor: Editor): Map<string, UIItem> {
    const registry = new Map<string, UIItem>();
    for (const [ext, ctx] of this.contexts(editor)) {
      for (const item of this.safely(ext, () => ext.ui?.(ctx) ?? [], [])) registry.set(item.id, item);
    }
    return registry;
  }

  createComponents(editor: Editor): ComponentSpec[] {
    return [...this.contexts(editor)].flatMap(([ext, ctx]) => this.safely(ext, () => ext.components?.(ctx) ?? [], []));
  }

  runCreate(editor: Editor): void {
    for (const [ext, ctx] of this.contexts(editor)) {
      const cleanup = this.safely(ext, () => ext.onCreate?.(ctx), undefined);
      if (cleanup) this.cleanups.push(cleanup);
    }
  }

  runDestroy(): void {
    for (const cleanup of this.cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    }
    this.cleanups = [];
  }

  private active(): ResolvedExtension[] {
    return this.resolved.filter(({ ext }) => !this.failed.has(ext.name));
  }

  private *contexts(editor: Editor): Generator<[Extension, ExtensionContext]> {
    for (const { ext, options } of this.active()) {
      yield [ext, { editor, options, schema: this.schema, config: this.config, t: (key, params) => editor.t(key, params) }];
    }
  }

  private safely<T>(ext: Extension, run: () => T, fallback: T): T {
    if (this.failed.has(ext.name)) return fallback;
    try {
      return run();
    } catch (cause) {
      this.failed.add(ext.name);
      this.report(new EditorError('EXTENSION_FAILED', ext.name, { cause }));
      return fallback;
    }
  }
}

const priorityOf = (ext: Extension): number => ext.priority ?? DEFAULT_PRIORITY;

function resolveOptions(ext: Extension, config: EditorConfig): unknown {
  const key = ext.optionsKey ?? ext.name;
  const raw = config.raw[key];
  checkOptionShape(key, ext.defaults, raw);
  return deepMerge(ext.defaults ?? {}, isPlainObject(raw) ? raw : undefined);
}

function resolveBindings(bindings: Record<string, string | Command>, commands: Map<string, CommandFactory>): Record<string, Command> {
  const resolved: Record<string, Command> = {};
  for (const [key, binding] of Object.entries(bindings)) {
    resolved[key] =
      typeof binding === 'string' ? (state, dispatch, view) => commands.get(binding)?.()(state, dispatch, view) ?? false : binding;
  }
  return resolved;
}

/** Dependency-first topological order; input order is kept otherwise. */
function sortExtensions(extensions: Extension[]): Extension[] {
  const byName = new Map<string, Extension>();
  for (const ext of extensions) {
    if (byName.has(ext.name)) throw new EditorError('DUPLICATE_EXTENSION', ext.name);
    byName.set(ext.name, ext);
  }
  const ordered: Extension[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (ext: Extension): void => {
    const mark = state.get(ext.name);
    if (mark === 'done') return;
    if (mark === 'visiting') throw new EditorError('INVALID_OPTION', `circular dependency at ${ext.name}`);
    state.set(ext.name, 'visiting');
    for (const dep of ext.dependencies ?? []) {
      const target = byName.get(dep);
      if (!target) throw new EditorError('MISSING_DEPENDENCY', `${ext.name} requires ${dep}`);
      visit(target);
    }
    state.set(ext.name, 'done');
    ordered.push(ext);
  };
  extensions.forEach(visit);
  return ordered;
}

function buildSchemaFrom(extensions: Extension[]): Schema {
  const nodes: Record<string, ExtNodeSpec> = {};
  const marks: Record<string, MarkSpec> = {};
  for (const ext of extensions) {
    collectSpecs(nodes, ext.nodes, 'node');
    collectSpecs(marks, ext.marks, 'mark');
  }
  for (const spec of extensions.flatMap((ext) => ext.globalAttributes ?? [])) applyGlobalAttributes(nodes, spec);
  return new Schema({ nodes, marks });
}

function collectSpecs<S>(target: Record<string, S>, source: Record<string, S> | undefined, kind: string): void {
  for (const [name, spec] of Object.entries(source ?? {})) {
    if (name in target) throw new EditorError('SCHEMA_CONFLICT', `${kind} "${name}"`);
    target[name] = spec;
  }
}

function applyGlobalAttributes(nodes: Record<string, NodeSpec>, spec: GlobalAttributeSpec): void {
  const entries = Object.entries(spec.attrs);
  for (const typeName of spec.types) {
    const node = nodes[typeName];
    if (!node) continue;
    const attrs = { ...(node.attrs ?? {}) };
    for (const [name, attr] of entries) attrs[name] = { default: attr.default };
    const parseDOM = node.parseDOM?.map((rule) => {
      if (!('tag' in rule)) return rule;
      const original = rule.getAttrs;
      const getAttrs = (dom: HTMLElement) => {
        const base = original ? original(dom) : (rule.attrs ?? null);
        if (base === false) return false;
        const extra = Object.fromEntries(entries.map(([name, attr]) => [name, attr.parse(dom) ?? attr.default]));
        return { ...(base ?? {}), ...extra };
      };
      return { ...rule, getAttrs } as TagParseRule;
    });
    const toDOM = node.toDOM;
    nodes[typeName] = {
      ...node,
      attrs,
      ...(parseDOM ? { parseDOM } : {}),
      ...(toDOM
        ? {
            toDOM: (pmNode: PMNode) =>
              injectAttrs(toDOM(pmNode), Object.assign({}, ...entries.map(([name, attr]) => attr.render(pmNode.attrs[name])))),
          }
        : {}),
    };
  }
}

/** Adds attributes to a DOMOutputSpec; `style` values are concatenated. */
function injectAttrs(out: DOMOutputSpec, extra: Record<string, string>): DOMOutputSpec {
  if (!Object.keys(extra).length) return out;
  if (Array.isArray(out)) {
    const [tag, maybeAttrs, ...rest] = out as unknown as [string, unknown, ...unknown[]];
    if (isPlainObject(maybeAttrs)) return [tag, mergeAttrs(maybeAttrs as Record<string, string>, extra), ...rest] as DOMOutputSpec;
    return (maybeAttrs === undefined ? [tag, extra] : [tag, extra, maybeAttrs, ...rest]) as DOMOutputSpec;
  }
  const dom = (out instanceof HTMLElement ? out : (out as { dom: Node }).dom) as HTMLElement;
  for (const [key, value] of Object.entries(mergeAttrs({ style: dom.getAttribute('style') ?? '' }, extra))) {
    if (value) dom.setAttribute(key, value);
  }
  return out;
}

function mergeAttrs(base: Record<string, string>, extra: Record<string, string>): Record<string, string> {
  const merged = { ...base, ...extra };
  if (base.style && extra.style) merged.style = `${base.style.replace(/;?\s*$/, '')};${extra.style}`;
  return merged;
}
