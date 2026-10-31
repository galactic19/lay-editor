import { expect, test } from '@playwright/test';
import { MOD } from './helpers';

test.beforeEach(({}, info) => test.skip(info.project.name.startsWith('mobile'), 'desktop layout'));

for (const width of [1280, 900, 700]) {
  test(`the toolbar never clips controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const toolbar = page.locator('#editor .le-toolbar');
    await expect(toolbar).toBeVisible();
    const { scroll, client } = await toolbar.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    const hidden = await toolbar.evaluate((el) =>
      Array.from(el.querySelectorAll<HTMLElement>('[data-item]:not([data-item="more"])')).filter((c) => c.hidden).map((c) => c.dataset.item),
    );
    if (hidden.length) {
      await toolbar.locator('[data-item="more"]').click();
      const listed = await page.locator('.le-dropdown [data-item]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.item));
      expect(listed).toEqual(hidden);
    }
  });
}

test('a panel opened by shortcut appears next to the editor, not at the page corner', async ({ page }) => {
  await page.goto('./');
  const second = page.locator('#editor-2 .ProseMirror');
  await second.click();
  await page.keyboard.press(`${MOD}+f`);
  const panel = page.locator('.le-dropdown');
  await expect(panel).toBeVisible();
  const editorBox = (await page.locator('#editor-2 .le-editor').boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.y).toBeGreaterThan(editorBox.y - panelBox.height - 8);
  expect(panelBox.y).toBeLessThan(editorBox.y + editorBox.height + 8);
});
