import { expect, test } from '../fixtures';
import {
  installDocumentApiMocks,
  installRecordDetailMock,
  openRecordDocumentCard,
  selectUploadFile,
} from '../shared/documents';

test('uploads an allowed image document through the record detail surface', async ({ page, loginAsAdmin }) => {
  const api = await installDocumentApiMocks(page, {
    documentId: 'document-record-image',
  });
  await installRecordDetailMock(page);
  await loginAsAdmin();
  await openRecordDocumentCard(page);

  await selectUploadFile(page, {
    name: 'record-photo.png',
    mimeType: 'image/png',
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });

  await expect.poll(() => api.initiateRequests).toEqual([
    expect.objectContaining({
      collection: 'records',
      filename: 'record-photo.png',
      mimeType: 'image/png',
      byteSize: 4,
    }),
  ]);
  await expect.poll(() => api.uploadRequests).toHaveLength(1);
  await expect.poll(() => api.completeRequests).toEqual(['document-record-image']);
  await expect(page.getByTestId('document-upload-root')).toHaveAttribute('data-upload-status', 'completed');
  await expect(page.getByTestId('record-document-download-surface')).toHaveAttribute(
    'data-document-id',
    'document-record-image',
  );
});
