import { expect, test } from '@playwright/test';
import { html, MOD, openEmpty } from './helpers';

test('Ctrl+Z after setHTML never brings back the previous document', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('Post A first paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Post A second');
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('');
  await page.evaluate(() => window.__editor.setHTML('<p>Post B loaded from server</p>'));
  await page.click('#editor .ProseMirror');
  await page.keyboard.press(`${MOD}+z`);
  expect(await html(page)).toBe('<p>Post B loaded from server</p>');
});
