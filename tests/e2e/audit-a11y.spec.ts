import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { contrast, control, html, MOD, openEmpty, panel, WCAG_AA } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('audit #34: the image panel file picker is focusable and opens the file dialog with Enter', async ({ page }) => {
  await openEmpty(page);
  await control(page, 'image').click();
  const picker = panel(page).locator('.le-file-button');
  await expect(picker).toBeFocused();
  // Record that Enter asks the hidden input for the native file dialog. Playwright's
  // 'filechooser' event is skipped here: under load it intermittently never arrives.
  const input = panel(page).locator('input[type="file"]');
  await input.evaluate((el) => el.addEventListener('click', () => (el.dataset.opened = 'true'), { once: true }));
  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('data-opened', 'true');
  await input.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => html(page)).toMatch(/<img src="\/__uploads\/\d+"/);
});


for (const theme of ['light', 'dark']) {
  test(`audit #65: selected menu items, field borders and code titles meet WCAG AA (${theme})`, async ({ page }) => {
    await openEmpty(page, `theme=${theme}`);
    await page.keyboard.type('text');
    await control(page, 'align').click();
    const selected = panel(page).locator('[data-item="align:left"]');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    const item = await selected.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      label: getComputedStyle(el.querySelector('.le-control-label')!).color,
      hint: getComputedStyle(el.querySelector('.le-control-hint')!).color,
    }));
    expect(contrast(item.label, item.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);
    expect(contrast(item.hint, item.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);

    await page.keyboard.press('Escape');
    await page.keyboard.press(`${MOD}+f`);
    const field = await panel(page)
      .locator('.le-input')
      .first()
      .evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, bg: getComputedStyle(el.closest('.le-portal')!).backgroundColor }));
    expect(contrast(field.border, field.bg)).toBeGreaterThanOrEqual(WCAG_AA.nonText);

    const code = await page.evaluate(() => {
      const style = getComputedStyle(window.__editor.root);
      return { title: style.getPropertyValue('--le-code-title'), bg: style.getPropertyValue('--le-color-code-bg') };
    });
    expect(contrast(code.title, code.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
}

test.describe('audit #32/#61: main toolbar tooltips', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name.startsWith('mobile'), 'tooltips belong to the desktop toolbar'));

  /** A strip just under the toolbar, beneath control `id`: where its tooltip belongs (above the caret line). */
  async function underControl(page: Page, id: string): Promise<Buffer> {
    const box = (await page.locator(`#editor .le-toolbar [data-item="${id}"]`).boundingBox())!;
    const bar = (await page.locator('#editor .le-toolbar').boundingBox())!;
    const x = Math.max(0, box.x - box.width);
    return page.screenshot({ clip: { x, y: bar.y + bar.height + 1, width: box.width * 3, height: 12 } });
  }

  test('a hovered control shows its label and shortcut, readable and unclipped', async ({ page }) => {
    await page.goto('./?empty');
    const bold = page.locator('#editor .le-toolbar [data-item="bold"]');
    const before = await underControl(page, 'bold');
    await bold.hover();
    await expect.poll(async () => (await underControl(page, 'bold')).equals(before)).toBe(false);
    const tip = page.getByText((await bold.getAttribute('data-tooltip'))!, { exact: true });
    await expect(tip).toBeVisible();
    const colors = await tip.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    expect(contrast(colors.fg, colors.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });

  test('a keyboard-focused control shows it too', async ({ page }) => {
    await openEmpty(page);
    const before = await underControl(page, 'undo');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#editor .le-toolbar [data-item="undo"]')).toBeFocused();
    await expect.poll(async () => (await underControl(page, 'undo')).equals(before)).toBe(false);
  });
});

/** Loads a table followed by a paragraph; returns the bar that holds the table tools on this device and its first control. */
async function withTable(page: Page, info: TestInfo): Promise<{ bar: Locator; first: Locator }> {
  await openEmpty(page);
  await page.evaluate(() => window.__editor.setHTML('<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table><p>after</p>'));
  const bar = page.locator(info.project.name.startsWith('mobile') ? '.le-mobile-bar:not([hidden])' : '.le-context-toolbar:not([hidden])');
  return { bar, first: bar.locator('[data-item="tableAddRowAfter"]') };
}

test('audit #33/#60: Alt+F10 reaches the table tools from the keyboard and Escape returns to the editor', async ({ page }, info) => {
  const { bar, first } = await withTable(page, info);
  await page.click('#editor td >> nth=1');
  await expect(first).toBeVisible();
  await page.keyboard.press('Alt+F10');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bar.locator('[data-item="tableAddColumnAfter"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor tr')).toHaveCount(2);
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
  await expect(bar).toBeVisible();
});

test('audit #33/#60 review: Alt+F10 pressed right after the caret moves into the table reaches the table tools', async ({ page }, info) => {
  const { first } = await withTable(page, info);
  await page.click('#editor p >> text=after');
  await page.keyboard.press('Home');
  // No wait between the keys: the caret move and Alt+F10 land in the same frame.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Alt+F10');
  await expect(first).toBeFocused();
});
