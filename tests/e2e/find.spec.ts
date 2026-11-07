import { expect, test } from '@playwright/test';
import { html, MOD, openEmpty, panel } from './helpers';

test('finds and replaces all with the keyboard shortcut', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('사과 배 사과');
  await page.keyboard.press(`${MOD}+f`);
  const find = panel(page).locator('input[data-field="find"]');
  await expect(find).toBeFocused();
  await find.fill('사과');
  await expect(page.locator('#editor .le-find-match')).toHaveCount(2);
  await panel(page).locator('input[data-field="replace"]').fill('포도');
  await panel(page).locator('[data-action="replaceAll"]').click();
  expect(await html(page)).toBe('<p>포도 배 포도</p>');
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor .le-find-match')).toHaveCount(0);
});
