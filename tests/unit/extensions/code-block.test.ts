import { defineExtension } from '../../../src/extensions/factories';
import { createHighlightPlugin, loadLowlight } from '../../../src/extensions/blocks/codeHighlight';
import { slashKey } from '../../../src/extensions/tools/slashMenu';
import { flushPromises, makeEditor, press, typeText } from '../../helpers/editor';

describe('code block', () => {
  it('``` + space creates a code block with language', () => {
    const ed = makeEditor();
    typeText(ed, '```js ');
    expect(ed.getHTML()).toBe('<pre><code class="language-js"></code></pre>');
  });

  it('keeps whitespace and newlines', () => {
    const ed = makeEditor({ content: '<pre><code>  a\n    b</code></pre>' });
    expect(ed.getHTML()).toBe('<pre><code>  a\n    b</code></pre>');
  });

  it('drops unsafe language classes', () => {
    expect(makeEditor({ content: '<pre><code class=\'language-js" onclick="x\'>a</code></pre>' }).getHTML()).toBe('<pre><code>a</code></pre>');
  });

  it('Tab inserts indent inside code and Mod-Enter exits', () => {
    const ed = makeEditor();
    ed.exec('toggleCodeBlock');
    press(ed, 'Tab');
    typeText(ed, 'x');
    expect(ed.getHTML()).toBe('<pre><code>  x</code></pre>');
    press(ed, 'Mod-Enter');
    typeText(ed, 'y');
    expect(ed.getHTML()).toBe('<pre><code>  x</code></pre><p>y</p>');
  });

  it('setCodeLanguage validates and clears', () => {
    const ed = makeEditor({ content: '<pre><code>a</code></pre>' });
    expect(ed.exec('setCodeLanguage', 'python')).toBe(true);
    expect(ed.getHTML()).toBe('<pre><code class="language-python">a</code></pre>');
    expect(ed.exec('setCodeLanguage', 'bad lang!')).toBe(false);
    ed.exec('setCodeLanguage', null);
    expect(ed.getHTML()).toBe('<pre><code>a</code></pre>');
  });

  it('offers a language dropdown in the code block context', () => {
    const ed = makeEditor({ codeBlock: { languages: ['plaintext', 'python'] } });
    const item = ed.ui!.registry.get('codeLanguage')!;
    expect(item.contexts).toEqual(['codeBlock']);
    expect(item.options!.map((o) => o.id)).toEqual(['codeLanguage:plaintext', 'codeLanguage:python']);
  });

  it('slash menu is inactive inside code blocks', () => {
    const ed = makeEditor();
    ed.exec('toggleCodeBlock');
    typeText(ed, '/');
    expect(slashKey.getState(ed.state)!.active).toBe(false);
  });
});

describe('syntax highlighting', () => {
  const withLoader = (load: Parameters<typeof createHighlightPlugin>[0]) =>
    makeEditor({ extensions: [defineExtension({ name: 'testHighlight', plugins: () => [createHighlightPlugin(load)] })], disable: ['codeHighlight'] });

  it('loads the highlighter once, lazily, and decorates', async () => {
    const load = vi.fn(async () => () => [{ from: 0, to: 5, className: 'hljs-keyword' }]);
    const ed = withLoader(load);
    expect(load).not.toHaveBeenCalled();
    ed.exec('toggleCodeBlock');
    typeText(ed, 'const');
    await flushPromises();
    typeText(ed, ' a');
    expect(load).toHaveBeenCalledTimes(1);
    expect(ed.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });

  it('ignores a highlighter that resolves after destroy', async () => {
    let resolve!: (h: () => never[]) => void;
    const ed = withLoader(() => new Promise((r) => (resolve = r)));
    ed.exec('toggleCodeBlock');
    ed.destroy();
    resolve(() => []);
    await expect(flushPromises()).resolves.toBeUndefined();
  });

  it('the default loader highlights JavaScript with lowlight', async () => {
    const highlight = await loadLowlight();
    const ranges = highlight('const a = "x";', 'javascript');
    expect(ranges).toContainEqual({ from: 0, to: 5, className: 'hljs-keyword' });
    expect(highlight('x', null)).toEqual([]);
    expect(highlight('x', 'no-such-language')).toEqual([]);
  });
});
