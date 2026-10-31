import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEFAULTS } from '../../src/core/defaults';
import { contrast, control, html, openEmpty, paste, WCAG_AA } from './helpers';

const isMobile = (info: TestInfo): boolean => info.project.name.startsWith('mobile');

/** Text color against the background color of the element(s) `selector` in the editor content. */
const textContrasts = (page: Page, selector: string): Promise<number[]> =>
  page.locator(`#editor .ProseMirror ${selector}`).evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return `${style.color}|${style.backgroundColor}`;
    }),
  ).then((pairs) => pairs.map((pair) => contrast(...(pair.split('|') as [string, string]))));

test('final review: shaded table cells stay readable in the dark theme, palette and pasted fills alike', async ({ page }) => {
  await openEmpty(page, 'theme=dark');
  expect(await page.evaluate(() => window.__editor.root.dataset.theme)).toBe('dark');
  // The cell color palette, plus shading Word pastes (grey, yellow).
  const fills = [...DEFAULTS.colors.highlight, DEFAULTS.paste.namedColors.silver, DEFAULTS.paste.namedColors.yellow];
  await page.evaluate((colors) => {
    const cells = colors.map((color) => `<td style="background-color: ${color};"><p>cell</p></td>`).join('');
    window.__editor.setHTML(`<table><tbody><tr>${cells}</tr><tr>${colors.map(() => '<td><p>plain</p></td>').join('')}</tr></tbody></table>`);
  }, fills);
  for (const ratio of await textContrasts(page, 'td[style*="background-color"]')) expect(ratio).toBeGreaterThanOrEqual(WCAG_AA.text);
  // Cells without a fill keep the theme's text color on the theme background.
  const plain = await page.locator('#editor .ProseMirror td:not([style])').first().evaluate((el) => getComputedStyle(el).color);
  const fg = await page.evaluate(() => getComputedStyle(window.__editor.root).getPropertyValue('--le-color-fg').trim());
  expect(contrast(plain, fg)).toBe(1);
});

for (const theme of ['light', 'dark']) {
  test(`final review: error toasts meet WCAG AA (${theme})`, async ({ page }) => {
    await openEmpty(page, `theme=${theme}`);
    await page.evaluate(() => window.__editor.ui!.toaster.show('x', 'error'));
    const toast = await page.locator('.le-toast-error').evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    expect(contrast(toast.fg, toast.bg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
}

test.describe('final review: the mobile keyboard bar covers nothing it should not', () => {
  test.beforeEach(({}, info) => test.skip(!isMobile(info), 'the keyboard bar is mobile only'));

  const barTop = (page: Page): Promise<number> => page.locator('.le-mobile-bar:not([hidden])').evaluate((el) => el.getBoundingClientRect().top);

  test('full screen keeps the last line and the status bar above the bar', async ({ page }) => {
    await openEmpty(page);
    await page.evaluate(() => window.__editor.exec('toggleFullscreen'));
    for (let i = 0; i < 30; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('last line');
    const top = await barTop(page);
    const caret = await page.evaluate(() => window.__editor.view.coordsAtPos(window.__editor.state.selection.head).bottom);
    expect(caret).toBeLessThanOrEqual(top);
    const status = await page.locator('#editor .le-status').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(status).toBeLessThanOrEqual(top + 1);
  });

  test('the slash menu does not run under the bar', async ({ page }) => {
    await openEmpty(page);
    for (let i = 0; i < 14; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const menu = page.locator('.le-slash-menu:not([hidden])');
    await expect(menu).toBeVisible();
    const height = await menu.evaluate((el) => el.getBoundingClientRect().height);
    // Puts the caret where a menu below it would end inside the bar.
    await page.keyboard.press('Backspace');
    const top = await barTop(page);
    await page.evaluate(
      ({ target }) => {
        const caret = window.__editor.view.coordsAtPos(window.__editor.state.selection.head);
        window.scrollBy(0, caret.bottom - target);
      },
      { target: top - height + 20 },
    );
    await page.keyboard.type('/');
    await expect(menu).toBeVisible();
    const box = await menu.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    expect(box.bottom).toBeLessThanOrEqual(top);
    await expect(control(page, 'bold')).toBeVisible();
  });
});

test('final review: ticking a task box keeps typing in the text', async ({ page }, info) => {
  await openEmpty(page);
  await page.keyboard.type('[] task a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('task b');
  const box = page.locator('#editor .ProseMirror input[type="checkbox"]').first();
  if (isMobile(info)) await box.tap();
  else await box.click();
  await page.keyboard.type(' more');
  await expect.poll(() => html(page)).toBe('<ul data-type="taskList"><li data-checked="true"><p>task a</p></li><li data-checked="false"><p>task b more</p></li></ul>');
});

test('final review: a form reset with the source view open keeps the restored content', async ({ page }, info) => {
  test.skip(isMobile(info), 'the form editor is driven through the desktop toolbar here');
  const initial = '<p>폼 안의 <strong>textarea</strong>가 에디터로 바뀝니다.</p>';
  await page.goto('./');
  const form = page.locator('#form');
  await form.evaluate((el) => el.append(Object.assign(document.createElement('button'), { type: 'reset', id: 'reset' })));
  await form.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  const toggleSource = async (): Promise<void> => {
    const direct = form.locator('.le-toolbar [data-item="sourceView"]');
    if (await direct.isVisible()) return direct.click();
    await form.locator('.le-toolbar [data-item="more"]').click();
    await page.locator('.le-dropdown [data-item="sourceView"]').click();
  };
  await toggleSource();
  const source = form.locator('textarea.le-source');
  await expect(source).toBeVisible();
  await page.click('#reset');
  await expect(source).toHaveValue(initial);
  await toggleSource();
  await expect(source).toHaveCount(0);
  await page.click('#form button[type="submit"]');
  await expect(page.locator('#form-output')).toHaveText(initial);
});

test('final review: read-only full screen keeps a control that leaves it', async ({ page }, info) => {
  await openEmpty(page);
  await page.keyboard.type('hello');
  await page.evaluate(() => {
    window.__editor.exec('toggleFullscreen');
    window.__editor.setEditable(false);
  });
  const fullscreen = control(page, 'fullscreen');
  await expect(fullscreen).toBeVisible();
  if (isMobile(info)) await fullscreen.tap();
  else await fullscreen.click();
  await expect(page.locator('#editor .le-editor')).not.toHaveClass(/le-fullscreen/);
  await expect(page.locator('html')).not.toHaveClass(/le-scroll-locked/);
});

test('final review: Enter in an image caption starts a paragraph after the image', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('before');
  await page.evaluate(() => {
    window.__editor.exec('insertImage', { src: 'https://example.com/a.png' });
  });
  await page.keyboard.type('caption');
  await page.keyboard.press('Enter');
  await page.keyboard.type('next');
  await expect
    .poll(() => html(page))
    .toBe('<p>before</p><figure data-align="center"><img src="https://example.com/a.png" alt=""><figcaption>caption</figcaption></figure><p>next</p>');
  // No caption the browser split off (Chrome on Android) is left on screen.
  await expect(page.locator('#editor .ProseMirror figcaption')).toHaveCount(1);
});

test('final review: typing right after a video inserted at the end keeps the video', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('intro');
  await page.keyboard.press('Enter');
  await paste(page, { 'text/plain': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  await page.keyboard.type('Next line');
  await expect.poll(() => html(page)).toMatch(/^<p>intro<\/p><div data-video="" data-provider="youtube".*<\/div><p>Next line<\/p>$/);
});

test('final review: Tab in the last table cell adds a row', async ({ page }, info) => {
  test.skip(isMobile(info), 'Tab needs a hardware keyboard');
  await openEmpty(page);
  await page.evaluate(() => window.__editor.exec('insertTable', 1, 2, false));
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  await page.keyboard.press('Tab');
  await page.keyboard.type('c');
  await expect
    .poll(() => html(page))
    .toBe('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p></p></td></tr></tbody></table>');
});
