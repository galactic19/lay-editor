import { PRESETS, SEPARATOR } from '../../../src/ui/presets';
import { makeEditor, press, selectText } from '../../helpers/editor';
import { triggerResize } from '../../setup';

const toolbarIds = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>('.le-toolbar > [data-item]:not([data-item="more"]), .le-toolbar > .le-separator')).map((el) => el.dataset.item ?? SEPARATOR);
const control = (root: HTMLElement, id: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`.le-toolbar [data-item="${id}"]`)!;
const dialog = (): HTMLElement | null => document.querySelector('.le-dropdown');

describe('Toolbar', () => {
  it('renders preset items in order with separators and labels', () => {
    const ed = makeEditor({ preset: 'basic' });
    expect(toolbarIds(ed.root)).toEqual(PRESETS.basic);
    const bold = control(ed.root, 'bold');
    expect(bold.getAttribute('aria-label')).toBe(ed.t('toolbar.bold'));
    expect(bold.dataset.tooltip).toMatch(/B\)$/);
    expect(ed.root.querySelector('.le-toolbar')!.getAttribute('role')).toBe('toolbar');
  });

  it('clicking bold toggles and syncs aria-pressed', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    selectText(ed, 'a');
    const btn = control(ed.root, 'bold');
    btn.click();
    ed.ui!.flush();
    expect(ed.getHTML()).toBe('<p><strong>a</strong></p>');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks unavailable commands aria-disabled and ignores clicks on them', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    ed.ui!.flush();
    const undo = control(ed.root, 'undo');
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    ed.setEditable(false);
    ed.ui!.flush();
    expect(control(ed.root, 'bold').getAttribute('aria-disabled')).toBe('true');
  });

  it('pointerdown on a control is prevented to keep focus', () => {
    const ed = makeEditor();
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    control(ed.root, 'bold').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('warns UNKNOWN_UI_ITEM listing valid ids for an explicit toolbar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ed = makeEditor({ toolbar: ['bold', 'nope', '|', 'italic'] });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/UNKNOWN_UI_ITEM.*nope.*bold/s));
    expect(toolbarIds(ed.root)).toEqual(['bold', SEPARATOR, 'italic']);
  });

  it('collapses separators left dangling by missing items', () => {
    const ed = makeEditor({ toolbar: ['|', 'bold', '|', '|', 'italic', '|'] });
    expect(toolbarIds(ed.root)).toEqual(['bold', SEPARATOR, 'italic']);
  });

  it('moves overflowing items into the more menu', () => {
    const ed = makeEditor({ toolbar: ['bold', 'italic', 'underline', 'strike', 'code', 'link'] });
    const bar = ed.root.querySelector<HTMLElement>('.le-toolbar')!;
    // Each visible control is 40px wide; the bar is 200px.
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => Array.from(bar.children).filter((el) => !(el as HTMLElement).hidden).length * 40 });
    triggerResize();
    const visible = toolbarIds(ed.root).filter((id) => !control(ed.root, id)?.hidden);
    expect(visible).toEqual(['bold', 'italic', 'underline', 'strike']);
    const more = bar.querySelector<HTMLButtonElement>('[data-item="more"]')!;
    expect(more.hidden).toBe(false);
    more.click();
    expect(Array.from(dialog()!.querySelectorAll<HTMLElement>('[data-item]')).map((el) => el.dataset.item)).toEqual(['code', 'link']);
  });

  it('heading dropdown applies H2', () => {
    const ed = makeEditor({ content: '<p>a</p>' });
    control(ed.root, 'heading').click();
    dialog()!.querySelector<HTMLButtonElement>('[data-item="heading:2"]')!.click();
    expect(ed.getHTML()).toBe('<h2>a</h2>');
    expect(dialog()).toBeNull();
  });

  it('color panel applies and resets a color', () => {
    const ed = makeEditor({ content: '<p>a</p>', colors: { text: ['#e03131', '#2f9e44'] } });
    selectText(ed, 'a');
    control(ed.root, 'textColor').click();
    const swatches = dialog()!.querySelectorAll<HTMLButtonElement>('.le-swatch');
    expect(swatches).toHaveLength(2);
    swatches[0]!.click();
    expect(ed.getHTML()).toBe('<p><span style="color: rgb(224, 49, 49);">a</span></p>');
    selectText(ed, 'a');
    control(ed.root, 'textColor').click();
    dialog()!.querySelector<HTMLButtonElement>('[data-action="reset"]')!.click();
    expect(ed.getHTML()).toBe('<p>a</p>');
  });

  it('Mod-k opens the link panel and Enter applies', () => {
    const ed = makeEditor({ content: '<p>ab</p>' });
    selectText(ed, 'ab');
    press(ed, 'Mod-k');
    const input = dialog()!.querySelector<HTMLInputElement>('input[type="url"]')!;
    expect(document.activeElement).toBe(input);
    input.value = 'https://a.com';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ed.getHTML()).toBe('<p><a href="https://a.com">ab</a></p>');
    expect(dialog()).toBeNull();
  });

  it('link panel keeps open and flags an invalid URL, prefills and removes an existing link', () => {
    const ed = makeEditor({ content: '<p><a href="https://a.com" target="_blank" rel="noopener noreferrer">ab</a></p>' });
    selectText(ed, 'ab');
    ed.ui!.openPanelFor('link');
    const input = dialog()!.querySelector<HTMLInputElement>('input[type="url"]')!;
    expect(input.value).toBe('https://a.com');
    expect(dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    input.value = 'javascript:alert(1)';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    dialog()!.querySelector<HTMLButtonElement>('[data-action="remove"]')!.click();
    expect(ed.getHTML()).toBe('<p>ab</p>');
  });
});

describe('EditorUI', () => {
  it('two editors are independent; destroying one keeps the other working', () => {
    const a = makeEditor({ content: '<p>a</p>' });
    const b = makeEditor({ content: '<p>b</p>' });
    a.destroy();
    selectText(b, 'b');
    control(b.root, 'bold').click();
    b.ui!.flush();
    expect(b.getHTML()).toBe('<p><strong>b</strong></p>');
    expect(control(b.root, 'bold').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.le-editor')).toHaveLength(1);
  });

  it('setLocale rebuilds labels and the placeholder', () => {
    const ed = makeEditor({ locale: 'ko' });
    expect(control(ed.root, 'bold').getAttribute('aria-label')).toBe('굵게');
    ed.setLocale('en');
    expect(control(ed.root, 'bold').getAttribute('aria-label')).toBe('Bold');
    expect(ed.view.dom.querySelector('.le-placeholder')!.getAttribute('data-placeholder')).toBe('Start writing…');
    expect(ed.root.querySelectorAll('.le-toolbar')).toHaveLength(1);
  });

  it('setTheme switches data-theme', () => {
    const ed = makeEditor({ theme: 'light' });
    expect(ed.root.dataset.theme).toBe('light');
    ed.setTheme('dark');
    expect(ed.root.dataset.theme).toBe('dark');
  });

  it('destroy removes portals and toolbar', () => {
    const ed = makeEditor();
    ed.ui!.openPanelFor('heading');
    ed.destroy();
    expect(document.querySelector('.le-portal')).toBeNull();
  });
});

describe('selection sync', () => {
  it('reads a DOM selection the editor has not processed yet before opening a panel', () => {
    const ed = makeEditor({ content: '<p>ab</p>' });
    ed.focus();
    const text = ed.view.dom.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    ed.ui!.openPanelFor('link');
    const input = dialog()!.querySelector<HTMLInputElement>('input[type="url"]')!;
    input.value = 'https://a.com';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ed.getHTML()).toBe('<p><a href="https://a.com">ab</a></p>');
  });
});
