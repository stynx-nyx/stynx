import { auditExpect, expectRLSIsolated } from '@stynx-nyx/testing';
import request from 'supertest';
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
  title: string;
  email: string;
  tenantId?: string;
  tenant_id?: string;
}

interface RecordRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  email: string;
}

function recordPayload(suffix: string) {
  return {
    title: `Idempotency ${suffix}`,
    email: `idempotency-${suffix}@example.com`,
    status: 'active' as const,
  };
}

function postRecord(
  context: ReferenceApiE2eContext,
  token: string,
  idempotencyKey: string,
  body: ReturnType<typeof recordPayload>,
): request.Test {
  return request(context.app.getHttpServer())
    .post('/records')
    .set('authorization', `Bearer ${token}`)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
}

async function countRows(context: ReferenceApiE2eContext, sql: string, values: unknown[]): Promise<number> {
  return context.database.withSystemContext('idempotency e2e count', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<{ value: string | number }>(sql, values);
        return Number(result.rows[0]?.value ?? 0);
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

async function countRecordsByEmail(context: ReferenceApiE2eContext, tenantId: string, email: string): Promise<number> {
  return countRows(
    context,
    `
      select count(*)::int as value
      from sample.record
      where tenant_id = $1::uuid
        and email = $2
    `,
    [tenantId, email],
  );
}

async function countCreateAuditRows(context: ReferenceApiE2eContext, recordId: string): Promise<number> {
  return countRows(
    context,
    `
      select count(*)::int as value
      from audit.log
      where operation = 'sample.record.create'
        and table_schema = 'sample'
        and table_name = 'record'
        and row_id = $1
    `,
    [recordId],
  );
}

async function expirePublicDurableIdempotencyRows(context: ReferenceApiE2eContext): Promise<void> {
  await context.database.withSystemContext('idempotency e2e expire public durable entries', async () =>
    context.database.tx(
      async (trx) => {
        await trx.query(
          `
            update core.idempotency_keys
               set expires_at = clock_timestamp() - interval '1 second',
                   updated_at = clock_timestamp()
             where tenant_id is null
               and status = 'completed'
          `,
        );
      },
      { role: 'owner', readonly: false, replica: false },
    ),
  );
}

async function clearRedisIdempotencyEntries(context: ReferenceApiE2eContext): Promise<void> {
  const cleared = await context.redis.exec([
    'sh',
    '-lc',
    "keys=$(redis-cli --scan --pattern 'stynx:idempotency*'); if [ -n \"$keys\" ]; then redis-cli del $keys >/dev/null; fi",
  ]);
  if (cleared.exitCode !== 0) {
    throw new Error(`Failed to clear idempotency cache keys: ${cleared.stderr}`);
  }
}

describe('@stynx-nyx/reference-api e2e idempotency', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;

  beforeAll(async () => {
    context = await setupReferenceApiE2e();
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('replays a matching record creation without duplicating record rows', async () => {
    const body = recordPayload('happy-replay');
    const key = 'idempotency-happy-replay';

    const first = (await postRecord(context, context.tokens.adminA, key, body).expect(201)).body as RecordBody;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: first.id,
    });

    const second = await postRecord(context, context.tokens.adminA, key, body).expect(201);

    expect(second.body).toEqual(first);
    expect(second.headers['idempotency-replayed']).toBe('true');
    await expect(countRecordsByEmail(context, tenants.tenantA, body.email)).resolves.toBe(1);
    await expect(countCreateAuditRows(context, first.id)).resolves.toBeGreaterThanOrEqual(1);
  });

  it('rejects divergent replay for the same tenant, actor, route, and idempotency key', async () => {
    const key = 'idempotency-divergent-replay';
    const firstBody = recordPayload('divergent-original');
    const divergentBody = {
      ...firstBody,
      title: 'Idempotency divergent changed',
    };

    const first = (await postRecord(context, context.tokens.adminA, key, firstBody).expect(201)).body as RecordBody;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: first.id,
    });

    await postRecord(context, context.tokens.adminA, key, divergentBody)
      .expect(422)
      .expect(({ body }) => {
        expect(JSON.stringify(body)).toContain('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
      });

    await expect(countRecordsByEmail(context, tenants.tenantA, firstBody.email)).resolves.toBe(1);
    await expect(countCreateAuditRows(context, first.id)).resolves.toBe(1);
  });

  it('scopes identical idempotency keys by tenant and preserves RLS isolation', async () => {
    const key = 'idempotency-cross-tenant';
    const body = recordPayload('cross-tenant');

    const tenantARecord = (await postRecord(context, context.tokens.adminA, key, body).expect(201)).body as RecordBody;
    const tenantBRecord = (await postRecord(context, context.tokens.adminB, key, body).expect(201)).body as RecordBody;

    expect(tenantBRecord.id).not.toBe(tenantARecord.id);
    await adminA.get(`/records/${tenantBRecord.id}`).expect(404);
    await adminB.get(`/records/${tenantARecord.id}`).expect(404);

    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: tenantARecord.id,
    });
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: tenantBRecord.id,
    });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<RecordRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text, email from sample.record',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });

  it('allows a reused public idempotency key to execute again after durable and cache expiry', async () => {
    const key = 'idempotency-expiry';

    await request(context.app.getHttpServer())
      .post('/_probes/idempotency')
      .set('Idempotency-Key', key)
      .expect(201)
      .expect(({ body, headers }) => {
        expect(body).toEqual({ status: 'ok' });
        expect(headers['idempotency-replayed']).toBeUndefined();
      });

    await request(context.app.getHttpServer())
      .post('/_probes/idempotency')
      .set('Idempotency-Key', key)
      .expect(201)
      .expect(({ body, headers }) => {
        expect(body).toEqual({ status: 'ok' });
        expect(headers['idempotency-replayed']).toBe('true');
      });

    await expirePublicDurableIdempotencyRows(context);
    await clearRedisIdempotencyEntries(context);

    await request(context.app.getHttpServer())
      .post('/_probes/idempotency')
      .set('Idempotency-Key', key)
      .expect(201)
      .expect(({ body, headers }) => {
        expect(body).toEqual({ status: 'ok' });
        expect(headers['idempotency-replayed']).toBeUndefined();
      });
  });
});
