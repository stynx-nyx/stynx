import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('admin@sample-demo.test');
  await page.getByTestId('login-tenant').selectOption('01978f4a-32bf-7c27-a131-fd73a9e001a1');
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('Operational overview')).toBeVisible();
}

test('record soft-delete appears in trash and can be restored', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/records/new');
  const recordTitle = `Trash ${Date.now()}`;
  await page.getByTestId('record-title-input').fill(recordTitle);
  await page.getByTestId('record-email-input').fill(`trash-${Date.now()}@sample-demo.test`);
  await page.getByTestId('record-save-submit').click();
  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);

  const recordId = page.url().split('/records/')[1]?.split(/[?#/]/)[0] ?? '';
  expect(recordId).not.toHaveLength(0);

  await page.goto('/records');
  await page.getByTestId(`record-delete-${recordId}`).click();
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeHidden();

  await page.goto('/trash');
  await page.getByTestId('trash-resource-records').click();
  const trashedRecord = page.getByRole('article').filter({ hasText: recordTitle });
  await expect(trashedRecord).toBeVisible();
  await trashedRecord.getByRole('button', { name: 'Restore' }).click();
  await expect(trashedRecord).toBeHidden();

  await page.goto(`/records/${recordId}`);
  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);
});
