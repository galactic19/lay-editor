import { expect, test } from '@playwright/test';
import { control, html, openEmpty, panel } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('audit #34: the image panel file picker is focusable and opens the file dialog with Enter', async ({ page }) => {
  await openEmpty(page);
  await control(page, 'image').click();
  const picker = panel(page).locator('.le-file-button');
  await expect(picker).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => html(page)).toMatch(/<img src="\/__uploads\/\d+"/);
});
