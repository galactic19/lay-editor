import { expect, type Page, test } from '@playwright/test';
import { DEFAULTS } from '../../src/core/defaults';
import { compose, control, html, openEmpty, panel } from './helpers';

test('audit #22: pasting a table with a huge colspan stays within the browser limit', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<table><tr><td colspan="5000">a</td></tr><tr><td>b</td></tr></table>');
    window.__editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#editor td')).toHaveCount(DEFAULTS.tableLimits.maxColspan + 1);
});

async function insertTable(page: Page, rows: number, cols: number): Promise<void> {
  await control(page, 'table').click();
  await panel(page).locator(`[data-rows="${rows}"][data-cols="${cols}"]`).click();
}

test('audit #13/#62: typing after inserting a table fills the header row from the first cell', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('Intro');
  await page.keyboard.press('Enter');
  await insertTable(page, 3, 3);
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Age');
  expect(await html(page)).toContain('<p>Intro</p><table><tbody><tr><th><p>Name</p></th><th><p>Age</p></th><th><p></p></th></tr>');
});

test('audit #62: IME composition right after inserting a table goes into the first cell', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'IME is driven through CDP');
  await openEmpty(page);
  await insertTable(page, 2, 2);
  await compose(page, ['ㅁ', '머', '멀', '머리'], '머리');
  expect(await html(page)).toContain('<tr><th><p>머리</p></th><th><p></p></th></tr>');
});
