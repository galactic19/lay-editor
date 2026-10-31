import { TextSelection } from 'prosemirror-state';
import { setMedia, setViewport } from '../../setup';
import { findText, flushPromises, makeEditor } from '../../helpers/editor';

const COARSE = '(pointer: coarse)';
const bar = () => document.querySelector<HTMLElement>('.le-mobile-bar')!;
const ids = () => Array.from(bar().querySelectorAll<HTMLElement>('[data-item]')).map((el) => el.dataset.item);

function mobileEditor(content = '<p>a</p>') {
  setMedia(COARSE, true);
  return makeEditor({ content });
}

describe('mobile mode', () => {
  it('uses a mobile bar in a portal instead of the top toolbar', () => {
    const ed = mobileEditor();
    expect(ed.root.dataset.mode).toBe('mobile');
    expect(bar()).not.toBeNull();
    expect(bar().parentElement).toBe(document.body);
    expect(ed.root.querySelector('.le-toolbar')).toBeNull();
    expect(document.querySelector('.le-bubble')).toBeNull();
  });

  it('shows only while the editor is focused', async () => {
    const ed = mobileEditor();
    ed.ui!.flush();
    expect(bar().hidden).toBe(true);
    ed.focus();
    ed.ui!.flush();
    expect(bar().hidden).toBe(false);
    ed.blur();
    await flushPromises();
    expect(bar().hidden).toBe(true);
  });

  it('sits above the on-screen keyboard', () => {
    const ed = mobileEditor();
    ed.focus();
    ed.ui!.flush();
    setViewport({ height: window.innerHeight - 300, offsetTop: 0 });
    expect(bar().style.bottom).toBe('300px');
  });

  it('swaps to table tools inside a table, keeping text tools that work there', () => {
    const ed = mobileEditor('<table><tbody><tr><td><p>x</p></td></tr></tbody></table>');
    ed.focus();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, findText(ed, 'x'))));
    ed.ui!.flush();
    expect(ids()[0]).toBe('tableAddRowAfter');
    expect(ids()).toContain('bold');
    expect(ids()).not.toContain('table');
  });

  it('opens panels as a bottom sheet that closes on a backdrop tap', () => {
    const ed = mobileEditor();
    ed.focus();
    ed.ui!.flush();
    bar().querySelector<HTMLButtonElement>('[data-item="textColor"]')!.click();
    const sheet = document.querySelector<HTMLElement>('.le-sheet')!;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.querySelector('.le-swatch')).not.toBeNull();
    document.querySelector<HTMLElement>('.le-sheet-backdrop')!.click();
    expect(document.querySelector('.le-sheet')).toBeNull();
  });

  it('closes a sheet when its handle is dragged down far enough', () => {
    const ed = mobileEditor();
    ed.ui!.openPanelFor('textColor');
    const handle = document.querySelector<HTMLElement>('.le-sheet-handle')!;
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 150 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 150 }));
    expect(document.querySelector('.le-sheet')).not.toBeNull();
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 300 }));
    expect(document.querySelector('.le-sheet')).toBeNull();
  });

  it('uses the smaller table grid on mobile', () => {
    const ed = mobileEditor();
    ed.ui!.openPanelFor('table');
    expect(document.querySelectorAll('.le-sheet [data-rows]')).toHaveLength(36);
  });

  it('rebuilds the UI when the device mode changes at runtime', () => {
    const ed = makeEditor();
    expect(ed.root.dataset.mode).toBe('desktop');
    const onMode = vi.fn();
    ed.on('modeChange', onMode);
    setMedia(COARSE, true);
    expect(onMode).toHaveBeenCalledWith('mobile');
    expect(ed.root.dataset.mode).toBe('mobile');
    expect(ed.root.querySelector('.le-toolbar')).toBeNull();
    expect(bar()).not.toBeNull();
    setMedia(COARSE, false);
    expect(ed.root.querySelector('.le-toolbar')).not.toBeNull();
    expect(document.querySelector('.le-mobile-bar')).toBeNull();
  });
});
