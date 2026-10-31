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

test('--- in an empty list item keeps typing after the divider (#19)', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('- first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('---');
  await page.keyboard.type('next');
  expect(await html(page)).toBe('<ul><li><p>first</p></li><li><p></p><hr><p>next</p></li></ul>');
});

test.describe('checklist toggle (#20)', () => {
  test('the toolbar button turns the whole list into a checklist', async ({ page }) => {
    await openEmpty(page);
    await page.keyboard.type('- a');
    for (const text of ['b', 'c']) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(text);
    }
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await control(page, 'taskList').click();
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-checked="false"><p>a</p></li><li data-checked="false"><p>b</p></li><li data-checked="false"><p>c</p></li></ul>',
    );
  });

  test('the shortcut works in a nested list', async ({ page }) => {
    await openEmpty(page);
    await page.keyboard.type('- parent');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');
    await page.keyboard.press(`${MOD}+Shift+9`);
    expect(await html(page)).toBe('<ul><li><p>parent</p><ul data-type="taskList"><li data-checked="false"><p>x</p></li></ul></li></ul>');
  });
});

test.describe('slash in prose (#31)', () => {
  for (const text of ['A / B', '1 / 2', 'and / or']) {
    test(`"${text}" then Enter keeps the text and starts a new paragraph`, async ({ page }) => {
      await openEmpty(page);
      await page.keyboard.type(text, { delay: 30 });
      await expect(page.locator('.le-slash-menu:not([hidden])')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await page.keyboard.type('next');
      expect(await html(page)).toBe(`<p>${text}</p><p>next</p>`);
    });
  }
});
