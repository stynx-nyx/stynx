import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  CreateBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { CognitoJwtValidator } from '@stynx/auth';
import {
  CascadeTooLargeError,
  Database,
} from '@stynx/data';
import {
  auditExpect,
  expectArchiveMirrorExists,
  expectArchiveMirrorInSync,
  expectInArchive,
  expectNotInLive,
  expectRLSIsolated,
  expectRestored,
  expectROCannotWrite,
  expectSoftDeleteBlocked,
} from '@stynx/testing';
import { SessionService } from '@stynx/sessions';
import { RequestContextMutator } from '@stynx/core';
import { StynxMetricsService } from '@stynx/health';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../packages/data/test/support/postgres';
import {
  recordNotes as liveRecordNotes,
  records as liveRecords,
  workItemEntries as liveWorkItemEntries,
  workItemLocks as liveWorkItemLocks,
  workItems as liveWorkItems,
} from '../../src/sample/schema';

jest.setTimeout(240_000);

const tenantA = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
const tenantB = '01978f4a-32bf-7c27-a131-fd73a9e001a2';
const adminAUser = '01978f4a-32bf-7c27-a131-fd73a9e002a1';
const readerAUser = '01978f4a-32bf-7c27-a131-fd73a9e002a2';
const adminBUser = '01978f4a-32bf-7c27-a131-fd73a9e002a3';
const adminAMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a1';
const readerAMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a2';
const adminBMembership = '01978f4a-32bf-7c27-a131-fd73a9e003a3';

function now(): string {
  return new Date().toISOString();
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

class FakeCognitoJwtValidator {
  async validateAccessToken(): Promise<{ sub: string; email: string; claims: Record<string, unknown> }> {
    return {
      sub: 'cognito-admin-a',
      email: 'admin-a@example.com',
      claims: {},
    };
  }
}

async function seedBaseState(database: PostgresTestDatabase): Promise<void> {
  const client = await database.connectAsAdmin();
  const stamp = now();
  try {
    await client.query(
      `
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values
          ($1::uuid, 'tenant-a', 'Tenant A', 'active', true, $3::timestamptz, $3::timestamptz),
          ($2::uuid, 'tenant-b', 'Tenant B', 'active', true, $3::timestamptz, $3::timestamptz)
      `,
      [tenantA, tenantB, stamp],
    );
    await client.query(
      `
        insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
        values
          ($1::uuid, 'admin-a@example.com', 'cognito-admin-a', 'en', $4::timestamptz, $4::timestamptz),
          ($2::uuid, 'reader-a@example.com', 'cognito-reader-a', 'en', $4::timestamptz, $4::timestamptz),
          ($3::uuid, 'admin-b@example.com', 'cognito-admin-b', 'en', $4::timestamptz, $4::timestamptz)
      `,
      [adminAUser, readerAUser, adminBUser, stamp],
    );
    await client.query(
      `
        insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
        values
          ($1::uuid, $4::uuid, $6::uuid, null, 0, true, $9::timestamptz),
          ($2::uuid, $4::uuid, $7::uuid, null, 0, true, $9::timestamptz),
          ($3::uuid, $5::uuid, $8::uuid, null, 0, true, $9::timestamptz)
      `,
      [adminAMembership, readerAMembership, adminBMembership, tenantA, tenantB, adminAUser, readerAUser, adminBUser, stamp],
    );

    const perms = [
      'sample:record:read',
      'sample:record:write',
      'sample:record:delete',
      'sample:record:restore',
      'sample:record:hard-delete',
      'sample:record-note:read',
      'sample:record-note:write',
      'sample:record-note:delete',
      'sample:record-note:restore',
      'sample:record-note:hard-delete',
      'sample:work-item:read',
      'sample:work-item:write',
      'sample:work-item:delete',
      'sample:work-item:restore',
      'sample:work-item:hard-delete',
      'sample:work-item-entry:read',
      'sample:work-item-entry:write',
      'sample:work-item-entry:delete',
      'sample:work-item-entry:restore',
      'sample:work-item-entry:hard-delete',
      'sample:work-item-lock:read',
      'sample:work-item-lock:write',
      'sample:work-item-lock:delete',
      'sample:work-item-lock:restore',
      'sample:work-item-lock:hard-delete',
      'sample:document:read',
      'sample:document:write',
      'sample:document:delete',
      'sample:document:restore',
      'sample:document:hard-delete',
      'sample:probe:read',
    ];

    for (const perm of perms) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [perm],
      );
    }

    const adminPerms = perms;
    const readerPerms = [
      'sample:record:read',
      'sample:record-note:read',
      'sample:work-item:read',
      'sample:work-item-entry:read',
      'sample:work-item-lock:read',
      'sample:document:read',
      'sample:probe:read',
    ];

    for (const perm of adminPerms) {
      await client.query(
        `
          insert into auth.direct_perms (id, membership_id, perm_id, effect)
          select gen_random_uuid(), $1::uuid, perm.id, 'allow'
          from auth.perms perm
          where perm.key = $2
        `,
        [adminAMembership, perm],
      );
      await client.query(
        `
          insert into auth.direct_perms (id, membership_id, perm_id, effect)
          select gen_random_uuid(), $1::uuid, perm.id, 'allow'
          from auth.perms perm
          where perm.key = $2
        `,
        [adminBMembership, perm],
      );
    }

    for (const perm of readerPerms) {
      await client.query(
        `
          insert into auth.direct_perms (id, membership_id, perm_id, effect)
          select gen_random_uuid(), $1::uuid, perm.id, 'allow'
          from auth.perms perm
          where perm.key = $2
        `,
        [readerAMembership, perm],
      );
    }
  } finally {
    await client.end();
  }
}

describe('@stynx/reference-api runtime suite', () => {
  let postgres: PostgresTestDatabase;
  let redis: StartedTestContainer;
  let localstack: StartedTestContainer;
  let app: INestApplication;
  let database: Database;
  let requestContextMutator: RequestContextMutator;
  let sessionService: SessionService;
  let metricsService: StynxMetricsService;
  let adminS3: S3Client;
  let bucketName = 'stynx-docs-local-us-east-1';
  let redisUrl = '';
  let localstackEndpoint = '';
  let adminAToken = '';
  let readerAToken = '';
  let adminBToken = '';
  let idempotencyCounter = 0;

  function authRequest(token: string) {
    const nextKey = (prefix: string) => `${prefix}-${++idempotencyCounter}`;
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set('authorization', `Bearer ${token}`),
      post: (path: string) => request(app.getHttpServer()).post(path).set('authorization', `Bearer ${token}`).set('Idempotency-Key', nextKey('post')),
      patch: (path: string) => request(app.getHttpServer()).patch(path).set('authorization', `Bearer ${token}`).set('Idempotency-Key', nextKey('patch')),
      delete: (path: string) => request(app.getHttpServer()).delete(path).set('authorization', `Bearer ${token}`).set('Idempotency-Key', nextKey('delete')),
    };
  }

  async function createTokenViaSessionRoute(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/sessions')
      .set('x-tenant-id', tenantA)
      .send({ cognitoToken: 'fake-cognito-access-token' })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function createDirectToken(userId: string, tenantId: string, membershipId: string): Promise<string> {
    const bundle = await sessionService.create(userId, tenantId, userId, {}, { membershipId });
    return bundle.accessToken;
  }

  async function uploadPresigned(url: string, headers: Record<string, string>, body: Buffer): Promise<void> {
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }
  }

  async function queryRowsAsTenant<T>(tenantId: string, actorId: string, sql: string, values: unknown[] = []): Promise<T[]> {
    return Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: `req-${Date.now()}`,
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        () =>
          database.tx(
            async (trx) => {
              await trx.query('set local role stynx_reader');
              const result = await trx.query<T & Record<string, unknown>>(sql, values);
              return result.rows;
            },
            { role: 'reader', readonly: true },
          ),
      ),
    );
  }

  async function countAdmin(sql: string, values: unknown[] = []): Promise<number> {
    return database.withSystemContext('reference-api runtime count', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ value: string }>(sql, values);
          return Number(result.rows[0]?.value ?? 0);
        },
        { role: 'owner', readonly: true },
      ),
    );
  }

  async function runWithTenantContext<T>(tenantId: string, actorId: string, fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: `req-${Date.now()}`,
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        fn,
      ),
    );
  }

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_EC2_METADATA_DISABLED = 'true';

    postgres = await createPostgresTestDatabase('reference_api');

    redis = await new GenericContainer('redis:7-alpine')
      .withEnvironment({
        GLOG_minloglevel: '2',
      })
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
      .start();
    redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

    localstack = await new GenericContainer('localstack/localstack:3.8.1')
      .withEnvironment({
        GLOG_minloglevel: '2',
        SERVICES: 's3',
        AWS_DEFAULT_REGION: 'us-east-1',
      })
      .withExposedPorts(4566)
      .withWaitStrategy(Wait.forLogMessage(/Ready\./u))
      .start();
    localstackEndpoint = `http://${localstack.getHost()}:${localstack.getMappedPort(4566)}`;

    process.env.STYNX_OWNER_DATABASE_URL = postgres.connectionString('@stynx/reference-api:owner');
    process.env.STYNX_APP_DATABASE_URL = postgres.connectionString('@stynx/reference-api:app');
    process.env.STYNX_READER_DATABASE_URL = postgres.connectionString('@stynx/reference-api:reader');
    process.env.STYNX_REDIS_URL = redisUrl;
    process.env.STYNX_STORAGE_ENDPOINT = localstackEndpoint;
    process.env.STYNX_STORAGE_FORCE_PATH_STYLE = 'true';
    process.env.STYNX_STORAGE_BUCKET = bucketName;
    process.env.STYNX_ENVIRONMENT = 'local';
    process.env.STYNX_STORAGE_REGION = 'us-east-1';
    process.env.STYNX_KMS_ALIAS = 'stynx-local';
    process.env.STYNX_STYNX_ISSUER = 'https://reference-api.test';
    process.env.STYNX_COGNITO_ISSUER = 'https://cognito.local';

    adminS3 = new S3Client({
      region: 'us-east-1',
      endpoint: localstackEndpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
    await adminS3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await adminS3.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: { Status: 'Enabled' },
      }),
    );

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CognitoJwtValidator)
      .useValue(new FakeCognitoJwtValidator())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    database = moduleRef.get(Database);
    requestContextMutator = moduleRef.get(RequestContextMutator);
    sessionService = moduleRef.get(SessionService);
    metricsService = moduleRef.get(StynxMetricsService);

    await seedBaseState(postgres);

    adminAToken = await createTokenViaSessionRoute();
    readerAToken = await createDirectToken(readerAUser, tenantA, readerAMembership);
    adminBToken = await createDirectToken(adminBUser, tenantB, adminBMembership);
  });

  afterAll(async () => {
    await app?.close();
    await localstack?.stop();
    await redis?.stop();
    await postgres?.dispose();
  });

  beforeEach(async () => {
    if (!redis) {
      return;
    }
    const cleared = await redis.exec([
      'sh',
      '-lc',
      "keys=$(redis-cli --scan --pattern 'stynx:ratelimit*'); if [ -n \"$keys\" ]; then redis-cli del $keys >/dev/null; fi",
    ]);
    if (cleared.exitCode !== 0) {
      throw new Error(`Failed to clear rate-limit keys: ${cleared.stderr}`);
    }
  });

  it('family 1: isolates live and archive rows by tenant across sample tables', async () => {
    const adminA = authRequest(adminAToken);
    const adminB = authRequest(adminBToken);

    const recordA = (await adminA.post('/records').send({ title: 'A record', email: 'a-record@example.com' }).expect(201)).body;
    const noteA = (await adminA.post('/record-notes').send({
      recordId: recordA.id,
      kind: 'primary',
      label: 'A note',
      detail: 'note',
      region: 'BR',
      code: 'A-NOTE',
    }).expect(201)).body;
    const itemA = (await adminA.post('/work-items').send({
      recordId: recordA.id,
      code: 'A-WI-001',
      openedOn: '2026-04-01',
      targetOn: '2026-04-10',
    }).expect(201)).body;
    const entryA = (await adminA.post('/work-item-entries').send({
      workItemId: itemA.id,
      description: 'entry A',
      quantity: '2.000',
      unitUnits: 3,
    }).expect(201)).body;
    const lockA = (await adminA.post('/work-item-locks').set('Idempotency-Key', 'lock-a').send({
      workItemId: itemA.id,
      lockedAt: now(),
      amountUnits: 5,
      reason: 'manual',
    }).expect(201)).body;

    const recordB = (await adminB.post('/records').send({ title: 'B record', email: 'b-record@example.com' }).expect(201)).body;
    const noteB = (await adminB.post('/record-notes').send({
      recordId: recordB.id,
      kind: 'primary',
      label: 'B note',
      detail: 'note',
      region: 'BR',
      code: 'B-NOTE',
    }).expect(201)).body;
    const itemB = (await adminB.post('/work-items').send({
      recordId: recordB.id,
      code: 'B-WI-001',
      openedOn: '2026-04-01',
      targetOn: '2026-04-10',
    }).expect(201)).body;
    const entryB = (await adminB.post('/work-item-entries').send({
      workItemId: itemB.id,
      description: 'entry B',
      quantity: '1.000',
      unitUnits: 9,
    }).expect(201)).body;
    const lockB = (await adminB.post('/work-item-locks').set('Idempotency-Key', 'lock-b').send({
      workItemId: itemB.id,
      lockedAt: now(),
      amountUnits: 7,
      reason: 'manual',
    }).expect(201)).body;

    await adminB.delete(`/record-notes/${noteB.id}`).set('Idempotency-Key', 'del-note-b').expect(200);
    await adminB.delete(`/work-item-entries/${entryB.id}`).set('Idempotency-Key', 'del-entry-b').expect(200);
    await adminB.delete(`/work-item-locks/${lockB.id}`).set('Idempotency-Key', 'del-lock-b').expect(200);
    await adminB.delete(`/work-items/${itemB.id}`).set('Idempotency-Key', 'del-item-b').expect(200);
    await adminB.delete(`/records/${recordB.id}`).set('Idempotency-Key', 'del-record-b').expect(200);

    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from sample.record'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from archive.sample_record'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from sample.record_note'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from archive.sample_record_note'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from sample.work_item'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from archive.sample_work_item'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from sample.work_item_entry'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from archive.sample_work_item_entry'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from sample.work_item_lock'),
      { tenantA, tenantB },
    );
    await expectRLSIsolated(
      (tenantId) => queryRowsAsTenant<{ id: string; tenant_id: string }>(tenantId, adminAUser, 'select id::text, tenant_id::text from archive.sample_work_item_lock'),
      { tenantA, tenantB },
    );

    expect(recordA.id).toBeDefined();
    expect(noteA.id).toBeDefined();
    expect(entryA.id).toBeDefined();
    expect(lockA.id).toBeDefined();
  });

  it('emits the SPEC 11.2 Prometheus metric names', async () => {
    metricsService.httpRequestDuration.labels('GET', '/healthz', '200', 'standard').observe(0.001);
    metricsService.httpRequestTotal.labels('GET', '/healthz', '200', 'standard').inc();
    metricsService.httpRequestsTotal.labels('GET', '/healthz', '200', 'standard').inc();
    metricsService.dbQueryDuration.labels('select').observe(0.001);
    metricsService.auditEventsTotal.labels('sample.record', 'INSERT').inc();
    metricsService.lgpdErasureTotal.labels('sample.record', 'nullify').inc();
    metricsService.storagePresignTotal.labels('upload').inc();

    const response = await request(app.getHttpServer()).get('/metrics').expect(200);
    for (const metricName of [
      'http_request_duration_seconds',
      'http_request_total',
      'http_requests_total',
      'db_query_duration_seconds',
      'audit_events_total',
      'lgpd_erasure_total',
      'storage_presign_total',
    ]) {
      expect(response.text).toContain(metricName);
    }
    expect(response.text).toContain('lgpd_erasure_total{table="sample.record",strategy="nullify"}');
  });

  it('family 2: denies routes when @Permission grants are missing', async () => {
    await authRequest(readerAToken)
      .post('/records')
      .set('Idempotency-Key', 'reader-create-record')
      .send({ title: 'Denied', email: 'denied@example.com' })
      .expect(403);
  });

  it('family 3: writes audit rows for audited routes', async () => {
    const created = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'audit-record-create')
      .send({ title: 'Audited', email: 'audited@example.com' })
      .expect(201);

    await auditExpect(database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: created.body.id,
    });
  });

  it('family 4: enforces collection scope on document download', async () => {
    const payload = Buffer.from('%PDF-1.4 scoped document');
    const initiated = await authRequest(adminAToken)
      .post('/documents')
      .set('Idempotency-Key', 'doc-init')
      .send({
        collection: 'records',
        filename: 'record.pdf',
        mimeType: 'application/pdf',
        byteSize: payload.length,
        checksumSha256: sha256Hex(payload),
      })
      .expect(201);

    await uploadPresigned(initiated.body.upload.url, initiated.body.upload.headers, payload);

    await authRequest(adminAToken)
      .post(`/documents/${initiated.body.id}/complete`)
      .set('Idempotency-Key', 'doc-complete')
      .send({})
      .expect(201);

    await authRequest(adminBToken)
      .get(`/documents/${initiated.body.id}/download`)
      .expect(403);
  });

  it('family 5: rate-limit blocks repeated high-cost route usage', async () => {
    const record = (await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'rate-record')
      .send({ title: 'Rate limited', email: 'rate-limited@example.com' })
      .expect(201)).body;
    const item = (await authRequest(adminAToken)
      .post('/work-items')
      .set('Idempotency-Key', 'rate-item')
      .send({
        recordId: record.id,
        code: 'RATE-WI-001',
        openedOn: '2026-04-01',
        targetOn: '2026-04-10',
      })
      .expect(201)).body;

    await authRequest(adminAToken)
      .post('/work-item-locks')
      .set('Idempotency-Key', 'rate-lock-1')
      .send({
        workItemId: item.id,
        lockedAt: now(),
        amountUnits: 1,
        reason: 'manual',
      })
      .expect(201);

    await authRequest(adminAToken)
      .post('/work-item-locks')
      .set('Idempotency-Key', 'rate-lock-2')
      .send({
        workItemId: item.id,
        lockedAt: now(),
        amountUnits: 2,
        reason: 'review',
      })
      .expect(429);
  });

  it('family 6: enforces read-only routes against writes', async () => {
    const expectedErrorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expectROCannotWrite(async () => {
        await authRequest(readerAToken)
          .get('/_probes/readonly-write')
          .expect(500);
        throw new Error('READONLY_VIOLATION_NOT_SURFACED');
      }).catch(async () => {
        const response = await authRequest(readerAToken)
          .get('/_probes/readonly-write')
          .expect(500);
        expect(response.body.code).toBe('READONLY_VIOLATION');
      });
    } finally {
      expectedErrorLog.mockRestore();
    }
  });

  it('family 7: replays idempotent record creation without duplicating rows', async () => {
    const body = { title: 'Idempotent', email: 'idempotent@example.com' };
    const first = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'record-idempotent')
      .send(body)
      .expect(201);
    const second = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'record-idempotent')
      .send(body)
      .expect(201);

    expect(first.body.id).toBe(second.body.id);
    expect(second.headers['idempotency-replayed']).toBe('true');
    await expect(
      countAdmin(
        `select count(*)::int as value from sample.record where tenant_id = $1::uuid and email = $2`,
        [tenantA, body.email],
      ),
    ).resolves.toBe(1);
  });

  it('family 8: performs a soft-delete round trip through trash and restore', async () => {
    const created = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'roundtrip-create')
      .send({ title: 'Roundtrip', email: 'roundtrip@example.com' })
      .expect(201);

    await authRequest(adminAToken)
      .delete(`/records/${created.body.id}`)
      .set('Idempotency-Key', 'roundtrip-delete')
      .expect(200);

    await expectInArchive(database, liveRecords, created.body.id);
    await expectNotInLive(database, liveRecords, created.body.id);

    const trash = await authRequest(adminAToken).get('/records/trash').expect(200);
    expect(trash.body.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    await authRequest(adminAToken)
      .post(`/records/${created.body.id}/restore`)
      .set('Idempotency-Key', 'roundtrip-restore')
      .expect(201);

    await expectRestored(database, liveRecords, created.body.id);
  });

  it('family 9: rejects hard delete without the hard-delete permission', async () => {
    const created = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'hard-authz-create')
      .send({ title: 'Hard Delete Authz', email: 'hard-authz@example.com' })
      .expect(201);

    await authRequest(adminAToken)
      .delete(`/records/${created.body.id}`)
      .set('Idempotency-Key', 'hard-authz-soft')
      .expect(200);

    await authRequest(readerAToken)
      .delete(`/records/${created.body.id}/hard`)
      .set('Idempotency-Key', 'hard-authz-hard')
      .expect(403);
  });

  it('family 10: returns 409 on restore conflicts against natural unique keys', async () => {
    const created = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'restore-conflict-create')
      .send({ title: 'Restore Conflict', email: 'restore-conflict@example.com' })
      .expect(201);

    await authRequest(adminAToken)
      .delete(`/records/${created.body.id}`)
      .set('Idempotency-Key', 'restore-conflict-delete')
      .expect(200);

    await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'restore-conflict-replacement')
      .send({ title: 'Replacement', email: 'restore-conflict@example.com' })
      .expect(201);

    await authRequest(adminAToken)
      .post(`/records/${created.body.id}/restore`)
      .set('Idempotency-Key', 'restore-conflict-restore')
      .expect(409);
  });

  it('family 11: enforces cascade and block FK annotations', async () => {
    const record = (await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'fk-record')
      .send({ title: 'FK Parent', email: 'fk-parent@example.com' })
      .expect(201)).body;
    const note = (await authRequest(adminAToken)
      .post('/record-notes')
      .set('Idempotency-Key', 'fk-note')
      .send({
        recordId: record.id,
        kind: 'primary',
        label: 'FK Note',
        detail: 'child',
        region: 'BR',
        code: 'FK-NOTE',
      })
      .expect(201)).body;
    const item = (await authRequest(adminAToken)
      .post('/work-items')
      .set('Idempotency-Key', 'fk-item')
      .send({
        recordId: record.id,
        code: 'FK-WI-001',
        openedOn: '2026-04-01',
        targetOn: '2026-04-10',
      })
      .expect(201)).body;
    const entry = (await authRequest(adminAToken)
      .post('/work-item-entries')
      .set('Idempotency-Key', 'fk-entry')
      .send({
        workItemId: item.id,
        description: 'entry',
        quantity: '3.000',
        unitUnits: 2,
      })
      .expect(201)).body;
    const lock = (await authRequest(adminAToken)
      .post('/work-item-locks')
      .set('Idempotency-Key', 'fk-lock')
      .send({
        workItemId: item.id,
        lockedAt: now(),
        amountUnits: 9,
        reason: 'manual',
      })
      .expect(201)).body;

    await authRequest(adminAToken)
      .delete(`/records/${record.id}`)
      .set('Idempotency-Key', 'fk-record-delete')
      .expect(409);

    await expectSoftDeleteBlocked(async () => {
      await runWithTenantContext(tenantA, adminAUser, async () => {
        await database.tx(async (trx) => {
          await trx.softDelete(liveWorkItems, item.id);
        });
      });
    });

    await authRequest(adminAToken)
      .delete(`/work-item-locks/${lock.id}`)
      .set('Idempotency-Key', 'fk-lock-delete')
      .expect(200);
    await authRequest(adminAToken)
      .delete(`/work-items/${item.id}`)
      .set('Idempotency-Key', 'fk-item-delete')
      .expect(200);

    await expectInArchive(database, liveWorkItems, item.id);
    await expectInArchive(database, liveWorkItemEntries, entry.id);

    await authRequest(adminAToken)
      .delete(`/records/${record.id}`)
      .set('Idempotency-Key', 'fk-record-delete-2')
      .expect(200);

    await expectInArchive(database, liveRecordNotes, note.id);
    await expectInArchive(database, liveRecords, record.id);
  });

  it('family 12: keeps archive mirrors in sync for all sample tables', async () => {
    await expectArchiveMirrorExists(database, liveRecords);
    await expectArchiveMirrorInSync(database, liveRecords);
    await expectArchiveMirrorExists(database, liveRecordNotes);
    await expectArchiveMirrorInSync(database, liveRecordNotes);
    await expectArchiveMirrorExists(database, liveWorkItems);
    await expectArchiveMirrorInSync(database, liveWorkItems);
    await expectArchiveMirrorExists(database, liveWorkItemEntries);
    await expectArchiveMirrorInSync(database, liveWorkItemEntries);
    await expectArchiveMirrorExists(database, liveWorkItemLocks);
    await expectArchiveMirrorInSync(database, liveWorkItemLocks);
  });

  it('family 13: demonstrates cascade size behavior within limits and on breach', async () => {
    const created = await authRequest(adminAToken)
      .post('/records')
      .set('Idempotency-Key', 'cascade-size-create')
      .send({ title: 'Cascade Size', email: 'cascade-size@example.com' })
      .expect(201);

    for (let index = 0; index < 12; index += 1) {
      await authRequest(adminAToken)
        .post('/record-notes')
        .set('Idempotency-Key', `cascade-size-note-${index}`)
        .send({
          recordId: created.body.id,
          kind: 'secondary',
          label: `Note ${index}`,
          detail: 'bulk',
          region: 'BR',
          code: `CS-${index}`,
        })
        .expect(201);
    }

    await runWithTenantContext(tenantA, adminAUser, async () => {
      await database.tx(async (trx) => {
        const plan = await trx.softDelete(liveRecords, created.body.id, {
          dryRun: true,
          maxCascadeRows: 20,
        });
        expect(plan.totalRows).toBeLessThanOrEqual(20);
      });
    });

    await expect(
      runWithTenantContext(tenantA, adminAUser, async () =>
        database.tx(async (trx) => {
          await trx.softDelete(liveRecords, created.body.id, {
            dryRun: true,
            maxCascadeRows: 5,
          });
        }),
      ),
    ).rejects.toBeInstanceOf(CascadeTooLargeError);
  });

  it('supports live stack smoke routes needed for local verification', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200);
    await request(app.getHttpServer()).get('/readyz').expect(200);

    const versions = await adminS3.send(new ListObjectVersionsCommand({ Bucket: bucketName }));
    expect(versions.Name).toBe(bucketName);
  });
});
