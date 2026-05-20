import type { Page, Route } from '@playwright/test';
import { referenceTenants } from './reference-data';

const tenantId = referenceTenants.sampleDemo.id;

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  if (route.request().resourceType() === 'document') {
    await route.fallback();
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function mockIamApi(page: Page): Promise<void> {
  await page.route('**/admin/users/user-1/effective-permissions**', (route) => fulfillJson(route, {
    userId: 'user-1',
    permissions: [{
      permission: {
        key: 'sample:record:write',
        resource: 'record',
        action: 'write',
        description: 'Create and edit records',
      },
      effect: 'allow',
      grantedBy: [{ type: 'role', id: 'role-admin', name: 'Admin' }],
    }],
  }));
  await page.route('**/admin/users/user-1/roles**', (route) => fulfillJson(route, [{
    id: 'role-admin',
    key: 'admin',
    name: 'Admin',
    description: 'Tenant administrators',
    permissionsCount: 8,
    membersCount: 1,
    system: true,
  }]));
  await page.route('**/admin/users/user-1/groups**', (route) => fulfillJson(route, [{
    id: 'group-ops',
    key: 'ops',
    name: 'Operations',
    description: 'Operations team',
    rolesCount: 1,
    membersCount: 2,
  }]));
  await page.route('**/admin/users/user-1**', (route) => fulfillJson(route, {
    id: 'user-1',
    tenantId,
    email: 'ada.admin@sample-demo.test',
    firstName: 'Ada',
    lastName: 'Admin',
    displayName: 'Ada Admin',
    locale: 'en-US',
    status: 'active',
    createdAt: '2026-05-20T00:00:00.000Z',
  }));
  await page.route('**/admin/users**', (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/admin/users')) {
      return route.fallback();
    }
    return fulfillJson(route, {
      items: [{
        id: 'user-1',
        tenantId,
        email: 'ada.admin@sample-demo.test',
        firstName: 'Ada',
        lastName: 'Admin',
        displayName: 'Ada Admin',
        status: 'active',
        lastLoginAt: '2026-05-20T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });
  await page.route('**/admin/roles/role-admin/permissions**', (route) => fulfillJson(route, [{
    key: 'sample:record:write',
    resource: 'record',
    action: 'write',
    description: 'Create and edit records',
  }]));
  await page.route('**/admin/roles/role-admin**', (route) => fulfillJson(route, {
    id: 'role-admin',
    key: 'admin',
    name: 'Admin',
    description: 'Tenant administrators',
    permissionsCount: 8,
    membersCount: 1,
    system: true,
  }));
  await page.route('**/admin/roles**', (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/admin/roles')) {
      return route.fallback();
    }
    return fulfillJson(route, [{
      id: 'role-admin',
      key: 'admin',
      name: 'Admin',
      description: 'Tenant administrators',
      permissionsCount: 8,
      membersCount: 1,
      system: true,
    }]);
  });
  await page.route('**/admin/groups/group-ops/roles**', (route) => fulfillJson(route, [{
    id: 'role-admin',
    key: 'admin',
    name: 'Admin',
    description: 'Tenant administrators',
    permissionsCount: 8,
    membersCount: 1,
    system: true,
  }]));
  await page.route('**/admin/groups/group-ops/members**', (route) => fulfillJson(route, [{
    id: 'user-1',
    tenantId,
    email: 'ada.admin@sample-demo.test',
    displayName: 'Ada Admin',
    status: 'active',
  }]));
  await page.route('**/admin/groups/group-ops**', (route) => fulfillJson(route, {
    id: 'group-ops',
    key: 'ops',
    name: 'Operations',
    description: 'Operations team',
    rolesCount: 1,
    membersCount: 2,
  }));
  await page.route('**/admin/groups**', (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/admin/groups')) {
      return route.fallback();
    }
    return fulfillJson(route, [{
      id: 'group-ops',
      key: 'ops',
      name: 'Operations',
      description: 'Operations team',
      rolesCount: 1,
      membersCount: 2,
    }]);
  });
}

export async function mockFlowApi(page: Page): Promise<void> {
  await page.route('**/flow/scopes**', (route) => fulfillJson(route, [{
    id: 'scope-1',
    tenantId,
    code: 'sample',
    name: 'Sample scope',
    status: 'active',
  }]));
  await page.route('**/flow/graphs**', (route) => fulfillJson(route, [{
    id: 'graph-1',
    scopeId: 'scope-1',
    code: 'onboarding',
    name: 'Onboarding',
    status: 'draft',
    version: 1,
    nodes: [],
    edges: [],
  }]));
  await page.route('**/flow/forms**', (route) => fulfillJson(route, [{
    id: 'form-1',
    scopeId: 'scope-1',
    key: 'onboarding-form',
    title: 'Onboarding form',
    questions: [],
  }]));
  await page.route('**/flow/fills**', (route) => fulfillJson(route, [{
    id: 'fill-1',
    formId: 'form-1',
    status: 'draft',
    targetType: 'record',
    targetId: 'record-1',
    answers: {},
  }]));
  await page.route('**/flow/open-tasks**', (route) => fulfillJson(route, {
    data: [{
      id: 'task-1',
      runId: 'run-1',
      nodeId: 'node-1',
      nodeName: 'Review',
      status: 'open',
      targetType: 'record',
      targetId: 'record-1',
    }],
    total: 1,
    page: 1,
    pageSize: 20,
  }));
  await page.route('**/flow/runs/summary**', (route) => fulfillJson(route, {
    data: [{
      scopeId: 'scope-1',
      graphId: 'graph-1',
      status: 'open',
      runCount: 2,
    }],
    total: 1,
    page: 1,
    pageSize: 20,
  }));
  await page.route('**/flow/analytics/dashboard**', (route) => fulfillJson(route, {
    openTasks: 1,
    cycleTime: { p50Seconds: 120, p95Seconds: 300 },
    completionRate: { last7Days: 0.75, last30Days: 0.9 },
    slaBreaches: 0,
  }));
}
