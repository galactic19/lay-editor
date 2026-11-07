import { expect, test, type Page } from '@playwright/test';
import { MOD, html, openEmpty, pasteHTML } from './helpers';

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

/** Opens an empty editor and pastes clipboard HTML another app (Word, Sheets) would put there. */
async function pasteIntoEmpty(page: Page, markup: string): Promise<void> {
  await openEmpty(page);
  await pasteHTML(page, markup);
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

  test('Word red text, highlights and cell shading survive (#24)', async ({ page }) => {
    await pasteIntoEmpty(
      page,
      `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment--><p class=MsoNormal><span style='color:red'>빨강</span><span style='background:yellow;mso-highlight:yellow'>형광</span></p><table class=MsoTableGrid><tr><td style='border:solid windowtext 1.0pt;background:#FFC000'><p class=MsoNormal>셀</p></td></tr></table><!--EndFragment--></body></html>`,
    );
    await expect.poll(() => html(page)).toContain('셀');
    expect(await html(page)).toBe(
      '<p><span style="color: rgb(255, 0, 0);">빨강</span><mark style="background-color: rgb(255, 255, 0);">형광</mark></p><table><tbody><tr><td style="background-color: rgb(255, 192, 0);"><p>셀</p></td></tr></tbody></table>',
    );
  });

  test("a code block copied from a viewer page keeps its language and the viewer's text color is dropped (#23, #25)", async ({ page }) => {
    await page.goto('./?empty');
    await copyPaste(page, '<div class="le-prose"><p>before</p><pre><code class="language-python">def f():\n    return 1</code></pre><p>after</p></div>');
    await expect.poll(() => html(page)).toContain('after');
    expect(await html(page)).toBe('<p>before</p><pre><code class="language-python">def f():\n    return 1</code></pre><p>after</p>');
  });

  test('Word Korean numbering pastes as numbered lists and adjacent lists stay apart (#26)', async ({ page }) => {
    const item = (style: string, marker: string, text: string) =>
      `<p class=MsoListParagraph style='mso-list:${style}'><![if !supportLists]><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span><![endif]>${text}<o:p></o:p></p>`;
    await pasteIntoEmpty(
      page,
      `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->${item('l0 level1 lfo1', '가.', '가항목')}${item('l0 level1 lfo1', '나.', '나항목')}${item('l1 level1 lfo2', '①', '원문자')}<!--EndFragment--></body></html>`,
    );
    await expect.poll(() => html(page)).toContain('원문자');
    expect(await html(page)).toBe('<ol><li><p>가항목</p></li><li><p>나항목</p></li></ol><ol><li><p>원문자</p></li></ol>');
  });

  test('Google Sheets bold header cells stay bold (#27)', async ({ page }) => {
    await pasteIntoEmpty(
      page,
      '<google-sheets-html-origin><table data-sheets-root="1"><tbody><tr><td style="background-color:#ffff00;font-weight:bold;">이름</td><td style="font-weight:bold;color:#ff0000;">점수</td></tr><tr><td>철수</td><td>90</td></tr></tbody></table></google-sheets-html-origin>',
    );
    await expect.poll(() => html(page)).toContain('철수');
    const weights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#editor .ProseMirror td p'), (p) => Number(getComputedStyle(p.firstElementChild ?? p).fontWeight)),
    );
    expect(weights.slice(0, 2).every((weight) => weight >= 600)).toBe(true);
    expect(weights.slice(2).every((weight) => weight < 600)).toBe(true);
  });

  test('white header text on a dark Sheets or Word fill stays white (#23, #24)', async ({ page }) => {
    await pasteIntoEmpty(
      page,
      `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment--><table><tr><td style="background-color:#1f4e79;color:#ffffff;font-weight:bold">Sheets</td><td style='background:#1F3864'><p class=MsoNormal><b><span style='color:white;mso-themecolor:background1'>Word</span></b></p></td></tr></table><!--EndFragment--></body></html>`,
    );
    await expect.poll(() => html(page)).toContain('Word');
    const colors = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#editor .ProseMirror td p'), (p) => {
        let text: Element = p;
        while (text.firstElementChild) text = text.firstElementChild;
        return getComputedStyle(text).color;
      }),
    );
    expect(colors).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
  });

  test('colors written in any CSS syntax survive (#24)', async ({ page }) => {
    await pasteIntoEmpty(
      page,
      '<p><span style="color: hsl(0,100%,40%)">hsl</span> <span style="color: rgb(200 0 0)">space</span> <span style="color: #c00000ff">hex8</span> <span style="color: #c00000 !important">imp</span></p>',
    );
    await expect.poll(() => html(page)).toContain('imp');
    expect(await html(page)).toBe(
      '<p><span style="color: rgb(204, 0, 0);">hsl</span> <span style="color: rgb(200, 0, 0);">space</span> <span style="color: rgb(192, 0, 0);">hex8</span> <span style="color: rgb(192, 0, 0);">imp</span></p>',
    );
  });

  test('a normal-weight run inside a bold row or list item stays normal (#27)', async ({ page }) => {
    await page.goto('./?empty');
    await copyPaste(
      page,
      '<table><tbody><tr style="font-weight:bold"><th>Name</th><td>Price <small style="font-weight:normal">(KRW)</small></td></tr></tbody></table><ul><li style="font-weight:700">Term<span style="font-weight:400">: description</span></li></ul>',
    );
    await expect.poll(() => html(page)).toContain('description');
    const bold = await page.evaluate(() => Array.from(document.querySelectorAll('#editor .ProseMirror strong'), (strong) => strong.textContent));
    expect(bold).toEqual(['Price ', 'Term']);
  });
});
