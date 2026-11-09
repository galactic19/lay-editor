import type { Page } from '@playwright/test';

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * prosemirror-view writes its own selection back to the DOM this long after the editor gains focus, when it has
 * not yet read the DOM selection (its focus handler). A selection key pressed before that can be undone.
 */
const PM_FOCUS_SETTLE_MS = 20;

/** Waits for the editor's post-focus selection write: a timer set now with the same delay runs after it. */
const settleFocus = (page: Page): Promise<void> =>
  page.evaluate((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay)), PM_FOCUS_SETTLE_MS);

export async function openEmpty(page: Page, query = ''): Promise<void> {
  await page.goto(`./?empty${query ? `&${query}` : ''}`);
  await page.click('#editor .ProseMirror');
  await settleFocus(page);
}

export const html = (page: Page): Promise<string> => page.evaluate(() => window.__editor.getHTML());

/** Drives a real IME composition through the Chrome DevTools Protocol. */
export async function compose(page: Page, steps: string[], commit: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  for (const text of steps) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  await cdp.send('Input.insertText', { text: commit });
  await cdp.detach();
}

/** Drags one finger from (x, y) down by `dy` pixels through the Chrome DevTools Protocol. */
export async function touchDrag(page: Page, x: number, y: number, dy: number, steps = 5): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', at: number | null) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: at === null ? [] : [{ x, y: at }] });
  await touch('touchStart', y);
  for (let step = 1; step <= steps; step++) await touch('touchMove', y + (dy * step) / steps);
  await touch('touchEnd', null);
  await cdp.detach();
}

/** A toolbar control: the desktop top toolbar or the visible mobile keyboard bar. */
export const control = (page: Page, id: string) =>
  page.locator(`#editor .le-toolbar [data-item="${id}"], .le-mobile-bar:not([hidden]) [data-item="${id}"]`).first();

/** The open panel: a dropdown on desktop, a bottom sheet on mobile. */
export const panel = (page: Page) => page.locator('.le-dropdown, .le-sheet');

/** Clicks a toolbar control, through the desktop toolbar's "more" menu when the control has overflowed into it. */
export async function clickControl(page: Page, id: string): Promise<void> {
  const target = control(page, id);
  if (await target.isVisible()) return target.click();
  await page.locator('#editor .le-toolbar [data-item="more"]').click();
  await panel(page).locator(`[data-item="${id}"]`).click();
}

/** A tool for the current context (image, table...): the desktop context toolbar or the mobile keyboard bar. */
export const contextControl = (page: Page, id: string) =>
  page.locator(`.le-context-toolbar:not([hidden]) [data-item="${id}"], .le-mobile-bar:not([hidden]) [data-item="${id}"]`).first();

/** Fires a real paste event at the editor carrying `data`, one entry per MIME type (what another page or app would put there). */
export const paste = (page: Page, data: Record<string, string>): Promise<void> =>
  page.evaluate((entries) => {
    const clipboardData = new DataTransfer();
    Object.entries(entries).forEach(([type, value]) => clipboardData.setData(type, value));
    window.__editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, data);

export const pasteHTML = (page: Page, markup: string): Promise<void> => paste(page, { 'text/html': markup });

/** WCAG 2 AA minimum contrast ratios: normal text, and non-text parts such as input borders. */
export const WCAG_AA = { text: 4.5, nonText: 3 } as const;

/** WCAG 2 contrast ratio of two colors given as `#rrggbb` or `rgb()`. */
export function contrast(a: string, b: string): number {
  const luminance = (color: string): number => {
    const hex = color.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    const channels = hex ? hex.slice(1).map((part) => parseInt(part, 16)) : color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    const [r, g, b] = channels.map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
