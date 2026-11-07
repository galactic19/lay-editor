import { expect, test } from '@playwright/test';
import { control, html, MOD, openEmpty, panel } from './helpers';

test('formats with the toolbar and shortcuts', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('hello');
  await page.keyboard.press('Shift+Home');
  await control(page, 'bold').click();
  expect(await html(page)).toBe('<p><strong>hello</strong></p>');
  await expect(control(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press(`${MOD}+i`);
  expect(await html(page)).toBe('<p><strong><em>hello</em></strong></p>');
});

test('adds a link through the link panel', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('site');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press(`${MOD}+k`);
  const input = panel(page).locator('input[type="url"]');
  await expect(input).toBeFocused();
  await input.fill('https://example.com');
  await input.press('Enter');
  expect(await html(page)).toBe('<p><a href="https://example.com">site</a></p>');
  await expect(panel(page)).toHaveCount(0);
});

test('markdown shortcuts build blocks', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('## 제목');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- 하나');
  expect(await html(page)).toBe('<h2>제목</h2><ul><li><p>하나</p></li></ul>');
});
