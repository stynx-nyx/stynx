import { expect, test } from '../fixtures';
import { mockIamApi } from '../shared/api-mocks';

test('renders the IAM users admin list', async ({ page, loginAsAdmin }) => {
  await mockIamApi(page);
  await loginAsAdmin();

  await page.goto('/admin/users');

  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText('Ada Admin')).toBeVisible();
  await expect(page.getByText('ada.admin@sample-demo.test')).toBeVisible();
});
