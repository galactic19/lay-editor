import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { contrast, control, openEmpty, WCAG_AA } from './helpers';

const isMobile = (info: TestInfo): boolean => info.project.name.startsWith('mobile');

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

test.describe('final review: the mobile keyboard bar covers nothing it should not', () => {
  test.beforeEach(({}, info) => test.skip(!isMobile(info), 'the keyboard bar is mobile only'));

  const barTop = (page: Page): Promise<number> => page.locator('.le-mobile-bar:not([hidden])').evaluate((el) => el.getBoundingClientRect().top);

  test('full screen keeps the last line and the status bar above the bar', async ({ page }) => {
    await openEmpty(page);
    await page.evaluate(() => window.__editor.exec('toggleFullscreen'));
    for (let i = 0; i < 30; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('last line');
    const top = await barTop(page);
    const caret = await page.evaluate(() => window.__editor.view.coordsAtPos(window.__editor.state.selection.head).bottom);
    expect(caret).toBeLessThanOrEqual(top);
    const status = await page.locator('#editor .le-status').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(status).toBeLessThanOrEqual(top + 1);
  });

  test('the slash menu does not run under the bar', async ({ page }) => {
    await openEmpty(page);
    for (let i = 0; i < 14; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = page.locator('.le-slash-menu:not([hidden])');
    await expect(menu).toBeVisible();
    const height = await menu.evaluate((el) => el.getBoundingClientRect().height);
    // Puts the caret where a menu below it would end inside the bar.
    await page.keyboard.press('Backspace');
    const top = await barTop(page);
    await page.evaluate(
      ({ target }) => {
        const caret = window.__editor.view.coordsAtPos(window.__editor.state.selection.head);
        window.scrollBy(0, caret.bottom - target);
      },
      { target: top - height + 20 },
    );
    await page.keyboard.type('/');
    await expect(menu).toBeVisible();
    const box = await menu.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    expect(box.bottom).toBeLessThanOrEqual(top);
    await expect(control(page, 'bold')).toBeVisible();
  });
});
