import { makeEditor, press, selectText, typeText } from '../../helpers/editor';

describe('block input rules', () => {
  it.each([
    ['## ', 'h2'],
    ['> ', 'blockquote'],
    ['- ', 'ul'],
    ['1. ', 'ol'],
    ['[] ', 'ul[data-type="taskList"]'],
  ])('"%s" creates %s', (input, sel) => {
    const ed = makeEditor();
    typeText(ed, input + 'x');
    expect(ed.view.dom.querySelector(sel)).not.toBeNull();
    expect(ed.getText()).toBe('x');
  });

  it('"[x] " creates a checked task', () => {
    const ed = makeEditor();
    typeText(ed, '[x] a');
    expect(ed.getHTML()).toBe('<ul data-type="taskList"><li data-checked="true"><p>a</p></li></ul>');
  });

  it('"5. " starts an ordered list at 5', () => {
    const ed = makeEditor();
    typeText(ed, '5. a');
    expect(ed.getHTML()).toBe('<ol start="5"><li><p>a</p></li></ol>');
  });

  it('--- becomes an hr followed by a paragraph', () => {
    const ed = makeEditor();
    typeText(ed, '---');
    expect(ed.getHTML()).toBe('<hr><p></p>');
    typeText(ed, 'a');
    expect(ed.getHTML()).toBe('<hr><p>a</p>');
  });
});

describe('heading', () => {
  it('toggleHeading twice returns to paragraph', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('toggleHeading', 1);
    expect(ed.getHTML()).toBe('<h1>a</h1>');
    ed.exec('toggleHeading', 1);
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('Mod-Alt-2 sets H2 and Mod-Alt-0 resets', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    press(ed, 'Mod-Alt-2');
    expect(ed.getHTML()).toBe('<h2>a</h2>');
    press(ed, 'Mod-Alt-0');
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('parses h5 and h6 as the last level', () => {
    expect(makeEditor({ content: '<h5>a</h5><h6>b</h6>' }).getHTML()).toBe('<h4>a</h4><h4>b</h4>');
  });

  it('isActive matches level', () => {
    const ed = makeEditor({ content: '<h3>a</h3>' });
    expect(ed.isActive('heading', { level: 3 })).toBe(true);
    expect(ed.isActive('heading', { level: 2 })).toBe(false);
  });
});

describe('lists', () => {
  it('toggleBulletList inside an ordered list converts it', () => {
    const ed = makeEditor({ content: '<ol><li><p>a</p></li></ol>' });
    selectText(ed, 'a');
    ed.exec('toggleBulletList');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p></li></ul>');
  });

  it('toggleBulletList twice unwraps', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('toggleBulletList');
    ed.exec('toggleBulletList');
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('switches between task and bullet lists', () => {
    const ed = makeEditor({ content: '<ul><li><p>a</p></li></ul>' });
    selectText(ed, 'a');
    ed.exec('toggleTaskList');
    expect(ed.getHTML()).toBe('<ul data-type="taskList"><li data-checked="false"><p>a</p></li></ul>');
    ed.exec('toggleBulletList');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p></li></ul>');
  });

  it('Enter splits items and Tab nests', () => {
    const ed = makeEditor();
    typeText(ed, '- a');
    press(ed, 'Enter');
    typeText(ed, 'b');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    press(ed, 'Tab');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
    press(ed, 'Shift-Tab');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
  });

  it('Enter in a task list creates an unchecked item', () => {
    const ed = makeEditor();
    typeText(ed, '[x] a');
    press(ed, 'Enter');
    typeText(ed, 'b');
    expect(ed.getHTML()).toBe('<ul data-type="taskList"><li data-checked="true"><p>a</p></li><li data-checked="false"><p>b</p></li></ul>');
  });

  it('the task checkbox toggles checked', () => {
    const ed = makeEditor({ content: '<ul data-type="taskList"><li data-checked="false"><p>a</p></li></ul>' });
    const box = ed.view.dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.getAttribute('aria-label')).toBe(ed.t('a11y.taskCheckbox'));
    box.click();
    expect(ed.getHTML()).toBe('<ul data-type="taskList"><li data-checked="true"><p>a</p></li></ul>');
  });
});

describe('blockquote and hr commands', () => {
  it('toggleBlockquote wraps and unwraps', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('toggleBlockquote');
    expect(ed.getHTML()).toBe('<blockquote><p>a</p></blockquote>');
    ed.exec('toggleBlockquote');
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('insertHorizontalRule', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    selectText(ed, 'a');
    ed.exec('insertHorizontalRule');
    expect(ed.getHTML()).toBe('<hr><p></p>');
  });
});

describe('align and indent', () => {
  it('setAlign center then left clears the style', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('setAlign', 'center');
    expect(ed.getHTML()).toBe('<p style="text-align: center;">a</p>');
    ed.exec('setAlign', null);
    expect(ed.getHTML()).toBe('<p>a</p>');
    expect(ed.exec('setAlign', 'diagonal')).toBe(false);
  });

  it('indent paragraphs up to max, then outdent to zero', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    for (let i = 0; i < 8; i++) expect(ed.exec('indent')).toBe(true);
    expect(ed.exec('indent')).toBe(false);
    expect(ed.getHTML()).toBe('<p data-indent="8">a</p>');
    for (let i = 0; i < 8; i++) ed.exec('outdent');
    expect(ed.exec('outdent')).toBe(false);
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('indent inside a list nests the item', () => {
    const ed = makeEditor({ content: '<ul><li><p>a</p></li><li><p>b</p></li></ul>' });
    selectText(ed, 'b');
    ed.exec('indent');
    expect(ed.getHTML()).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
  });

  it('clamps parsed indent values', () => {
    expect(makeEditor({ content: '<p data-indent="99">a</p><p data-indent="x">b</p>' }).getHTML()).toBe('<p data-indent="8">a</p><p>b</p>');
  });
});

describe('placeholder', () => {
  it('shows the placeholder only when empty', () => {
    const ed = makeEditor({ placeholder: '여기에 쓰기' });
    const el = ed.view.dom.querySelector('.le-placeholder');
    expect(el?.getAttribute('data-placeholder')).toBe('여기에 쓰기');
    typeText(ed, 'a');
    expect(ed.view.dom.querySelector('.le-placeholder')).toBeNull();
  });

  it('falls back to the locale text', () => {
    const ed = makeEditor({ locale: 'ko' });
    expect(ed.view.dom.querySelector('.le-placeholder')?.getAttribute('data-placeholder')).toBe('내용을 입력하세요');
  });
});
