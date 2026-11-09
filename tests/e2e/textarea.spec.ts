import { expect, test } from '@playwright/test';

test('submits the edited HTML through the original textarea', async ({ page }) => {
  await page.goto('./');
  const content = page.locator('#form .ProseMirror');
  await content.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 추가');
  await page.click('#form button[type="submit"]');
  await expect(page.locator('#form-output')).toHaveText('<p>폼 안의 <strong>textarea</strong>가 에디터로 바뀝니다. 추가</p>');
  await expect(page.locator('#form textarea')).toBeHidden();
});
