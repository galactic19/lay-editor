import { expect, test, type Page } from '@playwright/test';
import { contextControl, openEmpty } from './helpers';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seedImage(page: Page, caption = ''): Promise<void> {
  await page.evaluate(
    ([src, text]) => window.__editor.setHTML(`<p>intro paragraph</p><figure data-align="center" style="width: 25%;"><img src="${src}" alt="dot"><figcaption>${text}</figcaption></figure><p>after</p>`),
    [PNG_DATA_URL, caption],
  );
}

/** Answers uploads with a URL naming the file size, so each image can be traced back to its file. */
async function uploadBySize(page: Page): Promise<void> {
  await page.route('**/__upload', (route) => route.fulfill({ json: { url: `/__uploads/size-${route.request().postDataBuffer()!.length}` } }));
}

/** Fires a paste or drop carrying PNG files of the given sizes at `selector` (drops land at its start). */
async function sendFiles(page: Page, kind: 'paste' | 'drop', selector: string, sizes: number[]): Promise<void> {
  await page.evaluate(
    ([eventKind, target, byteSizes]) => {
      const data = new DataTransfer();
      byteSizes.forEach((size, i) => data.items.add(new File([new Uint8Array(size)], `${i + 1}.png`, { type: 'image/png' })));
      const el = document.querySelector(target)!;
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, clientX: rect.left + 1, clientY: rect.top + rect.height / 2 };
      el.dispatchEvent(eventKind === 'paste' ? new ClipboardEvent('paste', { ...init, clipboardData: data }) : new DragEvent('drop', { ...init, dataTransfer: data }));
    },
    [kind, selector, sizes] as const,
  );
}

const imageSrcs = (page: Page) => page.locator('#editor .le-image img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));

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
    // A click in text reaches ProseMirror through the asynchronous selectionchange event.
    await expect.poll(() => page.evaluate(() => window.__editor.state.selection.$from.parent.type.name)).toBe('image');
    expect(await selectionType(page)).toBe('text');
  });
});

test('audit #68: pasting a screenshot from inside a caption inserts it after that image', async ({ page }) => {
  await openEmpty(page);
  await uploadBySize(page);
  await page.evaluate(() =>
    window.__editor.setHTML('<figure data-align="center"><img src="/demo/missing.png" alt="original"><figcaption>My caption</figcaption></figure><p>after</p>'),
  );
  await page.locator('#editor .le-image figcaption').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => window.__editor.syncSelection());
  await sendFiles(page, 'paste', '#editor .ProseMirror', [70]);
  await expect.poll(() => imageSrcs(page)).toEqual(['/demo/missing.png', '/__uploads/size-70']);
  await expect(page.locator('#editor .le-image figcaption')).toHaveText(['My caption', '']);
});

test('audit #69: dropped files keep their order', async ({ page }) => {
  await openEmpty(page);
  await uploadBySize(page);
  await page.evaluate(() => window.__editor.setHTML('<p>first paragraph</p><p>second paragraph</p>'));
  await sendFiles(page, 'drop', '#editor .ProseMirror p:nth-child(2)', [11, 22, 33]);
  await expect.poll(() => imageSrcs(page)).toEqual(['/__uploads/size-11', '/__uploads/size-22', '/__uploads/size-33']);
  await expect(page.locator('#editor .ProseMirror > *')).toHaveCount(5);
  await expect(page.locator('#editor .ProseMirror > p').last()).toHaveText('second paragraph');
});
