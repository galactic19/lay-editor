import { expect, test, type Page } from '@playwright/test';
import { contextControl, openEmpty } from './helpers';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seedImage(page: Page, caption = ''): Promise<void> {
  await page.evaluate(
    ([src, text]) => window.__editor.setHTML(`<p>intro paragraph</p><figure data-align="center" style="width: 25%;"><img src="${src}" alt="dot"><figcaption>${text}</figcaption></figure><p>after</p>`),
    [PNG_DATA_URL, caption],
  );
}

const selectionType = (page: Page) => page.evaluate(() => window.__editor.state.selection.toJSON().type as string);
const captionPlaceholder = (page: Page) =>
  page.locator('#editor .le-image figcaption').evaluate((el) => ({ display: getComputedStyle(el).display, text: getComputedStyle(el, '::before').content }));

test.describe('audit #30: clicking an image', () => {
  test('selects it and shows the image tools', async ({ page }) => {
    await openEmpty(page);
    await seedImage(page);
    await page.locator('#editor .ProseMirror p').first().click();
    await page.locator('#editor .le-image img').click();
    expect(await selectionType(page)).toBe('node');
    expect(await page.evaluate(() => window.__editor.ui!.getContext())).toBe('image');
    await expect(contextControl(page, 'imageDelete')).toBeVisible();
  });

  test('shows the caption placeholder only while the image is active', async ({ page }) => {
    await openEmpty(page);
    await seedImage(page);
    await page.locator('#editor .ProseMirror p').first().click();
    expect((await captionPlaceholder(page)).display).toBe('none');
    await page.locator('#editor .le-image img').click();
    const hint = await page.evaluate(() => window.__editor.t('panel.image.caption'));
    expect(await captionPlaceholder(page)).toEqual({ display: 'block', text: `"${hint}"` });
  });

  test('a click in the caption still places the caret there', async ({ page }) => {
    await openEmpty(page);
    await seedImage(page, 'my caption');
    await page.locator('#editor .le-image figcaption').click();
    expect(await selectionType(page)).toBe('text');
    expect(await page.evaluate(() => window.__editor.state.selection.$from.parent.type.name)).toBe('image');
  });
});
