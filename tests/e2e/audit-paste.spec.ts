import { expect, test, type Page } from '@playwright/test';
import { MOD, html } from './helpers';

/** Selects `fragment` on the host page, copies it with the real clipboard and pastes it into the editor. */
async function copyPaste(page: Page, fragment: string): Promise<void> {
  await page.evaluate((markup) => {
    const source = document.createElement('div');
    source.innerHTML = markup;
    document.body.prepend(source);
    const range = document.createRange();
    range.selectNodeContents(source);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, fragment);
  await page.keyboard.press(`${MOD}+c`);
  await page.click('#editor .ProseMirror');
  await page.keyboard.press(`${MOD}+v`);
}

test.describe('paste from other pages (audit)', () => {
  test('text copied from a light web page stays readable in the dark theme (#23)', async ({ page }) => {
    await page.goto('./?empty&theme=dark');
    await copyPaste(
      page,
      '<article style="color:#212529;background:#f8f9fa"><h2>Web title</h2><p>Body text with <a href="https://example.com/">a link</a> end.</p></article>',
    );
    await expect.poll(() => html(page)).toContain('Web title');
    expect(await html(page)).not.toContain('color');
    const colors = await page.evaluate(() => {
      const prose = document.querySelector<HTMLElement>('#editor .ProseMirror')!;
      return { fg: getComputedStyle(prose).color, para: getComputedStyle(prose.querySelector('p')!).color };
    });
    expect(colors.para).toBe(colors.fg);
  });
});
