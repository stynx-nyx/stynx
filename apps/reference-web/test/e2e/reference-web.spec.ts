import { expect, test } from '@playwright/test';

test('login -> create record -> create work-item -> soft-delete -> restore -> logout', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('login-email').fill('admin@sample-demo.test');
  await page.getByTestId('login-tenant').selectOption('01978f4a-32bf-7c27-a131-fd73a9e001a1');
  await page.getByTestId('login-submit').click();

  await expect(page.getByText('Operational overview')).toBeVisible();

  await page.goto('/records/new');
  const recordTitle = `Record ${Date.now()}`;
  await page.getByTestId('record-title-input').fill(recordTitle);
  await page.getByTestId('record-email-input').fill(`record-${Date.now()}@sample-demo.test`);
  await page.getByTestId('record-save-submit').click();
  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);

  const recordPath = page.url().split('/records/')[1] ?? '';
  const recordId = recordPath.split(/[?#]/)[0] ?? '';
  expect(recordId).not.toHaveLength(0);

  await page.goto('/work-items/new');
  const workItemCode = `WI-${Date.now()}`;
  await page.getByTestId('work-item-record-select').selectOption(recordId);
  await page.getByTestId('work-item-code-input').fill(workItemCode);
  await page.getByTestId('work-item-save-submit').click();
  await expect(page.getByTestId('work-item-detail-title')).toContainText(workItemCode);

  const workItemPath = page.url().split('/work-items/')[1] ?? '';
  const workItemId = workItemPath.split(/[?#]/)[0] ?? '';
  expect(workItemId).not.toHaveLength(0);

  await page.goto('/work-items');
  await page.getByTestId(`work-item-delete-${workItemId}`).click();

  await page.goto('/trash');
  await page.getByTestId('trash-resource-work-items').click();
  await expect(page.getByText(workItemCode)).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(workItemCode)).not.toBeVisible();

  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('login-title')).toBeVisible();
});
