import { expect, test } from '../fixtures';
import { mockIamApi } from '../shared/api-mocks';

test('renders the IAM roles admin list', async ({ page, loginAsAdmin }) => {
  await mockIamApi(page);
  await loginAsAdmin();

  await page.goto('/admin/roles');

  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
  const roleRow = page.locator('tbody tr').filter({
    has: page.locator('td code').filter({ hasText: /^admin$/ }),
  });
  await expect(roleRow).toHaveCount(1);
  await expect(roleRow.locator('td').nth(0).locator('strong')).toHaveText('Admin');
  await expect(roleRow.locator('td').nth(0).locator('small')).toHaveText('Tenant administrators');
  await expect(roleRow.locator('td').nth(1).locator('code')).toHaveText('admin');
  await expect(roleRow.locator('td').nth(2)).toHaveText('8');
  await expect(roleRow.locator('td').nth(3)).toHaveText('1');
});
