import { expect, test } from '../fixtures';
import {
  installDocumentApiMocks,
  installRecordDetailMock,
  openRecordDocumentCard,
  selectUploadFile,
} from '../shared/documents';

test('surfaces forbidden document download responses on the record detail page', async ({ page, loginAsAdmin }) => {
  const api = await installDocumentApiMocks(page, {
    downloadStatus: 403,
    downloadBody: {
      statusCode: 403,
      message: 'Missing permission sample:document:read',
      error: 'Forbidden',
    },
  });
  await installRecordDetailMock(page);
  await loginAsAdmin();
  await openRecordDocumentCard(page);

  await selectUploadFile(page);
  await expect(page.getByTestId('record-document-download-surface')).toBeVisible();

  await page.getByTestId('document-download-button').click();

  await expect.poll(() => api.downloadRequests).toEqual(['document-record-uploaded']);
  await expect(page.getByTestId('document-download-root')).toHaveAttribute('data-download-status', 'errored');
  await expect(page.getByTestId('document-download-error')).toBeVisible();
  expect(api.blobRequests).toHaveLength(0);
});
