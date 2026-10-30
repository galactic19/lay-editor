import { expect, test } from '@playwright/test';
import { compose, html, MOD, openEmpty } from './helpers';

test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium', 'IME is driven through CDP'));

test('composes Korean without loss', async ({ page }) => {
  await openEmpty(page);
  await compose(page, ['ㅎ', '하', '한'], '한');
  await compose(page, ['ㄱ', '그', '글'], '글');
  await page.keyboard.type('a');
  expect(await html(page)).toBe('<p>한글a</p>');
});

test('composes Korean right after the "# " rule', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('# ');
  await compose(page, ['ㅈ', '제', '제ㅁ', '제목'], '제목');
  expect(await html(page)).toBe('<h1>제목</h1>');
});

test('composes Korean inside bold', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.press(`${MOD}+b`);
  await compose(page, ['ㄱ', '구', '굵'], '굵');
  await page.keyboard.type('!');
  expect(await html(page)).toBe('<p><strong>굵!</strong></p>');
});
