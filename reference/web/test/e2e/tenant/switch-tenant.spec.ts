import { expect, referenceActors, referenceTenants, test } from '../fixtures';
import { installSpaAuthMocks } from '../shared/login';

test('renders tenant selection cards after spa-only dev auth', async ({ page }) => {
  await installSpaAuthMocks(page, { actor: referenceActors.admin });
  await page.goto('/login');
  await page.getByTestId('login-email').fill(referenceActors.admin.email);
  await page.getByTestId('login-tenant').selectOption(referenceTenants.sampleDemo.id);
  await page.getByTestId('login-submit').click();

  await page.goto('/tenant');
  await expect(page.getByTestId('tenant-selection-title')).toBeVisible();
  await expect(page.getByTestId('tenant-current-banner')).toContainText(referenceTenants.sampleDemo.name);
  await expect(page.getByTestId(`tenant-card-${referenceTenants.sampleDemo.id}`)).toBeVisible();
  await expect(page.getByTestId(`tenant-card-${referenceTenants.sampleOps.id}`)).toBeVisible();
  await expect(page.getByTestId(`tenant-switch-${referenceTenants.sampleDemo.id}`)).toBeEnabled();
  await expect(page.getByTestId(`tenant-switch-${referenceTenants.sampleOps.id}`)).toBeEnabled();
});

test('switches the active tenant and mints a replacement session bundle', async ({ page }) => {
  const devLoginTenantIds: string[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/_reference/dev-login')) {
      return;
    }

    const body = request.postDataJSON() as { tenantId?: string };
    if (body.tenantId) {
      devLoginTenantIds.push(body.tenantId);
    }
  });
  await installSpaAuthMocks(page, { actor: referenceActors.admin });

  await page.goto('/login');
  await page.getByTestId('login-email').fill(referenceActors.admin.email);
  await page.getByTestId('login-tenant').selectOption(referenceTenants.sampleDemo.id);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();

  await page.goto('/tenant');
  await expect(page.getByTestId('tenant-current-banner')).toContainText(referenceTenants.sampleDemo.name);
  const requestCountBeforeSwitch = devLoginTenantIds.length;
  await page.getByTestId(`tenant-switch-${referenceTenants.sampleOps.id}`).click();
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await expect.poll(() => devLoginTenantIds.slice(requestCountBeforeSwitch)).toEqual([referenceTenants.sampleOps.id]);

  await page.goBack();
  await expect(page).toHaveURL(/\/tenant$/);
  await expect(page.getByTestId('tenant-current-banner')).toContainText(referenceTenants.sampleOps.name);
});

// Blocked: @axe-core/playwright is not installed in @stynx/reference-web, so the
// tenant a11y probe cannot be authored without a dependency-policy assist.
