import { expect, test, type Page } from '@playwright/test';
import { contrast, openEmpty, WCAG_AA } from './helpers';

/** Text color against the background color of the element(s) `selector` in the editor content. */
const textContrasts = (page: Page, selector: string): Promise<number[]> =>
  page.locator(`#editor .ProseMirror ${selector}`).evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return `${style.color}|${style.backgroundColor}`;
    }),
  ).then((pairs) => pairs.map((pair) => contrast(...(pair.split('|') as [string, string]))));

test('final review: shaded table cells stay readable in the dark theme, palette and pasted fills alike', async ({ page }) => {
  await openEmpty(page, 'theme=dark');
  const fills = await page.evaluate(() => window.__editor.root.dataset.theme);
  expect(fills).toBe('dark');
  await page.evaluate(() => {
    const palette = ['#ffec99', '#ffd8a8', '#ffc9c9', '#d3f9d8', '#d0ebff', '#e5dbff', '#fcc2d7', '#c5f6fa', '#e9ecef', '#fff3bf', '#d9d9d9', '#ffff00'];
    const cells = palette.map((color) => `<td style="background-color: ${color};"><p>cell</p></td>`).join('');
    window.__editor.setHTML(`<table><tbody><tr>${cells}</tr><tr>${palette.map(() => '<td><p>plain</p></td>').join('')}</tr></tbody></table>`);
  });
  for (const ratio of await textContrasts(page, 'td[style*="background-color"]')) expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.text);
  // Cells without a fill keep the theme's text color on the theme background.
  const plain = await page.locator('#editor .ProseMirror td:not([style])').first().evaluate((el) => getComputedStyle(el).color);
  const fg = await page.evaluate(() => getComputedStyle(window.__editor.root).getPropertyValue('--le-color-fg').trim());
  expect(contrast(plain, fg)).toBe(1);
});

for (const theme of ['light', 'dark']) {
  test(`final review: error toasts meet WCAG AA (${theme})`, async ({ page }) => {
    await openEmpty(page, `theme=${theme}`);
    await page.evaluate(() => window.__editor.ui!.toaster.show('x', 'error'));
    const toast = await page.locator('.le-toast-error').evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    expect(contrast(toast.fg, toast.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
}
