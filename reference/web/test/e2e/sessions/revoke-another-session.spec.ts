import { expect, referenceActors, test } from '../fixtures';

const currentSessionSid = `sid-${referenceActors.admin.email}`;
const secondarySessionSid = 'sid-reference-dev-secondary';

test('revokes another active session without clearing the current session', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin();
  await page.goto('/tenant');
  await expect(page.getByTestId('tenant-selection-title')).toBeVisible();
  await page.goto('/');

  await expect(page.getByTestId('dashboard-active-sessions')).toBeVisible();
  await expect(page.getByTestId(`active-session-row-${currentSessionSid}`)).toBeVisible();
  await expect(page.getByTestId(`active-session-row-${secondarySessionSid}`)).toBeVisible();

  await page.getByTestId(`active-session-revoke-${secondarySessionSid}`).click();

  await expect.poll(async () => ({
    current: await page.getByTestId(`active-session-row-${currentSessionSid}`).isVisible(),
    secondary: await page.getByTestId(`active-session-row-${secondarySessionSid}`).isVisible(),
  })).toEqual({
    current: true,
    secondary: false,
  });

  await expect(page.getByTestId(`active-session-current-${currentSessionSid}`)).toBeVisible();
  await expect(page.getByTestId('logout-button')).toBeEnabled();
});
