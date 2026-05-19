import { PermissionCache } from '@stynx/auth';
import { auditExpect, expectRLSIsolated } from '@stynx/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
}

interface WorkItemBody {
  id: string;
}

interface WorkItemLockBody {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  workItemId: string;
  amountUnits: number;
  reason: string;
}

const rateLimitFlowPermissions = [
  'sample:work-item:read',
  'sample:work-item:write',
  'sample:work-item-lock:read',
  'sample:work-item-lock:write',
] as const;

async function grantRateLimitFlowPermissions(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    for (const permission of rateLimitFlowPermissions) {
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
  return new Date('2026-05-19T13:00:00.000Z').toISOString();
}

async function createWorkItemTarget(
  agent: AuthenticatedAgent,
  suffix: string,
): Promise<{ record: RecordBody; workItem: WorkItemBody }> {
  const record = (await agent.post('/records').send({
    title: `Rate limit ${suffix} record`,
    email: `rate-limit-${suffix}@example.com`,
    status: 'active',
  }).expect(201)).body as RecordBody;

  const workItem = (await agent.post('/work-items').send({
    recordId: record.id,
    code: `RATE-${suffix.toUpperCase()}`,
    openedOn: '2026-05-19',
    targetOn: '2026-05-26',
    category: 'OPS',
    totalUnits: 2,
    status: 'draft',
  }).expect(201)).body as WorkItemBody;

  return { record, workItem };
}

describe('@stynx/reference-api e2e rate limit', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let adminALockId = '';
  let adminBLockId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e();
    await grantRateLimitFlowPermissions(context);
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('allows the first high-cost tenant request and records the audit row', async () => {
    const { workItem } = await createWorkItemTarget(adminA, 'tenant-a');
    await auditExpect(context.database, 'work_item', 'sample.work-item.create', {
      schema: 'sample',
      rowId: workItem.id,
    });

    const lock = (await adminA.post('/work-item-locks').send({
      workItemId: workItem.id,
      lockedAt: lockTimestamp(),
      amountUnits: 1,
      reason: 'manual',
    }).expect(201)).body as WorkItemLockBody;
    adminALockId = lock.id;

    expect(lock).toEqual(expect.objectContaining({
      id: adminALockId,
      workItemId: workItem.id,
      amountUnits: 1,
      reason: 'manual',
    }));
    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.create', {
      schema: 'sample',
      rowId: adminALockId,
    });
  });

  it('blocks the second same-tenant lock request with retry headers', async () => {
    const { workItem } = await createWorkItemTarget(adminA, 'tenant-a-blocked');
    await adminA.post('/work-item-locks').send({
      workItemId: workItem.id,
      lockedAt: lockTimestamp(),
      amountUnits: 2,
      reason: 'review',
    }).expect(429)
      .expect(({ headers, text }) => {
        expect(headers['x-ratelimit-limit']).toBe('2');
        expect(headers['x-ratelimit-remaining']).toBe('0');
        expect(Number(headers['retry-after'])).toBeGreaterThanOrEqual(1);
        expect(text).toContain('Rate limit exceeded');
      });
  });

  it('denies the viewer before a write can consume the tenant bucket', async () => {
    await viewerA.post('/work-items').send({
      recordId: adminALockId,
      code: 'RATE-VIEWER-DENIED',
      openedOn: '2026-05-19',
      targetOn: '2026-05-26',
    }).expect(403);
  });

  it('keeps rate-limit buckets and lock rows isolated across tenants', async () => {
    const { workItem } = await createWorkItemTarget(adminB, 'tenant-b');
    const lock = (await adminB.post('/work-item-locks').send({
      workItemId: workItem.id,
      lockedAt: lockTimestamp(),
      amountUnits: 1,
      reason: 'hold',
    }).expect(201)).body as WorkItemLockBody;
    adminBLockId = lock.id;

    await auditExpect(context.database, 'work_item_lock', 'sample.work-item-lock.create', {
      schema: 'sample',
      rowId: adminBLockId,
    });

    await adminA.get(`/work-item-locks/${adminBLockId}`).expect(404);
    await adminB.get(`/work-item-locks/${adminALockId}`).expect(404);

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
});
