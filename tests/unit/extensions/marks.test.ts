import { TextSelection } from 'prosemirror-state';
import { makeEditor, selectText, typeText } from '../../helpers/editor';

describe('basic marks', () => {
  it('toggles bold on a selection', () => {
    const ed = makeEditor({ content: '<p>abc</p>' });
    selectText(ed, 'ab');
    ed.exec('toggleBold');
    expect(ed.getHTML()).toBe('<p><strong>ab</strong>c</p>');
  });

  it.each([
    ['**ab**', '<p><strong>ab</strong></p>'],
    ['~~ab~~', '<p><s>ab</s></p>'],
    ['`ab`', '<p><code>ab</code></p>'],
    ['x *ab*', '<p>x <em>ab</em></p>'],
  ])('input rule %s', (input, out) => {
    const ed = makeEditor();
    typeText(ed, input);
    expect(ed.getHTML()).toBe(out);
  });

  it.each([
    ['<p><b>a</b></p>', '<p><strong>a</strong></p>'],
    ['<p><b style="font-weight:normal">a</b></p>', '<p>a</p>'],
    ['<p><span style="font-weight:700">a</span></p>', '<p><strong>a</strong></p>'],
    ['<p><i>a</i></p>', '<p><em>a</em></p>'],
    ['<p><span style="text-decoration:underline">a</span></p>', '<p><u>a</u></p>'],
    ['<p><del>a</del></p>', '<p><s>a</s></p>'],
  ])('parses %s', (input, out) => {
    expect(makeEditor({ content: input }).getHTML()).toBe(out);
  });

  it('inline code excludes other marks', () => {
    const ed = makeEditor({ content: '<p><strong>ab</strong></p>' });
    selectText(ed, 'ab');
    ed.exec('toggleCode');
    expect(ed.getHTML()).toBe('<p><code>ab</code></p>');
  });
});

describe('color marks', () => {
  it('setTextColor validates', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    selectText(ed, 'a');
    expect(ed.exec('setTextColor', 'red')).toBe(false);
    expect(ed.exec('setTextColor', '#e03131')).toBe(true);
    expect(ed.getHTML()).toBe('<p><span style="color: rgb(224, 49, 49);">a</span></p>');
    ed.exec('unsetTextColor');
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('setHighlight replaces an existing highlight', () => {
    const ed = makeEditor({ content: '<p><mark style="background-color:#ffec99">a</mark></p>' });
    selectText(ed, 'a');
    ed.exec('setHighlight', '#d0ebff');
    expect(ed.getHTML()).toBe('<p><mark style="background-color: rgb(208, 235, 255);">a</mark></p>');
  });

  it('parses span background-color as highlight and a bare mark with the default color', () => {
    expect(makeEditor({ content: '<p><span style="background-color:#ffec99">a</span></p>' }).getHTML()).toBe(
      '<p><mark style="background-color: rgb(255, 236, 153);">a</mark></p>',
    );
    expect(makeEditor({ content: '<p><mark>a</mark></p>' }).getHTML()).toBe('<p><mark style="background-color: rgb(255, 236, 153);">a</mark></p>');
  });

  it('exposes the palette from colors options', () => {
    const ed = makeEditor({ colors: { text: ['#111111'] } });
    expect(ed.manager.resolved.find((r) => r.ext.name === 'textColor')!.options).toMatchObject({ text: ['#111111'] });
  });
});

describe('link', () => {
  it('setLink adds rel for new tab and rejects javascript:', () => {
    const ed = makeEditor({ content: '<p>ab</p>' });
    selectText(ed, 'ab');
    expect(ed.exec('setLink', { href: 'javascript:alert(1)' })).toBe(false);
    expect(ed.exec('setLink', { href: 'https://a.com', newTab: true })).toBe(true);
    expect(ed.getHTML()).toBe('<p><a href="https://a.com" target="_blank" rel="noopener noreferrer">ab</a></p>');
  });

  it('inserts the URL as text when the selection is empty', () => {
    const ed = makeEditor();
    ed.exec('setLink', { href: 'https://a.com' });
    expect(ed.getHTML()).toBe('<p><a href="https://a.com">https://a.com</a></p>');
  });

  it('updates the whole link around the cursor and unsetLink removes it', () => {
    const ed = makeEditor({ content: '<p><a href="https://a.com">abc</a></p>' });
    const { view } = ed;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    ed.exec('setLink', { href: 'https://b.com' });
    expect(ed.getHTML()).toBe('<p><a href="https://b.com">abc</a></p>');
    ed.exec('unsetLink');
    expect(ed.getHTML()).toBe('<p>abc</p>');
  });

  it('drops links with unsafe href on parse', () => {
    expect(makeEditor({ content: '<p><a href="javascript:x">a</a></p>' }).getHTML()).toBe('<p>a</p>');
  });

  it('autolinks typed URLs', () => {
    const ed = makeEditor();
    typeText(ed, 'www.a.com ');
    expect(ed.getHTML()).toBe('<p><a href="https://www.a.com">www.a.com</a> </p>');
  });

  it('Mod-k maps to openLinkPanel', () => {
    const ed = makeEditor();
    expect(ed.can('openLinkPanel')).toBe(true);
  });
});

describe('clearFormat', () => {
  it('removes marks but keeps links', () => {
    const ed = makeEditor({ content: '<p><a href="https://a.com"><strong><em>ab</em></strong></a></p>' });
    selectText(ed, 'ab');
    ed.exec('clearFormat');
    expect(ed.getHTML()).toBe('<p><a href="https://a.com">ab</a></p>');
  });
});
