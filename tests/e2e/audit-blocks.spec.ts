import { expect, test, type Page } from '@playwright/test';
import { control, html, MOD, openEmpty } from './helpers';

const pastePlainText = (page: Page, text: string) =>
  page.evaluate((data) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', data);
    document.querySelector('#editor .ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);

test.describe('code block lines (#12)', () => {
  test('code lines become paragraphs and selected lines one code block again', async ({ page }) => {
    await openEmpty(page);
    await page.keyboard.type('```js ');
    await page.keyboard.type('line1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('line2');
    await page.keyboard.press(`${MOD}+Alt+c`);
    expect(await html(page)).toBe('<p>line1</p><p>line2</p>');
    await page.keyboard.press(`${MOD}+a`);
    await control(page, 'codeBlock').click();
    expect(await html(page)).toBe('<pre><code>line1\nline2</code></pre>');
  });

  test('a pasted multi-line snippet keeps its lines when turned into code', async ({ page }) => {
    await openEmpty(page);
    await pastePlainText(page, 'function f() {\n  return 1;\n}');
    await page.keyboard.press(`${MOD}+a`);
    await control(page, 'codeBlock').click();
    expect(await html(page)).toBe('<pre><code>function f() {\n  return 1;\n}</code></pre>');
  });
});

test.describe('leaving a code block at the end of the document (#16)', () => {
  const CODE = '<pre><code class="language-js">x();</code></pre>';

  for (const key of ['ArrowDown', 'ArrowRight']) {
    test(`${key} at the end moves into a new paragraph`, async ({ page }) => {
      await openEmpty(page);
      await page.keyboard.type('```js ');
      await page.keyboard.type('x();');
      await page.keyboard.press(key);
      await page.keyboard.type('A');
      expect(await html(page)).toBe(`${CODE}<p>A</p>`);
    });
  }

  test('a third Enter on trailing empty lines leaves the block', async ({ page }) => {
    await openEmpty(page);
    await page.keyboard.type('```js ');
    await page.keyboard.type('x();');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('B');
    expect(await html(page)).toBe(`${CODE}<p>B</p>`);
  });
});
