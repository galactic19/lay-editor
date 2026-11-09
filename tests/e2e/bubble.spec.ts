import { expect, test } from '@playwright/test';
import { html, openEmpty } from './helpers';

test('shows the bubble for a selection and formats from it', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'the bubble is desktop-only');
  await openEmpty(page);
  await page.keyboard.type('hello world');
  await page.keyboard.press('Shift+Home');
  const bubble = page.locator('.le-bubble:not([hidden])');
  await expect(bubble).toBeVisible();
  await bubble.locator('[data-item="italic"]').click();
  expect(await html(page)).toBe('<p><em>hello world</em></p>');
  await page.keyboard.press('End');
  await expect(bubble).toHaveCount(0);
});
