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
};

type CreateRecordRequest = Pick<RecordItem, 'title' | 'email' | 'externalRef' | 'status'>;

const tenantId = referenceTenants.sampleDemo.id;
const createdAt = '2026-05-19T09:30:46.338Z';
const recordsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records(?:\?.*)?$/;
const recordApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records\/([^/?#]+)(?:\?.*)?$/;

function recordIdFromUrl(url: string): string {
  return url.split('/records/')[1]?.split(/[?#/]/)[0] ?? '';
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

async function installRecordApiMocks(page: Page): Promise<void> {
  const rows: RecordItem[] = [];
  let createdCount = 0;

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

    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as CreateRecordRequest;
      if (index < 0) {
        await fulfillJson(route, 404, {
          statusCode: 404,
          message: 'Record not found',
          error: 'Not Found',
        });
        return;
      }
      rows[index] = {
        ...rows[index],
        ...body,
        externalRef: body.externalRef ?? null,
        updatedAt: createdAt,
      };
      await fulfillJson(route, 200, rows[index]);
      return;
    }

    if (method === 'DELETE') {
      if (index >= 0) {
        rows.splice(index, 1);
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
      const created = recordFromRequest(`record-created-${createdCount}`, body);
      rows.push(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
  });
}

test('creates, edits, lists, and soft-deletes a record', async ({ page, loginAsAdmin }) => {
  await installRecordApiMocks(page);
  await loginAsAdmin();

  const suffix = Date.now();
  const recordTitle = `Records CRUD ${suffix}`;
  const recordEmail = `records-crud-${suffix}@sample-demo.test`;

  await page.goto('/records/new');
  await page.getByTestId('record-title-input').fill(recordTitle);
  await page.getByTestId('record-email-input').fill(recordEmail);
  await page.getByTestId('record-save-submit').click();

  await expect(page.getByTestId('record-detail-title')).toContainText(recordTitle);
  const recordId = recordIdFromUrl(page.url());
  expect(recordId).not.toHaveLength(0);

  await page.goto('/records');
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeVisible();

  const updatedTitle = `${recordTitle} updated`;
  await page.goto(`/records/${recordId}/edit`);
  await page.getByTestId('record-title-input').fill(updatedTitle);
  await page.getByTestId('record-email-input').fill(`records-crud-updated-${suffix}@sample-demo.test`);
  await page.getByTestId('record-save-submit').click();

  await expect(page.getByTestId('record-detail-title')).toContainText(updatedTitle);

  await page.goto('/records');
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeVisible();
  await page.getByTestId(`record-delete-${recordId}`).click();
  await expect(page.getByTestId(`record-row-${recordId}`)).toBeHidden();
});

// Blocked until @axe-core/playwright is added to @stynx/reference-web devDependencies.
