import { AllSelection, TextSelection } from 'prosemirror-state';
import { findText, makeEditor, press, typeText } from '../helpers/editor';
import type { Editor } from '../../src/core/Editor';

const caretAt = (ed: Editor, pos: number): void => {
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)));
};
const caretAfter = (ed: Editor, text: string): void => caretAt(ed, findText(ed, text) + text.length);
const selectAll = (ed: Editor): void => {
  ed.view.dispatch(ed.state.tr.setSelection(new AllSelection(ed.state.doc)));
};

describe('code block conversion keeps lines (#12)', () => {
  it('line breaks become newlines in the code block', () => {
    const ed = makeEditor({ content: '<p>const a = 1;<br>const b = 2;<br>console.log(a + b);</p>' });
    caretAfter(ed, 'const a');
    expect(ed.exec('toggleCodeBlock')).toBe(true);
    expect(ed.getHTML()).toBe('<pre><code>const a = 1;\nconst b = 2;\nconsole.log(a + b);</code></pre>');
  });

  it('selected paragraphs join into one code block, one line each', () => {
    const ed = makeEditor({ content: '<p>function f() {</p><p>return 1;</p><p>}</p>' });
    selectAll(ed);
    ed.exec('toggleCodeBlock');
    expect(ed.getHTML()).toBe('<pre><code>function f() {\nreturn 1;\n}</code></pre>');
  });

  it('code lines split back into paragraphs and the caret stays on its line', () => {
    const ed = makeEditor({ content: '<pre><code class="language-js">line1\n\nline2</code></pre>' });
    caretAfter(ed, 'line2');
    ed.exec('toggleCodeBlock');
    expect(ed.getHTML()).toBe('<p>line1</p><p></p><p>line2</p>');
    typeText(ed, '!');
    expect(ed.getHTML()).toBe('<p>line1</p><p></p><p>line2!</p>');
  });

  it('other block types keep newlines as line breaks', () => {
    const ed = makeEditor({ content: '<pre><code>a\nb</code></pre>' });
    ed.exec('setHeading', 2);
    expect(ed.getHTML()).toBe('<h2>a<br>b</h2>');
  });
});

describe('leaving a code block (#16)', () => {
  const lastCode = (text: string): Editor => {
    const ed = makeEditor({ content: `<pre><code class="language-js">${text}</code></pre>` });
    caretAt(ed, ed.state.doc.content.size - 1);
    return ed;
  };

  it.each(['ArrowDown', 'ArrowRight'])('%s at the end of the last code block adds a paragraph after it', (key) => {
    const ed = lastCode('x();');
    expect(press(ed, key)).toBe(true);
    typeText(ed, 'A');
    expect(ed.getHTML()).toBe('<pre><code class="language-js">x();</code></pre><p>A</p>');
  });

  it('arrows keep their native behaviour when something follows or the caret is mid-line', () => {
    const ed = makeEditor({ content: '<pre><code>x();</code></pre><p>after</p>' });
    caretAfter(ed, 'x();');
    expect(press(ed, 'ArrowRight')).toBe(false);
    caretAt(ed, 1);
    expect(press(ed, 'ArrowRight')).toBe(false);
  });

  it('Enter on the second empty trailing line drops the blank lines and leaves the block', () => {
    const ed = lastCode('x();');
    press(ed, 'Enter');
    press(ed, 'Enter');
    expect(ed.getHTML()).toBe('<pre><code class="language-js">x();\n\n</code></pre>');
    press(ed, 'Enter');
    typeText(ed, 'B');
    expect(ed.getHTML()).toBe('<pre><code class="language-js">x();</code></pre><p>B</p>');
  });

  it('a typed newline (Android sends no Enter key in <pre>) leaves the block the same way', () => {
    const ed = lastCode('x();\n\n');
    typeText(ed, '\nB');
    expect(ed.getHTML()).toBe('<pre><code class="language-js">x();</code></pre><p>B</p>');
  });

  it('blank lines in the middle of the code keep Enter as a newline', () => {
    const ed = makeEditor({ content: '<pre><code>a\n\nb</code></pre>' });
    caretAt(ed, findText(ed, 'b'));
    press(ed, 'Enter');
    expect(ed.getHTML()).toBe('<pre><code>a\n\n\nb</code></pre>');
  });
});
