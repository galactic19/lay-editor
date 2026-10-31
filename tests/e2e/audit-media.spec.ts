import { expect, test, type Page } from '@playwright/test';
import { contextControl, MOD, openEmpty } from './helpers';

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

/** Serves every /demo/*.png as a real (1px) image, so an image can be clicked. */
async function serveImages(page: Page): Promise<void> {
  const png = Buffer.from(PNG_DATA_URL.split(',')[1]!, 'base64');
  await page.route('**/demo/*.png', (route) => route.fulfill({ contentType: 'image/png', body: png }));
}

/** Fires a paste or drop carrying PNG files of the given sizes (and optional HTML) at `selector` (drops land at its start). */
async function sendFiles(page: Page, kind: 'paste' | 'drop', selector: string, sizes: number[], html = ''): Promise<void> {
  await page.evaluate(
    ([eventKind, target, byteSizes, markup]) => {
      const data = new DataTransfer();
      byteSizes.forEach((size, i) => data.items.add(new File([new Uint8Array(size)], `${i + 1}.png`, { type: 'image/png' })));
      if (markup) data.setData('text/html', markup);
      const el = document.querySelector(target)!;
      const rect = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, clientX: rect.left + 1, clientY: rect.top + rect.height / 2 };
      el.dispatchEvent(eventKind === 'paste' ? new ClipboardEvent('paste', { ...init, clipboardData: data }) : new DragEvent('drop', { ...init, dataTransfer: data }));
    },
    [kind, selector, sizes, html] as const,
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

  test('the hint in an empty caption leaves the caret where typing starts', async ({ page }) => {
    // The caption text is centred, so the caret of an empty caption belongs in the middle.
    const CARET_TOLERANCE = 2;
    await openEmpty(page);
    await seedImage(page);
    await page.locator('#editor .ProseMirror p').first().click();
    await page.locator('#editor .le-image img').click();
    const caption = page.locator('#editor .le-image figcaption');
    await caption.click();
    await expect.poll(() => page.evaluate(() => window.__editor.state.selection.$from.parent.type.name)).toBe('image');
    const caretX = await page.evaluate(() => window.__editor.view.coordsAtPos(window.__editor.state.selection.from).left);
    const box = (await caption.boundingBox())!;
    expect(Math.abs(caretX - (box.x + box.width / 2))).toBeLessThan(CARET_TOLERANCE);
    await page.keyboard.type('A');
    await expect(caption).toHaveText('A');
  });

  test('the empty caption stays hidden in read-only mode', async ({ page }) => {
    await openEmpty(page);
    await seedImage(page);
    await page.evaluate(() => window.__editor.setEditable(false));
    await page.locator('#editor .ProseMirror p').first().click();
    await page.locator('#editor .le-image img').click();
    expect((await captionPlaceholder(page)).display).toBe('none');
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

const captionedFigure = (src: string, caption: string) =>
  `<figure data-align="center" style="width: 25%;"><img src="${src}" alt=""><figcaption>${caption}</figcaption></figure>`;

/** Puts the caret two characters before the end of the nth image caption. */
async function caretInCaption(page: Page, nth = 0): Promise<void> {
  await page.locator('#editor .le-image figcaption').nth(nth).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => window.__editor.syncSelection());
}

test.describe('audit #68: pasting from inside a caption inserts after that image', () => {
  test.beforeEach(async ({ page }) => {
    await serveImages(page);
    await openEmpty(page);
    await uploadBySize(page);
  });

  test('a screenshot', async ({ page }) => {
    await page.evaluate((html) => window.__editor.setHTML(`${html}<p>after</p>`), captionedFigure('/demo/missing.png', 'My caption'));
    await caretInCaption(page);
    await sendFiles(page, 'paste', '#editor .ProseMirror', [70]);
    await expect.poll(() => imageSrcs(page)).toEqual(['/demo/missing.png', '/__uploads/size-70']);
    await expect(page.locator('#editor .le-image figcaption')).toHaveText(['My caption', '']);
  });

  test('an image copied from a web page (HTML plus the image file)', async ({ page }) => {
    await page.evaluate((html) => window.__editor.setHTML(`${html}<p>after</p>`), captionedFigure('/demo/missing.png', 'My caption'));
    await caretInCaption(page);
    await sendFiles(page, 'paste', '#editor .ProseMirror', [70], '<img src="/demo/copied.png">');
    await expect.poll(() => imageSrcs(page)).toEqual(['/demo/missing.png', '/demo/copied.png']);
    await expect(page.locator('#editor .le-image figcaption')).toHaveText(['My caption', '']);
  });

  test('an image copied in the editor with the keyboard', async ({ page }) => {
    await page.evaluate((html) => window.__editor.setHTML(`${html}<p>after</p>`), captionedFigure('/demo/a.png', 'first') + captionedFigure('/demo/b.png', 'second caption'));
    // Clicking elsewhere first keeps the image click from counting as a double click with openEmpty's.
    await page.locator('#editor .ProseMirror p').click();
    await page.locator('#editor .le-image img').first().click();
    await page.keyboard.press(`${MOD}+c`);
    await caretInCaption(page, 1);
    await page.keyboard.press(`${MOD}+v`);
    await expect.poll(() => imageSrcs(page)).toEqual(['/demo/a.png', '/demo/b.png', '/demo/a.png']);
    await expect(page.locator('#editor .le-image figcaption')).toHaveText(['first', 'second caption', 'first']);
  });
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

test('audit #9: the more menu leads out of the source view after a UI rebuild in read-only mode', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'the more menu is part of the desktop toolbar');
  await openEmpty(page);
  await page.evaluate(() => window.__editor.setHTML('<p>kept</p>'));
  await page.evaluate(() => {
    window.__editor.exec('toggleSourceView');
    window.__editor.setEditable(false);
    window.__editor.setLocale('en');
  });
  const more = page.locator('#editor .le-toolbar [data-item="more"]');
  await expect(page.locator('#editor .le-toolbar [data-item="sourceView"]')).toBeHidden();
  await expect(more).toHaveAttribute('aria-disabled', 'false');
  await more.click();
  await page.locator('.le-dropdown [data-item="sourceView"]').click();
  await expect(page.locator('#editor textarea.le-source')).toHaveCount(0);
  expect(await page.evaluate(() => window.__editor.getHTML())).toBe('<p>kept</p>');
});
