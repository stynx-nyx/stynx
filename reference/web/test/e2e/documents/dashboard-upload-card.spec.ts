import { expect, test } from '../fixtures';

test('renders the dashboard document upload card for a document writer', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin();

  await expect(page.getByTestId('dashboard-document-upload-card')).toBeVisible();
  await expect(page.getByTestId('dashboard-document-upload')).toBeVisible();
  await expect(page.getByTestId('document-upload-root')).toHaveAttribute('data-upload-status', 'idle');
});
