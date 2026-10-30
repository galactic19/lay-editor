import { defineExtension } from '../../../src/extensions/factories';
import { PastePipeline } from '../../../src/io/paste/pipeline';
import { makeEditor } from '../../helpers/editor';

const files = import.meta.glob('../../fixtures/paste/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const read = (name: string): string => files[`../../fixtures/paste/${name}`]!;

describe('paste fixtures', () => {
  it.each(['word-list-nested', 'word-formatting', 'hwp-basic', 'gdocs-basic', 'web-article'])('%s', (name) => {
    const ed = makeEditor();
    ed.view.pasteHTML(read(`${name}.html`));
    expect(ed.getHTML()).toBe(read(`${name}.expected.html`).trim());
  });

  it('keeps nested Word list levels', () => {
    const ed = makeEditor();
    ed.view.pasteHTML(read('word-list-nested.html'));
    expect(ed.view.dom.querySelector('ul ul, ol ol, ul ol, ol ul')).not.toBeNull();
  });
});

describe('paste behaviour', () => {
  it('splits plain text into paragraphs and breaks', () => {
    const ed = makeEditor();
    ed.view.pasteText('a\n\nb\nc');
    expect(ed.getHTML()).toBe('<p>a</p><p>b<br>c</p>');
  });

  it('escapes HTML in plain text', () => {
    const ed = makeEditor();
    ed.view.pasteText('<b>x</b> & y');
    expect(ed.getHTML()).toBe('<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>');
  });

  it('falls back to plain text when a cleaner throws', () => {
    const bad = defineExtension({ name: 'bad', pasteCleaners: [() => { throw new Error('x'); }] });
    const ed = makeEditor({ extensions: [bad] });
    const onError = vi.fn();
    ed.on('error', onError);
    ed.view.pasteHTML('<p><b>a</b></p>');
    expect(ed.getHTML()).toBe('<p>a</p>');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASTE_FAILED' }));
  });

  it('runs extension cleaners after the built-in ones', () => {
    const upper = defineExtension({ name: 'upper', pasteCleaners: [(html) => html.replace('a', 'A')] });
    const ed = makeEditor({ extensions: [upper] });
    ed.view.pasteHTML('<p>a</p>');
    expect(ed.getHTML()).toBe('<p>A</p>');
  });

  it('leaves internal ProseMirror clipboard HTML untouched', () => {
    const marker = defineExtension({ name: 'marker', pasteCleaners: [() => '<p>cleaned</p>'] });
    const ed = makeEditor({ extensions: [marker] });
    ed.view.pasteHTML('<p data-pm-slice="1 1 []">kept</p>');
    expect(ed.getHTML()).toBe('<p>kept</p>');
  });
});

describe('PastePipeline', () => {
  it('runs cleaners in order', () => {
    const pipeline = new PastePipeline([(h) => `${h}a`, (h) => `${h}b`]);
    expect(pipeline.run('x')).toBe('xab');
  });
});
