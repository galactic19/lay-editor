import { expect, test } from '@playwright/test';
import { control, openEmpty, panel } from './helpers';

test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('mobile'), 'mobile layout only'));

test('pins the toolbar to the bottom of the screen while editing', async ({ page }) => {
  await openEmpty(page);
  const bar = page.locator('.le-mobile-bar:not([hidden])');
  await expect(bar).toBeVisible();
  await expect(page.locator('#editor .le-toolbar')).toHaveCount(0);
  const box = (await bar.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.75);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('opens panels as a bottom sheet', async ({ page }) => {
  await openEmpty(page);
  await control(page, 'textColor').click();
  const sheet = page.locator('.le-sheet');
  await expect(sheet).toBeVisible();
  await expect(panel(page)).toHaveCount(1);
  await page.locator('.le-sheet-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(sheet).toHaveCount(0);
});

test('shows image width buttons when an image is selected', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => window.__editor.exec('insertImage', { src: '/__uploads/none.png', alt: 'x' }));
  await page.locator('#editor .le-image img').click();
  await expect(control(page, 'imageWidth50')).toBeVisible();
  await control(page, 'imageWidth50').click();
  await expect.poll(() => page.evaluate(() => window.__editor.getHTML())).toContain('width: 50%;');
});
