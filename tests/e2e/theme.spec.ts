import { expect, test } from '@playwright/test';

test('switches to the dark theme', async ({ page }) => {
  await page.goto('./?theme=light');
  const root = page.locator('#editor .le-editor');
  await expect(root).toHaveAttribute('data-theme', 'light');
  const light = await root.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.click('#toggle-theme');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  const dark = await root.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
});
