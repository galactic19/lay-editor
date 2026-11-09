import { DraftStore } from '../../../src/io/autosave';
import { DEFAULTS } from '../../../src/core/defaults';
import { makeEditor, typeText } from '../../helpers/editor';

const KEY = (key: string) => DEFAULTS.autosave.prefix + key;
const bar = (ed: ReturnType<typeof makeEditor>) => ed.root.querySelector<HTMLElement>('.le-restore-bar');
const action = (ed: ReturnType<typeof makeEditor>, name: string) => bar(ed)!.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;

describe('DraftStore', () => {
  it('saves, loads and clears', () => {
    const store = new DraftStore('k');
    expect(store.available).toBe(true);
    store.save('<p>a</p>');
    expect(store.load()).toEqual({ html: '<p>a</p>', savedAt: expect.any(Number) });
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('ignores corrupt data and unusable storage', () => {
    localStorage.setItem('bad', '{not json');
    expect(new DraftStore('bad').load()).toBeNull();
    const broken = { setItem: () => { throw new Error('quota'); }, getItem: () => null, removeItem: () => {} } as unknown as Storage;
    expect(new DraftStore('k', broken).available).toBe(false);
    expect(new DraftStore('k', null).available).toBe(false);
  });
});

describe('autosave', () => {
  it('saves after the debounce and restores via the bar', () => {
    vi.useFakeTimers();
    const a = makeEditor({ autosave: { key: 'k' } });
    typeText(a, 'x');
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(JSON.parse(localStorage.getItem(KEY('k'))!).html).toBe('<p>x</p>');
    a.destroy();
    const b = makeEditor({ autosave: { key: 'k' } });
    expect(bar(b)!.hidden).toBe(false);
    expect(bar(b)!.textContent).toContain(b.t('autosave.found'));
    action(b, 'restore').click();
    expect(b.getHTML()).toBe('<p>x</p>');
    expect(bar(b)!.hidden).toBe(true);
  });

  it('hides the bar when the draft equals the current content', () => {
    localStorage.setItem(KEY('k'), JSON.stringify({ html: '<p>same</p>', savedAt: 1 }));
    expect(bar(makeEditor({ autosave: { key: 'k' }, content: '<p>same</p>' }))!.hidden).toBe(true);
  });

  it('discard and clearDraft remove the draft', () => {
    localStorage.setItem(KEY('k'), JSON.stringify({ html: '<p>old</p>', savedAt: 1 }));
    const ed = makeEditor({ autosave: { key: 'k' } });
    action(ed, 'discard').click();
    expect(localStorage.getItem(KEY('k'))).toBeNull();
    expect(bar(ed)!.hidden).toBe(true);
    localStorage.setItem(KEY('k'), JSON.stringify({ html: '<p>x</p>', savedAt: 1 }));
    ed.clearDraft();
    expect(localStorage.getItem(KEY('k'))).toBeNull();
  });

  it('does not overwrite an undecided draft', () => {
    vi.useFakeTimers();
    localStorage.setItem(KEY('k'), JSON.stringify({ html: '<p>old</p>', savedAt: 1 }));
    const ed = makeEditor({ autosave: { key: 'k' } });
    typeText(ed, 'new');
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(JSON.parse(localStorage.getItem(KEY('k'))!).html).toBe('<p>old</p>');
    action(ed, 'discard').click();
    typeText(ed, '!');
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(JSON.parse(localStorage.getItem(KEY('k'))!).html).toBe('<p>new!</p>');
  });

  it('keeps drafts of different keys separate across editors', () => {
    vi.useFakeTimers();
    const a = makeEditor({ autosave: { key: 'k1' } });
    const b = makeEditor({ autosave: { key: 'k2' } });
    typeText(a, 'a');
    typeText(b, 'b');
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(JSON.parse(localStorage.getItem(KEY('k1'))!).html).toBe('<p>a</p>');
    expect(JSON.parse(localStorage.getItem(KEY('k2'))!).html).toBe('<p>b</p>');
  });

  it('flushes a pending save on destroy', () => {
    vi.useFakeTimers();
    const ed = makeEditor({ autosave: { key: 'k' } });
    typeText(ed, 'z');
    ed.destroy();
    expect(JSON.parse(localStorage.getItem(KEY('k'))!).html).toBe('<p>z</p>');
  });

  it('reports STORAGE_UNAVAILABLE and stays usable when storage throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const ed = makeEditor({ autosave: { key: 'k' } });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
    typeText(ed, 'a');
    expect(ed.getHTML()).toBe('<p>a</p>');
    expect(ed.exec('clearDraft')).toBe(false);
  });

  it('does nothing without a key', () => {
    vi.useFakeTimers();
    const ed = makeEditor();
    typeText(ed, 'a');
    vi.advanceTimersByTime(DEFAULTS.autosave.debounce);
    expect(localStorage.length).toBe(0);
    expect(bar(ed)).toBeNull();
  });
});
