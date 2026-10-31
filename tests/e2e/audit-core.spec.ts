import { expect, test, type Page } from '@playwright/test';
import { html, MOD, openEmpty } from './helpers';

test('Ctrl+Z after setHTML never brings back the previous document', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.type('Post A first paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Post A second');
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('');
  await page.evaluate(() => window.__editor.setHTML('<p>Post B loaded from server</p>'));
  await page.click('#editor .ProseMirror');
  await page.keyboard.press(`${MOD}+z`);
  expect(await html(page)).toBe('<p>Post B loaded from server</p>');
});

test.describe('textarea mode in a real form', () => {
  const SUBMIT_PATH = '/submit-target';
  const content = '#f .ProseMirror';

  interface FormPage {
    /** The body field of every POST the form sent. */
    posted: string[];
    shown(): Promise<string>;
  }

  /**
   * Puts a form posting to SUBMIT_PATH on the demo page and turns its textarea into an editor.
   * Ctrl+Enter calls form.submit() and Ctrl+S reads new FormData(form), like app shortcuts do.
   */
  async function mountForm(page: Page, textarea: string, options: Record<string, unknown> = {}): Promise<FormPage> {
    const posted: string[] = [];
    await page.route(`**${SUBMIT_PATH}`, async (route) => {
      posted.push(new URLSearchParams(route.request().postData() ?? '').get('body') ?? '');
      await route.fulfill({ contentType: 'text/html', body: 'saved' });
    });
    await page.goto('./?empty');
    await page.evaluate(
      ({ textarea, action }) => {
        const form = document.createElement('form');
        form.id = 'f';
        form.method = 'post';
        form.action = action;
        form.innerHTML = `${textarea}<button type="reset" id="reset">reset</button><button id="save">save</button>`;
        document.body.prepend(form);
        const shortcuts: Record<string, () => void> = {
          Enter: () => form.submit(),
          s: () => ((window as unknown as { __saved: unknown }).__saved = new FormData(form).get('body')),
        };
        // Capture phase: the app handles the shortcut before the editor sees the key.
        document.addEventListener(
          'keydown',
          (event) => {
            const run = (event.ctrlKey || event.metaKey) && shortcuts[event.key];
            if (!run) return;
            event.preventDefault();
            event.stopPropagation();
            run();
          },
          true,
        );
      },
      { textarea, action: SUBMIT_PATH },
    );
    await page.addScriptTag({
      type: 'module',
      content: `import { createEditor } from '/src/index.ts';
        window.__formEditor = createEditor({ element: '#f textarea', ...${JSON.stringify(options)} });`,
    });
    await page.waitForSelector(content);
    return { posted, shown: () => page.evaluate(() => (window as unknown as { __formEditor: { getHTML(): string } }).__formEditor.getHTML()) };
  }

  const typeAtEnd = async (page: Page, text: string): Promise<void> => {
    await page.click(content);
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type(text);
  };

  test('an unedited form posts the content option the editor shows', async ({ page }) => {
    const form = await mountForm(page, '<textarea name="body"></textarea>', { content: '<p>prefilled</p>' });
    await page.click('#save');
    await expect.poll(() => form.posted).toEqual(['<p>prefilled</p>']);
  });

  test('form.submit() right after typing posts the last keystrokes', async ({ page }) => {
    const form = await mountForm(page, '<textarea name="body"><p>orig</p></textarea>');
    await typeAtEnd(page, ' typed');
    const shown = await form.shown();
    expect(shown).toContain('orig typed');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => form.posted).toEqual([shown]);
  });

  test('new FormData(form) right after typing reads the last keystrokes', async ({ page }) => {
    const form = await mountForm(page, '<textarea name="body"><p>원래 내용</p></textarea>');
    await typeAtEnd(page, ' 마지막 문장');
    await page.keyboard.press('Control+s');
    expect(await page.evaluate(() => (window as unknown as { __saved: unknown }).__saved)).toBe(await form.shown());
    expect(await form.shown()).toContain('마지막 문장');
  });

  test('the reset button resets the editor and the post matches the screen', async ({ page }) => {
    const form = await mountForm(page, '<textarea name="body"><p>원래 내용</p></textarea>');
    await typeAtEnd(page, ' 추가한 글');
    await page.click('#reset');
    await expect(page.locator(content)).toHaveText('원래 내용');
    await page.click('#save');
    await expect.poll(() => form.posted).toEqual(['<p>원래 내용</p>']);
  });

  test('a required, empty editor blocks the submit with visible feedback', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    const form = await mountForm(page, '<textarea name="body" required></textarea>');
    await page.click('#save');
    const root = page.locator('#f .le-editor');
    await expect(root).toHaveClass(/le-invalid/);
    await expect(page.locator(content)).toBeFocused();
    await expect(page.locator(content)).toHaveAttribute('aria-invalid', 'true');
    await expect(root.locator('.le-toast-error')).toBeVisible();
    const border = await root.evaluate((el) => getComputedStyle(el).borderColor);
    const danger = await root.evaluate((el) => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--le-color-danger)';
      el.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(border).toBe(danger);
    expect(form.posted).toEqual([]);
    expect(errors.filter((text) => text.includes('not focusable'))).toEqual([]);

    await page.keyboard.type('본문');
    await expect(root).not.toHaveClass(/le-invalid/);
    await page.click('#save');
    await expect.poll(() => form.posted).toEqual(['<p>본문</p>']);
  });
});
