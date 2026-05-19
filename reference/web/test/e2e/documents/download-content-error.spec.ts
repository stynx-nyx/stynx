import { expect, test } from '../fixtures';
import {
  installDocumentApiMocks,
  installRecordDetailMock,
  openRecordDocumentCard,
  selectUploadFile,
} from '../shared/documents';

test('surfaces signed document content fetch failures during download', async ({ page, loginAsAdmin }) => {
  const api = await installDocumentApiMocks(page, {
    blobStatus: 403,
    blobBody: 'signed object access denied',
  });
  await installRecordDetailMock(page);
  await loginAsAdmin();
  await openRecordDocumentCard(page);

  await selectUploadFile(page);
  await expect(page.getByTestId('record-document-download-surface')).toBeVisible();

  await page.getByTestId('document-download-button').click();

  await expect.poll(() => api.downloadRequests).toEqual(['document-record-uploaded']);
  await expect.poll(() => api.blobRequests).toEqual(['document-record-uploaded']);
  await expect(page.getByTestId('document-download-root')).toHaveAttribute('data-download-status', 'errored');
  await expect(page.getByTestId('document-download-error')).toBeVisible();
});
