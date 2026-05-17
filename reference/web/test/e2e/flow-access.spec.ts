import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('admin@sample-demo.test');
  await page.getByTestId('login-tenant').selectOption('01978f4a-32bf-7c27-a131-fd73a9e001a1');
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('Operational overview')).toBeVisible();
}

test.describe('Flow route access', () => {
  test('requires a session before mounting Flow routes', async ({ page }) => {
    await page.goto('/flow/forms');
    await expect(page.getByTestId('login-title')).toBeVisible();
  });

  test('mounts generic Flow package routes for an authorized reference tenant admin', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/flow/forms');
    await expect(page.getByRole('heading', { name: 'Forms' })).toBeVisible();

    await page.goto('/flow/fills');
    await expect(page.getByRole('heading', { name: 'Fills' })).toBeVisible();

    await page.goto('/flow/open-tasks');
    await expect(page.getByRole('heading', { name: 'Open tasks' })).toBeVisible();
  });
});
