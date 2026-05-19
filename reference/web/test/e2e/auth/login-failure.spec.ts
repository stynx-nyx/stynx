import { expect, gotoLoginPage, installSpaAuthMocks, referenceActors, referenceTenants, test } from '../fixtures';

test('keeps the user on login when dev auth rejects the request', async ({ page }) => {
  let devLoginAttempts = 0;
  await installSpaAuthMocks(page, {
    failLogin: true,
    onDevLogin: () => {
      devLoginAttempts += 1;
    },
  });

  await gotoLoginPage(page);
  await page.getByTestId('login-email').fill(referenceActors.admin.email);
  await page.getByTestId('login-tenant').selectOption(referenceTenants.sampleDemo.id);
  await page.getByTestId('login-submit').click();

  await expect.poll(() => devLoginAttempts).toBe(1);
  await expect(page.getByTestId('login-title')).toBeVisible();
  await expect(page.getByTestId('login-submit')).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});
