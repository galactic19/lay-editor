import { setMedia } from '../setup';
import { flushPromises, makeEditor } from '../helpers/editor';

const COARSE = '(pointer: coarse)';
const bar = () => document.querySelector<HTMLElement>('.le-mobile-bar')!;
const barItem = (id: string) => bar().querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!;
const source = () => document.querySelector<HTMLTextAreaElement>('.le-source')!;

function mobileEditor(content = '<p>a</p>') {
  setMedia(COARSE, true);
  const ed = makeEditor({ content });
  ed.focus();
  ed.ui!.flush();
  return ed;
}

describe('audit: mobile keyboard bar', () => {
  it('stays visible while the HTML source textarea has focus, so source view can be closed again', async () => {
    const ed = mobileEditor();
    ed.exec('toggleSourceView');
    await flushPromises();
    expect(document.activeElement).toBe(source());
    expect(bar().hidden).toBe(false);
    expect(barItem('sourceView').getAttribute('aria-pressed')).toBe('true');
    expect(barItem('sourceView').getAttribute('aria-disabled')).toBe('false');

    source().blur();
    await flushPromises();
    expect(bar().hidden).toBe(true);
    source().focus();
    expect(bar().hidden).toBe(false);

    barItem('sourceView').click();
    expect(document.querySelector('.le-source')).toBeNull();
    expect(bar().hidden).toBe(false);
  });

  it('shows the bar when the device turns mobile while source view is open', () => {
    const ed = makeEditor();
    ed.focus();
    ed.exec('toggleSourceView');
    setMedia(COARSE, true);
    expect(ed.root.dataset.mode).toBe('mobile');
    expect(bar().hidden).toBe(false);
  });
});
