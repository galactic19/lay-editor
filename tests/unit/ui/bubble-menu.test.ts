import { TextSelection } from 'prosemirror-state';
import { BUBBLE_ITEMS } from '../../../src/ui/presets';
import { setMedia } from '../../setup';
import { makeEditor, select, selectText } from '../../helpers/editor';

const bubble = () => document.querySelector<HTMLElement>('.le-bubble')!;
const IMAGE = '<figure data-align="center"><img src="https://x.com/a.png" alt=""><figcaption></figcaption></figure>';

function focused(content: string) {
  const ed = makeEditor({ content });
  ed.focus();
  return ed;
}

describe('BubbleMenu', () => {
  it('shows the bubble items for a non-empty text selection and hides when collapsed', () => {
    const ed = focused('<p>abc</p>');
    selectText(ed, 'ab');
    ed.ui!.flush();
    expect(bubble().hidden).toBe(false);
    expect(Array.from(bubble().querySelectorAll<HTMLElement>('[data-item]')).map((el) => el.dataset.item)).toEqual(BUBBLE_ITEMS);
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1)));
    ed.ui!.flush();
    expect(bubble().hidden).toBe(true);
  });

  it('hides inside code blocks and for node selections', () => {
    const ed = focused('<pre><code>abc</code></pre>' + IMAGE);
    selectText(ed, 'ab');
    ed.ui!.flush();
    expect(bubble().hidden).toBe(true);
    select(ed, `node:${ed.state.doc.firstChild!.nodeSize}`);
    ed.ui!.flush();
    expect(bubble().hidden).toBe(true);
  });

  it('hides while the pointer is down and shows on pointerup', () => {
    const ed = focused('<p>abc</p>');
    selectText(ed, 'ab');
    ed.view.dom.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    ed.ui!.flush();
    expect(bubble().hidden).toBe(true);
    window.dispatchEvent(new Event('pointerup'));
    expect(bubble().hidden).toBe(false);
  });

  it('applies bold from the bubble', () => {
    const ed = focused('<p>abc</p>');
    selectText(ed, 'ab');
    ed.ui!.flush();
    bubble().querySelector<HTMLButtonElement>('[data-item="bold"]')!.click();
    expect(ed.getHTML()).toBe('<p><strong>ab</strong>c</p>');
  });

  it('stays hidden without focus and on mobile', () => {
    const ed = makeEditor({ content: '<p>abc</p>' });
    selectText(ed, 'ab');
    ed.ui!.flush();
    expect(bubble().hidden).toBe(true);
    ed.destroy();
    setMedia('(pointer: coarse)', true);
    const mobile = focused('<p>abc</p>');
    selectText(mobile, 'ab');
    mobile.ui!.flush();
    expect(document.querySelector('.le-bubble')).toBeNull();
  });

  it('the link context toolbar yields to the bubble for range selections', () => {
    const ed = focused('<p><a href="https://a.com">abc</a></p>');
    selectText(ed, 'ab');
    ed.ui!.flush();
    expect(bubble().hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('.le-context-toolbar')!.hidden).toBe(true);
  });
});
