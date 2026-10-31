import { expect, test, type Page } from '@playwright/test';
import { control, html, MOD, openEmpty, panel } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('audit #34: the image panel file picker is focusable and opens the file dialog with Enter', async ({ page }) => {
  await openEmpty(page);
  await control(page, 'image').click();
  const picker = panel(page).locator('.le-file-button');
  await expect(picker).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => html(page)).toMatch(/<img src="\/__uploads\/\d+"/);
});

/** WCAG 2 contrast ratio of two colors given as `#rrggbb` or `rgb()`. */
function contrast(a: string, b: string): number {
  const luminance = (color: string): number => {
    const hex = color.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    const channels = hex ? hex.slice(1).map((part) => parseInt(part, 16)) : color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    const [r, g, b] = channels.map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

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
    expect(contrast(item.label, item.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(item.hint, item.bg)).toBeGreaterThanOrEqual(AA_TEXT);

    await page.keyboard.press('Escape');
    await page.keyboard.press(`${MOD}+f`);
    const field = await panel(page)
      .locator('.le-input')
      .first()
      .evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, bg: getComputedStyle(el.closest('.le-portal')!).backgroundColor }));
    expect(contrast(field.border, field.bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);

    const code = await page.evaluate(() => {
      const style = getComputedStyle(window.__editor.root);
      return { title: style.getPropertyValue('--le-code-title'), bg: style.getPropertyValue('--le-color-code-bg') };
    });
    expect(contrast(code.title, code.bg)).toBeGreaterThanOrEqual(AA_TEXT);
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
    expect(contrast(colors.fg, colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('a keyboard-focused control shows it too', async ({ page }) => {
    await openEmpty(page);
    const before = await underControl(page, 'undo');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#editor .le-toolbar [data-item="undo"]')).toBeFocused();
    await expect.poll(async () => (await underControl(page, 'undo')).equals(before)).toBe(false);
  });
});
