import type { Page } from '@playwright/test';

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

export async function openEmpty(page: Page, query = ''): Promise<void> {
  await page.goto(`./?empty${query ? `&${query}` : ''}`);
  await page.click('#editor .ProseMirror');
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
