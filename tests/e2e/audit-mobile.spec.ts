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
