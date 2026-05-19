import { expect, installSpaAuthMocks, loginAs, referenceActors, test } from '../fixtures';

test('redirects a reader without write permission to the unauthorized route', async ({ page }) => {
  await installSpaAuthMocks(page, { actor: referenceActors.recordReader });
  await loginAs(page, referenceActors.recordReader);

  await page.goto('/records/new');

  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
});
