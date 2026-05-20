import { expect, test } from '../fixtures';
import { mockIamApi } from '../shared/api-mocks';

test('renders the IAM groups admin list', async ({ page, loginAsAdmin }) => {
  await mockIamApi(page);
  await loginAsAdmin();

  await page.goto('/admin/groups');

  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  const groupRow = page.locator('tbody tr').filter({
    has: page.locator('td code').filter({ hasText: /^ops$/ }),
  });
  await expect(groupRow).toHaveCount(1);
  await expect(groupRow.locator('td').nth(0).locator('strong')).toHaveText('Operations');
  await expect(groupRow.locator('td').nth(0).locator('small')).toHaveText('Operations team');
  await expect(groupRow.locator('td').nth(1).locator('code')).toHaveText('ops');
  await expect(groupRow.locator('td').nth(2)).toHaveText('1');
  await expect(groupRow.locator('td').nth(3)).toHaveText('2');
});
