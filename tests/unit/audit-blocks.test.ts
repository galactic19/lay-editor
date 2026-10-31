import { AllSelection, TextSelection } from 'prosemirror-state';
import { findText, makeEditor, press, selectText, typeText } from '../helpers/editor';
import type { Editor } from '../../src/core/Editor';
import { filterSlashItems, slashItems, slashKey } from '../../src/extensions/tools/slashMenu';

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

  it.each(['ArrowDown', 'ArrowRight'])('%s at the end of a code block in the last table cell leaves the table like any other block', (key) => {
    const table = '<table><tbody><tr><td><pre><code>x</code></pre></td></tr></tbody></table>';
    const ed = makeEditor({ content: table });
    caretAfter(ed, 'x');
    expect(press(ed, key)).toBe(true);
    typeText(ed, 'A');
    expect(ed.getHTML()).toBe(`${table}<p>A</p>`);
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

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])('exitBlankLines %s turns the exit off and Enter keeps adding lines', (exitBlankLines) => {
    const ed = makeEditor({ codeBlock: { exitBlankLines }, content: '<pre><code>x</code></pre>' });
    caretAt(ed, ed.state.doc.content.size - 1);
    for (let i = 0; i < 3; i++) press(ed, 'Enter');
    typeText(ed, '\n');
    expect(ed.getHTML()).toBe('<pre><code>x\n\n\n\n</code></pre>');
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

  it.each([
    ['<p>abc</p>', 'b', '<p>ac</p><hr><p>N</p>'],
    ['<p>hello world</p>', 'world', '<p>hello&nbsp;</p><hr><p>N</p>'],
    ['<ul><li><p>abc</p></li></ul>', 'b', '<ul><li><p>ac</p><hr><p>N</p></li></ul>'],
  ])('insertHorizontalRule over a selection in %s puts the caret after the divider', (content, selected, expected) => {
    const ed = makeEditor({ content });
    selectText(ed, selected);
    expect(ed.exec('insertHorizontalRule')).toBe(true);
    typeText(ed, 'N');
    expect(ed.getHTML()).toBe(expected);
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

  it.each([
    ['ko', '리스트', 'taskList'],
    ['ko', '선', 'horizontalRule'],
    ['en', 'list', 'taskList'],
    ['en', 'ul', 'bulletList'],
  ] as const)('a %s query "%s" still finds %s by text inside its label', (locale, query, id) => {
    const ed = makeEditor({ locale });
    expect(filterSlashItems(slashItems(ed), query, ed.t).map((item) => item.id)).toContain(id);
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

  it('opening and closing the source view without edits keeps the spaces', () => {
    const ed = makeEditor();
    typeText(ed, '이름:    김철수');
    const before = ed.getHTML();
    ed.exec('toggleSourceView');
    ed.exec('toggleSourceView');
    expect(ed.getHTML()).toBe(before);
    expect(ed.getText()).toBe('이름:    김철수');
  });

  it('reloading turns the saved no-break spaces back into plain spaces', () => {
    const ed = makeEditor();
    typeText(ed, 'hello ');
    ed.setHTML(ed.getHTML());
    caretAt(ed, ed.state.doc.content.size - 1);
    typeText(ed, 'world');
    expect(ed.getHTML()).toBe('<p>hello world</p>');
    expect(ed.getText()).toBe('hello world');
  });

  it('reloaded indented lines become code with plain spaces', () => {
    const ed = makeEditor({ content: '<p>if (x) {</p><p>&nbsp;&nbsp; &nbsp;run();</p><p>}</p>' });
    selectAll(ed);
    ed.exec('toggleCodeBlock');
    expect(ed.getHTML()).toBe('<pre><code>if (x) {\n    run();\n}</code></pre>');
  });

  it('keeps a no-break space between two words, where a plain space would not collapse', () => {
    const ed = makeEditor({ content: '<p>10&nbsp;km, a &nbsp;b</p>' });
    expect(ed.getText()).toBe('10\u00a0km, a  b');
    expect(roundTrip(ed)).toBe('<p>10&nbsp;km, a &nbsp;b</p>');
  });

  it('leaves single spaces between words and code blocks alone', () => {
    const ed = makeEditor({ content: '<p>a b c</p><pre><code>  a\n    b</code></pre>' });
    expect(roundTrip(ed)).toBe('<p>a b c</p><pre><code>  a\n    b</code></pre>');
  });
});

describe('list items that start with a block stay in the list (#17)', () => {
  it.each([
    [
      '<ol><li><h3>Install</h3><p>Run the installer.</p></li><li><h3>Configure</h3><p>Edit the file.</p></li></ol>',
      '<ol><li><p></p><h3>Install</h3><p>Run the installer.</p></li><li><p></p><h3>Configure</h3><p>Edit the file.</p></li></ol>',
    ],
    [
      '<ol><li><img src="https://x.com/1.png">Photo one</li><li>Second</li></ol>',
      '<ol><li><p></p><figure data-align="center"><img src="https://x.com/1.png" alt=""><figcaption></figcaption></figure><p>Photo one</p></li><li><p>Second</p></li></ol>',
    ],
    [
      '<ol start="3"><li><blockquote><p>q</p></blockquote></li><li> <pre><code>x=1</code></pre></li><li>z</li></ol>',
      '<ol start="3"><li><p></p><blockquote><p>q</p></blockquote></li><li><p></p><pre><code>x=1</code></pre></li><li><p>z</p></li></ol>',
    ],
    [
      '<ul data-type="taskList"><li data-checked="true"><h3>Done</h3></li><li data-checked="false">Todo</li></ul>',
      '<ul data-type="taskList"><li data-checked="true"><p></p><h3>Done</h3></li><li data-checked="false"><p>Todo</p></li></ul>',
    ],
    ['<ul><li><strong>a</strong> b</li><li><p>c</p><h3>d</h3></li></ul>', '<ul><li><p><strong>a</strong> b</p></li><li><p>c</p><h3>d</h3></li></ul>'],
  ])('setHTML %s', (input, expected) => {
    expect(makeEditor({ content: input }).getHTML()).toBe(expected);
  });

  it('pasted HTML keeps every item in the ordered list', () => {
    const ed = makeEditor();
    ed.view.pasteHTML('<ol><li><h3>Install</h3><p>Run.</p></li><li><h3>Configure</h3><p>Edit.</p></li></ol>');
    expect(ed.getHTML()).toBe('<ol><li><p></p><h3>Install</h3><p>Run.</p></li><li><p></p><h3>Configure</h3><p>Edit.</p></li></ol>');
  });
});
