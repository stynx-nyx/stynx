import { test } from '../fixtures';
import { installRecordDetailMock, openRecordDocumentCard } from '../shared/documents';

test('renders the record detail document upload surface', async ({ page, loginAsAdmin }) => {
  await installRecordDetailMock(page);
  await loginAsAdmin();

  await openRecordDocumentCard(page);
});
