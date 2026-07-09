import { Logger } from '@nestjs/common';
import { PermissionCache } from '@stynx-nyx/auth';
import { auditExpect, expectRLSIsolated } from '@stynx-nyx/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  status: string;
  tenantId?: string;
  tenant_id?: string;
}

const probeReadPermission = 'sample:probe:read';

async function grantProbeReadPermission(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    await client.query(
      `
        insert into auth.perms (id, key, description)
        values (gen_random_uuid(), $1, $1)
        on conflict (key) do nothing
      `,
      [probeReadPermission],
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
      [actors.viewerA.membershipId, probeReadPermission],
    );
  } finally {
    await client.end();
  }

  const permissionCache = context.app.get(PermissionCache);
  await permissionCache.publishInvalidation(`${actors.viewerA.userId}:${tenants.tenantA}`);
}

async function countAuditRows(
  context: ReferenceApiE2eContext,
  operation: string,
  tableName: string,
  rowId: string,
): Promise<number> {
  return context.database.withSystemContext('error matrix e2e audit count', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<{ value: string | number }>(
          `
            select count(*)::int as value
            from audit.log
            where operation = $1
              and table_schema = 'sample'
              and table_name = $2
              and row_id = $3
          `,
          [operation, tableName, rowId],
        );
        return Number(result.rows[0]?.value ?? 0);
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

describe('@stynx-nyx/reference-api e2e error matrix', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let happyRecordId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e({ databaseName: 'reference_api_error_matrix' });
    await grantProbeReadPermission(context);
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('runs an audited happy-path mutation that anchors the matrix', async () => {
    const record = (await adminA.post('/records').send({
      title: 'Error matrix happy record',
      email: 'error-matrix-happy@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;
    happyRecordId = record.id;

    expect(record).toEqual(expect.objectContaining({
      id: happyRecordId,
      title: 'Error matrix happy record',
      status: 'active',
    }));
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: happyRecordId,
    });
  });

  it('returns canonical authentication, authorization, and idempotency errors', async () => {
    await request(context.app.getHttpServer())
      .get('/records')
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing STYNX bearer token');
      });

    await viewerA.post('/records').send({
      title: 'Viewer denied by error matrix',
      email: 'error-matrix-viewer-denied@example.com',
      status: 'active',
    }).expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission sample:record:write');
      });

    await request(context.app.getHttpServer())
      .post('/records')
      .set('authorization', `Bearer ${context.tokens.adminA}`)
      .send({
        title: 'Missing idempotency key',
        email: 'missing-idempotency-key@example.com',
        status: 'active',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(String(body.message)).toContain('Idempotency-Key');
      });

    await request(context.app.getHttpServer())
      .get('/_probes/data-tx')
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing STYNX bearer token');
      });
  });

  it('surfaces read-only transaction violations through a read-only route', async () => {
    const expectedErrorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await viewerA.get('/_probes/readonly-write')
        .expect(500)
        .expect(({ body }) => {
          expect(body.code).toBe('READONLY_VIOLATION');
          expect(body.message).toBe('Read-only transaction cannot execute a write statement');
        });
    } finally {
      expectedErrorLog.mockRestore();
    }
  });

  it('rejects hard delete without hard-delete permission and does not write a hard-delete audit row', async () => {
    const record = (await adminA.post('/records').send({
      title: 'Error matrix hard-delete target',
      email: 'error-matrix-hard-delete@example.com',
      status: 'inactive',
    }).expect(201)).body as RecordBody;

    await adminA.delete(`/records/${record.id}`).expect(200);
    await auditExpect(context.database, 'record', 'sample.record.soft-delete', {
      schema: 'sample',
    });

    await adminA.delete(`/records/${record.id}/hard`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission sample:record:hard-delete');
      });
    await expect(countAuditRows(context, 'sample.record.hard-delete', 'record', record.id)).resolves.toBe(0);
  });

  it('maps cross-tenant record access to 404 and preserves RLS isolation', async () => {
    const tenantBRecord = (await adminB.post('/records').send({
      title: 'Error matrix tenant B record',
      email: 'error-matrix-tenant-b@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;

    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: tenantBRecord.id,
    });

    await adminA.get(`/records/${tenantBRecord.id}`)
      .expect(404)
      .expect(({ body }) => {
        expect(body.message).toBe('RESOURCE_NOT_FOUND');
      });
    await adminA.get('/records').expect(200).expect(({ body }: { body: RecordBody[] }) => {
      expect(body.some((row) => row.id === tenantBRecord.id)).toBe(false);
      expect(body.some((row) => row.id === happyRecordId)).toBe(true);
    });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<RecordBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.record',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });
});
