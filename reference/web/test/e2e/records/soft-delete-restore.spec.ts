import type { Page, Route } from '@playwright/test';
import { expect, referenceTenants, test } from '../fixtures';

type RecordItem = {
  id: string;
  tenantId: string;
  title: string;
  email: string;
  externalRef: string | null;
  status: 'active' | 'pending' | 'inactive';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type CreateRecordRequest = Pick<RecordItem, 'title' | 'email' | 'externalRef' | 'status'>;

const tenantId = referenceTenants.sampleDemo.id;
const createdAt = '2026-05-19T09:30:46.338Z';
const deletedAt = '2026-05-19T10:15:46.338Z';
const recordsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records(?:\?.*)?$/;
const recordsTrashApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records\/trash(?:\?.*)?$/;
const recordRestoreApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records\/([^/?#]+)\/restore(?:\?.*)?$/;
const recordApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records\/(?!trash(?:[/?#]|$))([^/?#]+)(?:\?.*)?$/;

function recordIdFromUrl(url: string): string {
  return url.split('/records/')[1]?.split(/[?#/]/)[0] ?? '';
}

function restoredRecord(record: RecordItem): RecordItem {
  const { deletedAt: _deletedAt, ...restored } = record;
  return restored;
}

function recordFromRequest(id: string, input: CreateRecordRequest): RecordItem {
  return {
    id,
    tenantId,
    title: input.title,
    email: input.email,
    externalRef: input.externalRef ?? null,
    status: input.status,
    createdAt,
    updatedAt: createdAt,
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installRecordTrashApiMocks(page: Page): Promise<{ restoredIds: string[] }> {
  const rows: RecordItem[] = [];
  const trash: RecordItem[] = [];
  const restoredIds: string[] = [];
  let createdCount = 0;

  await page.route(recordsTrashApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    await fulfillJson(route, 200, trash);
  });

  await page.route(recordRestoreApiUrl, async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const id = recordIdFromUrl(route.request().url());
    const index = trash.findIndex((record) => record.id === id);
    if (index < 0) {
      await fulfillJson(route, 404, {
        statusCode: 404,
        message: 'Record not found',
        error: 'Not Found',
      });
      return;
    }

    rows.push(restoredRecord(trash[index]));
    trash.splice(index, 1);
    restoredIds.push(id);
    await fulfillJson(route, 200, { status: 'restored', id });
  });

  await page.route(recordApiUrl, async (route) => {
    const method = route.request().method();
    const id = recordIdFromUrl(route.request().url());
    const index = rows.findIndex((record) => record.id === id);

    if (method === 'GET') {
      const found = rows[index];
      await fulfillJson(
        route,
        found ? 200 : 404,
        found ?? {
          statusCode: 404,
          message: 'Record not found',
          error: 'Not Found',
        },
      );
      return;
    }

    if (method === 'DELETE') {
      if (index >= 0) {
        const [deleted] = rows.splice(index, 1);
        trash.push({
          ...deleted,
          deletedAt,
          updatedAt: deletedAt,
        });
      }
      await fulfillJson(route, 200, { status: 'deleted', id });
      return;
    }

    await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
  });

  await page.route(recordsApiUrl, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await fulfillJson(route, 200, rows);
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as CreateRecordRequest;
      createdCount += 1;
      const created = recordFromRequest(`record-restore-${createdCount}`, body);
      rows.push(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
  });

  return { restoredIds };
}

test('restores a soft-deleted record from trash', async ({ page, loginAsAdmin }) => {
  const api = await installRecordTrashApiMocks(page);
  await loginAsAdmin();

  const suffix = Date.now();
  const recordTitle = `Records restore ${suffix}`;

  await page.goto('/records/new');
  await page.getByTestId('record-title-input').fill(recordTitle);
  await page.getByTestId('record-email-input').fill(`records-restore-${suffix}@sample-demo.test`);
  await page.getByTestId('record-save-submit').click();

  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);
  const recordId = recordIdFromUrl(page.url());
  expect(recordId).not.toHaveLength(0);

  await page.goto('/records');
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeVisible();
  await page.getByTestId(`record-delete-${recordId}`).click();
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeHidden();

  await page.goto('/trash');
  await page.getByTestId('trash-resource-records').click();
  await expect(page.getByTestId(`trash-item-records-${recordId}`)).toBeVisible();
  await page.getByTestId(`trash-restore-records-${recordId}`).click();

  await expect.poll(() => api.restoredIds).toEqual([recordId]);
  await expect(page.getByTestId(`trash-item-records-${recordId}`)).toBeHidden();

  await page.goto(`/records/${recordId}`);
  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);
});

// Blocked: @axe-core/playwright is not installed in @stynx/reference-web, so an
// accessibility probe cannot be authored in this spec without dependency-policy assist.
