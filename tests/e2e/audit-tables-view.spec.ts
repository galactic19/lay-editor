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

/** Renders saved HTML the way a read-only page does: in a .le-prose container styled by content.css. */
async function renderViewPage(page: Page, content: string): Promise<void> {
  await page.evaluate((html) => {
    const view = document.createElement('div');
    view.className = 'le-prose';
    view.id = 'view-page';
    view.style.width = '800px';
    view.innerHTML = html;
    document.body.appendChild(view);
  }, content);
}

const width = (page: Page, selector: string): Promise<number> => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().width);

test('audit #14: column widths dragged in the editor show on the view page', async ({ page }, info) => {
  await openEmpty(page);
  await insertTable(page, 2, 3);
  if (info.project.name.startsWith('mobile')) {
    // Column resizing is a desktop mouse gesture; on mobile only the saved widths are rendered.
    await page.evaluate(() => window.__editor.setHTML(window.__editor.getHTML().replace('<th>', '<th data-colwidth="350">').replace('<td>', '<td data-colwidth="350">')));
  } else {
    const th = (await page.locator('#editor th').first().boundingBox())!;
    await page.mouse.move(th.x + th.width - 2, th.y + th.height / 2);
    await page.mouse.down();
    await page.mouse.move(th.x + th.width + 250, th.y + th.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  const editorWidth = await width(page, '#editor th');
  expect(editorWidth).toBeGreaterThan(300);
  await renderViewPage(page, await html(page));
  expect(Math.abs((await width(page, '#view-page th')) - editorWidth)).toBeLessThanOrEqual(2);
});

/** A table tool: the desktop context toolbar or the mobile keyboard bar in table context. */
const tableTool = (page: Page, id: string) =>
  page.locator(`.le-context-toolbar [data-item="${id}"], .le-mobile-bar:not([hidden]) [data-item="${id}"]`).first();

/** Selects text from the first cell into the second the way touch selection handles do (a native DOM range). */
async function selectAcrossCells(page: Page): Promise<void> {
  await page.evaluate(() => {
    const [first, second] = Array.from(document.querySelectorAll('#editor td p'), (p) => p.firstChild!);
    getSelection()!.setBaseAndExtent(first!, 1, second!, 2);
    window.__editor.syncSelection();
  });
}

const TWO_BY_TWO = '<table><tbody><tr><td><p>aaaa</p></td><td><p>bbbb</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

test.describe('audit #44: a selection dragged across cells becomes a cell selection', () => {
  test.beforeEach(async ({ page }) => {
    await openEmpty(page);
    await page.evaluate((content) => window.__editor.setHTML(content), TWO_BY_TWO);
    await page.locator('#editor td').first().click();
    await selectAcrossCells(page);
  });

  test('the Merge tool becomes usable and merges the cells', async ({ page }) => {
    await expect(tableTool(page, 'tableMerge')).not.toHaveAttribute('aria-disabled', 'true');
    await tableTool(page, 'tableMerge').click();
    await expect.poll(() => html(page)).toContain('<td colspan="2"><p>aaaa</p><p>bbbb</p></td>');
  });

  test('typing over it replaces the selected cells instead of moving text between them', async ({ page }) => {
    await page.keyboard.type('Z');
    expect(await html(page)).not.toContain('aZbb');
    await expect(page.locator('#editor tr:first-child td')).toHaveCount(2);
    await expect(page.locator('#editor tr:first-child')).toHaveText('Z');
  });
});
