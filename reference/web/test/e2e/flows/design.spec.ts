import { expect, test } from '../fixtures';
import { mockFlowApi } from '../shared/api-mocks';

test('renders the Flow design forms route', async ({ page, loginAsAdmin }) => {
  await mockFlowApi(page);
  await loginAsAdmin();

  await page.goto('/flow/forms');

  await expect(page.getByRole('heading', { name: 'Forms' })).toBeVisible();
});
