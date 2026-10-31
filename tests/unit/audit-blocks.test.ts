import { AllSelection, TextSelection } from 'prosemirror-state';
import { findText, makeEditor, press, typeText } from '../helpers/editor';
import type { Editor } from '../../src/core/Editor';
import { filterSlashItems, slashKey } from '../../src/extensions/tools/slashMenu';
import type { UIItem } from '../../src/core/types';

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

describe('divider in an empty list item (#19)', () => {
  it('--- in an empty bullet item puts the caret after the divider', () => {
    const ed = makeEditor();
    typeText(ed, '- first');
    press(ed, 'Enter');
    typeText(ed, '---');
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph');
    typeText(ed, 'next');
    expect(ed.getHTML()).toBe('<ul><li><p>first</p></li><li><p></p><hr><p>next</p></li></ul>');
  });

  it('insertHorizontalRule in an empty task item does the same', () => {
    const ed = makeEditor({ content: '<ul data-type="taskList"><li data-checked="false"><p>first</p></li><li data-checked="false"><p></p></li></ul>' });
    caretAt(ed, ed.state.doc.content.size - 3);
    expect(ed.exec('insertHorizontalRule')).toBe(true);
    typeText(ed, 'next');
    expect(ed.getHTML()).toBe('<ul data-type="taskList"><li data-checked="false"><p>first</p></li><li data-checked="false"><p></p><hr><p>next</p></li></ul>');
  });
});

describe('checklist toggle converts the whole list (#20)', () => {
  const BULLET = '<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>';
  const TASK = '<ul data-type="taskList"><li data-checked="false"><p>a</p></li><li data-checked="false"><p>b</p></li><li data-checked="false"><p>c</p></li></ul>';

  it.each(['a', 'b'])('caret in "%s" turns every item into a task and keeps the caret', (text) => {
    const ed = makeEditor({ content: BULLET });
    caretAfter(ed, text);
    expect(ed.exec('toggleTaskList')).toBe(true);
    expect(ed.getHTML()).toBe(TASK);
    typeText(ed, '!');
    expect(ed.getHTML()).toBe(TASK.replace(`<p>${text}</p>`, `<p>${text}!</p>`));
  });

  it('a task list turns back into one ordered list', () => {
    const ed = makeEditor({ content: TASK.replace('data-checked="false"', 'data-checked="true"') });
    caretAfter(ed, 'a');
    ed.exec('toggleOrderedList');
    expect(ed.getHTML()).toBe('<ol><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ol>');
  });

  it('works inside a nested list, both ways', () => {
    const ed = makeEditor({ content: '<ul><li><p>parent</p><ul><li><p>x</p></li><li><p>y</p></li></ul></li></ul>' });
    caretAfter(ed, 'y');
    expect(ed.can('toggleTaskList')).toBe(true);
    ed.exec('toggleTaskList');
    expect(ed.getHTML()).toBe('<ul><li><p>parent</p><ul data-type="taskList"><li data-checked="false"><p>x</p></li><li data-checked="false"><p>y</p></li></ul></li></ul>');
    ed.exec('toggleBulletList');
    expect(ed.getHTML()).toBe('<ul><li><p>parent</p><ul><li><p>x</p></li><li><p>y</p></li></ul></li></ul>');
  });
});

describe('slash menu leaves prose alone (#31)', () => {
  it.each(['A / B', '1 / 2', 'and / or', 'x / y'])('"%s" then Enter starts a new paragraph', (text) => {
    const ed = makeEditor();
    typeText(ed, text);
    expect(slashKey.getState(ed.state)!.active).toBe(false);
    press(ed, 'Enter');
    typeText(ed, 'next');
    expect(ed.getHTML()).toBe(`<p>${text}</p><p>next</p>`);
  });

  it('a query with a space closes the menu even when it would match', () => {
    const ed = makeEditor({ locale: 'en' });
    typeText(ed, '/heading');
    expect(slashKey.getState(ed.state)!.active).toBe(true);
    typeText(ed, ' ');
    expect(slashKey.getState(ed.state)!.active).toBe(false);
  });

  it('matches the start of a label word or keyword, not text inside a word', () => {
    const t = (key: string) => key;
    const table: UIItem = { id: 'table', kind: 'button', icon: 'x', label: 'Insert table', contexts: ['text'], slash: { keywords: ['grid'] } };
    const ids = (query: string) => filterSlashItems([table], query, t).map((item) => item.id);
    expect(ids('ta')).toEqual(['table']);
    expect(ids('INS')).toEqual(['table']);
    expect(ids('gr')).toEqual(['table']);
    expect(ids('able')).toEqual([]);
    expect(ids('b')).toEqual([]);
  });
});

describe('typed spaces survive saving (#18)', () => {
  const roundTrip = (ed: Editor): string => {
    const saved = ed.getHTML();
    ed.setHTML(saved);
    expect(ed.getHTML()).toBe(saved);
    return saved;
  };

  it('runs of spaces and leading spaces alternate with no-break spaces and reload unchanged', () => {
    const ed = makeEditor();
    typeText(ed, 'Name:    Kim');
    press(ed, 'Enter');
    typeText(ed, '    indented line');
    expect(roundTrip(ed)).toBe('<p>Name: &nbsp; &nbsp;Kim</p><p>&nbsp;&nbsp; &nbsp;indented line</p>');
  });

  it('spaces at line edges, around breaks and across marks stay visible', () => {
    const ed = makeEditor({ content: '<p>a<br>b</p>' });
    caretAfter(ed, 'a');
    typeText(ed, '  ');
    caretAfter(ed, 'b');
    typeText(ed, ' c ');
    expect(roundTrip(ed)).toBe('<p>a &nbsp;<br>b c&nbsp;</p>');
    const marked = makeEditor({ content: '<p>a <strong>b</strong></p>' });
    caretAt(marked, findText(marked, 'b'));
    marked.exec('toggleBold');
    typeText(marked, ' ');
    expect(roundTrip(marked)).toBe('<p>a <strong>&nbsp;b</strong></p>');
  });

  it('leaves single spaces between words and code blocks alone', () => {
    const ed = makeEditor({ content: '<p>a b c</p><pre><code>  a\n    b</code></pre>' });
    expect(roundTrip(ed)).toBe('<p>a b c</p><pre><code>  a\n    b</code></pre>');
  });
});
