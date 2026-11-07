import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('the UMD bundle works from a plain script tag', async ({ page }) => {
  test.skip(!existsSync('dist/editor.umd.js'), 'run `npm run build` first');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('umd.html');
  await expect(page.locator('#editor .le-editor .ProseMirror')).toHaveText('UMD');
  await page.click('#editor .ProseMirror');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  expect(await page.evaluate(() => (window as unknown as { __umd: { getHTML(): string } }).__umd.getHTML())).toBe('<p>UMD!</p>');
  expect(errors).toEqual([]);
});
