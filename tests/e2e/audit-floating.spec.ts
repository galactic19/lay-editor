import { expect, test, type Locator, type Page } from '@playwright/test';
import { control, openEmpty, panel } from './helpers';

const isMobile = (name: string): boolean => name.startsWith('mobile');

/** Whether the element's centre point hits the element itself (once its entry animation ends), i.e. nothing is painted over it. */
const onTop = (locator: Locator): Promise<boolean> =>
  locator.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit && el.contains(hit));
  });

const isFullscreen = (page: Page): Promise<boolean> => page.locator('#editor .le-editor').evaluate((el) => el.classList.contains('le-fullscreen'));

test.describe('fullscreen stacking (#28, #38)', () => {
  test('dropdowns, the bubble and the slash menu stay above the fullscreen editor', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop floating UI');
    await openEmpty(page);
    await page.keyboard.type('hello world');
    await page.evaluate(() => window.__editor.exec('toggleFullscreen'));
    expect(await isFullscreen(page)).toBe(true);

    await control(page, 'heading').click();
    await expect(panel(page)).toBeVisible();
    expect(await onTop(panel(page))).toBe(true);
    await page.keyboard.press('Escape');

    await page.keyboard.press('Shift+Home');
    const bubble = page.locator('.le-bubble:not([hidden])');
    await expect(bubble).toBeVisible();
    expect(await onTop(bubble)).toBe(true);

    await page.keyboard.press('End');
    await page.keyboard.type(' /');
    const slash = page.locator('.le-slash-menu:not([hidden])');
    await expect(slash).toBeVisible();
    expect(await onTop(slash)).toBe(true);
  });

  test('the keyboard bar and bottom sheets stay above the fullscreen editor, so it can be left again', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'mobile keyboard bar');
    await openEmpty(page);
    await page.keyboard.type('hello');
    await control(page, 'fullscreen').tap();
    expect(await isFullscreen(page)).toBe(true);
    const bar = page.locator('.le-mobile-bar:not([hidden])');
    expect(await onTop(bar)).toBe(true);

    await control(page, 'textColor').tap();
    await expect(panel(page)).toBeVisible();
    expect(await onTop(panel(page))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);

    await control(page, 'fullscreen').tap({ timeout: 5000 });
    expect(await isFullscreen(page)).toBe(false);
  });
});
