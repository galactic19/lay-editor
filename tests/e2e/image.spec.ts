import { expect, test } from '@playwright/test';
import { control, html, openEmpty, panel } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function pickFile(page: import('@playwright/test').Page): Promise<void> {
  await control(page, 'image').click();
  await panel(page).locator('input[type="file"]').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
}

test('uploads a picked file and inserts the returned URL', async ({ page }) => {
  await openEmpty(page);
  await pickFile(page);
  await expect.poll(() => html(page)).toMatch(/<figure data-align="center"><img src="\/__uploads\/\d+" alt=""><figcaption><\/figcaption><\/figure>/);
  await expect(page.locator('#editor .le-uploading')).toHaveCount(0);
});

test('shows a toast and removes the placeholder when the upload fails', async ({ page }) => {
  await openEmpty(page, 'fail');
  await pickFile(page);
  await expect(page.locator('#editor .le-toast-error')).toBeVisible();
  await expect(page.locator('#editor .le-image')).toHaveCount(0);
  expect(await html(page)).toBe('');
});
