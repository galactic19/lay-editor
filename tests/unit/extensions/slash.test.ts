import { Selection } from 'prosemirror-state';
import { filterSlashItems, slashKey } from '../../../src/extensions/tools/slashMenu';
import { makeEditor, press, typeText } from '../../helpers/editor';
import type { Editor } from '../../../src/core/Editor';

const state = (ed: Editor) => slashKey.getState(ed.state)!;
const menu = () => document.querySelector<HTMLElement>('.le-slash-menu')!;
const visibleItemIds = (ed: Editor): string[] => {
  ed.ui!.flush();
  return Array.from(menu().querySelectorAll<HTMLElement>('[role="option"]')).map((el) => el.dataset.item!);
};

describe('slash menu', () => {
  it('opens on "/" at line start and filters by Korean keyword', () => {
    const ed = makeEditor();
    typeText(ed, '/표');
    expect(state(ed).active).toBe(true);
    expect(visibleItemIds(ed)).toEqual(['table']);
    expect(menu().hidden).toBe(false);
  });

  it('opens after a space but not mid-word', () => {
    const a = makeEditor();
    typeText(a, 'a/');
    expect(state(a).active).toBe(false);
    const b = makeEditor();
    typeText(b, 'a /');
    expect(state(b).active).toBe(true);
  });

  it('Enter runs the item and removes the query', () => {
    const ed = makeEditor();
    typeText(ed, '/h2');
    expect(press(ed, 'Enter')).toBe(true);
    expect(ed.getHTML()).toBe('<h2></h2>');
    expect(state(ed).active).toBe(false);
  });

  it('arrows move the active option and wrap', () => {
    const ed = makeEditor();
    typeText(ed, '/');
    const ids = visibleItemIds(ed);
    press(ed, 'ArrowDown');
    expect(state(ed).index).toBe(1);
    press(ed, 'ArrowUp');
    press(ed, 'ArrowUp');
    expect(state(ed).index).toBe(ids.length - 1);
    ed.ui!.flush();
    expect(menu().querySelector('[aria-selected="true"]')!.getAttribute('data-item')).toBe(ids[ids.length - 1]);
    expect(ed.view.dom.getAttribute('aria-activedescendant')).toBe(menu().querySelector('[aria-selected="true"]')!.id);
  });

  it('Escape closes and keeps the text', () => {
    const ed = makeEditor();
    typeText(ed, '/ab');
    press(ed, 'Escape');
    expect(state(ed).active).toBe(false);
    expect(ed.getHTML()).toBe('<p>/ab</p>');
    typeText(ed, 'c');
    expect(state(ed).active).toBe(false);
  });

  it('panel items open their panel', () => {
    const ed = makeEditor();
    typeText(ed, '/table');
    press(ed, 'Enter');
    expect(ed.getHTML()).toBe('');
    expect(document.querySelector('.le-dropdown [data-rows]')).not.toBeNull();
  });

  it('clicking an option runs it', () => {
    const ed = makeEditor();
    typeText(ed, '/인용');
    visibleItemIds(ed);
    menu().querySelector<HTMLElement>('[data-item="blockquote"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(ed.getHTML()).toBe('<blockquote><p></p></blockquote>');
  });

  it('shows an empty message and closes once a query with a space matches nothing', () => {
    const ed = makeEditor();
    typeText(ed, '/zzz');
    expect(visibleItemIds(ed)).toEqual([]);
    expect(menu().textContent).toBe(ed.t('slash.empty'));
    typeText(ed, ' ');
    ed.ui!.flush();
    expect(state(ed).active).toBe(false);
    expect(menu().hidden).toBe(true);
  });

  it('closes when the cursor leaves the query', () => {
    const ed = makeEditor({ content: '<p>x</p>' });
    typeText(ed, '/');
    press(ed, 'ArrowLeft');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atStart(ed.state.doc)));
    expect(state(ed).active).toBe(false);
  });
});

describe('filterSlashItems', () => {
  it('matches labels and keywords case-insensitively and caps the list', () => {
    const t = (key: string) => key;
    const items = Array.from({ length: 15 }, (_, i) => ({ id: `i${i}`, kind: 'button' as const, icon: 'x', label: `Item ${i}`, contexts: ['text' as const], slash: { keywords: ['abc'] } }));
    expect(filterSlashItems(items, 'ABC', t)).toHaveLength(10);
    expect(filterSlashItems(items, 'item 3', t).map((i) => i.id)).toEqual(['i3']);
  });
});
