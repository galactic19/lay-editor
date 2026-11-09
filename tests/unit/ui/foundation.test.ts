import { h } from '../../../src/ui/dom';
import { UIComponent } from '../../../src/ui/UIComponent';
import { registerIcon, renderIcon } from '../../../src/ui/icons';
import { formatShortcut } from '../../../src/ui/shortcut';
import { RovingFocus } from '../../../src/ui/roving';
import { trapFocus } from '../../../src/ui/focus';
import { PRESETS, SEPARATOR, BUBBLE_ITEMS } from '../../../src/ui/presets';
import { c } from '../../../src/ui/classes';
import type { Editor } from '../../../src/core/Editor';
import { makeEditor, typeText } from '../../helpers/editor';

describe('h', () => {
  it('builds element with class, attrs, listeners, children', () => {
    const click = vi.fn();
    const el = h('button', { class: 'a b', attrs: { 'aria-label': 'x', hidden: true, title: null }, on: { click } }, 'hi', null, h('span', {}, 'z'));
    expect(el.className).toBe('a b');
    expect(el.getAttribute('aria-label')).toBe('x');
    expect(el.hasAttribute('hidden')).toBe(true);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.textContent).toBe('hiz');
    el.click();
    expect(click).toHaveBeenCalled();
  });
});

class Probe extends UIComponent<HTMLDivElement> {
  calls = 0;
  constructor(editor: Editor) {
    super(editor, h('div'));
    this.listen(window, 'resize', () => this.calls++);
    this.subscribe('update', () => this.calls++);
  }
}

describe('UIComponent', () => {
  it('destroy removes listeners, subscriptions and the element', () => {
    const ed = makeEditor();
    const probe = new Probe(ed);
    document.body.appendChild(probe.el);
    probe.destroy();
    window.dispatchEvent(new Event('resize'));
    typeText(ed, 'a');
    expect(probe.calls).toBe(0);
    expect(probe.el.isConnected).toBe(false);
  });
});

describe('icons', () => {
  it('renders a registered lucide icon as svg', () => {
    const svg = renderIcon('bold');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('le-icon')).toBe(true);
  });

  it('falls back and warns once for unknown names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderIcon('no-such-icon');
    const svg = renderIcon('no-such-icon');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('registerIcon overrides with an svg string', () => {
    registerIcon('custom', '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
    expect(renderIcon('custom').querySelector('rect')).not.toBeNull();
  });
});

describe('formatShortcut', () => {
  it.each([
    ['Mod-Shift-b', true, '⌘⇧B'],
    ['Mod-Shift-b', false, 'Ctrl+Shift+B'],
    ['Mod-Alt-1', false, 'Ctrl+Alt+1'],
    ['Mod-]', true, '⌘]'],
  ])('%s (mac=%s) → %s', (spec, mac, out) => {
    expect(formatShortcut(spec, mac)).toBe(out);
  });
});

describe('RovingFocus', () => {
  it('moves with arrows and Home/End, one tab stop', () => {
    const box = h('div', {}, h('button', {}, '1'), h('button', {}, '2'), h('button', {}, '3'));
    document.body.appendChild(box);
    const roving = new RovingFocus(box, 'button');
    const [a, b, z] = Array.from(box.querySelectorAll('button'));
    expect([a, b, z].map((x) => x!.tabIndex)).toEqual([0, -1, -1]);
    a!.focus();
    a!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(b);
    b!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(z);
    z!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(a);
    a!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(z);
    expect(z!.tabIndex).toBe(0);
    roving.destroy();
  });
});

describe('trapFocus', () => {
  it('wraps Tab inside the container', () => {
    const box = h('div', {}, h('button', {}, '1'), h('button', {}, '2'));
    document.body.appendChild(box);
    const release = trapFocus(box);
    const [first, last] = Array.from(box.querySelectorAll('button'));
    last!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last!.dispatchEvent(tab);
    expect(document.activeElement).toBe(first);
    expect(tab.defaultPrevented).toBe(true);
    release();
  });
});

describe('presets', () => {
  it('have unique ids and full contains basic', () => {
    for (const ids of Object.values(PRESETS)) {
      const real = ids.filter((i) => i !== SEPARATOR);
      expect(new Set(real).size).toBe(real.length);
    }
    expect(PRESETS.basic.filter((i) => i !== SEPARATOR).every((i) => PRESETS.full.includes(i))).toBe(true);
    expect(BUBBLE_ITEMS.every((i) => PRESETS.full.includes(i))).toBe(true);
  });

  it('class helper prefixes names', () => {
    expect(c('toolbar', 'active')).toBe('le-toolbar le-active');
  });
});
