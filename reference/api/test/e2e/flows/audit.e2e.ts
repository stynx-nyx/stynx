import { PermissionCache } from '@stynx/auth';
import { auditExpect } from '@stynx/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

interface RecordBody {
  id: string;
  title: string;
  email: string;
  status: string;
  tenantId?: string;
  tenant_id?: string;
}

interface AuditLogItem {
  id: number;
  tableSchema: string;
  tableName: string;
  rowId?: string | null;
  operation: string;
  tenantId?: string | null;
  actorId?: string | null;
  tags: Record<string, unknown>;
  payload: Record<string, unknown>;
}

interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor?: string;
}

const auditReadPermission = 'platform:audit:read:*';

async function grantAuditReadPermission(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    await client.query(
      `
        insert into auth.perms (id, key, description)
        values (gen_random_uuid(), $1, $1)
        on conflict (key) do nothing
      `,
      [auditReadPermission],
    );
    await client.query(
      `
        insert into auth.direct_perms (id, membership_id, perm_id, effect)
        select gen_random_uuid(), $1::uuid, perm.id, 'allow'
        from auth.perms perm
        where perm.key = $2
          and not exists (
            select 1
            from auth.direct_perms existing
            where existing.membership_id = $1::uuid
              and existing.perm_id = perm.id
              and existing.effect = 'allow'
          )
      `,
      [actors.adminA.membershipId, auditReadPermission],
    );
  } finally {
    await client.end();
  }

  const permissionCache = context.app.get(PermissionCache);
  await permissionCache.publishInvalidation(`${actors.adminA.userId}:${tenants.tenantA}`);
}

async function queryAuditEvents(
  context: ReferenceApiE2eContext,
  tenantId: string,
  rowId: string,
): Promise<Array<{ operation: string; entity: string; previous_hash: string | null; row_hash: string }>> {
  return context.database.withSystemContext('audit e2e chain read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<{
          operation: string;
          entity: string;
          previous_hash: string | null;
          row_hash: string;
        }>(
          `
            select operation::text, entity, previous_hash, row_hash
            from audit.events
            where tenancy_id = $1::uuid
              and entity_id = $2
            order by occurred_at, event_id
          `,
          [tenantId, rowId],
        );
        return result.rows;
      },
      { role: 'owner', readonly: true },
    ),
  );
}

function findAuditItem(page: AuditLogPage, rowId: string, operation: string): AuditLogItem | undefined {
  return page.items.find((item) => item.rowId === rowId && item.operation === operation);
}

describe('@stynx/reference-api e2e audit', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let adminARecordId = '';
  let adminBRecordId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e();
    await grantAuditReadPermission(context);
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('records a mutating route in audit.log, audit.events, and the hash-chain columns', async () => {
    const record = (await adminA.post('/records').send({
      title: 'Audit E2E',
      email: 'audit-e2e@example.com',
      status: 'pending',
    }).expect(201)).body as RecordBody;
    adminARecordId = record.id;

    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: adminARecordId,
    });
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: adminARecordId,
      tags: { manual_event: true },
    });

    const events = await queryAuditEvents(context, tenants.tenantA, adminARecordId);
    expect(events.map((event) => event.operation)).toEqual(
      expect.arrayContaining(['INSERT', 'sample.record.create']),
    );
    expect(events.every((event) => event.row_hash.length > 0)).toBe(true);
    expect(events.some((event) => event.previous_hash !== null)).toBe(true);
  });

  it('allows an audit reader to query the log and keeps credential material out of audit metadata', async () => {
    const response = await adminA
      .get(`/_audit/log?tenantId=${tenants.tenantA}&tableSchema=sample&tableName=record&rowId=${adminARecordId}&limit=5`)
      .expect(200);
    const page = response.body as AuditLogPage;
    const item = findAuditItem(page, adminARecordId, 'sample.record.create');

    expect(item).toEqual(expect.objectContaining({
      tableSchema: 'sample',
      tableName: 'record',
      rowId: adminARecordId,
      tenantId: tenants.tenantA,
      actorId: actors.adminA.userId,
    }));
    expect(item?.payload.metadata ?? {}).toEqual({});
    expect(JSON.stringify(item)).not.toContain('Bearer ');
    expect(JSON.stringify(item)).not.toContain(context.tokens.adminA);
  });

  it('denies audit-log access to an actor without platform audit permission', async () => {
    await viewerA.get('/_audit/log?limit=1').expect(403);
  });

  it('keeps audit queries scoped by tenant filters across tenant records', async () => {
    const record = (await adminB.post('/records').send({
      title: 'Audit E2E tenant B',
      email: 'audit-e2e-tenant-b@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;
    adminBRecordId = record.id;

    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: adminBRecordId,
    });

    await adminA
      .get(`/_audit/log?tenantId=${tenants.tenantA}&tableSchema=sample&tableName=record&limit=50`)
      .expect(200)
      .expect(({ body }: { body: AuditLogPage }) => {
        expect(body.items.some((item) => item.tenantId === tenants.tenantB)).toBe(false);
        expect(body.items.some((item) => item.rowId === adminBRecordId)).toBe(false);
      });

    await adminA
      .get(`/_audit/log?tenantId=${tenants.tenantB}&tableSchema=sample&tableName=record&rowId=${adminBRecordId}&limit=5`)
      .expect(200)
      .expect(({ body }: { body: AuditLogPage }) => {
        expect(findAuditItem(body, adminBRecordId, 'sample.record.create')).toEqual(
          expect.objectContaining({
            tenantId: tenants.tenantB,
            actorId: actors.adminB.userId,
          }),
        );
      });
  });
});
