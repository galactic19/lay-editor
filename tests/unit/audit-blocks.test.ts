import { AllSelection, TextSelection } from 'prosemirror-state';
import { findText, makeEditor, typeText } from '../helpers/editor';
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
