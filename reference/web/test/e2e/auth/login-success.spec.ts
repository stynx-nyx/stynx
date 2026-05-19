import { expect, test } from '../fixtures';
import { expectAuthenticatedShell } from '../shared/nav';

test('logs in a reference admin through spa-only dev auth', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin();
  await expectAuthenticatedShell(page);
  await expect(page).toHaveURL(/\/$/);
});
