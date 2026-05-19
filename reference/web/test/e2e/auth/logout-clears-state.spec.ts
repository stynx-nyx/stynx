import { expect, test } from '../fixtures';

test('logout clears the active shell and returns to login', async ({ page, loginAsAdmin }) => {
  let logoutAttempts = 0;
  await page.route('**/sessions/logout', async (route) => {
    logoutAttempts += 1;
    await route.fulfill({ status: 204, body: '' });
  });

  await loginAsAdmin();
  await page.getByTestId('logout-button').click();

  await expect.poll(() => logoutAttempts).toBe(1);
  await expect(page.getByTestId('login-title')).toBeVisible();
  await expect(page.getByTestId('login-submit')).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});
