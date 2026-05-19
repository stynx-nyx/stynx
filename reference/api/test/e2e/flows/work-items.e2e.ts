import {
  auditExpect,
  expectInArchive,
  expectNotInLive,
  expectRestored,
  expectRLSIsolated,
} from '@stynx/testing';
import { PermissionCache } from '@stynx/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  workItemEntries,
  workItemLocks,
  workItems,
} from '../../../src/sample/schema';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

interface RecordBody {
  id: string;
  title: string;
  email: string;
}

interface WorkItemBody {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  recordId: string;
  code: string;
  openedOn: string;
  targetOn: string;
  category: string;
  totalUnits: number;
  status: string;
}

interface WorkItemEntryBody {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  workItemId: string;
  description: string;
  quantity: string;
  unitUnits: number;
  totalUnits: number;
}

interface WorkItemLockBody {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  workItemId: string;
  lockedAt: string;
  amountUnits: number;
  reason: string;
  externalRef?: string | null;
}

const adminWorkItemPermissions = [
  'sample:work-item:read',
  'sample:work-item:write',
  'sample:work-item:delete',
  'sample:work-item:restore',
  'sample:work-item-entry:read',
  'sample:work-item-entry:write',
  'sample:work-item-entry:delete',
  'sample:work-item-entry:restore',
  'sample:work-item-lock:read',
  'sample:work-item-lock:write',
  'sample:work-item-lock:delete',
  'sample:work-item-lock:restore',
] as const;

async function grantAdminWorkItemPermissions(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    for (const permission of adminWorkItemPermissions) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [permission],
      );

      for (const membershipId of [actors.adminA.membershipId, actors.adminB.membershipId]) {
        await client.query(
          `
            insert into auth.direct_perms (id, membership_id, perm_id, effect)
            select gen_random_uuid(), $1::uuid, perm.id, 'allow'
            from auth.perms perm
            where perm.key = $2
          `,
          [membershipId, permission],
        );
      }
    }
  } finally {
    await client.end();
  }

  const permissionCache = context.app.get(PermissionCache);
  await permissionCache.publishInvalidation(`${actors.adminA.userId}:${tenants.tenantA}`);
  await permissionCache.publishInvalidation(`${actors.adminB.userId}:${tenants.tenantB}`);
}

function lockTimestamp(): string {
  return new Date('2026-05-19T12:00:00.000Z').toISOString();
}

describe('@stynx/reference-api e2e work items', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let recordId = '';
  let workItemId = '';
  let entryId = '';
  let lockId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e();
    await grantAdminWorkItemPermissions(context);
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('runs happy create, update, read, and list for work items, entries, and locks with audit rows', async () => {
    const record = (await adminA.post('/records').send({
      title: 'Work item dependency',
      email: 'work-item-dependency@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;
    recordId = record.id;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: recordId,
    });

    const workItem = (await adminA.post('/work-items').send({
      recordId,
      code: 'WI-E2E-001',
      openedOn: '2026-05-19',
      targetOn: '2026-05-26',
      category: 'OPS',
      totalUnits: 10,
      status: 'draft',
    }).expect(201)).body as WorkItemBody;
    workItemId = workItem.id;
    expect(workItem).toEqual(expect.objectContaining({
      id: workItemId,
      recordId,
      code: 'WI-E2E-001',
      category: 'OPS',
      totalUnits: 10,
      status: 'draft',
    }));
    await auditExpect(context.database, 'work_item', 'sample.work-item.create', {
      schema: 'sample',
      rowId: workItemId,
    });

    const updatedWorkItem = (await adminA.patch(`/work-items/${workItemId}`).send({
      code: 'WI-E2E-001A',
      status: 'ready',
      totalUnits: 12,
    }).expect(200)).body as WorkItemBody;
    expect(updatedWorkItem).toEqual(expect.objectContaining({
      id: workItemId,
      code: 'WI-E2E-001A',
      status: 'ready',
      totalUnits: 12,
    }));
    await auditExpect(context.database, 'work_item', 'sample.work-item.update', {
      schema: 'sample',
      rowId: workItemId,
    });

    const entry = (await adminA.post('/work-item-entries').send({
      workItemId,
      description: 'Initial entry',
      quantity: '2.000',
      unitUnits: 3,
    }).expect(201)).body as WorkItemEntryBody;
    entryId = entry.id;
    expect(entry).toEqual(expect.objectContaining({
      id: entryId,
      workItemId,
      description: 'Initial entry',
      quantity: '2.000',
      unitUnits: 3,
      totalUnits: 6,
    }));
    await auditExpect(context.database, 'work_item_entry', 'sample.work-item-entry.create', {
      schema: 'sample',
      rowId: entryId,
    });

    const updatedEntry = (await adminA.patch(`/work-item-entries/${entryId}`).send({
      description: 'Updated entry',
      quantity: '4.000',
      unitUnits: 5,
    }).expect(200)).body as WorkItemEntryBody;
    expect(updatedEntry).toEqual(expect.objectContaining({
      id: entryId,
      description: 'Updated entry',
      quantity: '4.000',
      unitUnits: 5,
      totalUnits: 20,
    }));
    await auditExpect(context.database, 'work_item_entry', 'sample.work-item-entry.update', {
      schema: 'sample',
      rowId: entryId,
    });

    const lock = (await adminA.post('/work-item-locks').send({
      workItemId,
      lockedAt: lockTimestamp(),
      amountUnits: 5,
      reason: 'manual',
      externalRef: 'LOCK-E2E-001',
    }).expect(201)).body as WorkItemLockBody;
    lockId = lock.id;
    expect(lock).toEqual(expect.objectContaining({
      id: lockId,
      workItemId,
      amountUnits: 5,
      reason: 'manual',
      externalRef: 'LOCK-E2E-001',
    }));
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.create', {
      schema: 'sample',
      rowId: lockId,
    });

    const updatedLock = (await adminA.patch(`/work-item-locks/${lockId}`).send({
      amountUnits: 7,
      reason: 'review',
      externalRef: 'LOCK-E2E-001A',
    }).expect(200)).body as WorkItemLockBody;
    expect(updatedLock).toEqual(expect.objectContaining({
      id: lockId,
      amountUnits: 7,
      reason: 'review',
      externalRef: 'LOCK-E2E-001A',
    }));
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.update', {
      schema: 'sample',
      rowId: lockId,
    });

    await adminA.get(`/work-items/${workItemId}`).expect(200).expect(({ body }: { body: WorkItemBody }) => {
      expect(body.id).toBe(workItemId);
    });
    await adminA.get(`/work-item-entries/${entryId}`).expect(200).expect(({ body }: { body: WorkItemEntryBody }) => {
      expect(body.id).toBe(entryId);
    });
    await adminA.get(`/work-item-locks/${lockId}`).expect(200).expect(({ body }: { body: WorkItemLockBody }) => {
      expect(body.id).toBe(lockId);
    });

    await adminA.get('/work-items').expect(200).expect(({ body }: { body: WorkItemBody[] }) => {
      expect(body.some((row) => row.id === workItemId)).toBe(true);
    });
    await adminA.get('/work-item-entries').expect(200).expect(({ body }: { body: WorkItemEntryBody[] }) => {
      expect(body.some((row) => row.id === entryId)).toBe(true);
    });
    await adminA.get('/work-item-locks').expect(200).expect(({ body }: { body: WorkItemLockBody[] }) => {
      expect(body.some((row) => row.id === lockId)).toBe(true);
    });
  });

  it('denies work-item writes to the viewer actor', async () => {
    await viewerA.post('/work-items').send({
      recordId,
      code: 'WI-VIEWER-DENIED',
      openedOn: '2026-05-19',
      targetOn: '2026-05-20',
    }).expect(403);
  });

  it('isolates work items, entries, and locks across tenants through HTTP and RLS', async () => {
    const otherRecord = (await adminB.post('/records').send({
      title: 'Tenant B work dependency',
      email: 'tenant-b-work-dependency@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: otherRecord.id,
    });

    const otherWorkItem = (await adminB.post('/work-items').send({
      recordId: otherRecord.id,
      code: 'WI-TENANT-B-001',
      openedOn: '2026-05-19',
      targetOn: '2026-05-26',
      category: 'OPS',
    }).expect(201)).body as WorkItemBody;
    const otherEntry = (await adminB.post('/work-item-entries').send({
      workItemId: otherWorkItem.id,
      description: 'Tenant B entry',
      quantity: '1.000',
      unitUnits: 9,
    }).expect(201)).body as WorkItemEntryBody;
    const otherLock = (await adminB.post('/work-item-locks').send({
      workItemId: otherWorkItem.id,
      lockedAt: lockTimestamp(),
      amountUnits: 9,
      reason: 'hold',
    }).expect(201)).body as WorkItemLockBody;

    await auditExpect(context.database, 'work_item', 'sample.work-item.create', {
      schema: 'sample',
      rowId: otherWorkItem.id,
    });
    await auditExpect(context.database, 'work_item_entry', 'sample.work-item-entry.create', {
      schema: 'sample',
      rowId: otherEntry.id,
    });
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.create', {
      schema: 'sample',
      rowId: otherLock.id,
    });

    await adminA.get(`/work-items/${otherWorkItem.id}`).expect(404);
    await adminA.get(`/work-item-entries/${otherEntry.id}`).expect(404);
    await adminA.get(`/work-item-locks/${otherLock.id}`).expect(404);
    await adminA.get('/work-items').expect(200).expect(({ body }: { body: WorkItemBody[] }) => {
      expect(body.some((row) => row.id === otherWorkItem.id)).toBe(false);
    });
    await adminA.get('/work-item-entries').expect(200).expect(({ body }: { body: WorkItemEntryBody[] }) => {
      expect(body.some((row) => row.id === otherEntry.id)).toBe(false);
    });
    await adminA.get('/work-item-locks').expect(200).expect(({ body }: { body: WorkItemLockBody[] }) => {
      expect(body.some((row) => row.id === otherLock.id)).toBe(false);
    });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<WorkItemBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.work_item',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<WorkItemEntryBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.work_item_entry',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<WorkItemLockBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.work_item_lock',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });

  it('soft-deletes and restores work-item entries, locks, and items with archive assertions', async () => {
    await adminA.delete(`/work-item-locks/${lockId}`).expect(200);
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, workItemLocks, lockId);
    await expectNotInLive(context.database, workItemLocks, lockId);

    await adminA.post(`/work-item-locks/${lockId}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.restore', {
      schema: 'sample',
      rowId: lockId,
    });
    await expectRestored(context.database, workItemLocks, lockId);

    await adminA.delete(`/work-item-entries/${entryId}`).expect(200);
    await auditExpect(context.database, 'work_item_entry', 'sample.work-item-entry.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, workItemEntries, entryId);
    await expectNotInLive(context.database, workItemEntries, entryId);

    await adminA.post(`/work-item-entries/${entryId}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'work_item_entry', 'sample.work-item-entry.restore', {
      schema: 'sample',
      rowId: entryId,
    });
    await expectRestored(context.database, workItemEntries, entryId);

    await adminA.delete(`/work-item-locks/${lockId}`).expect(200);
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, workItemLocks, lockId);

    await adminA.delete(`/work-items/${workItemId}`).expect(200);
    await auditExpect(context.database, 'work_item', 'sample.work-item.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, workItems, workItemId);
    await expectNotInLive(context.database, workItems, workItemId);

    await adminA.get('/work-items/trash').expect(200).expect(({ body }: { body: WorkItemBody[] }) => {
      expect(body.some((row) => row.id === workItemId)).toBe(true);
    });

    await adminA.post(`/work-items/${workItemId}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'work_item', 'sample.work-item.restore', {
      schema: 'sample',
      rowId: workItemId,
    });
    await expectRestored(context.database, workItems, workItemId);
  });
});
