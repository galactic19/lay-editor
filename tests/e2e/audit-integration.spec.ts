import { expect, test } from '@playwright/test';
import { control, MOD, openEmpty, panel } from './helpers';

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

test('an open panel follows an OS color scheme change (#3, #63)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openEmpty(page);
  await page.keyboard.press(`${MOD}+f`);
  await expect(panel(page)).toHaveCount(1);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#editor .le-editor')).toHaveAttribute('data-theme', 'dark');
  // The panel stays open and follows, and so does the bottom sheet's backdrop on mobile.
  await expect(panel(page)).toHaveAttribute('data-theme', 'dark');
  for (const backdrop of await page.locator('.le-sheet-backdrop').all()) await expect(backdrop).toHaveAttribute('data-theme', 'dark');
});

test('registerIcon with SVG copied from an HTML page renders the icon, not a parser error page (#57)', async ({ page }) => {
  await page.goto('./');
  const bodyHeight = () => page.evaluate(() => document.body.getBoundingClientRect().height);
  const before = await bodyHeight();
  await page.evaluate(async (entry) => {
    const { registerIcon } = (await import(/* @vite-ignore */ entry)) as typeof import('../../src');
    registerIcon('bold', '<svg viewBox="0 0 24 24"><path d="M6 4h8"><path d="M6 12h9"></svg>');
    window.__editor.setLocale('ko');
  }, '/src/index.ts');
  await page.click('#editor .ProseMirror');
  const icon = control(page, 'bold').locator(':scope > *');
  await expect(icon).toHaveCount(1);
  expect(await icon.evaluate((el) => [el.localName, el.namespaceURI])).toEqual(['svg', 'http://www.w3.org/2000/svg']);
  await expect(page.locator('parsererror')).toHaveCount(0);
  expect(await bodyHeight()).toBe(before);
});
