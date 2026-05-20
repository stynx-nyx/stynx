import { expect, test } from '../fixtures';
import { mockFlowApi } from '../shared/api-mocks';

test('renders the Flow analytics dashboard route', async ({ page, loginAsAdmin }) => {
  await mockFlowApi(page);
  await loginAsAdmin();

  await page.goto('/flow/dashboard');

  await expect(page.getByRole('heading', { name: 'Flow dashboard' })).toBeVisible();
});
