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
    await expect(panel(page)).toHaveCount(0);
    expect(await isFullscreen(page)).toBe(true);

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

test('Escape leaves fullscreen while the caret is in the editor (#52)', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('hello');
  await page.evaluate(() => window.__editor.exec('toggleFullscreen'));
  expect(await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await isFullscreen(page)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.classList.contains('le-scroll-locked'))).toBe(false);
});

type Box = { x: number; y: number; width: number; height: number };

/** The open dropdown sits right under one of `targets` (its opener, or the selection), aligned to its left or right edge. */
async function expectPanelUnder(page: Page, targets: Box[]): Promise<void> {
  await expect(panel(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 16;
  const under = targets.some(
    (t) => near(box.y, t.y + t.height) && (near(box.x, t.x) || near(box.x + box.width, t.x + t.width)),
  );
  expect(under, `panel ${JSON.stringify(box)} vs ${JSON.stringify(targets)}`).toBe(true);
}

const selectionBox = (page: Page): Promise<Box> =>
  page.evaluate(() => {
    const { x, y, width, height } = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { x, y, width, height };
  });

/** Clicks a floating-toolbar button and checks where its panel opened. */
async function openFrom(page: Page, button: Locator): Promise<void> {
  const opener = (await button.boundingBox())!;
  const selection = await selectionBox(page);
  await button.click();
  await expectPanelUnder(page, [opener, selection]);
}

test.describe('panels anchor to what opened them (#29, #59)', () => {
  test.beforeEach(({}, info) => test.skip(isMobile(info.project.name), 'desktop dropdowns'));

  for (const id of ['link', 'textColor', 'highlight']) {
    test(`from the selection bubble: ${id}`, async ({ page }) => {
      await openEmpty(page);
      await page.keyboard.type('hello world');
      await page.keyboard.press('Shift+Home');
      await openFrom(page, page.locator(`.le-bubble:not([hidden]) [data-item="${id}"]`));
    });
  }

  for (const [id, content, target] of [
    ['codeLanguage', '<p>intro</p><pre><code>let a = 1;</code></pre>', '#editor pre'],
    ['tableCellColor', '<p>intro</p><table><tbody><tr><td><p>cell</p></td></tr></tbody></table>', '#editor td'],
    ['linkEdit', '<p>intro <a href="https://a.com">link</a> text</p>', '#editor a'],
  ] as const) {
    test(`from the context toolbar: ${id}`, async ({ page }) => {
      await openEmpty(page);
      await page.evaluate((html) => window.__editor.setHTML(html), content);
      await page.click(target);
      await openFrom(page, page.locator(`.le-context-toolbar:not([hidden]) [data-item="${id}"]`));
    });
  }

  test('from the toolbar overflow menu', async ({ page }) => {
    await openEmpty(page);
    const more = page.locator('#editor .le-toolbar [data-item="more"]');
    await expect(more).toBeVisible();
    const moreBox = (await more.boundingBox())!;
    await more.click();
    await panel(page).locator('[data-item="findReplace"]').click();
    await expect(panel(page).locator('.le-find-panel')).toBeVisible();
    await expectPanelUnder(page, [moreBox]);
  });
});
