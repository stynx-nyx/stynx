import { expect, test } from '../fixtures';
import {
  expectNoDocumentApiCalls,
  installRecordDetailMock,
  openRecordDocumentCard,
  selectUploadFile,
} from '../shared/documents';

test('rejects an unsupported document MIME type before calling the API', async ({ page, loginAsAdmin }) => {
  const api = await expectNoDocumentApiCalls(page);
  await installRecordDetailMock(page);
  await loginAsAdmin();
  await openRecordDocumentCard(page);

  await selectUploadFile(page, {
    name: 'notes.txt',
    mimeType: 'text/plain',
    body: 'not a supported document',
  });

  await expect(page.getByTestId('document-upload-root')).toHaveAttribute('data-upload-status', 'errored');
  await expect(page.getByTestId('document-upload-error')).toBeVisible();
  await expect(page.getByTestId('record-document-download-surface')).toBeHidden();
  expect(api.initiateCalls).toBe(0);
});
