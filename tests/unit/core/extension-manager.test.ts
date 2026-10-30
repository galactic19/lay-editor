import { EditorState, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model';
import { ExtensionManager } from '../../../src/core/ExtensionManager';
import { defineExtension } from '../../../src/extensions/factories';
import type { EditorError } from '../../../src/core/errors';
import { coreNodes, fakeConfig, fakeEditor } from '../../helpers/schema';

const noop = () => {};

describe('ExtensionManager', () => {
  it('throws DUPLICATE_EXTENSION', () => {
    expect(() => new ExtensionManager([coreNodes, defineExtension({ name: 'a' }), defineExtension({ name: 'a' })], fakeConfig(), noop))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_EXTENSION' }));
  });

  it('throws MISSING_DEPENDENCY', () => {
    expect(() => new ExtensionManager([coreNodes, defineExtension({ name: 'a', dependencies: ['zzz'] })], fakeConfig(), noop))
      .toThrowError(expect.objectContaining({ code: 'MISSING_DEPENDENCY' }));
  });

  it('throws MISSING_DEPENDENCY when a dependency is disabled', () => {
    const exts = [coreNodes, defineExtension({ name: 'a' }), defineExtension({ name: 'b', dependencies: ['a'] })];
    expect(() => new ExtensionManager(exts, fakeConfig({}, ['a']), noop)).toThrowError(expect.objectContaining({ code: 'MISSING_DEPENDENCY' }));
  });

  it('throws SCHEMA_CONFLICT for a node defined twice', () => {
    const a = defineExtension({ name: 'a', nodes: { box: { group: 'block', content: 'inline*' } } });
    const b = defineExtension({ name: 'b', nodes: { box: { group: 'block', content: 'inline*' } } });
    expect(() => new ExtensionManager([coreNodes, a, b], fakeConfig(), noop)).toThrowError(expect.objectContaining({ code: 'SCHEMA_CONFLICT' }));
  });

  it('orders by dependencies but keeps input order otherwise', () => {
    const a = defineExtension({ name: 'a' });
    const b = defineExtension({ name: 'b' });
    const c = defineExtension({ name: 'c', dependencies: ['a'] });
    const m = new ExtensionManager([coreNodes, c, a, b], fakeConfig(), noop);
    expect(m.resolved.map((r) => r.ext.name)).toEqual(['testCore', 'a', 'c', 'b']);
  });

  it('removes disabled extensions', () => {
    const m = new ExtensionManager([coreNodes, defineExtension({ name: 'a' })], fakeConfig({}, ['a']), noop);
    expect(m.resolved.map((r) => r.ext.name)).toEqual(['testCore']);
  });

  it('merges options from config.raw[optionsKey ?? name] over defaults, ignoring non-objects', () => {
    const a = defineExtension({ name: 'a', defaults: { x: 1, y: 2 } });
    const b = defineExtension({ name: 'b', optionsKey: 'shared', defaults: { z: 1 } });
    const c = defineExtension({ name: 'c', defaults: { w: 1 } });
    const m = new ExtensionManager([coreNodes, a, b, c], fakeConfig({ a: { y: 3 }, shared: { z: 9 }, c: 'text' }), noop);
    expect(m.resolved.map((r) => r.options)).toEqual([{}, { x: 1, y: 3 }, { z: 9 }, { w: 1 }]);
  });

  it('injects global attributes into parse and render', () => {
    const align = defineExtension({
      name: 'align',
      globalAttributes: [{
        types: ['paragraph'],
        attrs: {
          align: {
            default: null,
            parse: (dom) => dom.style.textAlign || null,
            render: (v) => (v ? { style: `text-align:${v}` } : null),
          },
        },
      }],
    });
    const indent = defineExtension({
      name: 'indent',
      globalAttributes: [{
        types: ['paragraph'],
        attrs: { indent: { default: 0, parse: (dom) => Number(dom.dataset.indent ?? 0), render: (v) => (v ? { 'data-indent': String(v) } : null) } },
      }],
    });
    const { schema } = new ExtensionManager([coreNodes, align, indent], fakeConfig(), noop);
    const host = document.createElement('div');
    host.innerHTML = '<p style="text-align:center" data-indent="2">a</p><p>b</p>';
    const doc = PMDOMParser.fromSchema(schema).parse(host);
    expect(doc.firstChild!.attrs).toEqual({ align: 'center', indent: 2 });
    expect(doc.lastChild!.attrs).toEqual({ align: null, indent: 0 });
    const out = document.createElement('div');
    out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
    expect(out.innerHTML).toBe('<p style="text-align: center;" data-indent="2">a</p><p>b</p>');
  });

  it('skips an extension whose plugins() throws and reports EXTENSION_FAILED', () => {
    const report = vi.fn<(e: EditorError) => void>();
    const good = new Plugin({});
    const bad = defineExtension({ name: 'bad', plugins: () => { throw new Error('boom'); } });
    const ok = defineExtension({ name: 'ok', plugins: () => [good] });
    const m = new ExtensionManager([coreNodes, bad, ok], fakeConfig(), report);
    const plugins = m.createPlugins(fakeEditor(), m.createCommands(fakeEditor()));
    expect(plugins).toContain(good);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXTENSION_FAILED' }));
  });

  it('collects keymaps by priority (higher first) and resolves command names', () => {
    const calls: string[] = [];
    const low = defineExtension({
      name: 'low',
      priority: 1,
      keymap: () => ({ Enter: 'lowCmd', 'Mod-b': 'lowCmd' }),
      commands: () => ({ lowCmd: () => () => (calls.push('low'), true) }),
    });
    const high = defineExtension({ name: 'high', priority: 500, keymap: () => ({ Enter: () => (calls.push('high'), true) }) });
    const m = new ExtensionManager([coreNodes, low, high], fakeConfig(), noop);
    const plugins = m.createPlugins(fakeEditor(), m.createCommands(fakeEditor()));
    const state = EditorState.create({ schema: m.schema, plugins });
    const view = { state, dispatch: () => {} } as unknown as EditorView;
    const press = (key: string, mod = false) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: mod });
      for (const p of plugins) if (p.props.handleKeyDown?.call(p, view, event)) return;
    };
    press('Enter');
    press('b', true);
    expect(calls).toEqual(['high', 'low']);
  });

  it('later UI items with the same id win', () => {
    const a = defineExtension({ name: 'a', ui: () => [{ id: 'x', kind: 'button', icon: 'a', label: 'a', contexts: ['text'] }] });
    const b = defineExtension({ name: 'b', ui: () => [{ id: 'x', kind: 'button', icon: 'b', label: 'b', contexts: ['text'] }] });
    const m = new ExtensionManager([coreNodes, a, b], fakeConfig(), noop);
    expect(m.createUIRegistry(fakeEditor()).get('x')!.icon).toBe('b');
  });

  it('buildSchema works without an editor', () => {
    expect(ExtensionManager.buildSchema([coreNodes]).nodes.paragraph).toBeDefined();
  });
});
