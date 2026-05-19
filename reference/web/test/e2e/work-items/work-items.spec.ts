import type { Page, Route } from '@playwright/test';
import { expect, referenceTenants, test } from '../fixtures';
import { expectAuthenticatedShell } from '../shared/nav';

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

type WorkItem = {
  id: string;
  tenantId: string;
  recordId: string;
  code: string;
  openedOn: string;
  targetOn: string;
  category: string;
  totalUnits: number;
  status: 'draft' | 'ready' | 'done' | 'cancelled';
  createdAt: string;
  updatedAt: string;
};

type CreateWorkItemRequest = {
  recordId: string;
  code: string;
  openedOn: string;
  targetOn: string;
  category?: string;
  totalUnits?: number;
  status?: WorkItem['status'];
};

const tenantId = referenceTenants.sampleDemo.id;
const createdAt = '2026-05-19T09:30:46.338Z';
const recordsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records(?:\?.*)?$/;
const workItemsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/work-items(?:\?.*)?$/;
const workItemApiUrl = /^http:\/\/127\.0\.0\.1:3000\/work-items\/(?!trash(?:[/?#]|$))([^/?#]+)(?:\?.*)?$/;
const workItemsTrashApiUrl = /^http:\/\/127\.0\.0\.1:3000\/work-items\/trash(?:\?.*)?$/;

const primaryRecord: RecordItem = {
  id: 'record-work-items-primary',
  tenantId,
  title: 'Work item parent record',
  email: 'work-items-parent@sample-demo.test',
  externalRef: 'WI-PARENT-001',
  status: 'active',
  createdAt,
  updatedAt: createdAt,
};

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  const id = overrides.id ?? 'work-item-existing';
  return {
    id,
    tenantId,
    recordId: primaryRecord.id,
    code: 'WI-EXISTING',
    openedOn: '2026-05-19',
    targetOn: '2026-05-26',
    category: 'GEN',
    totalUnits: 3,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installWorkItemApiMocks(page: Page): Promise<{
  createdWorkItems: CreateWorkItemRequest[];
  deletedWorkItemIds: string[];
}> {
  const rows = [workItem()];
  const createdWorkItems: CreateWorkItemRequest[] = [];
  const deletedWorkItemIds: string[] = [];

  await page.route(recordsApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    await fulfillJson(route, 200, [primaryRecord]);
  });

  await page.route(workItemsTrashApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    await fulfillJson(
      route,
      200,
      deletedWorkItemIds.map((id) => ({
        ...workItem({ id, code: 'WI-DELETE-ME' }),
        deletedAt: createdAt,
      })),
    );
  });

  await page.route(workItemApiUrl, async (route) => {
    const method = route.request().method();
    const id = route.request().url().split('/work-items/')[1]?.split(/[?#/]/)[0] ?? '';

    if (method === 'GET') {
      const found = rows.find((item) => item.id === id);
      await fulfillJson(
        route,
        found ? 200 : 404,
        found ?? {
          statusCode: 404,
          message: 'Work item not found',
          error: 'Not Found',
        },
      );
      return;
    }

    if (method === 'DELETE') {
      deletedWorkItemIds.push(id);
      const index = rows.findIndex((item) => item.id === id);
      if (index >= 0) {
        rows.splice(index, 1);
      }
      await fulfillJson(route, 200, { status: 'deleted', id });
      return;
    }

    await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
  });

  await page.route(workItemsApiUrl, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await fulfillJson(route, 200, rows);
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as CreateWorkItemRequest;
      createdWorkItems.push(body);
      const created = workItem({
        ...body,
        id: `work-item-created-${createdWorkItems.length}`,
        category: body.category ?? 'GEN',
        totalUnits: body.totalUnits ?? 0,
        status: body.status ?? 'draft',
      });
      rows.push(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
  });

  return { createdWorkItems, deletedWorkItemIds };
}

test('creates a work item and opens its detail page', async ({ page, loginAsAdmin }) => {
  const api = await installWorkItemApiMocks(page);

  await loginAsAdmin();
  await expectAuthenticatedShell(page);
  await page.goto('/work-items/new');
  await page.getByTestId('work-item-record-select').selectOption(primaryRecord.id);
  await page.getByTestId('work-item-code-input').fill('WI-CREATED');
  await page.getByTestId('work-item-save-submit').click();

  await expect
    .poll(() => api.createdWorkItems)
    .toEqual([
      expect.objectContaining({
        recordId: primaryRecord.id,
        code: 'WI-CREATED',
      }),
    ]);
  await expect(page.getByTestId('work-item-detail-title')).toContainText('WI-CREATED');
  await expect(page).toHaveURL(/\/work-items\/work-item-created-1$/);
});

test('lists work items and soft-deletes a selected row', async ({ page, loginAsAdmin }) => {
  const api = await installWorkItemApiMocks(page);
  const rowId = 'work-item-existing';

  await loginAsAdmin();
  await page.getByTestId('nav-work-items').click();
  await expect(page.getByTestId('work-items-title')).toBeVisible();
  await expect(page.getByTestId(`work-item-row-${rowId}`)).toBeVisible();

  await page.getByTestId(`work-item-delete-${rowId}`).click();

  await expect.poll(() => api.deletedWorkItemIds).toEqual([rowId]);
  await expect(page.getByTestId(`work-item-row-${rowId}`)).toBeHidden();
  await page.goto('/trash');
  await page.getByTestId('trash-resource-work-items').click();
});

// Blocked: @axe-core/playwright is not installed in @stynx/reference-web, so the
// required work-items a11y probe cannot be authored without a dependency-policy assist.
// Blocked: reference/web/playwright.config.mjs does not include work-items/**/*.spec.ts
// in the spa-only ownedCategorySpecs list, and this worker may not edit config.
