import { expect, test } from '@playwright/test';
import { control } from './helpers';

test('the theme picked at runtime survives a language switch (#3, #63)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const root = page.locator('#editor .le-editor');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.click('#toggle-theme');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.click('#toggle-locale');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  // The rebuilt chrome is in English and, on mobile, the keyboard bar portal is dark as well.
  await page.click('#editor .ProseMirror');
  await expect(control(page, 'bold')).toHaveAttribute('aria-label', /^Bold/);
  for (const bar of await page.locator('.le-mobile-bar:not([hidden])').all()) await expect(bar).toHaveAttribute('data-theme', 'dark');
});
