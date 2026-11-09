import { findKey, findMatches } from '../../../src/extensions/tools/findReplace';
import { makeEditor, press } from '../../helpers/editor';

const dialog = () => document.querySelector<HTMLElement>('.le-dropdown')!;

describe('findMatches', () => {
  it('finds within blocks only, case-insensitive by default', () => {
    const ed = makeEditor({ content: '<p>Ab ab</p><p>a</p><p>b</p>' });
    expect(findMatches(ed.state.doc, 'ab', false)).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 6 },
    ]);
    expect(findMatches(ed.state.doc, 'ab', true)).toHaveLength(1);
    expect(findMatches(ed.state.doc, '', false)).toEqual([]);
  });

  it('handles Korean and regex-like characters literally', () => {
    const ed = makeEditor({ content: '<p>한글 한. (a+b)</p>' });
    expect(findMatches(ed.state.doc, '한.', false)).toHaveLength(1);
    expect(findMatches(ed.state.doc, '(a+b)', false)).toHaveLength(1);
  });

  it('maps positions across marks', () => {
    const ed = makeEditor({ content: '<p>x<strong>ab</strong>c</p>' });
    const [m] = findMatches(ed.state.doc, 'abc', false);
    expect(ed.state.doc.textBetween(m!.from, m!.to)).toBe('abc');
  });
});

describe('find and replace commands', () => {
  it('highlights matches and findNext cycles and selects', () => {
    const ed = makeEditor({ content: '<p>a b a b a</p>' });
    ed.exec('setFindQuery', 'a');
    expect(ed.view.dom.querySelectorAll('.le-find-match')).toHaveLength(3);
    ed.exec('findNext');
    ed.exec('findNext');
    ed.exec('findNext');
    ed.exec('findNext');
    expect(findKey.getState(ed.state)!.current).toBe(0);
    expect(ed.state.selection.from).toBe(1);
    expect(ed.view.dom.querySelectorAll('.le-find-current')).toHaveLength(1);
    ed.exec('findPrev');
    expect(findKey.getState(ed.state)!.current).toBe(2);
  });

  it('replaceAll is one undo step', () => {
    const ed = makeEditor({ content: '<p>a a a</p>' });
    ed.exec('setFindQuery', 'a');
    ed.exec('replaceAll', 'b');
    expect(ed.getHTML()).toBe('<p>b b b</p>');
    ed.exec('undo');
    expect(ed.getHTML()).toBe('<p>a a a</p>');
  });

  it('replaceCurrent replaces the selected match and moves on', () => {
    const ed = makeEditor({ content: '<p>a a</p>' });
    ed.exec('setFindQuery', 'a');
    ed.exec('findNext');
    ed.exec('replaceCurrent', 'b');
    expect(ed.getHTML()).toBe('<p>b a</p>');
    expect(findKey.getState(ed.state)!.matches).toHaveLength(1);
  });

  it('closeFind clears highlights; commands fail without matches', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.exec('setFindQuery', 'a');
    ed.exec('closeFind');
    expect(ed.view.dom.querySelector('.le-find-match')).toBeNull();
    expect(ed.exec('findNext')).toBe(false);
    expect(ed.exec('replaceAll', 'x')).toBe(false);
  });

  it('Mod-f opens the panel; typing searches and closing clears', () => {
    const ed = makeEditor({ content: '<p>Hello hello</p>' });
    press(ed, 'Mod-f');
    const input = dialog().querySelector<HTMLInputElement>('input[data-field="find"]')!;
    expect(document.activeElement).toBe(input);
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    expect(dialog().querySelector('[data-field="status"]')!.textContent).toBe(ed.t('status.matchCount', { current: 0, total: 2 }));
    dialog().querySelector<HTMLInputElement>('input[data-field="case"]')!.click();
    expect(dialog().querySelector('[data-field="status"]')!.textContent).toBe(ed.t('status.matchCount', { current: 0, total: 1 }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(dialog().querySelector('[data-field="status"]')!.textContent).toBe(ed.t('status.matchCount', { current: 1, total: 1 }));
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ed.view.dom.querySelector('.le-find-match')).toBeNull();
  });

  it('replace all from the panel', () => {
    const ed = makeEditor({ content: '<p>cat cat</p>' });
    ed.ui!.openPanelFor('findReplace');
    const find = dialog().querySelector<HTMLInputElement>('input[data-field="find"]')!;
    const replace = dialog().querySelector<HTMLInputElement>('input[data-field="replace"]')!;
    find.value = 'cat';
    find.dispatchEvent(new Event('input'));
    replace.value = 'dog';
    dialog().querySelector<HTMLButtonElement>('[data-action="replaceAll"]')!.click();
    expect(ed.getHTML()).toBe('<p>dog dog</p>');
    expect(dialog().querySelector('[data-field="status"]')!.textContent).toBe(ed.t('status.noMatch'));
  });
});
