import type { Attrs, MarkSpec, MarkType, NodeSpec, ParseRule, TagParseRule } from 'prosemirror-model';
import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { InputRule, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { Command } from 'prosemirror-state';
import { EditorError } from '../core/errors';
import { deepMerge } from '../core/merge';
import { isNodeActive } from '../core/state-utils';
import type { Extension, ExtensionContext, UIItem } from '../core/types';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function commandName(verb: string, name: string): string {
  return verb + capitalize(name);
}

export function defineExtension<O = any>(ext: Extension<O>): Extension<O> {
  if (!ext.name) throw new EditorError('INVALID_OPTION', 'extension name is empty');
  return ext;
}

type Ctx = ExtensionContext<any>;
type RecordField = 'commands' | 'keymap' | 'nodeViews';
type ListField = 'inputRules' | 'plugins' | 'ui' | 'components';
const RECORD_FIELDS: RecordField[] = ['commands', 'keymap', 'nodeViews'];
const LIST_FIELDS: ListField[] = ['inputRules', 'plugins', 'ui', 'components'];

/** Merges `extend` into `base`: function fields from both sides combine, extend wins on clashes. */
export function extendExtension<O>(base: Extension<O>, extend?: Partial<Extension<O>>): Extension<O> {
  if (!extend) return base;
  const merged: Extension<O> = { ...base, ...extend, name: extend.name ?? base.name };
  for (const field of RECORD_FIELDS) {
    const a = base[field] as ((ctx: Ctx) => object) | undefined;
    const b = extend[field] as ((ctx: Ctx) => object) | undefined;
    if (a && b) (merged[field] as unknown) = (ctx: Ctx) => ({ ...a(ctx), ...b(ctx) });
  }
  for (const field of LIST_FIELDS) {
    const a = base[field] as ((ctx: Ctx) => unknown[]) | undefined;
    const b = extend[field] as ((ctx: Ctx) => unknown[]) | undefined;
    if (a && b) (merged[field] as unknown) = (ctx: Ctx) => [...a(ctx), ...b(ctx)];
  }
  if (base.nodes && extend.nodes) merged.nodes = { ...base.nodes, ...extend.nodes };
  if (base.marks && extend.marks) merged.marks = { ...base.marks, ...extend.marks };
  merged.globalAttributes = concatOptional(base.globalAttributes, extend.globalAttributes);
  merged.pasteCleaners = concatOptional(base.pasteCleaners, extend.pasteCleaners);
  merged.dependencies = concatOptional(base.dependencies, extend.dependencies);
  if (base.defaults !== undefined && extend.defaults !== undefined) merged.defaults = deepMerge(base.defaults, extend.defaults as never);
  if (base.onCreate && extend.onCreate) {
    const [a, b] = [base.onCreate, extend.onCreate];
    merged.onCreate = (ctx) => {
      const cleanups = [a(ctx), b(ctx)];
      return () => cleanups.forEach((fn) => fn?.());
    };
  }
  return merged;
}

function concatOptional<T>(a?: T[], b?: T[]): T[] | undefined {
  return a || b ? [...(a ?? []), ...(b ?? [])] : undefined;
}

/** Wraps the last capture group of `pattern` in a mark when typed. */
export function markInputRule(pattern: RegExp, type: MarkType, attrs?: Attrs): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const captured = match[match.length - 1];
    const full = match[0];
    if (!captured) return null;
    const tr = state.tr;
    const leading = full.search(/\S/);
    const textStart = start + full.indexOf(captured);
    const textEnd = textStart + captured.length;
    if (textEnd < end) tr.delete(textEnd, end);
    if (textStart > start + leading) tr.delete(start + leading, textStart);
    const markStart = start + leading;
    tr.addMark(markStart, markStart + captured.length, type.create(attrs));
    tr.removeStoredMark(type);
    return tr;
  });
}

export const removeMark =
  (type: MarkType): Command =>
  (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (dispatch) dispatch(empty ? state.tr.removeStoredMark(type) : state.tr.removeMark(from, to, type));
    return true;
  };

/** Adds (or replaces) a mark over the selection, or stores it for the next input when empty. */
export const applyMark =
  (type: MarkType, attrs?: Attrs): Command =>
  (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const mark = type.create(attrs);
    if (dispatch) dispatch(empty ? state.tr.addStoredMark(mark) : state.tr.addMark(from, to, mark));
    return true;
  };

export interface MarkExtensionConfig {
  name: string;
  tags: string[];
  parse?: ParseRule[];
  toDOM?: MarkSpec['toDOM'];
  attrs?: MarkSpec['attrs'];
  excludes?: string;
  inclusive?: boolean;
  shortcut?: string;
  icon: string;
  inputRule?: RegExp;
  extend?: Partial<Extension>;
}

export function markExtension(cfg: MarkExtensionConfig): Extension {
  const { name, tags, shortcut, icon } = cfg;
  const toggle = commandName('toggle', name);
  const unset = commandName('unset', name);
  const spec: MarkSpec = {
    parseDOM: [...tags.map((tag) => ({ tag })), ...(cfg.parse ?? [])],
    toDOM: cfg.toDOM ?? (() => [tags[0]!, 0]),
  };
  if (cfg.attrs) spec.attrs = cfg.attrs;
  if (cfg.excludes !== undefined) spec.excludes = cfg.excludes;
  if (cfg.inclusive !== undefined) spec.inclusive = cfg.inclusive;
  const ui: UIItem = {
    id: name,
    kind: 'button',
    icon,
    label: `toolbar.${name}`,
    command: toggle,
    contexts: ['text', 'table'],
    isActive: (editor) => editor.isActive(name),
  };
  if (shortcut) ui.shortcut = shortcut;
  return extendExtension(
    defineExtension({
      name,
      marks: { [name]: spec },
      commands: ({ schema }) => ({
        [toggle]: (attrs?: Attrs) => toggleMark(schema.marks[name]!, attrs),
        [unset]: () => removeMark(schema.marks[name]!),
      }),
      keymap: () => (shortcut ? { [shortcut]: toggle } : {}),
      inputRules: ({ schema }) => (cfg.inputRule ? [markInputRule(cfg.inputRule, schema.marks[name]!)] : []),
      ui: () => [ui],
    }),
    cfg.extend,
  );
}

export interface BlockExtensionConfig {
  name: string;
  kind: 'textblock' | 'wrapper';
  tag: string;
  content?: string;
  group?: string;
  attrs?: NodeSpec['attrs'];
  parse?: TagParseRule[];
  toDOM?: NodeSpec['toDOM'];
  defining?: boolean;
  code?: boolean;
  marks?: string;
  shortcut?: string;
  /** Without an icon no UI item is generated. */
  icon?: string;
  inputRule?: { pattern: RegExp; attrs?(match: RegExpMatchArray): Attrs };
  slash?: { keywords: string[] };
  extend?: Partial<Extension>;
}

export function blockExtension(cfg: BlockExtensionConfig): Extension {
  const { name, kind, tag, shortcut, icon } = cfg;
  const isTextblock = kind === 'textblock';
  const toggle = commandName('toggle', name);
  const spec: NodeSpec = {
    group: cfg.group ?? 'block',
    content: cfg.content ?? (isTextblock ? 'inline*' : 'block+'),
    parseDOM: [{ tag }, ...(cfg.parse ?? [])],
    toDOM: cfg.toDOM ?? (() => [tag, 0]),
  };
  if (cfg.attrs) spec.attrs = cfg.attrs;
  if (cfg.defining !== undefined) spec.defining = cfg.defining;
  if (cfg.code !== undefined) spec.code = cfg.code;
  if (cfg.marks !== undefined) spec.marks = cfg.marks;

  const commands = ({ schema }: Ctx) => {
    const type = schema.nodes[name]!;
    if (!isTextblock) {
      const toggleWrap: Command = (state, dispatch) => (isNodeActive(state, type) ? lift(state, dispatch) : wrapIn(type)(state, dispatch));
      return { [toggle]: () => toggleWrap };
    }
    const toggleBlock =
      (attrs?: Attrs): Command =>
      (state, dispatch) =>
        isNodeActive(state, type, attrs)
          ? setBlockType(schema.nodes.paragraph!)(state, dispatch)
          : setBlockType(type, attrs)(state, dispatch);
    return { [commandName('set', name)]: (attrs?: Attrs) => setBlockType(type, attrs), [toggle]: toggleBlock };
  };

  const inputRules = ({ schema }: Ctx) => {
    const rule = cfg.inputRule;
    if (!rule) return [];
    const type = schema.nodes[name]!;
    const attrs = rule.attrs ?? (() => ({}));
    return [isTextblock ? textblockTypeInputRule(rule.pattern, type, attrs) : wrappingInputRule(rule.pattern, type, attrs)];
  };

  const ui = (): UIItem[] => {
    if (!icon) return [];
    const item: UIItem = {
      id: name,
      kind: 'button',
      icon,
      label: `toolbar.${name}`,
      command: toggle,
      contexts: ['text'],
      isActive: (editor) => editor.isActive(name),
    };
    if (shortcut) item.shortcut = shortcut;
    if (cfg.slash) item.slash = cfg.slash;
    return [item];
  };

  return extendExtension(
    defineExtension({
      name,
      nodes: { [name]: spec },
      commands,
      keymap: () => (shortcut ? { [shortcut]: toggle } : {}),
      inputRules,
      ui,
    }),
    cfg.extend,
  );
}
