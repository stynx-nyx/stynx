import { expect, test } from '../fixtures';
import {
  installDocumentApiMocks,
  installRecordDetailMock,
  openRecordDocumentCard,
  selectUploadFile,
} from '../shared/documents';

test('uploads a record document and downloads it from the mounted detail surface', async ({ page, loginAsAdmin }) => {
  const api = await installDocumentApiMocks(page);
  await installRecordDetailMock(page);
  await loginAsAdmin();
  await openRecordDocumentCard(page);

  await selectUploadFile(page, {
    name: 'record-document.pdf',
    mimeType: 'application/pdf',
    body: '%PDF-1.4 uploaded from Playwright',
  });

  await expect.poll(() => api.initiateRequests).toEqual([
    expect.objectContaining({
      collection: 'records',
      filename: 'record-document.pdf',
      mimeType: 'application/pdf',
      byteSize: 33,
    }),
  ]);
  await expect.poll(() => api.uploadRequests.map((body) => body.toString('utf8'))).toEqual([
    '%PDF-1.4 uploaded from Playwright',
  ]);
  await expect.poll(() => api.completeRequests).toEqual(['document-record-uploaded']);
  await expect(page.getByTestId('document-upload-root')).toHaveAttribute('data-upload-status', 'completed');
  await expect(page.getByTestId('record-document-download-surface')).toHaveAttribute(
    'data-document-id',
    'document-record-uploaded',
  );

  await page.getByTestId('document-download-button').click();

  await expect.poll(() => api.downloadRequests).toEqual(['document-record-uploaded']);
  await expect.poll(() => api.blobRequests).toEqual(['document-record-uploaded']);
  await expect(page.getByTestId('document-download-root')).toHaveAttribute('data-download-status', 'completed');
});
