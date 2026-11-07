import { TextSelection } from 'prosemirror-state';
import { contextAnchor, contextOnlyItems, resolveContext } from '../../../src/ui/context';
import { findText, makeEditor, select } from '../../helpers/editor';

const IMAGE = '<figure data-align="center"><img src="https://x.com/a.png" alt=""><figcaption>cap</figcaption></figure>';
const TABLE = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
const toolbar = () => document.querySelector<HTMLElement>('.le-context-toolbar');

function cursorAt(ed: ReturnType<typeof makeEditor>, text: string): void {
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, findText(ed, text) + 1)));
}

describe('resolveContext', () => {
  it.each([
    [IMAGE, 'node:0', 'image'],
    [TABLE, 'text:a', 'table'],
    ['<p><a href="https://a.com">ab</a></p>', 'text:ab', 'link'],
    ['<p>a</p>', 'text:a', 'text'],
  ])('%s with %s → %s', (html, sel, ctx) => {
    const ed = makeEditor({ content: html });
    select(ed, sel);
    expect(resolveContext(ed.state)).toBe(ctx);
  });

  it('a cursor in an image caption is the image context', () => {
    const ed = makeEditor({ content: IMAGE });
    cursorAt(ed, 'cap');
    expect(resolveContext(ed.state)).toBe('image');
  });

  it('finds the anchor element for a context', () => {
    const ed = makeEditor({ content: IMAGE + TABLE });
    select(ed, 'node:0');
    expect(contextAnchor(ed.view, 'image')?.tagName).toBe('FIGURE');
    cursorAt(ed, 'a');
    expect(contextAnchor(ed.view, 'table')?.querySelector('table')).not.toBeNull();
  });

  it('contextOnlyItems excludes items that also work in text', () => {
    const ed = makeEditor();
    const ids = contextOnlyItems(ed.ui!.registry, 'link').map((i) => i.id);
    expect(ids).toEqual(['linkEdit', 'linkOpen', 'linkRemove']);
  });
});

describe('ContextToolbar', () => {
  it('shows only context items for a focused image and hides for text', () => {
    const ed = makeEditor({ content: IMAGE + '<p>t</p>' });
    ed.focus();
    select(ed, 'node:0');
    ed.ui!.flush();
    expect(toolbar()!.hidden).toBe(false);
    expect(toolbar()!.querySelector('[data-item="imageWidth50"]')).not.toBeNull();
    expect(toolbar()!.querySelector('[data-item="bold"]')).toBeNull();
    select(ed, 'text:t');
    ed.ui!.flush();
    expect(toolbar()!.hidden).toBe(true);
  });

  it('runs context commands', () => {
    const ed = makeEditor({ content: IMAGE });
    ed.focus();
    select(ed, 'node:0');
    ed.ui!.flush();
    toolbar()!.querySelector<HTMLButtonElement>('[data-item="imageWidth50"]')!.click();
    expect(ed.getHTML()).toContain('style="width: 50%;"');
  });

  it('removes a link from the link context', () => {
    const ed = makeEditor({ content: '<p><a href="https://a.com">ab</a></p>' });
    ed.focus();
    cursorAt(ed, 'a');
    ed.ui!.flush();
    toolbar()!.querySelector<HTMLButtonElement>('[data-item="linkRemove"]')!.click();
    expect(ed.getHTML()).toBe('<p>ab</p>');
  });

  it('stays hidden when the editor is not focused', () => {
    const ed = makeEditor({ content: IMAGE });
    select(ed, 'node:0');
    ed.ui!.flush();
    expect(toolbar()!.hidden).toBe(true);
  });

  it('is removed on destroy', () => {
    const ed = makeEditor();
    ed.destroy();
    expect(toolbar()).toBeNull();
  });
});
