import { expect, test } from '@playwright/test';
import { html, openEmpty } from './helpers';

test('inserts a block from the slash menu with the keyboard', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('/');
  const menu = page.locator('.le-slash-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<h3></h3>');
  await expect(menu).toHaveCount(0);
});

test('filters by Korean keywords', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('/목록');
  await expect(page.locator('.le-slash-menu:not([hidden]) [role="option"]').first()).toHaveAttribute('data-item', 'bulletList');
  await page.keyboard.press('Enter');
  await page.keyboard.type('항목');
  expect(await html(page)).toBe('<ul><li><p>항목</p></li></ul>');
});
