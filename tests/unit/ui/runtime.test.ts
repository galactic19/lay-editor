import { DeviceWatcher, ViewportTracker } from '../../../src/ui/device';
import { ThemeController } from '../../../src/ui/theme';
import { PanelHost } from '../../../src/ui/PanelHost';
import { Toaster } from '../../../src/ui/Toast';
import { h } from '../../../src/ui/dom';
import { DEFAULTS } from '../../../src/core/defaults';
import { setMedia, setViewport, triggerResize } from '../../setup';
import { makeEditor } from '../../helpers/editor';

const COARSE = '(pointer: coarse)';
const DARK = '(prefers-color-scheme: dark)';

function sized(width: number): HTMLElement {
  const el = h('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(el);
  return el;
}

describe('DeviceWatcher', () => {
  it('reports mobile for coarse pointer and narrow container, and notifies changes', () => {
    setMedia(COARSE, true);
    let width = 400;
    const el = sized(0);
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
    const watcher = new DeviceWatcher(el, 768);
    expect(watcher.mode).toBe('mobile');
    const onChange = vi.fn();
    watcher.onChange(onChange);
    width = 1000;
    triggerResize();
    expect(watcher.mode).toBe('desktop');
    expect(onChange).toHaveBeenCalledWith('desktop');
    width = 400;
    setMedia(COARSE, false);
    expect(watcher.mode).toBe('desktop');
    watcher.destroy();
  });
});

describe('ViewportTracker', () => {
  it('computes the keyboard inset from visualViewport', () => {
    const tracker = new ViewportTracker();
    const onChange = vi.fn();
    tracker.onChange(onChange);
    setViewport({ height: window.innerHeight - 300, offsetTop: 0 });
    expect(tracker.bottomInset).toBe(300);
    expect(onChange).toHaveBeenCalled();
    tracker.destroy();
  });
});

describe('ThemeController', () => {
  it('auto follows prefers-color-scheme changes on all targets', () => {
    const a = h('div');
    const b = h('div');
    const theme = new ThemeController(() => [a, b], 'auto');
    expect(a.dataset.theme).toBe('light');
    setMedia(DARK, true);
    expect([a.dataset.theme, b.dataset.theme]).toEqual(['dark', 'dark']);
    theme.set('light');
    setMedia(DARK, false);
    setMedia(DARK, true);
    expect(theme.resolved).toBe('light');
    theme.destroy();
  });
});

describe('PanelHost', () => {
  it('opens a dialog in a portal, closes on Escape and returns focus to the editor', () => {
    const ed = makeEditor();
    const host = new PanelHost(ed, () => 'desktop');
    const anchor = h('button');
    document.body.appendChild(anchor);
    host.openPanel(({ close }) => h('div', {}, h('input'), h('button', { on: { click: close } }, 'ok')), anchor);
    const dialog = document.querySelector<HTMLElement>('.le-portal.le-dropdown[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('input'));
    const focus = vi.spyOn(ed, 'focus');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.le-dropdown')).toBeNull();
    expect(host.isOpen).toBe(false);
    expect(focus).toHaveBeenCalled();
  });

  it('closes on an outside pointerdown, but not on the anchor', () => {
    const ed = makeEditor();
    const host = new PanelHost(ed, () => 'desktop');
    const anchor = h('button');
    document.body.appendChild(anchor);
    host.openPanel(() => h('div', {}, 'x'), anchor);
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(host.isOpen).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(host.isOpen).toBe(false);
  });

  it('copies the editor theme to the portal and replaces an open panel', () => {
    const ed = makeEditor();
    ed.root.dataset.theme = 'dark';
    const host = new PanelHost(ed, () => 'desktop');
    host.openPanel(() => h('div', {}, 'one'));
    host.openPanel(() => h('div', {}, 'two'));
    const portals = document.querySelectorAll<HTMLElement>('.le-dropdown');
    expect(portals).toHaveLength(1);
    expect(portals[0]!.textContent).toBe('two');
    expect(portals[0]!.dataset.theme).toBe('dark');
    host.destroy();
    expect(document.querySelector('.le-dropdown')).toBeNull();
  });
});

describe('Toaster', () => {
  it('announces with role=status and removes after the duration', () => {
    vi.useFakeTimers();
    const host = h('div');
    host.dataset.theme = 'dark';
    const toaster = new Toaster(host, () => 48);
    toaster.show('업로드 실패', 'error');
    const region = document.querySelector<HTMLElement>('.le-portal.le-toasts[role="status"]')!;
    expect(region.parentElement).toBe(document.body);
    expect(region.dataset.theme).toBe('dark');
    expect(region.style.getPropertyValue('--le-toast-offset')).toBe('48px');
    expect(region.textContent).toBe('업로드 실패');
    expect(region.querySelector('.le-toast-error')).not.toBeNull();
    vi.advanceTimersByTime(DEFAULTS.toast.duration);
    expect(region.textContent).toBe('');
    toaster.destroy();
    expect(region.isConnected).toBe(false);
  });
});
