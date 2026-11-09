import { EditorState, TextSelection } from 'prosemirror-state';
import type { TagParseRule } from 'prosemirror-model';
import { blockExtension, commandName, defineExtension, markExtension } from '../../../src/extensions/factories';
import { coreNodes, fakeCtx } from '../../helpers/schema';
import { ExtensionManager } from '../../../src/core/ExtensionManager';

describe('commandName', () => {
  it('camel-cases verb and name', () => {
    expect(commandName('toggle', 'codeBlock')).toBe('toggleCodeBlock');
  });
});

describe('defineExtension', () => {
  it('rejects an empty name with INVALID_OPTION', () => {
    expect(() => defineExtension({ name: '' })).toThrowError(expect.objectContaining({ code: 'INVALID_OPTION' }));
  });
});

describe('markExtension', () => {
  it('generates spec, toggle command, keymap and UI item', () => {
    const ext = markExtension({ name: 'bold', tags: ['strong', 'b'], shortcut: 'Mod-b', icon: 'bold' });
    expect(ext.marks!.bold!.parseDOM!.map((r) => (r as TagParseRule).tag)).toEqual(['strong', 'b']);
    const ctx = fakeCtx(ext);
    expect(Object.keys(ext.commands!(ctx))).toEqual(['toggleBold', 'unsetBold']);
    expect(ext.keymap!(ctx)).toEqual({ 'Mod-b': 'toggleBold' });
    expect(ext.ui!(ctx)[0]).toMatchObject({ id: 'bold', command: 'toggleBold', label: 'toolbar.bold', contexts: ['text', 'table'] });
  });

  it('toggle command adds and removes the mark', () => {
    const ext = markExtension({ name: 'bold', tags: ['strong'], icon: 'bold' });
    const ctx = fakeCtx(ext);
    const { schema } = ctx;
    let state = EditorState.create({ doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('ab')])]) });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 3)));
    const toggle = ext.commands!(ctx).toggleBold!();
    toggle(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.rangeHasMark(1, 3, schema.marks.bold!)).toBe(true);
    toggle(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.rangeHasMark(1, 3, schema.marks.bold!)).toBe(false);
  });
});

describe('blockExtension', () => {
  it('wrapper toggles via wrapIn/lift', () => {
    const ext = blockExtension({ name: 'blockquote', kind: 'wrapper', tag: 'blockquote', icon: 'quote' });
    const ctx = fakeCtx(ext);
    const { schema } = ctx;
    let state = EditorState.create({ doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('a')])]) });
    const toggle = ext.commands!(ctx).toggleBlockquote!();
    toggle(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.firstChild!.type.name).toBe('blockquote');
    toggle(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.firstChild!.type.name).toBe('paragraph');
  });

  it('textblock creates set and toggle commands that fall back to paragraph', () => {
    const ext = blockExtension({ name: 'heading', kind: 'textblock', tag: 'h1', icon: 'heading' });
    const ctx = fakeCtx(ext);
    const { schema } = ctx;
    let state = EditorState.create({ doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('a')])]) });
    const cmds = ext.commands!(ctx);
    expect(Object.keys(cmds)).toEqual(['setHeading', 'toggleHeading']);
    cmds.toggleHeading!()(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.firstChild!.type.name).toBe('heading');
    cmds.toggleHeading!()(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.firstChild!.type.name).toBe('paragraph');
  });

  it('generates no UI item without an icon', () => {
    const ext = blockExtension({ name: 'heading', kind: 'textblock', tag: 'h1' });
    expect(ext.ui?.(fakeCtx(ext)) ?? []).toEqual([]);
  });
});

describe('extend', () => {
  it('merges function fields from both sides; extend wins on key clashes', () => {
    const ext = markExtension({
      name: 'bold',
      tags: ['strong'],
      icon: 'bold',
      extend: { commands: () => ({ extra: () => () => true, unsetBold: () => () => false }) },
    });
    const cmds = ext.commands!(fakeCtx(ext));
    expect(Object.keys(cmds).sort()).toEqual(['extra', 'toggleBold', 'unsetBold']);
    expect(cmds.unsetBold!()(null as never)).toBe(false);
  });

  it('composes onCreate cleanups from both sides', () => {
    const calls: string[] = [];
    const ext = defineExtension({ name: 'x', onCreate: () => () => calls.push('a') });
    const merged = markExtension({ name: 'm', tags: ['b'], icon: 'i', extend: { onCreate: () => () => calls.push('b') } });
    const m = new ExtensionManager([coreNodes, ext, merged], { raw: {}, disable: [] } as never, () => {});
    m.runCreate({ t: () => '' } as never);
    m.runDestroy();
    expect(calls.sort()).toEqual(['a', 'b']);
  });
});
