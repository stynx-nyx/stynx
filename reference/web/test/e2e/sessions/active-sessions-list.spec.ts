import { expect, referenceActors, referenceTenants, test } from '../fixtures';

const currentSessionSid = `sid-${referenceActors.admin.email}`;
const secondarySessionSid = 'sid-reference-dev-secondary';

test('renders the active sessions list on the authenticated dashboard', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin();
  await page.goto('/tenant');
  await expect(page.getByTestId('tenant-selection-title')).toBeVisible();
  await page.goto('/');

  await expect(page.getByTestId('dashboard-active-sessions')).toBeVisible();
  await expect(page.getByTestId('active-sessions-list')).toBeVisible();

  await expect.poll(async () => ({
    current: await page.getByTestId(`active-session-row-${currentSessionSid}`).isVisible(),
    secondary: await page.getByTestId(`active-session-row-${secondarySessionSid}`).isVisible(),
  })).toEqual({
    current: true,
    secondary: true,
  });

  await expect(page.getByTestId(`active-session-current-${currentSessionSid}`)).toBeVisible();
  await expect(page.getByTestId(`active-session-tenant-${currentSessionSid}`)).toContainText(
    referenceTenants.sampleDemo.id,
  );
  await expect(page.getByTestId(`active-session-tenant-${secondarySessionSid}`)).toContainText(
    'reference-dev-secondary',
  );
  await expect(page.getByTestId(`active-session-revoke-${secondarySessionSid}`)).toBeEnabled();
  await expect(page.getByTestId('active-sessions-revoke-others')).toBeEnabled();
});
