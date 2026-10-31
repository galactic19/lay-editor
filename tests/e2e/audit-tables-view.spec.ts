import { expect, test } from '@playwright/test';
import { DEFAULTS } from '../../src/core/defaults';
import { openEmpty } from './helpers';

test('audit #22: pasting a table with a huge colspan stays within the browser limit', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<table><tr><td colspan="5000">a</td></tr><tr><td>b</td></tr></table>');
    window.__editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#editor td')).toHaveCount(DEFAULTS.tableLimits.maxColspan + 1);
});
