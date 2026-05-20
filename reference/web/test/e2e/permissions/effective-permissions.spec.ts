import { expect, test } from '../fixtures';
import { mockIamApi } from '../shared/api-mocks';

test('shows permission denial for a reader without admin grants', async ({ page }) => {
  await mockIamApi(page);
  await page.goto('/login');
  await page.getByTestId('login-email').fill('reader@sample-demo.test');
  await page.getByTestId('login-tenant').selectOption('01978f4a-32bf-7c27-a131-fd73a9e001a1');
  await page.getByTestId('login-submit').click();

  await page.goto('/admin/users');

  await expect(page.getByTestId('unauthorized-title')).toBeVisible();
  await expect(page.getByTestId('unauthorized-banner')).toContainText('missing the required permission');
});
