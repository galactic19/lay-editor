import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { control, html, MOD, openEmpty, panel, touchDrag } from './helpers';

const mobileOnly = (info: TestInfo): void => test.skip(!info.project.name.startsWith('mobile'), 'the keyboard bar and bottom sheets exist only in mobile mode');
const visibleBar = (page: Page) => page.locator('.le-mobile-bar:not([hidden])');
/** The --le-touch-target token in pixels. */
const touchTarget = (page: Page): Promise<number> => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editor .le-editor')!).getPropertyValue('--le-touch-target')));

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

test('shows the table tools after inserting a table from the end of the bar', async ({ page }, info) => {
  mobileOnly(info);
  await openEmpty(page);
  await control(page, 'table').tap();
  await panel(page).locator('[data-rows="2"][data-cols="2"]').tap();
  await expect(control(page, 'tableAddRowAfter')).toBeInViewport({ ratio: 1 });
});

test('repaints the keyboard bar when the OS switches to dark while editing', async ({ page }, info) => {
  mobileOnly(info);
  await page.emulateMedia({ colorScheme: 'light' });
  await openEmpty(page);
  await expect(visibleBar(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#editor .le-editor')).toHaveAttribute('data-theme', 'dark');
  await expect(visibleBar(page)).toHaveAttribute('data-theme', 'dark');
});

test('gives the bottom-sheet drag area and checkbox rows a full touch target', async ({ page }, info) => {
  mobileOnly(info);
  await openEmpty(page);
  const target = await touchTarget(page);
  for (const item of ['link', 'findReplace']) {
    await control(page, item).tap();
    const row = (await panel(page).locator('label:has(input[type="checkbox"])').boundingBox())!;
    expect(row.height, item).toBeGreaterThanOrEqual(target);
    await page.keyboard.press('Escape');
  }

  await control(page, 'textColor').tap();
  const sheet = page.locator('.le-sheet');
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const handle = (await page.locator('.le-sheet-handle').boundingBox())!;
  expect(handle.height).toBeGreaterThanOrEqual(target);
  // A drag that starts a little below the visible grip still closes the sheet.
  await touchDrag(page, handle.x + handle.width / 2, handle.y + handle.height / 2 + 10, 150);
  await expect(sheet).toHaveCount(0);
});

test('applies a link typed without a scheme from the link panel', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('visit');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press(`${MOD}+k`);
  await panel(page).locator('input[type="url"]').fill('naver.com');
  await panel(page).locator('button[type="submit"]').click();
  await expect(panel(page)).toHaveCount(0);
  expect(await html(page)).toBe('<p><a href="https://naver.com">visit</a></p>');
});

test('completes the scheme in the image form and shows why the video form rejects a URL', async ({ page }) => {
  await openEmpty(page);
  const submit = async (item: string, url: string) => {
    await page.evaluate((id) => window.__editor.ui!.openPanelFor(id), item);
    await panel(page).locator('input[type="url"]').fill(url);
    await panel(page).locator('button[type="submit"]').click();
  };
  await submit('image', 'example.com/photo.jpg');
  await expect(panel(page)).toHaveCount(0);
  expect(await html(page)).toContain('src="https://example.com/photo.jpg"');

  await submit('video', 'example.com/clip');
  await expect(panel(page).locator('input[type="url"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(page.locator('#editor [data-video]')).toHaveCount(0);
});

// Portrait, and landscape where the sheet takes most of the height.
for (const size of [
  { width: 360, height: 640 },
  { width: 740, height: 360 },
]) {
  test(`scrolls each find result into view, clear of a bottom sheet (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await openEmpty(page);
    await page.evaluate(() => window.__editor.setHTML(Array.from({ length: 60 }, (_, i) => `<p>${i % 10 ? 'filler' : 'NEEDLE'} ${i}</p>`).join('')));
    await page.evaluate(() => window.__editor.ui!.openPanelFor('findReplace'));
    await panel(page).locator('[data-field="find"]').fill('NEEDLE');
    const current = page.locator('#editor .le-find-current');
    const coveredBySheet = () =>
      page.evaluate(() => {
        const sheet = document.querySelector('.le-sheet')?.getBoundingClientRect();
        return Boolean(sheet && document.querySelector('#editor .le-find-current')!.getBoundingClientRect().bottom > sheet.top);
      });
    for (let step = 1; step <= 6; step++) {
      await panel(page).locator('[data-action="next"]').click();
      await expect(panel(page).locator('[data-field="status"]')).toContainText(`${step}/6`);
      await expect(current).toBeInViewport({ ratio: 1 });
      await expect.poll(coveredBySheet, { message: `match ${step}` }).toBe(false);
    }
  });
}
