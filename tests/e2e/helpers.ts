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

/** A toolbar control: the desktop top toolbar or the visible mobile keyboard bar. */
export const control = (page: Page, id: string) =>
  page.locator(`#editor .le-toolbar [data-item="${id}"], .le-mobile-bar:not([hidden]) [data-item="${id}"]`).first();

/** The open panel: a dropdown on desktop, a bottom sheet on mobile. */
export const panel = (page: Page) => page.locator('.le-dropdown, .le-sheet');

/** A tool for the current context (image, table...): the desktop context toolbar or the mobile keyboard bar. */
export const contextControl = (page: Page, id: string) =>
  page.locator(`.le-context-toolbar:not([hidden]) [data-item="${id}"], .le-mobile-bar:not([hidden]) [data-item="${id}"]`).first();
