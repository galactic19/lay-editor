import { expect, test } from '@playwright/test';
import { compose, html, openEmpty } from './helpers';

async function insertTable(page: import('@playwright/test').Page, rows: number, cols: number): Promise<void> {
  await page.click('#editor .le-toolbar [data-item="table"]');
  await page.click(`.le-dropdown [data-rows="${rows}"][data-cols="${cols}"]`);
}

test('inserts a table from the size picker', async ({ page }) => {
  await openEmpty(page);
  await insertTable(page, 3, 3);
  await expect(page.locator('#editor table tr')).toHaveCount(3);
  await expect(page.locator('#editor table tr').first().locator('th')).toHaveCount(3);
});

test('merges two selected cells', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'drag selection uses a mouse');
  await openEmpty(page);
  await insertTable(page, 2, 2);
  const cells = page.locator('#editor tr').nth(1).locator('td');
  const first = (await cells.nth(0).boundingBox())!;
  const second = (await cells.nth(1).boundingBox())!;
  await page.mouse.move(first.x + 10, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => window.__editor.exec('mergeCells'));
  await expect.poll(() => html(page)).toContain('colspan="2"');
});

test('composes Korean inside a table cell', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'IME is driven through CDP');
  await openEmpty(page);
  await insertTable(page, 2, 2);
  await page.click('#editor tr:nth-child(2) td:first-child');
  await compose(page, ['ㅅ', '세', '셀'], '셀');
  expect(await html(page)).toContain('<td><p>셀</p></td>');
});
