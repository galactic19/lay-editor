import { expect, type Page, test } from '@playwright/test';
import { DEFAULTS } from '../../src/core/defaults';
import { compose, contextControl, contrast, control, html, openEmpty, panel, pasteHTML, WCAG_AA } from './helpers';

const { maxColspan } = DEFAULTS.tableLimits;

test('audit #22: pasting a table with a huge colspan stays within the browser limit', async ({ page }) => {
  await openEmpty(page);
  await pasteHTML(page, '<table><tr><td colspan="5000">a</td></tr><tr><td>b</td></tr></table>');
  await expect(page.locator('#editor td')).toHaveCount(maxColspan + 1);
});

test('audit #22: a wide row over many empty rows is pasted as plain blocks instead of being filled', async ({ page }) => {
  await openEmpty(page);
  await pasteHTML(page, `<table><tr><td colspan="${maxColspan}">wide</td></tr>${'<tr></tr>'.repeat(60)}</table>`);
  await expect(page.locator('#editor .ProseMirror')).toHaveText('wide');
  await expect(page.locator('#editor table')).toHaveCount(0);
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

/**
 * Moves the native selection the way touch selection handles do: 'select' spans from the first cell into cell
 * `to`, 'extend' drags the end on into cell `to` from wherever the browser has the selection start.
 */
const selectInCells = (page: Page, mode: 'select' | 'extend', to: number): Promise<void> =>
  page.evaluate(
    ([how, cell]) => {
      const texts = Array.from(document.querySelectorAll('#editor td p'), (p) => p.firstChild!);
      if (how === 'extend') getSelection()!.extend(texts[cell]!, 2);
      else getSelection()!.setBaseAndExtent(texts[0]!, 1, texts[cell]!, 2);
      window.__editor.syncSelection();
    },
    [mode, to] as const,
  );

const selectAcrossCells = (page: Page): Promise<void> => selectInCells(page, 'select', 1);

const TWO_BY_TWO = '<table><tbody><tr><td><p>aaaa</p></td><td><p>bbbb</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

test.describe('audit #44: a selection dragged across cells becomes a cell selection', () => {
  test.beforeEach(async ({ page }) => {
    await openEmpty(page);
    await setContent(page, TWO_BY_TWO);
    await page.locator('#editor td').first().click();
    await selectAcrossCells(page);
  });

  test('the Merge tool becomes usable and merges the cells', async ({ page }) => {
    await expect(contextControl(page, 'tableMerge')).not.toHaveAttribute('aria-disabled', 'true');
    await contextControl(page, 'tableMerge').click();
    await expect.poll(() => html(page)).toContain('<td colspan="2"><p>aaaa</p><p>bbbb</p></td>');
  });

  test('typing over it replaces the selected cells instead of moving text between them', async ({ page }) => {
    await page.keyboard.type('Z');
    expect(await html(page)).not.toContain('aZbb');
    await expect(page.locator('#editor tr:first-child td')).toHaveCount(2);
    await expect(page.locator('#editor tr:first-child')).toHaveText('Z');
  });
});

test('audit #44: dragging a handle on into a third cell keeps the first cell selected', async ({ page }) => {
  await openEmpty(page);
  await setContent(page, '<table><tbody><tr><td><p>aaaa</p></td><td><p>bbbb</p></td><td><p>cccc</p></td></tr></tbody></table>');
  await page.locator('#editor td').first().click();
  await selectAcrossCells(page);
  await selectInCells(page, 'extend', 2);
  await contextControl(page, 'tableMerge').click();
  await expect.poll(() => html(page)).toContain('<td colspan="3"><p>aaaa</p><p>bbbb</p><p>cccc</p></td>');
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
      for (const [fg, bg] of colors) expect(contrast(fg!, bg!), `${root} ${fg} on ${bg}`).toBeGreaterThanOrEqual(WCAG_AA.text);
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
