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

/** Pixels two layouts of the same content may differ by (sub-pixel rounding). */
const PX_TOLERANCE = 2;

const setContent = (page: Page, content: string): Promise<void> => page.evaluate((html) => window.__editor.setHTML(html), content);

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

/** The editor body and a read-only page: saved HTML in a .le-prose container styled by content.css. */
const ROOTS = ['#editor .ProseMirror', '#view-page'];

async function renderViewPage(page: Page, content: string, theme?: 'dark'): Promise<void> {
  await page.evaluate(
    ([html, dark]) => {
      const view = document.createElement('div');
      view.className = 'le-prose';
      view.id = 'view-page';
      view.style.width = '800px';
      if (dark) view.dataset.theme = dark;
      view.innerHTML = html!;
      document.body.appendChild(view);
    },
    [content, theme],
  );
}

const width = (page: Page, selector: string): Promise<number> => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().width);

const WIDE_COLUMN = 350;

test('audit #14: column widths dragged in the editor show on the view page', async ({ page }, info) => {
  await openEmpty(page);
  await insertTable(page, 2, 3);
  if (info.project.name.startsWith('mobile')) {
    // Column resizing is a desktop mouse gesture; on mobile only the saved widths are rendered.
    const resized = (await html(page)).replace('<th>', `<th data-colwidth="${WIDE_COLUMN}">`).replace('<td>', `<td data-colwidth="${WIDE_COLUMN}">`);
    await setContent(page, resized);
  } else {
    const th = (await page.locator('#editor th').first().boundingBox())!;
    const y = th.y + th.height / 2;
    await page.mouse.move(th.x + th.width - PX_TOLERANCE, y);
    await page.mouse.down();
    await page.mouse.move(th.x + WIDE_COLUMN, y, { steps: 5 });
    await page.mouse.up();
  }
  const editorWidth = await width(page, '#editor th');
  expect(Math.abs(editorWidth - WIDE_COLUMN)).toBeLessThanOrEqual(PX_TOLERANCE);
  await renderViewPage(page, await html(page));
  expect(Math.abs((await width(page, '#view-page th')) - editorWidth)).toBeLessThanOrEqual(PX_TOLERANCE);
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
    await setContent(page, TWO_BY_TWO);
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

const TASKS =
  '<ul data-type="taskList"><li data-checked="false"><p>Parent task</p><ul data-type="taskList"><li data-checked="true"><p>Child task</p></li></ul></li>' +
  '<li data-checked="false"><p>Second para one</p><p>Second para two</p></li></ul>';

/** Paragraph boxes inside `root`, keyed by text, relative to the root's outer list. */
const taskBoxes = (page: Page, root: string) =>
  page.evaluate((selector) => {
    const list = document.querySelector(`${selector} ul`)!.getBoundingClientRect();
    return Object.fromEntries(
      Array.from(document.querySelectorAll(`${selector} p`), (p) => {
        const box = p.getBoundingClientRect();
        return [p.textContent, { left: box.left - list.left, top: box.top - list.top, bottom: box.bottom - list.top }];
      }),
    );
  }, root);

test('audit #15: the view page stacks nested task lists and extra paragraphs like the editor', async ({ page }) => {
  await openEmpty(page);
  await setContent(page, TASKS);
  await renderViewPage(page, TASKS);
  for (const root of ROOTS) {
    const boxes = await taskBoxes(page, root);
    expect(boxes['Child task']!.top, root).toBeGreaterThanOrEqual(boxes['Parent task']!.bottom);
    expect(boxes['Second para two']!.top, root).toBeGreaterThanOrEqual(boxes['Second para one']!.bottom);
    expect(boxes['Second para two']!.left, root).toBe(boxes['Second para one']!.left);
  }
  const [editor, view] = await Promise.all(ROOTS.map((root) => taskBoxes(page, root)));
  for (const text of Object.keys(editor!)) {
    expect(Math.abs(view![text]!.left - editor![text]!.left), `${text} left`).toBeLessThanOrEqual(PX_TOLERANCE);
    expect(Math.abs(view![text]!.top - editor![text]!.top), `${text} top`).toBeLessThanOrEqual(PX_TOLERANCE);
  }
});

const LISTS = '<ul><li><p>bullet</p><ul><li><p>nested</p></li></ul></li></ul><ol><li><p>number</p></li></ol><ul data-type="taskList"><li data-checked="false"><p>task</p></li></ul>';
const MARKERS = { 'ul:not([data-type])': 'disc', 'ul ul': 'circle', ol: 'decimal', "ul[data-type='taskList']": 'none' };
const RESETS = {
  'Tailwind v3 preflight': 'ol, ul, menu { list-style: none; margin: 0; padding: 0; }',
  'Tailwind v4 preflight (layered)': '@layer base { ol, ul, menu { list-style: none; margin: 0; padding: 0; } }',
};

for (const [name, reset] of Object.entries(RESETS)) {
  test(`audit #50: list markers survive a CSS reset (${name})`, async ({ page }) => {
    await openEmpty(page);
    await page.addStyleTag({ content: reset });
    await setContent(page, LISTS);
    await renderViewPage(page, LISTS);
    for (const root of ROOTS) {
      for (const [selector, type] of Object.entries(MARKERS)) {
        const actual = await page.locator(`${root} ${selector}`).first().evaluate((el) => getComputedStyle(el).listStyleType);
        expect(actual, `${root} ${selector}`).toBe(type);
      }
    }
  });
}

/** WCAG contrast ratio between two computed rgb() colours. */
function contrast(fg: string, bg: string): number {
  const luminance = (color: string): number => {
    const [r, g, b] = color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => Number(v) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

const WCAG_AA = 4.5;

test.describe('audit #51: highlighted text in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('every default highlight colour keeps readable text in the editor and on a dark view page', async ({ page }) => {
    const marks = `<p>${DEFAULTS.colors.highlight.map((color) => `<mark style="background-color: ${color}">형광펜 텍스트</mark>`).join(' ')}</p>`;
    await openEmpty(page);
    expect(await page.evaluate(() => window.__editor.root.dataset.theme)).toBe('dark');
    await setContent(page, marks);
    await renderViewPage(page, marks, 'dark');
    for (const root of ROOTS) {
      const colors = await page.locator(`${root} mark`).evaluateAll((els) => els.map((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]));
      expect(colors).toHaveLength(DEFAULTS.colors.highlight.length);
      for (const [fg, bg] of colors) expect(contrast(fg!, bg!), `${root} ${fg} on ${bg}`).toBeGreaterThanOrEqual(WCAG_AA);
    }
  });
});

/** Highlights inside a text colour and inside a link (with bold in between); the schema nests <mark> innermost. */
const COLOURED_HIGHLIGHTS =
  '<p><span style="color: #e03131"><mark style="background-color: #ffec99">coloured</mark></span> ' +
  '<a href="https://example.com"><strong><mark style="background-color: #ffec99">linked</mark></strong></a></p>';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`audit #51: highlighted text keeps an explicit colour (${colorScheme})`, () => {
    test.use({ colorScheme });

    test('a text colour or link around the highlight still sets the text colour', async ({ page }) => {
      await openEmpty(page);
      await setContent(page, COLOURED_HIGHLIGHTS);
      await renderViewPage(page, await html(page), colorScheme === 'dark' ? colorScheme : undefined);
      for (const root of ROOTS) {
        const colors = await page
          .locator(`${root} mark`)
          .evaluateAll((marks) => marks.map((mark) => [getComputedStyle(mark).color, getComputedStyle(mark.closest('a, span')!).color]));
        expect(colors, root).toHaveLength(2);
        for (const [mark, outer] of colors) expect(mark, root).toBe(outer);
      }
    });
  });
}
