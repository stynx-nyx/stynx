import { expect, test } from '../fixtures';
import { mockFlowApi } from '../shared/api-mocks';

test('renders the Flow runtime fills route', async ({ page, loginAsAdmin }) => {
  await mockFlowApi(page);
  await loginAsAdmin();

  await page.goto('/flow/fills');

  await expect(page.getByRole('heading', { name: 'Fills' })).toBeVisible();
});
