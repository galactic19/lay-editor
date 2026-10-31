import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { control, openEmpty } from './helpers';

const mobileOnly = (info: TestInfo): void => test.skip(!info.project.name.startsWith('mobile'), 'the keyboard bar and bottom sheets exist only in mobile mode');
const visibleBar = (page: Page) => page.locator('.le-mobile-bar:not([hidden])');

test('keeps the keyboard bar in source view so the user can switch back', async ({ page }, info) => {
  mobileOnly(info);
  await openEmpty(page);
  await page.keyboard.type('hello');
  await control(page, 'sourceView').tap();
  const source = page.locator('#editor .le-source');
  await expect(source).toBeFocused();
  await expect(control(page, 'sourceView')).toHaveAttribute('aria-pressed', 'true');
  await source.tap();
  await expect(visibleBar(page)).toHaveCount(1);
  await control(page, 'sourceView').tap();
  await expect(source).toHaveCount(0);
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
});

test('keeps the caret line above the keyboard bar while typing past one screen', async ({ page }, info) => {
  mobileOnly(info);
  await openEmpty(page);
  const clearance = () =>
    page.evaluate(() => {
      const { view } = window.__editor;
      const caret = view.coordsAtPos(view.state.selection.head);
      return document.querySelector('.le-mobile-bar:not([hidden])')!.getBoundingClientRect().top - caret.bottom;
    });
  for (let line = 1; line <= 30; line++) {
    await page.keyboard.type(`line ${line}`);
    await page.keyboard.press('Enter');
    await expect.poll(clearance, { message: `caret of line ${line + 1}` }).toBeGreaterThanOrEqual(0);
  }
});
