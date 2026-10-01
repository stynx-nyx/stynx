import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import request from 'supertest';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { RequestContextMutator, StynxCoreModule } from '@stynx-nyx/core';
import type { IdempotencyStoredEntry, IdempotencyStore } from '@stynx-nyx/idempotency';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-01…04. This suite executes 0001→0002 against real PostgreSQL.
const tenantA = '00000000-0000-4000-8000-0000000000a1';
const tenantB = '00000000-0000-4000-8000-0000000000b1';
const hash = `sha256:${createHash('sha256').update('{}').digest('hex')}`;
const migrationDir = resolve(__dirname, '../../migrations');
// The test helper connects as an admin by default; startup role binding exercises FORCE RLS.
const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('CTG9 OFS additive PostgreSQL upgrade', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ctg9_ofs', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('ctg9-owner') },
            app: { connectionString: asRole(pg.connectionString('ctg9-app'), 'stynx_app'), max: 2 },
            reader: {
              connectionString: asRole(pg.connectionString('ctg9-reader'), 'stynx_reader'),
            },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const pools = moduleRef.get(StynxPoolRegistry).pools;
    const appRole = await pools.app.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`select current_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user`);
    expect(appRole.rows).toEqual([
      { current_user: 'stynx_app', rolsuper: false, rolbypassrls: false },
    ]);
    const readerRole = await pools.reader.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`select current_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user`);
    expect(readerRole.rows).toEqual([
      { current_user: 'stynx_reader', rolsuper: false, rolbypassrls: false },
    ]);
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query(await readFile(resolve(migrationDir, '0001_offline_sync.sql'), 'utf8'));
      await admin.query(
        `insert into tenancy.tenants (id,slug,name,is_active,created_at,updated_at) values
        ($1::uuid,'ctg9-ofs-a','CTG9 A',true,clock_timestamp(),clock_timestamp()),
        ($2::uuid,'ctg9-ofs-b','CTG9 B',true,clock_timestamp(),clock_timestamp())`,
        [tenantA, tenantB],
      );
      await admin.query(
        `insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,reserved_number,status,created_locally_at)
        values ('legacy-item',$1::uuid,'legacy-batch','org-a','business-agent','device-a','citation',
                'local-legacy','legacy-key',$2,'{}'::jsonb,1000,'received','2026-09-28T12:00:00Z')`,
        [tenantA, hash],
      );
      await admin.query(
        `insert into offline.numbering_ranges
        (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values
        ('10000000-0000-4000-8000-0000000000a1',$1::uuid,'org-a','citation','C',1000,1099,1000,'active'),
        ('10000000-0000-4000-8000-0000000000b1',$2::uuid,'org-b','citation','C',1000,1099,1000,'active')`,
        [tenantA, tenantB],
      );
      const next = (await readdir(migrationDir)).filter((name) => /^0002_.*\.sql$/.test(name));
      expect(next).toHaveLength(1);
      await admin.query(await readFile(resolve(migrationDir, next[0]!), 'utf8'));
      await admin.query(`create table offline.ctg9_item_effect_probe (
        tenant_id uuid not null,
        queue_item_id text not null,
        phase text not null,
        transaction_id bigint not null,
        primary key (tenant_id, queue_item_id, phase)
      )`);
      await admin.query(`alter table offline.ctg9_item_effect_probe enable row level security`);
      await admin.query(`alter table offline.ctg9_item_effect_probe force row level security`);
      await admin.query(`create policy ctg9_probe_tenant on offline.ctg9_item_effect_probe
        using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
      await admin.query(`grant select, insert on offline.ctg9_item_effect_probe to stynx_app`);
      await admin.query(`grant select on offline.ctg9_item_effect_probe to stynx_reader`);
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);

  it('applies 0001 then 0002 to an empty database with forced RLS and app grants', async () => {
    const clean = await createPostgresTestDatabase('stynx_ctg9_empty', { useTemplate: false });
    let cleanModule: TestingModule | undefined;
    try {
      cleanModule = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: clean.connectionString('ctg9-clean-owner') },
              app: { connectionString: clean.connectionString('ctg9-clean-app') },
              reader: { connectionString: clean.connectionString('ctg9-clean-reader') },
            },
            migrations: { enabled: true },
          }),
        ],
      }).compile();
      await cleanModule.init();
      const names = (await readdir(migrationDir)).filter((name) => /^0002_.*\.sql$/.test(name));
      expect(names).toHaveLength(1);
      const admin = await clean.connectAsAdmin();
      try {
        await admin.query(await readFile(resolve(migrationDir, '0001_offline_sync.sql'), 'utf8'));
        await admin.query(await readFile(resolve(migrationDir, names[0]!), 'utf8'));
        const tables = await admin.query<{ relname: string; relforcerowsecurity: boolean }>(`
          select c.relname,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='offline' and c.relkind='r'`);
        expect(tables.rows.length).toBeGreaterThan(4);
        expect(tables.rows.every((row) => row.relforcerowsecurity)).toBe(true);
        const added = tables.rows.filter(
          (row) =>
            ![
              'numbering_ranges',
              'numbering_reservations',
              'sync_queue_items',
              'sync_conflicts',
            ].includes(row.relname),
        );
        expect(added.length).toBeGreaterThan(0);
        for (const row of added) {
          const table = `offline."${row.relname.replaceAll('"', '""')}"`;
          const grants = await admin.query(
            `select has_table_privilege('stynx_app',$1,'INSERT') as app_insert,
                    has_table_privilege('stynx_reader',$1,'SELECT') as reader_select`,
            [table],
          );
          expect(grants.rows[0]).toEqual({ app_insert: true, reader_select: true });
        }
      } finally {
        await admin.end();
      }
    } finally {
      await cleanModule?.close();
      await clean.dispose();
    }
  }, 60_000);

  it('UPS-OFS-01 allocates disjoint intervals under two concurrent app-role requests', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    const scope = { tenantId: tenantA, actorId: 'actor-a' };
    const reserve = (deviceId: string) =>
      Promise.resolve(
        contexts.runWithRequestContext(
          {
            requestId: `ctg9-${deviceId}`,
            tenantId: tenantA,
            actorId: 'actor-a',
            startedAt: new Date('2026-09-28T12:00:00.000Z'),
          },
          () =>
            store.reserveNumbering(
              scope,
              {
                orgUnitId: 'org-a',
                entityType: 'citation',
                deviceId,
                shiftId: 'shift-a',
                requestedSize: 10,
              },
              '2026-09-28T12:00:00.000Z',
              '2026-09-29T12:00:00.000Z',
            ),
        ),
      );
    const [a, b] = await Promise.all([reserve('device-a'), reserve('device-b')]);
    const intervals = [
      [a.startNumber, a.endNumber],
      [b.startNumber, b.endNumber],
    ].sort((x, y) => x[0]! - y[0]!);
    expect(intervals).toEqual([
      [1000, 1009],
      [1010, 1019],
    ]);
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query('begin');
      await admin.query('set local role stynx_app');
      await admin.query(`select set_config('app.tenant_id',$1,true)`, [tenantB]);
      const hidden = await admin.query(
        `select id from offline.numbering_reservations where range_id='10000000-0000-4000-8000-0000000000a1'`,
      );
      expect(hidden.rows).toEqual([]);
      await admin.query('commit');
    } catch (error) {
      await admin.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      await admin.end();
    }
  }, 60_000);

  it('preserves 0001 IDs/status/hash and installs key identity before permitting equal bytes under another key', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      const preserved = await admin.query(
        `select id,status,payload_hash,idempotency_key,identity_mode from offline.sync_queue_items
        where tenant_id=$1::uuid and id='legacy-item'`,
        [tenantA],
      );
      expect(preserved.rows).toEqual([
        {
          id: 'legacy-item',
          status: 'received',
          payload_hash: hash,
          idempotency_key: 'legacy-key',
          identity_mode: 'e6',
        },
      ]);
      const service = new OfflineSyncService(
        new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
        { policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) } } as never,
      ) as OfflineSyncService & {
        getSyncBatchReceipt(
          deviceId: string,
          deviceBatchId: string,
        ): Promise<{
          status: string;
          responseStatus: number | null;
          responseBodyBytes: Uint8Array | null;
        }>;
      };
      const contexts = moduleRef.get(RequestContextMutator);
      const receipt = await contexts.runWithRequestContext(
        {
          requestId: 'ctg9-legacy-read',
          tenantId: tenantA,
          actorId: 'actor-a',
          startedAt: new Date('2026-09-28T12:00:00.000Z'),
        },
        () => service.getSyncBatchReceipt('device-a', 'legacy-batch'),
      );
      expect(receipt).toMatchObject({
        status: 'legacy_closed_unverified',
        responseStatus: null,
        responseBodyBytes: null,
      });
      await admin.query(
        `insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,reserved_number,status,created_locally_at,identity_mode)
        values ('equal-bytes-new-key',$1::uuid,'new-batch','org-a','business-agent','device-a','citation',
                'local-new','new-key',$2,'{}'::jsonb,1001,'received','2026-09-28T12:00:00Z','ctg9')`,
        [tenantA, hash],
      );
      const equalBytes = await admin.query(
        `select id from offline.sync_queue_items where tenant_id=$1::uuid and payload_hash=$2 order by id`,
        [tenantA, hash],
      );
      expect(equalBytes.rows).toEqual([{ id: 'equal-bytes-new-key' }, { id: 'legacy-item' }]);
      await expect(
        admin.query(
          `insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,status,created_locally_at,identity_mode)
        values ('e6-same-hash',$1::uuid,'e6-duplicate','org-a','business-agent','device-a','citation',
                'local-e6','e6-new-key',$2,'{}'::jsonb,'received','2026-09-28T12:00:00Z','e6')`,
          [tenantA, hash],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        admin.query(
          `insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,status,created_locally_at,identity_mode)
        values ('ctg9-same-key',$1::uuid,'ctg9-duplicate','org-a','business-agent','device-a','citation',
                'local-ctg9','new-key',$2,'{"changed":true}'::jsonb,'received','2026-09-28T12:00:00Z','ctg9')`,
          [tenantA, `sha256:${createHash('sha256').update('{"changed":true}').digest('hex')}`],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      const indexes = await admin.query<{ indexdef: string }>(`select indexdef from pg_indexes
        where schemaname='offline' and tablename='sync_queue_items'`);
      expect(
        indexes.rows.some(
          ({ indexdef }) =>
            /CREATE UNIQUE INDEX/i.test(indexdef) &&
            /\(tenant_id, payload_hash\)/i.test(indexdef) &&
            /WHERE.*identity_mode.*e6/i.test(indexdef),
        ),
      ).toBe(true);
      expect(
        indexes.rows.some(
          ({ indexdef }) =>
            /CREATE UNIQUE INDEX/i.test(indexdef) &&
            /\(tenant_id, idempotency_key\)/i.test(indexdef) &&
            !/WHERE/i.test(indexdef),
        ),
      ).toBe(true);
      const modeColumn = await admin.query<{ is_nullable: string; column_default: string }>(`
        select is_nullable,column_default from information_schema.columns
        where table_schema='offline' and table_name='sync_queue_items' and column_name='identity_mode'`);
      expect(modeColumn.rows).toHaveLength(1);
      expect(modeColumn.rows[0]).toMatchObject({ is_nullable: 'NO' });
      expect(modeColumn.rows[0]!.column_default).toContain('e6');
      const checks = await admin.query<{ definition: string }>(`
        select pg_get_constraintdef(c.oid) as definition from pg_constraint c
        where c.conrelid='offline.sync_queue_items'::regclass and c.contype='c'`);
      expect(
        checks.rows.some(
          ({ definition }) =>
            definition.includes('identity_mode') &&
            definition.includes('e6') &&
            definition.includes('ctg9'),
        ),
      ).toBe(true);
    } finally {
      await admin.end();
    }
  }, 60_000);

  it('replays only a valid legacy durable-store ACK through the read-only compatibility bridge', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      const schema = await admin.query(`select count(*)::int as tables from pg_class c
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relkind='r'`);
      expect(schema.rows[0].tables).toBeGreaterThan(4);
    } finally {
      await admin.end();
    }
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'legacy-batch',
      items: [
        {
          queueItemId: 'legacy-item',
          entityType: 'citation',
          localEntityId: 'local-legacy',
          idempotencyKey: 'legacy-key',
          payloadHash: hash,
          payloadJson: {},
          reservedNumber: 1000,
          createdLocallyAt: '2026-09-28T12:00:00.000Z',
        },
      ],
    };
    const legacyBody = {
      batchId: 'legacy-batch',
      acceptedItems: 1,
      duplicateItems: 0,
      conflicts: [],
      items: [],
    };
    const valid: IdempotencyStoredEntry = {
      status: 'completed',
      requestFingerprint: '',
      statusCode: 201,
      body: legacyBody,
      headers: { 'x-original-ack': 'kept' },
      expiresAt: Date.now() + 60_000,
    };
    const legacy = {
      lookup: vi.fn(),
      reserve: vi.fn(async () => true),
      persistResponse: vi.fn(async () => true),
      clearReservation: vi.fn(async () => undefined),
    };
    const applier = { apply: vi.fn() };
    const module = await Test.createTestingModule({
      imports: [
        StynxOfflineSyncModule.forRoot({
          mountControllers: false,
          store: new PostgresOfflineSyncStore(moduleRef),
          context: { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
          policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
          legacyIdempotencyStore: legacy as IdempotencyStore,
          itemApplier: applier,
          eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
        } as never),
      ],
    }).compile();
    await module.init();
    try {
      const service = module.get(OfflineSyncService) as OfflineSyncService & {
        submitSyncBatch(
          value: typeof input,
          options: { transportIdempotencyKey: string; method: 'POST'; path: string },
        ): Promise<unknown>;
      };
      const contexts = moduleRef.get(RequestContextMutator);
      await contexts.runWithRequestContext(
        {
          requestId: 'ctg9-legacy-bridge',
          tenantId: tenantA,
          actorId: 'actor-a',
          startedAt: new Date('2026-09-28T12:00:00.000Z'),
        },
        async () => {
          const options = {
            transportIdempotencyKey: 'legacy-transport-key',
            method: 'POST' as const,
            path: '/offline-sync/sync-batches',
          };
          const denied = [
            (fingerprint: string) => ({
              ...valid,
              requestFingerprint: fingerprint,
              status: 'pending' as const,
            }),
            (fingerprint: string) => ({
              ...valid,
              requestFingerprint: fingerprint,
              expiresAt: Date.now() - 1,
            }),
            (_fingerprint: string) => ({ ...valid, requestFingerprint: 'wrong-fingerprint' }),
            (_fingerprint: string) => null,
            (fingerprint: string) => ({
              ...valid,
              requestFingerprint: fingerprint,
              body: undefined,
            }),
          ];
          for (const record of denied) {
            legacy.lookup.mockImplementationOnce(async (decision) =>
              record(decision.requestFingerprint),
            );
            await expect(service.submitSyncBatch(input, options)).rejects.toMatchObject({
              status: 409,
            });
            expect(applier.apply).not.toHaveBeenCalled();
          }
          legacy.lookup.mockImplementationOnce(async (decision) => ({
            ...valid,
            requestFingerprint: decision.requestFingerprint,
          }));
          await expect(service.submitSyncBatch(input, options)).resolves.toEqual(legacyBody);
          expect(legacy.lookup).toHaveBeenCalledWith(
            expect.objectContaining({
              tenantId: tenantA,
              userId: 'actor-a',
              routeKey: 'POST:/offline-sync/sync-batches',
              headerValue: 'legacy-transport-key',
              requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          );
          expect(legacy.reserve).not.toHaveBeenCalled();
          expect(legacy.persistResponse).not.toHaveBeenCalled();
          expect(legacy.clearReservation).not.toHaveBeenCalled();
          expect(applier.apply).not.toHaveBeenCalled();
        },
      );
    } finally {
      await module.close();
    }
  }, 60_000);

  it('replays a legacy ACK over HTTP under a global prefix using the published transport route key', async () => {
    const ack = { batchId: 'legacy-batch', acceptedItems: 1, duplicateItems: 0, conflicts: [], items: [] };
    const legacy = { lookup: vi.fn(async (decision: { requestFingerprint: string }) => ({
      status: 'completed', requestFingerprint: decision.requestFingerprint, statusCode: 201,
      body: ack, headers: { 'x-legacy-ack': 'saved' }, expiresAt: Date.now() + 60_000,
    })), reserve: vi.fn(), persistResponse: vi.fn(), clearReservation: vi.fn() };
    const module = await Test.createTestingModule({ imports: [StynxCoreModule.forRoot({ appName: 'ctg9-http-proof', schema: { safeParseAsync: async () => ({ success: true, data: {} }) } as never }), StynxOfflineSyncModule.forRoot({
      store: new PostgresOfflineSyncStore(moduleRef),
      context: { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
      legacyIdempotencyStore: legacy as never,
      itemApplier: { apply: vi.fn(async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` })) },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    } as never)] })
      .overrideGuard(StynxAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true }).compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('gateway/v2');
    const contexts = moduleRef.get(RequestContextMutator);
    app.use((_req: unknown, _res: unknown, next: () => void) => contexts.runWithRequestContext({
      requestId: 'ctg9-prefixed-http-bridge', tenantId: tenantA, actorId: 'actor-a',
      startedAt: new Date('2026-09-28T12:00:00.000Z'),
    }, next));
    await app.init();
    try {
      const response = await request(app.getHttpServer()).post('/gateway/v2/offline-sync/sync-batches')
        .set('Idempotency-Key', 'legacy-transport-key').send({
          orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'legacy-batch',
          items: [{ queueItemId: 'legacy-item', entityType: 'citation', localEntityId: 'local-legacy',
            idempotencyKey: 'legacy-key', payloadHash: hash, payloadJson: {},
            createdLocallyAt: '2026-09-28T12:00:00.000Z' }],
        });
      expect(response.status).toBe(201);
      expect(response.body).toEqual(ack);
      expect(response.headers['x-legacy-ack']).toBe('saved');
      expect(legacy.lookup).toHaveBeenCalledWith(expect.objectContaining({
        routeKey: 'POST:/gateway/v2/offline-sync/sync-batches',
      }));
      const missingHeader = await request(app.getHttpServer()).post('/gateway/v2/offline-sync/sync-batches').send({ orgUnitId: 'org-a', deviceId: 'missing-key-device', deviceBatchId: 'missing-key-batch', items: [] });
      expect(missingHeader.status).toBe(400);
      expect(missingHeader.body).toEqual({ statusCode: 400, message: 'Idempotency-Key header is required for idempotent routes', error: 'Bad Request' });
      const transportBody = (batchId: string, value: string) => {
        const payloadJson = { transportProbe: value };
        return { orgUnitId: 'org-a', deviceId: 'transport-replay-device', deviceBatchId: batchId,
          items: [{ queueItemId: `${batchId}-item`, entityType: 'citation', localEntityId: `${batchId}-local`,
            idempotencyKey: `${batchId}-key`, payloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payloadJson)).digest('hex')}`,
            payloadJson, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] };
      };
      const transportFirst = await request(app.getHttpServer()).post('/gateway/v2/offline-sync/sync-batches').set('Idempotency-Key', 'same-transport-key').send(transportBody('transport-first', 'one'));
      expect(transportFirst.status).toBe(201);
      const transportReuse = await request(app.getHttpServer()).post('/gateway/v2/offline-sync/sync-batches').set('Idempotency-Key', 'same-transport-key').send(transportBody('transport-second', 'two'));
      expect(transportReuse.status).toBe(422);
      expect(transportReuse.body).toEqual({ statusCode: 422, message: 'IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY', error: 'Unprocessable Entity' });
    } finally { await app.close(); }
  }, 60_000);

  it('returns retryable 503 and leaves an internal item failure open over HTTP', async () => {
    let requestContexts!: RequestContextMutator;
    const module = await Test.createTestingModule({ imports: [StynxCoreModule.forRoot({ appName: 'ctg9-http-proof', schema: { safeParseAsync: async () => ({ success: true, data: {} }) } as never }), StynxOfflineSyncModule.forRoot({
      store: new PostgresOfflineSyncStore(moduleRef),
      context: { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
      itemApplier: { apply: async () => { throw new Error('temporary upstream failure'); } },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    } as never)] })
      .overrideGuard(StynxAuthGuard).useValue({ canActivate: () => { requestContexts.patch({ tenantId: tenantA, actorId: 'actor-a' }); return true; } })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true }).compile();
    const app: INestApplication = module.createNestApplication();
    requestContexts = module.get(RequestContextMutator);
    await app.init();
    try {
      const body = { orgUnitId: 'org-a', deviceId: 'internal-failure-device', deviceBatchId: 'internal-failure-batch',
        items: [{ queueItemId: 'internal-failure-item', entityType: 'citation', localEntityId: 'local-internal-failure',
          idempotencyKey: 'internal-failure-key', payloadHash: hash, payloadJson: {},
          createdLocallyAt: '2026-09-28T12:00:00.000Z' }] };
      const response = await request(app.getHttpServer()).post('/offline-sync/sync-batches')
        .set('X-Request-Id', '0198d132-0000-7000-8000-000000000001')
        .set('Idempotency-Key', 'internal-failure-transport').send(body);
      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(response.body).toMatchObject({ errorCode: 'OFFLINE_SYNC:BATCH:in-progress', retryable: true, requestId: response.headers['x-request-id'] });
      const receiptService = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
        { policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) } } as never);
      const receipt = await moduleRef.get(RequestContextMutator).runWithRequestContext({ requestId: 'ctg9-internal-failure-receipt', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => receiptService.getSyncBatchReceipt(body.deviceId, body.deviceBatchId));
      expect(receipt).toMatchObject({ status: 'open', responseStatus: null });
      expect(receipt.items).toMatchObject([{ queueItemId: 'internal-failure-item', status: 'received' }]);
    } finally { await app.close(); }
  }, 60_000);

  it('checks closed and open batch context after a tenant-device advisory 55P03', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({
      requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z'),
    }, action);
    const makeService = (apply: (queueItemId: string) => Promise<unknown>) => new OfflineSyncService(store,
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => apply(current.queueItemId) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never);
    const closedService = makeService(async (queueItemId) => ({ serverEntityId: `server-${queueItemId}` }));
    const closed = { orgUnitId: 'org-a', deviceId: '55p03-closed-device', deviceBatchId: '55p03-closed-batch', batchSequence: 1, items: [
      { queueItemId: '55p03-closed-original', entityType: 'citation', localEntityId: 'local-closed-original', idempotencyKey: '55p03-closed-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    await run('55p03-closed-create', () => closedService.submitSyncBatch(closed));
    const lock = async (deviceId: string, runAttempt: () => Promise<unknown>, expectedStatus = 409) => {
      const admin = await pg.connectAsAdmin();
      try {
        await admin.query('begin');
        await admin.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [`${tenantA}:${deviceId}`]);
        const snapshot = async () => {
          const tables = [
            ['sync_batches', 'device_batch_id'],
            ['sync_batch_transport_keys', 'transport_key'],
            ['sync_queue_items', 'id'],
            ['sync_item_receipts', 'idempotency_key'],
            ['sync_item_attempts', 'device_batch_id,queue_item_id'],
          ] as const;
          const snapshotRows: unknown[][] = [];
          for (const [table, order] of tables) {
            const rows = await admin.query(`select * from offline.${table} where tenant_id=$1::uuid and device_id=$2 order by ${order}`, [tenantA, deviceId]);
            snapshotRows.push(rows.rows);
          }
          return snapshotRows;
        };
        const before = await snapshot();
        await expect(runAttempt()).rejects.toMatchObject({ status: expectedStatus });
        expect(await snapshot()).toEqual(before);
      } finally { await admin.query('rollback').catch(() => undefined); await admin.end(); }
    };
    await lock(closed.deviceId, () => run('55p03-closed-divergent', () => closedService.submitSyncBatch({
      ...closed, items: [{ ...closed.items[0], queueItemId: '55p03-closed-undeclared', localEntityId: 'local-undeclared', idempotencyKey: '55p03-closed-other-key' }],
    })));
    await lock(closed.deviceId, () => run('55p03-sequence-divergent', () => closedService.submitSyncBatch({ ...closed, batchSequence: 2 })));
    await lock(closed.deviceId, () => run('55p03-fingerprint-divergent', () => closedService.submitSyncBatch({ ...closed, extraTransportBody: 'changed-with-same-domain-context' })), 422);

    let failOnce = true;
    const openService = makeService(async (queueItemId) => {
      if (failOnce) { failOnce = false; throw new Error('leave batch open'); }
      return { serverEntityId: `server-${queueItemId}` };
    });
    const open = { orgUnitId: 'org-a', deviceId: '55p03-open-device', deviceBatchId: '55p03-open-batch', items: [
      { queueItemId: '55p03-open-original', entityType: 'citation', localEntityId: 'local-open-original', idempotencyKey: '55p03-open-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    await run('55p03-open-create', () => openService.submitSyncBatch(open));
    await lock(open.deviceId, () => run('55p03-open-divergent', () => openService.submitSyncBatch({
      ...open, items: [{ ...open.items[0], queueItemId: '55p03-open-undeclared', localEntityId: 'local-open-undeclared', idempotencyKey: '55p03-open-other-key' }],
    })));
  }, 60_000);

  it('enforces PostgreSQL sequence duplicate and gap statuses with the expected message', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, leaseWaitMs: 100,
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never);
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    const submit = (deviceBatchId: string, queueItemId: string, batchSequence: number) => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'pg-sequence-device', deviceBatchId, batchSequence, items: [{ queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`, idempotencyKey: `key-${queueItemId}`, payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
    await run('pg-sequence-first', () => submit('pg-sequence-one', 'pg-sequence-item-one', 1));
    await expect(run('pg-sequence-duplicate', () => submit('pg-sequence-reused-one', 'pg-sequence-item-reused', 1))).rejects.toMatchObject({ status: 409, code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    let gap: unknown;
    try { await run('pg-sequence-gap', () => submit('pg-sequence-three', 'pg-sequence-item-three', 3)); } catch (error) { gap = error; }
    expect(gap).toBeInstanceOf(HttpException);
    expect((gap as HttpException).getStatus()).toBe(422);
    expect((gap as HttpException).getResponse()).toEqual({ statusCode: 422, errorCode: 'OFFLINE_SYNC_BATCH_SEQUENCE', message: 'Expected batch sequence 2; received 3.', retryable: false });
    const admin = await pg.connectAsAdmin();
    try {
      const absent = await admin.query(`select id from offline.sync_queue_items where tenant_id=$1::uuid and id in ('pg-sequence-item-reused','pg-sequence-item-three')`, [tenantA]);
      expect(absent.rows).toEqual([]);
    } finally { await admin.end(); }
  }, 60_000);

  it('keeps E6 store behavior against the upgraded schema when no resolver is configured', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      const schema = await admin.query(`select count(*)::int as tables from pg_class c
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relkind='r'`);
      expect(schema.rows[0].tables).toBeGreaterThan(4);
    } finally {
      await admin.end();
    }
    const contexts = moduleRef.get(RequestContextMutator);
    const service = new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      { now: () => '2026-09-28T12:00:00.000Z' },
    );
    await contexts.runWithRequestContext(
      {
        requestId: 'ctg9-e6-upgrade',
        tenantId: tenantA,
        actorId: 'actor-a',
        startedAt: new Date('2026-09-28T12:00:00.000Z'),
      },
      async () => {
        const reservation = await service.reserveNumbering({
          orgUnitId: 'org-a',
          deviceId: 'e6-device',
          shiftId: 'e6-shift',
          entityType: 'citation',
          requestedSize: 1,
        });
        await service.cancelNumberingReservation(reservation.reservationId);
        await expect(
          service.cancelNumberingReservation(reservation.reservationId),
        ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE', status: 409 });
        const payloadJson = { e6: true };
        const payloadHash = `sha256:${createHash('sha256').update(JSON.stringify(payloadJson)).digest('hex')}`;
        const first = {
          queueItemId: 'e6-item-1',
          entityType: 'citation',
          localEntityId: 'e6-local-1',
          idempotencyKey: 'e6-key-1',
          payloadHash,
          payloadJson,
          reservedNumber: 1000,
          createdLocallyAt: '2026-09-28T12:00:00.000Z',
        };
        await expect(
          service.submitSyncBatch({
            orgUnitId: 'org-a',
            deviceId: 'e6-device',
            deviceBatchId: 'e6-batch-1',
            items: [first],
          }),
        ).resolves.toMatchObject({ duplicateItems: 0 });
        await expect(
          service.submitSyncBatch({
            orgUnitId: 'org-a',
            deviceId: 'e6-device',
            deviceBatchId: 'e6-batch-2',
            items: [
              {
                ...first,
                queueItemId: 'e6-item-2',
                localEntityId: 'e6-local-2',
                idempotencyKey: 'e6-key-2',
              },
            ],
          }),
        ).resolves.toMatchObject({ duplicateItems: 1 });
        await expect(
          service.submitSyncBatch({
            orgUnitId: 'org-a',
            deviceId: 'e6-device',
            deviceBatchId: 'e6-batch-3',
            items: [{ ...first, payloadHash: `sha256:${'c'.repeat(64)}` }],
          }),
        ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ID_REUSED', status: 409 });
      },
    );
  }, 60_000);

  it('separates CTG9 keyed identity from E6 hash deduplication through the real store', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    const context = { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) };
    const ctg9 = new OfflineSyncService(store, context, {
      now: () => '2026-09-28T12:00:00.000Z',
      policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
    } as never);
    const e6 = new OfflineSyncService(store, context, {
      now: () => '2026-09-28T12:00:00.000Z',
    });
    const bytes = { identityModeProbe: 'ctg9-before-e6' };
    const sharedHash = `sha256:${createHash('sha256').update(JSON.stringify(bytes)).digest('hex')}`;
    const submit = (deviceBatchId: string, queueItemId: string, idempotencyKey: string) => ({
      orgUnitId: 'org-a',
      deviceId: 'identity-device',
      deviceBatchId,
      items: [
        {
          queueItemId,
          entityType: 'citation',
          localEntityId: `local-${queueItemId}`,
          idempotencyKey,
          payloadHash: sharedHash,
          payloadJson: bytes,
          createdLocallyAt: '2026-09-28T12:00:00.000Z',
        },
      ],
    });
    await contexts.runWithRequestContext(
      {
        requestId: 'ctg9-identity-mode-real-store',
        tenantId: tenantA,
        actorId: 'actor-a',
        startedAt: new Date('2026-09-28T12:00:00.000Z'),
      },
      async () => {
        await expect(
          ctg9.submitSyncBatch(submit('identity-ctg9', 'identity-ctg9-item', 'identity-ctg9-key')),
        ).resolves.toMatchObject({ duplicateItems: 0 });
        const admin = await pg.connectAsAdmin();
        try {
          const first = await admin.query(
            `select id,identity_mode from offline.sync_queue_items
            where tenant_id=$1::uuid and id='identity-ctg9-item'`,
            [tenantA],
          );
          expect(first.rows).toEqual([{ id: 'identity-ctg9-item', identity_mode: 'ctg9' }]);
        } finally {
          await admin.end();
        }
        await expect(
          e6.submitSyncBatch(submit('identity-e6-first', 'identity-e6-item', 'identity-e6-key')),
        ).resolves.toMatchObject({ duplicateItems: 0 });
        const third = await e6.submitSyncBatch(
          submit('identity-e6-third', 'identity-e6-third-item', 'identity-e6-third-key'),
        );
        expect(third.duplicateItems).toBe(1);
        expect(third.items[0]?.queueItemId).toBe('identity-e6-item');
        const verify = await pg.connectAsAdmin();
        try {
          const rows = await verify.query(
            `select id,identity_mode from offline.sync_queue_items
            where tenant_id=$1::uuid and payload_hash=$2 order by id`,
            [tenantA, sharedHash],
          );
          expect(rows.rows).toEqual([
            { id: 'identity-ctg9-item', identity_mode: 'ctg9' },
            { id: 'identity-e6-item', identity_mode: 'e6' },
          ]);
        } finally {
          await verify.end();
        }
      },
    );
  }, 60_000);

  it('serializes a same-key cross-device race and persists a divergent attempt in its batch receipt', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    let enterApply!: () => void;
    let releaseApply!: () => void;
    const entered = new Promise<void>((resolve) => { enterApply = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseApply = resolve; });
    const applied: string[] = [];
    const service = new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      {
        now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => {
          applied.push(current.queueItemId);
          if (current.queueItemId === 'cross-device-first') { enterApply(); await blocked; }
          return { serverEntityId: `server-${current.queueItemId}` };
        } },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never,
    ) as OfflineSyncService & {
      getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<{ items: Array<{ queueItemId: string; status: string }> }>;
    };
    const body = { sharedKeyRace: 'same-payload' };
    const sharedHash = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
    const submit = (deviceId: string, batchId: string, queueItemId: string, payload = body, payloadHash = sharedHash) => ({
      orgUnitId: 'org-a', deviceId, deviceBatchId: batchId,
      items: [{ queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`,
        idempotencyKey: 'ctg9-cross-device-shared-key', payloadHash, payloadJson: payload,
        createdLocallyAt: '2026-09-28T12:00:00.000Z' }],
    });
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({
      requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z'),
    }, action);
    const first = run('ctg9-cross-device-first', () => service.submitSyncBatch(submit('race-device-a', 'race-batch-a', 'cross-device-first')));
    await entered;
    const second = run('ctg9-cross-device-second', () => service.submitSyncBatch(submit('race-device-b', 'race-batch-b', 'cross-device-second')));
    releaseApply();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.items[0]).toMatchObject({ status: 'applied' });
    expect(secondResult.items[0]).toMatchObject({ queueItemId: 'cross-device-second', status: 'applied' });
    expect(applied).toEqual(['cross-device-first']);
    const changed = { sharedKeyRace: 'different-payload' };
    const changedHash = `sha256:${createHash('sha256').update(JSON.stringify(changed)).digest('hex')}`;
    const divergent = await run('ctg9-cross-device-divergent', () => service.submitSyncBatch(
      submit('race-device-c', 'race-batch-c', 'cross-device-divergent', changed, changedHash),
    ));
    expect(divergent.items[0]).toMatchObject({ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' });
    expect(applied).toEqual(['cross-device-first']);
    expect(await run('ctg9-cross-device-divergent-receipt', () => service.getSyncBatchReceipt('race-device-c', 'race-batch-c'))).toMatchObject({
      items: [{ queueItemId: 'cross-device-divergent', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }],
    });
    expect(await run('ctg9-cross-device-receipt', () => service.getSyncBatchReceipt('race-device-b', 'race-batch-b'))).toMatchObject({
      items: [{ queueItemId: 'cross-device-second', status: 'applied', context: { originalQueueItemId: 'cross-device-first' } }],
    });
  }, 60_000);

  it('classifies PostgreSQL reservation outcomes and persists open domain evidence', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    const service = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
      now: () => '2026-09-28T12:00:00.000Z',
      policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
      itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` }) },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    } as never) as OfflineSyncService & {
      getNumberingConsumption(id: string): Promise<{ consumption: Array<{ number: number; status: string; serverEntityId: string | null }> }>;
    };
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({
      requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z'),
    }, action);
    const itemFor = (queueItemId: string, number: number, reservationId?: string, createdLocallyAt = '2026-09-28T12:00:00.000Z') => ({
      queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`, idempotencyKey: `key-${queueItemId}`,
      payloadHash: hash, payloadJson: {}, reservedNumber: number, createdLocallyAt,
      ...(reservationId ? { reservationId } : {}),
    });
    const submit = (batchId: string, deviceId: string, item: ReturnType<typeof itemFor>) => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId, deviceBatchId: batchId, items: [item] });
    const outcomes: Array<{ queueItemId: string; expected: string }> = [];
    await run('ctg9-outcome-matrix', async () => {
      const noCoverage = await submit('outcome-no-coverage', 'outcome-device', itemFor('outcome-no-coverage-item', 987654));
      outcomes.push({ queueItemId: 'outcome-no-coverage-item', expected: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE' });
      expect(noCoverage.items[0]).toMatchObject({ status: 'rejected', errorCode: outcomes[0].expected, context: { number: 987654, reservationId: null } });

      const admin = await pg.connectAsAdmin();
      try {
        await admin.query(`insert into offline.numbering_ranges (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values
          ('20000000-0000-4000-8000-0000000000c1',$1::uuid,'org-a','citation','MATRIX-A',888800,888810,888800,'active'),
          ('20000000-0000-4000-8000-0000000000c2',$1::uuid,'org-a','citation','MATRIX-B',888800,888810,888800,'active')`, [tenantA]);
      } finally { await admin.end(); }
      const a = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'outcome-ambiguous-device', shiftId: 'matrix-a', entityType: 'citation', series: 'MATRIX-A', requestedSize: 1 });
      await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'outcome-ambiguous-device', shiftId: 'matrix-b', entityType: 'citation', series: 'MATRIX-B', requestedSize: 1 });
      const ambiguous = await submit('outcome-ambiguous', 'outcome-ambiguous-device', itemFor('outcome-ambiguous-item', a.startNumber));
      outcomes.push({ queueItemId: 'outcome-ambiguous-item', expected: 'OFFLINE_SYNC_NUMBERING_AMBIGUOUS' });
      expect(ambiguous.items[0]).toMatchObject({ status: 'rejected', errorCode: outcomes[1].expected, context: { number: a.startNumber, reservationId: null } });

      const closed = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'outcome-closed-device', shiftId: 'matrix-closed', entityType: 'citation', requestedSize: 1 });
      await service.closeNumberingReservation(closed.reservationId);
      const closedResult = await submit('outcome-closed', 'outcome-closed-device', itemFor('outcome-closed-item', closed.startNumber, closed.reservationId));
      outcomes.push({ queueItemId: 'outcome-closed-item', expected: 'OFFLINE_SYNC_NUMBERING_EXPIRED' });
      expect(closedResult.items[0]).toMatchObject({ status: 'conflict', errorCode: outcomes[2].expected, context: { number: closed.startNumber, reservationId: closed.reservationId } });

      const expired = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'outcome-expired-device', shiftId: 'matrix-expired', entityType: 'citation', requestedSize: 1, validUntil: '2026-09-29T12:00:00.000Z' });
      const expiredResult = await submit('outcome-expired', 'outcome-expired-device', itemFor('outcome-expired-item', expired.startNumber, expired.reservationId, '2026-09-30T12:00:00.000Z'));
      outcomes.push({ queueItemId: 'outcome-expired-item', expected: 'OFFLINE_SYNC_NUMBERING_EXPIRED' });
      expect(expiredResult.items[0]).toMatchObject({ status: 'conflict', errorCode: outcomes[3].expected, context: { number: expired.startNumber, reservationId: expired.reservationId } });

      const applied = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'outcome-applied-device', shiftId: 'matrix-applied', entityType: 'citation', requestedSize: 1 });
      await submit('outcome-applied-first', 'outcome-applied-device', itemFor('outcome-applied-first-item', applied.startNumber, applied.reservationId));
      const repeated = await submit('outcome-applied-repeat', 'outcome-applied-device', itemFor('outcome-applied-repeat-item', applied.startNumber, applied.reservationId));
      outcomes.push({ queueItemId: 'outcome-applied-repeat-item', expected: 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED' });
      expect(repeated.items[0]).toMatchObject({ status: 'rejected', errorCode: outcomes[4].expected, context: { number: applied.startNumber, reservationId: applied.reservationId } });

      const outOfScope = await submit('outcome-foreign-id', 'outcome-foreign-device', itemFor('outcome-foreign-item', a.startNumber, a.reservationId));
      outcomes.push({ queueItemId: 'outcome-foreign-item', expected: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE' });
      expect(outOfScope.items[0]).toMatchObject({ status: 'rejected', errorCode: outcomes[5].expected, context: { number: a.startNumber, reservationId: a.reservationId } });

      const inScopeOutOfRange = await submit('outcome-in-scope-out-of-range', 'outcome-ambiguous-device', itemFor('outcome-range-item', a.startNumber + 1, a.reservationId));
      outcomes.push({ queueItemId: 'outcome-range-item', expected: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE' });
      expect(inScopeOutOfRange.items[0]).toMatchObject({ status: 'rejected', errorCode: outcomes[6].expected, context: { number: a.startNumber + 1, reservationId: a.reservationId } });

      const lateReservation = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'late-sync-device', shiftId: 'late-sync', entityType: 'citation', requestedSize: 1, validUntil: '2026-09-29T12:00:00.000Z' });
      const lateService = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-30T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never);
      const late = await run('ctg9-late-sync-positive', () => lateService.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'late-sync-device', deviceBatchId: 'late-sync-batch', items: [itemFor('late-sync-item', lateReservation.startNumber, lateReservation.reservationId, '2026-09-28T12:00:00.000Z')] }));
      expect(late.items[0]).toMatchObject({ status: 'applied', queueItemId: 'late-sync-item' });
      expect((await lateService.getNumberingConsumption(lateReservation.reservationId)).consumption).toMatchObject([
        { number: lateReservation.startNumber, status: 'applied', serverEntityId: 'server-late-sync-item' },
      ]);
    });
    const admin = await pg.connectAsAdmin();
    try {
      const evidence = await admin.query<{ queue_item_id: string; evidence: Record<string, unknown> }>(`select queue_item_id,e.evidence from offline.sync_conflict_evidence e where tenant_id=$1::uuid and queue_item_id=any($2::text[])`, [tenantA, outcomes.map((o) => o.queueItemId)]);
      expect(evidence.rows.map((row) => row.queue_item_id).sort()).toEqual(outcomes.map((o) => o.queueItemId).sort());
      expect(evidence.rows.every((row) => Object.keys(row.evidence).length > 0)).toBe(true);
      const open = await admin.query<{ status: string; count: number }>(`select c.status,count(*)::int as count from offline.sync_conflicts c join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id where c.tenant_id=$1::uuid and e.queue_item_id=any($2::text[]) group by c.status`, [tenantA, outcomes.map((o) => o.queueItemId)]);
      expect(open.rows).toEqual([{ status: 'open', count: 7 }]);
    } finally { await admin.end(); }
  }, 60_000);

  it('rejects a directly constructed applier without an event port before any PostgreSQL batch write', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const apply = vi.fn(async () => ({ serverEntityId: 'unexpected-effect' }));
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: { apply },
      } as never);
    const input = { orgUnitId: 'org-a', deviceId: 'missing-event-port-device', deviceBatchId: 'missing-event-port-batch', items: [
      { queueItemId: 'missing-event-port-item', entityType: 'citation', localEntityId: 'local-missing-event-port', idempotencyKey: 'missing-event-port-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    let error: unknown;
    try {
      await contexts.runWithRequestContext({ requestId: 'missing-event-port-request', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(input));
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect((error as Error).constructor.name).toBe('OfflineSyncConfigurationError');
    expect((error as Error).message).toContain('eventPort');
    expect(apply).not.toHaveBeenCalled();
    const admin = await pg.connectAsAdmin();
    try {
      for (const table of ['sync_batches', 'sync_batch_transport_keys', 'sync_queue_items', 'sync_item_receipts', 'sync_item_attempts']) {
        const rows = await admin.query(`select * from offline.${table} where tenant_id=$1::uuid and device_id=$2`, [tenantA, input.deviceId]);
        expect(rows.rows).toEqual([]);
      }
    } finally { await admin.end(); }
  }, 60_000);

  it('rejects fractional reservation numbers and requires an applier before numbered batch writes', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
      } as never);
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    const reservation = await run('ctg9-no-applier-reserve', () => service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'safe-integer-device', shiftId: 'safe-integer', entityType: 'citation', requestedSize: 1 }));
    const numbered = { queueItemId: 'no-applier-numbered-item', entityType: 'citation', localEntityId: 'local-no-applier-numbered', idempotencyKey: 'no-applier-numbered-key', payloadHash: hash, payloadJson: {}, reservedNumber: reservation.startNumber, reservationId: reservation.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' };
    await expect(run('ctg9-no-applier-submit', () => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'safe-integer-device', deviceBatchId: 'no-applier-numbered-batch', items: [numbered] })))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    await expect(run('ctg9-fraction-submit', () => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'safe-integer-device', deviceBatchId: 'fractional-number-batch', items: [{ ...numbered, queueItemId: 'fractional-number-item', idempotencyKey: 'fractional-number-key', reservedNumber: reservation.startNumber + 0.5 }] })))
      .rejects.toMatchObject({ status: 400 });
    const admin = await pg.connectAsAdmin();
    try {
      const rows = await admin.query(`select id from offline.sync_queue_items where tenant_id=$1::uuid and id in ('no-applier-numbered-item','fractional-number-item')`, [tenantA]);
      expect(rows.rows).toEqual([]);
      const receipts = await admin.query(`select device_batch_id from offline.sync_batches where tenant_id=$1::uuid and device_id='safe-integer-device' and device_batch_id in ('no-applier-numbered-batch','fractional-number-batch')`, [tenantA]);
      expect(receipts.rows).toEqual([]);
    } finally { await admin.end(); }
  }, 60_000);

  it('rejects duplicate declared or synthetic CTG9 item keys before PostgreSQL writes', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const applier = { apply: vi.fn() };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, itemApplier: applier,
      } as never);
    const itemFor = (queueItemId: string, idempotencyKey?: string) => ({ queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }), payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' });
    await contexts.runWithRequestContext({ requestId: 'ctg9-duplicate-keys', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, async () => {
      await expect(service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'duplicate-device', deviceBatchId: 'duplicate-declared', items: [itemFor('declared-a', 'same-declared'), itemFor('declared-b', 'same-declared')] })).rejects.toMatchObject({ status: 400 });
      const syntheticService = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
          policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
          legacyItemIdentityResolver: { resolve: async () => 'same-synthetic-identity' }, itemApplier: applier,
        } as never);
      await expect(syntheticService.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'duplicate-device', deviceBatchId: 'duplicate-synthetic', items: [itemFor('synthetic-a'), itemFor('synthetic-b')] })).rejects.toMatchObject({ status: 400 });
    });
    expect(applier.apply).not.toHaveBeenCalled();
    const admin = await pg.connectAsAdmin();
    try {
      const rows = await admin.query(`select device_batch_id from offline.sync_batches where tenant_id=$1::uuid and device_id='duplicate-device' and device_batch_id in ('duplicate-declared','duplicate-synthetic')`, [tenantA]);
      const items = await admin.query(`select id from offline.sync_queue_items where tenant_id=$1::uuid and id in ('declared-a','declared-b','synthetic-a','synthetic-b')`, [tenantA]);
      expect(rows.rows).toEqual([]);
      expect(items.rows).toEqual([]);
    } finally { await admin.end(); }
  }, 60_000);

  it('continues PostgreSQL batch processing after a CTG9 queue ID is reused by another batch', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const applier = { apply: vi.fn(async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` })) };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, itemApplier: applier,
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never);
    const makeItem = (queueItemId: string, idempotencyKey: string) => ({ queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`,
      idempotencyKey, payloadHash: `sha256:${createHash('sha256').update(idempotencyKey).digest('hex')}`, payloadJson: { idempotencyKey },
      createdLocallyAt: '2026-09-28T12:00:00.000Z' });
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    await run('ctg9-queue-id-original', () => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'queue-id-pg-device', deviceBatchId: 'queue-id-pg-first', items: [makeItem('queue-id-pg-reused', 'queue-id-pg-original-key')] }));
    const result = await run('ctg9-queue-id-reused', () => service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'queue-id-pg-device', deviceBatchId: 'queue-id-pg-second', items: [
      makeItem('queue-id-pg-reused', 'queue-id-pg-new-key'), makeItem('queue-id-pg-sibling', 'queue-id-pg-sibling-key'),
    ] }));
    expect(result.receipt.items).toMatchObject([
      { queueItemId: 'queue-id-pg-reused', status: 'rejected', errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED' },
      { queueItemId: 'queue-id-pg-sibling', status: 'applied' },
    ]);
    expect(applier.apply.mock.calls.map(([, current]) => current.queueItemId)).toEqual(['queue-id-pg-reused', 'queue-id-pg-sibling']);
  }, 60_000);

  it('takes over an expired open-batch lease with a higher fence generation', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    let failOnce = true;
    const service = new OfflineSyncService(
      store,
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      {
        now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: { apply: async () => {
          if (failOnce) { failOnce = false; throw new Error('transient database failure'); }
          return { serverEntityId: 'server-after-takeover' };
        } },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never,
    );
    const batch = {
      orgUnitId: 'org-a', deviceId: 'takeover-device', deviceBatchId: 'takeover-batch',
      items: [{ queueItemId: 'takeover-item', entityType: 'citation', localEntityId: 'local-takeover',
        idempotencyKey: 'takeover-key', payloadHash: hash, payloadJson: {},
        createdLocallyAt: '2026-09-28T12:00:00.000Z' }],
    };
    await contexts.runWithRequestContext({ requestId: 'ctg9-lease-takeover', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, async () => {
      const interrupted = await service.submitSyncBatch(batch);
      expect(interrupted).toMatchObject({ receipt: { status: 'open', responseStatus: null } });
      const admin = await pg.connectAsAdmin();
      try {
        const before = await admin.query<{ lease_generation: string }>(`select lease_generation from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, batch.deviceId, batch.deviceBatchId]);
        await admin.query(`update offline.sync_batches set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 second' where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, batch.deviceId, batch.deviceBatchId]);
        const resumed = await service.submitSyncBatch(batch);
        expect(resumed).toMatchObject({ receipt: { status: 'closed', responseStatus: 201 }, items: [{ status: 'applied' }] });
        const after = await admin.query<{ lease_generation: string; status: string }>(`select lease_generation,status from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, batch.deviceId, batch.deviceBatchId]);
        expect(Number(after.rows[0]?.lease_generation)).toBe(Number(before.rows[0]?.lease_generation) + 1);
        expect(after.rows[0]?.status).toBe('closed');
      } finally { await admin.end(); }
    });
  }, 60_000);

  it('preserves numbering conflict context and response bytes when an open batch resumes', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    let fail = true;
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => {
          if (current.queueItemId === 'resume-transient-item' && fail) throw new Error('retry after sibling interruption');
          return { serverEntityId: `server-${current.queueItemId}` };
        } },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never) as OfflineSyncService & { getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<{ responseBodyBytes: Uint8Array | null; items: Array<{ queueItemId: string; status: string; errorCode?: string; context?: Record<string, unknown> }> }> };
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    const reservation = await run('resume-context-reservation', () => service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'resume-context-device', shiftId: 'resume-context', entityType: 'citation', requestedSize: 1 }));
    await run('resume-context-close', () => service.closeNumberingReservation(reservation.reservationId));
    await run('resume-context-cross-batch-seed', () => service.submitSyncBatch({
      orgUnitId: 'org-a', deviceId: 'resume-context-device', deviceBatchId: 'resume-context-seed', items: [
        { queueItemId: 'resume-cross-original', entityType: 'citation', localEntityId: 'local-resume-cross-original', idempotencyKey: 'resume-cross-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
      ],
    }));
    const input = { orgUnitId: 'org-a', deviceId: 'resume-context-device', deviceBatchId: 'resume-context-batch', items: [
      { queueItemId: 'resume-expired-item', entityType: 'citation', localEntityId: 'local-resume-expired', idempotencyKey: 'resume-expired-key', payloadHash: hash, payloadJson: {}, reservedNumber: reservation.startNumber, reservationId: reservation.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
      { queueItemId: 'resume-cross-duplicate', entityType: 'citation', localEntityId: 'local-resume-cross-duplicate', idempotencyKey: 'resume-cross-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
      { queueItemId: 'resume-transient-item', entityType: 'citation', localEntityId: 'local-resume-transient', idempotencyKey: 'resume-transient-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const first = await run('resume-context-first', () => service.submitSyncBatch(input));
    expect(first.receipt).toMatchObject({ status: 'open', items: [
      { status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', context: { conflictId: expect.any(String) } },
      { status: 'applied', context: { originalQueueItemId: 'resume-cross-original' } },
      { status: 'received', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' },
    ] });
    expect(first.duplicateItems).toBe(1);
    fail = false;
    const resumed = await run('resume-context-second', () => service.submitSyncBatch(input));
    const durable = await run('resume-context-read', () => service.getSyncBatchReceipt(input.deviceId, input.deviceBatchId));
    expect(resumed.duplicateItems).toBe(1);
    expect(resumed.items[1]).toMatchObject({ queueItemId: 'resume-cross-duplicate', status: 'applied', context: { originalQueueItemId: 'resume-cross-original' } });
    expect(resumed.items[0]).toMatchObject({ queueItemId: 'resume-expired-item', status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', context: { conflictId: expect.any(String), allowedActions: expect.any(Array) } });
    expect(durable.items[0]).toMatchObject({ queueItemId: 'resume-expired-item', status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', context: resumed.items[0].context });
    const persistedBody = JSON.parse(Buffer.from(durable.responseBodyBytes!).toString('utf8'));
    expect(persistedBody).toEqual(resumed);
    expect(persistedBody.duplicateItems).toBe(1);
  }, 60_000);

  it('binds PostgreSQL K1 and K2 bodies, rejects altered effect context, and replays with K2 headers', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    let fail = true;
    const applier = { apply: vi.fn(async () => {
      if (fail) throw new Error('retryable transport-ledger interruption');
      return { serverEntityId: 'server-ledger-item' };
    }) };
    const append = vi.fn(async () => undefined);
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
        itemApplier: applier, eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
      } as never);
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    const reservation = await run('ledger-reserve', () => service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'transport-ledger-device', shiftId: 'transport-ledger', entityType: 'citation', requestedSize: 2 }));
    const input = { orgUnitId: 'org-a', deviceId: 'transport-ledger-device', deviceBatchId: 'transport-ledger-batch', batchSequence: 1, items: [
      { queueItemId: 'transport-ledger-item', entityType: 'citation', localEntityId: 'local-ledger-item', idempotencyKey: 'transport-ledger-key', payloadHash: hash, payloadJson: {}, reservedNumber: reservation.startNumber, reservationId: reservation.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const send = (requestId: string, key: string, requestBody: unknown, response?: { status: (code: number) => unknown; setHeader: (name: string, value: string) => unknown; getHeaders: () => Record<string, string> }, submission = input) => run(requestId, () => service.submitSyncBatch(submission, { transportIdempotencyKey: key, method: 'POST', path: '/offline-sync/sync-batches', requestBody, ...(response ? { response } : {}) }));
    const first = await send('ledger-k1', 'K1', { ...input, transportMetadata: { delivery: 1 } });
    expect(first.receipt.status).toBe('open');
    const receiptBeforeAltered = await run('ledger-receipt-before', () => service.getSyncBatchReceipt(input.deviceId, input.deviceBatchId));
    const before = await run('ledger-read-before', () => service.getNumberingConsumption(reservation.reservationId));
    for (const altered of [
      { ...input, items: [{ ...input.items[0]!, payloadJson: { altered: true } }] },
      { ...input, items: [{ ...input.items[0]!, reservedNumber: reservation.startNumber + 1 }] },
      { ...input, items: [{ ...input.items[0]!, reservationId: '00000000-0000-4000-8000-0000000000b1' }] },
      { ...input, items: [{ ...input.items[0]!, createdLocallyAt: '2026-09-28T12:01:00.000Z' }] },
    ]) {
      await expect(send('ledger-altered', 'K2', altered, undefined, altered)).rejects.toMatchObject({ status: 409, code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    }
    expect(applier.apply).toHaveBeenCalledOnce();
    expect(append).not.toHaveBeenCalled();
    expect(await run('ledger-receipt-after', () => service.getSyncBatchReceipt(input.deviceId, input.deviceBatchId))).toEqual(receiptBeforeAltered);
    expect(await run('ledger-read-after', () => service.getNumberingConsumption(reservation.reservationId))).toEqual(before);
    const admin = await pg.connectAsAdmin();
    try {
      const bindings = await admin.query<{ transport_key: string; device_batch_id: string }>(`select transport_key,device_batch_id from offline.sync_batch_transport_keys where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, input.deviceId, input.deviceBatchId]);
      expect(bindings.rows).toHaveLength(1);
    } finally { await admin.end(); }
    fail = false;
    const responseHeaders: Record<string, string> = { 'X-Request-Id': '0198d132-0000-7000-8000-000000000002' };
    let replayStatus = 0;
    const response = { status: (code: number) => { replayStatus = code; }, setHeader: (name: string, value: string) => { responseHeaders[name] = value; }, getHeaders: () => ({ 'x-request-id': responseHeaders['X-Request-Id']!, 'x-current-response': 'kept' }) };
    const resumed = await send('ledger-k2', 'K2', { ...input, transportMetadata: { delivery: 2 } }, response);
    expect(resumed).toMatchObject({ receipt: { status: 'closed' }, items: [{ status: 'applied' }] });
    expect(applier.apply).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledOnce();
    expect(replayStatus).toBe(0);
    const replayHeaders: Record<string, string> = { 'X-Request-Id': '0198d132-0000-7000-8000-000000000003' };
    let returnedStatus = 0;
    const replayResponse = { status: (code: number) => { returnedStatus = code; }, setHeader: (name: string, value: string) => { replayHeaders[name] = value; }, getHeaders: () => ({ 'x-request-id': replayHeaders['X-Request-Id']!, 'x-current-response': 'kept' }) };
    await expect(send('ledger-replay', 'K2', { ...input, transportMetadata: { delivery: 2 } }, replayResponse)).resolves.toEqual(resumed);
    expect(returnedStatus).toBe(201);
    expect(replayHeaders['X-Idempotency-Key']).toBe('K2');
    expect(replayHeaders['Idempotency-Replayed']).toBe('true');
    expect(replayHeaders['X-Request-Id']).toBe('0198d132-0000-7000-8000-000000000003');
    expect(replayHeaders['x-request-id']).toEqual(undefined);
    expect(replayHeaders['x-current-response']).toBe('kept');
    await expect(send('ledger-changed', 'K2', { ...input, transportMetadata: { delivery: 3 } })).rejects.toMatchObject({ status: 422 });
  }, 60_000);

  it('serializes simultaneous PostgreSQL submissions of the same open batch to one effect', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    let enterApply!: () => void; let releaseApply!: () => void;
    const entered = new Promise<void>((resolve) => { enterApply = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseApply = resolve; });
    const append = vi.fn(async () => undefined);
    const apply = vi.fn(async () => { enterApply(); await blocked; return { serverEntityId: 'server-same-pg-batch' }; });
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, leaseWaitMs: 100,
        itemApplier: { apply }, eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
      } as never);
    const input = { orgUnitId: 'org-a', deviceId: 'same-pg-open-device', deviceBatchId: 'same-pg-open-batch', items: [
      { queueItemId: 'same-pg-open-item', entityType: 'citation', localEntityId: 'local-same-pg-open', idempotencyKey: 'same-pg-open-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const run = (requestId: string) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(input));
    const first = run('same-pg-open-first');
    await entered;
    const second = run('same-pg-open-second').then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );
    let secondOutcome: Awaited<typeof second> | undefined;
    const admin = await pg.connectAsAdmin();
    try {
      secondOutcome = await second;
      expect(secondOutcome.status === 'fulfilled' ? secondOutcome.value : secondOutcome.reason).toMatchObject({ status: 503, code: 'OFFLINE_SYNC:BATCH:in-progress' });
      const liveLease = await admin.query<{ count: number }>(`select count(*)::int as count from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and status='open' and lease_token is not null and lease_expires_at>clock_timestamp()`, [tenantA, input.deviceId, input.deviceBatchId]);
      expect(liveLease.rows[0]?.count).toBe(1);
    } finally { releaseApply(); await admin.end(); }
    const results = await Promise.allSettled([first]);
    expect(apply).toHaveBeenCalledOnce();
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { receipt: { status: 'closed' } } });
    expect(secondOutcome?.status).toBe('rejected');
    if (secondOutcome?.status === 'rejected') {
      expect(secondOutcome.reason).toMatchObject({ status: 503, code: 'OFFLINE_SYNC:BATCH:in-progress' });
      expect((secondOutcome.reason as HttpException).getResponse()).toEqual({
        statusCode: 503,
        errorCode: 'OFFLINE_SYNC:BATCH:in-progress',
        message: 'Batch is in progress.',
        retryable: true,
      });
    }
    expect(append).toHaveBeenCalledOnce();
    const receipt = await run('same-pg-open-final-read');
    const firstOutcome = results[0];
    if (firstOutcome?.status !== 'fulfilled') throw new Error('First batch did not complete');
    expect(receipt).toEqual(firstOutcome.value);
    const verify = await pg.connectAsAdmin();
    try {
      const attempts = await verify.query(`select queue_item_id from offline.sync_item_attempts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, input.deviceId, input.deviceBatchId]);
      const receipts = await verify.query(`select queue_item_id from offline.sync_item_receipts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, input.deviceId, input.deviceBatchId]);
      expect(attempts.rows).toEqual([]);
      expect(receipts.rows).toEqual([{ queue_item_id: 'same-pg-open-item' }]);
    } finally { await verify.end(); }
  }, 60_000);

  it('fences a stale PostgreSQL holder by captured lease token and generation before a resumed owner applies the next item', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    let heldTransaction!: () => void; let releaseTransaction!: () => void;
    const transactionHeld = new Promise<void>((resolve) => { heldTransaction = resolve; });
    const transactionGate = new Promise<void>((resolve) => { releaseTransaction = resolve; });
    let originalToken: string | undefined; let originalGeneration: string | undefined;
    const apply = vi.fn(async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` }));
    const append = vi.fn(async (trx: { query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }, event: { entityId: string }) => {
      if (event.entityId === 'server-stale-holder-first-item') {
        const before = await trx.query<{ lease_token: string; lease_generation: string }>(`select lease_token,lease_generation from offline.sync_batches where tenant_id=$1::uuid and device_id='stale-holder-device' and device_batch_id='stale-holder-batch'`, [tenantA]);
        originalToken = before.rows[0]?.lease_token;
        originalGeneration = before.rows[0]?.lease_generation;
        expect(originalToken).toEqual(expect.any(String));
        await trx.query(`update offline.sync_batches set lease_token=gen_random_uuid(),lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()-interval '1 second' where tenant_id=$1::uuid and device_id='stale-holder-device' and device_batch_id='stale-holder-batch'`, [tenantA]);
        heldTransaction();
        await transactionGate;
      }
    });
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, itemApplier: { apply },
        eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
      } as never);
    const input = { orgUnitId: 'org-a', deviceId: 'stale-holder-device', deviceBatchId: 'stale-holder-batch', items: [
      { queueItemId: 'stale-holder-first-item', entityType: 'citation', localEntityId: 'local-stale-first', idempotencyKey: 'stale-holder-first-key', payloadHash: `sha256:${createHash('sha256').update('stale-first').digest('hex')}`, payloadJson: { item: 'first' }, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
      { queueItemId: 'stale-holder-second-item', entityType: 'citation', localEntityId: 'local-stale-second', idempotencyKey: 'stale-holder-second-key', payloadHash: `sha256:${createHash('sha256').update('stale-second').digest('hex')}`, payloadJson: { item: 'second' }, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const run = (requestId: string) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(input));
    const original = run('stale-holder-original');
    await transactionHeld;
    try { await transactionHeld; } finally { releaseTransaction(); }
    await expect(original).rejects.toMatchObject({ status: 409, code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    expect(apply.mock.calls.map(([, current]) => current.queueItemId)).toEqual(['stale-holder-first-item']);
    expect(append).toHaveBeenCalledOnce();
    const takeover = await run('stale-holder-takeover');
    expect(takeover).toMatchObject({ receipt: { status: 'closed' } });
    expect(apply.mock.calls.map(([, current]) => current.queueItemId)).toEqual(['stale-holder-first-item', 'stale-holder-second-item']);
    expect(append).toHaveBeenCalledTimes(2);
    expect(originalToken).toEqual(expect.any(String));
    expect(originalGeneration).toEqual(expect.any(String));
    const verify = await pg.connectAsAdmin();
    try {
      const staleWrite = await verify.query(`update offline.sync_batches set lease_expires_at=clock_timestamp() where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and lease_token=$4::uuid and lease_generation=$5`, [tenantA, input.deviceId, input.deviceBatchId, originalToken, originalGeneration]);
      expect(staleWrite.rowCount).toBe(0);
      const state = await verify.query<{ lease_generation: string; status: string }>(`select lease_generation,status from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`, [tenantA, input.deviceId, input.deviceBatchId]);
      expect(state.rows).toEqual([{ lease_generation: String(Number(originalGeneration) + 2), status: 'closed' }]);
      const items = await verify.query<{ id: string; status: string }>(`select id,status from offline.sync_queue_items where tenant_id=$1::uuid and id in ('stale-holder-first-item','stale-holder-second-item') order by id`, [tenantA]);
      expect(items.rows).toEqual([{ id: 'stale-holder-first-item', status: 'applied' }, { id: 'stale-holder-second-item', status: 'applied' }]);
    } finally { await verify.end(); }
  }, 60_000);

  it('continues after a post-migration E6 queue collision without applying or rewriting that legacy row', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const applier = { apply: vi.fn(async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` })) };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      { now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: applier, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } } as never);
    const input = { orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'post-migration-e6-collision', items: [
      { queueItemId: 'legacy-item', entityType: 'citation', localEntityId: 'local-legacy', idempotencyKey: 'legacy-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
      { queueItemId: 'after-e6-collision', entityType: 'citation', localEntityId: 'local-after-e6', idempotencyKey: 'after-e6-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const result = await contexts.runWithRequestContext({ requestId: 'ctg9-post-0002-e6-collision', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(input));
    expect(result.receipt.items).toMatchObject([
      { queueItemId: 'legacy-item', status: 'rejected', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' },
      { queueItemId: 'after-e6-collision', status: 'applied' },
    ]);
    expect(applier.apply.mock.calls.map(([, current]) => current.queueItemId)).toEqual(['after-e6-collision']);
    const admin = await pg.connectAsAdmin();
    try {
      const preserved = await admin.query(`select id,status,payload_hash,identity_mode from offline.sync_queue_items where tenant_id=$1::uuid and id='legacy-item'`, [tenantA]);
      expect(preserved.rows).toEqual([{ id: 'legacy-item', status: 'received', payload_hash: hash, identity_mode: 'e6' }]);
      const attempt = await admin.query(`select status,error_code from offline.sync_item_attempts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and queue_item_id='legacy-item'`, [tenantA, input.deviceId, input.deviceBatchId]);
      expect(attempt.rows).toEqual([{ status: 'rejected', error_code: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }]);
    } finally { await admin.end(); }
  }, 60_000);

  it('lazily backfills an E6 batch and its item receipt when the E6 row appeared after 0002', async () => {
    const lazyPayloadHash = `sha256:${createHash('sha256').update(JSON.stringify({ lazyE6: 'unique-after-migration' })).digest('hex')}`;
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query(`insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,status,created_locally_at,identity_mode)
        values ('lazy-e6-item',$1::uuid,'lazy-e6-batch','org-a','business-agent','lazy-e6-device','citation',
                'local-lazy-e6','lazy-e6-key',$2,'{}'::jsonb,'received','2026-09-28T12:00:00Z','e6')`, [tenantA, lazyPayloadHash]);
    } finally { await admin.end(); }
    const ack = { batchId: 'lazy-e6-batch', acceptedItems: 1, duplicateItems: 0, conflicts: [], items: [] };
    const legacy = { lookup: vi.fn(async (decision: { requestFingerprint: string }) => ({
      status: 'completed', requestFingerprint: decision.requestFingerprint, statusCode: 201, body: ack,
      headers: { 'x-lazy-e6-ack': 'preserved' }, expiresAt: Date.now() + 60_000,
    })), reserve: vi.fn(), persistResponse: vi.fn(), clearReservation: vi.fn() };
    const applier = { apply: vi.fn() };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) }, legacyIdempotencyStore: legacy as never,
        itemApplier: applier,
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never);
    const input = { orgUnitId: 'org-a', deviceId: 'lazy-e6-device', deviceBatchId: 'lazy-e6-batch', items: [
      { queueItemId: 'lazy-e6-item', entityType: 'citation', localEntityId: 'local-lazy-e6', idempotencyKey: 'lazy-e6-key', payloadHash: lazyPayloadHash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' },
    ] };
    const contexts = moduleRef.get(RequestContextMutator);
    await expect(contexts.runWithRequestContext({ requestId: 'ctg9-lazy-e6', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(input))).resolves.toEqual(ack);
    expect(legacy.lookup).toHaveBeenCalledOnce();
    expect(applier.apply).not.toHaveBeenCalled();
    const verify = await pg.connectAsAdmin();
    try {
      const header = await verify.query(`select status from offline.sync_batches where tenant_id=$1::uuid and device_id='lazy-e6-device' and device_batch_id='lazy-e6-batch'`, [tenantA]);
      const receipt = await verify.query(`select status from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key='lazy-e6-key'`, [tenantA]);
      expect(header.rows).toEqual([{ status: 'legacy_closed_unverified' }]);
      expect(receipt.rows).toEqual([{ status: 'received' }]);
    } finally { await verify.end(); }
  }, 60_000);

  it('records PostgreSQL conflict evidence and allowed actions, rejects a forbidden action, and persists resolution', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const detector = { detect: vi.fn(async () => ({ suspected: true, pairs: [{ firstItemId: 'conflict-first', secondItemId: 'conflict-second' }] })) };
    const resolver = {
      allowedActions: vi.fn(async () => ['manual-review'] as const),
      resolve: vi.fn(async (_trx: unknown, conflictId: string) => ({
        conflictId, queueItemId: 'conflict-second', localEntityId: 'local-conflict-second', payloadHash: hash,
        conflictType: 'concurrency', description: 'resolved by host', status: 'resolved',
        resolution: 'manual-review', resolvedBy: 'actor-a', resolvedAt: '2026-09-28T12:00:00.000Z',
      })),
    };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      { now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150, concurrencyWindowMinutes: 30 }) },
        itemApplier: { apply: async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
        concurrencyDetector: detector, conflictResolver: resolver } as never) as OfflineSyncService & {
          getSyncItemReceipt(key: string): Promise<{ status: string; context?: Record<string, unknown> }>;
        };
    const submit = (deviceId: string, batchId: string, queueItemId: string, key: string) => ({ orgUnitId: 'org-a', deviceId, deviceBatchId: batchId,
      items: [{ queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`, idempotencyKey: key,
        payloadHash: `sha256:${createHash('sha256').update(queueItemId).digest('hex')}`, payloadJson: { queueItemId }, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
    const run = <T>(requestId: string, action: () => Promise<T>) => contexts.runWithRequestContext({ requestId, tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, action);
    await run('ctg9-conflict-first', () => service.submitSyncBatch(submit('conflict-device-a', 'conflict-batch-a', 'conflict-first', 'conflict-first-key')));
    await run('ctg9-conflict-second', () => service.submitSyncBatch(submit('conflict-device-b', 'conflict-batch-b', 'conflict-second', 'conflict-second-key')));
    const firstReceipt = await run('ctg9-conflict-read', () => service.getSyncItemReceipt('conflict-first-key'));
    expect(firstReceipt).toMatchObject({ status: 'conflict', context: { relatedQueueItemId: 'conflict-second', allowedActions: ['manual-review'] } });
    const conflictId = firstReceipt.context?.conflictId as string;
    await expect(run('ctg9-conflict-forbidden', () => service.resolveConflict(conflictId, { resolution: 'device-wins' }))).rejects.toMatchObject({ status: 409 });
    expect(resolver.resolve).not.toHaveBeenCalled();
    await expect(run('ctg9-conflict-permitted', () => service.resolveConflict(conflictId, { resolution: 'manual-review' }))).resolves.toMatchObject({ status: 'resolved', resolution: 'manual-review' });
    expect(resolver.resolve).toHaveBeenCalledOnce();
    const admin = await pg.connectAsAdmin();
    try {
      const evidence = await admin.query<{ queue_item_id: string; related_queue_item_id: string; allowed_actions: string[] }>(`select distinct on (queue_item_id) queue_item_id,related_queue_item_id,allowed_actions from offline.sync_conflict_evidence where tenant_id=$1::uuid and queue_item_id in ('conflict-first','conflict-second') order by queue_item_id,created_at desc`, [tenantA]);
      expect(evidence.rows).toEqual(expect.arrayContaining([
        { queue_item_id: 'conflict-first', related_queue_item_id: 'conflict-second', allowed_actions: ['manual-review'] },
        { queue_item_id: 'conflict-second', related_queue_item_id: 'conflict-first', allowed_actions: ['manual-review'] },
      ]));
      const saved = await admin.query<{ status: string; resolution: string }>(`select status,resolution from offline.sync_conflicts where tenant_id=$1::uuid and id=$2::uuid`, [tenantA, conflictId]);
      expect(saved.rows).toEqual([{ status: 'resolved', resolution: 'manual-review' }]);
    } finally { await admin.end(); }
  }, 60_000);

  it('serializes item consumption with a concurrent reservation close', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    let enteredApply!: () => void;
    let releaseApply!: () => void;
    const entered = new Promise<void>((resolve) => { enteredApply = resolve; });
    const held = new Promise<void>((resolve) => { releaseApply = resolve; });
    const service = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
      now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 60_000 }) },
      itemApplier: { apply: async () => { enteredApply(); await held; return { serverEntityId: 'server-reservation-race' }; } },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    } as never) as OfflineSyncService & {
      reserveNumbering(input: { orgUnitId: string; deviceId: string; shiftId: string; entityType: string; requestedSize: number }): Promise<{ reservationId: string; startNumber: number }>;
      getNumberingConsumption(id: string): Promise<{ status: string; consumption: Array<{ status: string; serverEntityId: string | null }> }>;
    };
    const reservation = await contexts.runWithRequestContext({ requestId: 'ctg9-reservation-race-create', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'reservation-race-device', shiftId: 'reservation-race', entityType: 'citation', requestedSize: 1 }));
    const batch = { orgUnitId: 'org-a', deviceId: 'reservation-race-device', deviceBatchId: 'reservation-race-batch', items: [{
      queueItemId: 'reservation-race-item', entityType: 'citation', localEntityId: 'local-reservation-race',
      idempotencyKey: 'reservation-race-key', payloadHash: hash, payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z',
      reservedNumber: reservation.startNumber, reservationId: reservation.reservationId,
    }] };
    const apply = contexts.runWithRequestContext({ requestId: 'ctg9-reservation-race-apply', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch(batch));
    await entered;
    const closing = contexts.runWithRequestContext({ requestId: 'ctg9-reservation-race-close', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.closeNumberingReservation(reservation.reservationId));
    const admin = await pg.connectAsAdmin();
    try {
      let blocked = false;
      const deadline = Date.now() + 3_000;
      while (!blocked && Date.now() < deadline) {
        const waits = await admin.query<{ waiting: number }>(`select count(*)::int as waiting from pg_stat_activity where wait_event_type='Lock' and query ilike '%offline.numbering_reservations%'`);
        blocked = Number(waits.rows[0]?.waiting ?? 0) > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      releaseApply();
      const [applied, closed] = await Promise.all([apply, closing]);
      expect(applied.items[0]).toMatchObject({ status: 'applied' });
      expect(closed.status).toBe('consumed');
      expect(await contexts.runWithRequestContext({ requestId: 'ctg9-reservation-race-read', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.getNumberingConsumption(reservation.reservationId))).toMatchObject({
        status: 'consumed', consumption: [{ status: 'applied', serverEntityId: 'server-reservation-race' }],
      });
    } finally { releaseApply(); await admin.end(); }
  }, 60_000);

  it('does not invent a PostgreSQL concurrency window when policy omits it', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const detector = { detect: vi.fn() };
    const service = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
        itemApplier: { apply: async () => ({ serverEntityId: 'server-no-window' }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
        concurrencyDetector: detector,
      } as never);
    await contexts.runWithRequestContext({ requestId: 'ctg9-no-window-policy', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, () => service.submitSyncBatch({
      orgUnitId: 'org-a', deviceId: 'no-window-device', deviceBatchId: 'no-window-batch', items: [{ queueItemId: 'no-window-item',
        entityType: 'citation', localEntityId: 'local-no-window', idempotencyKey: 'no-window-key', payloadHash: hash,
        payloadJson: {}, createdLocallyAt: '2026-09-28T12:00:00.000Z' }],
    }));
    expect(detector.detect).not.toHaveBeenCalled();
  }, 60_000);

  it('projects blocked, expired, and claimed-local reservation numbers and preserves the claimed tail on cancel', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const store = new PostgresOfflineSyncStore(moduleRef);
    const scope = { tenantId: tenantA, actorId: 'actor-a', ctg9: true } as never;
    await contexts.runWithRequestContext({ requestId: 'ctg9-number-projection', tenantId: tenantA, actorId: 'actor-a', startedAt: new Date('2026-09-28T12:00:00.000Z') }, async () => {
      const reservation = await store.reserveNumbering(scope, { orgUnitId: 'org-a', deviceId: 'projection-device', shiftId: 'projection-shift', entityType: 'citation', series: 'C', requestedSize: 3 }, '2026-09-28T12:00:00.000Z', '2099-09-29T12:00:00.000Z');
      await store.reconcileNumberingReservation(scope, reservation.reservationId, { claimedNumbers: [reservation.startNumber + 1] }, '2026-09-28T12:00:00.000Z');
      const afterClaim = await store.getNumberingConsumption(scope, reservation.reservationId);
      expect(afterClaim.consumption.map((entry) => entry.status)).toEqual(['available', 'claimed-locally', 'available']);
      const cancelled = await store.cancelNumberingReservation(scope, reservation.reservationId, {}, '2026-09-28T12:00:00.000Z');
      expect(cancelled.status).toBe('cancelled');
      const admin = await pg.connectAsAdmin();
      try {
        const range = await admin.query<{ next_number: string }>(`select next_number from offline.numbering_ranges where tenant_id=$1::uuid and id=$2::uuid`, [tenantA, reservation.rangeId]);
        expect(Number(range.rows[0]?.next_number)).toBe(reservation.startNumber + 2);
        await admin.query(`update offline.numbering_reservations set status='blocked' where tenant_id=$1::uuid and id=$2::uuid`, [tenantA, reservation.reservationId]);
      } finally { await admin.end(); }
      expect((await store.getNumberingConsumption(scope, reservation.reservationId)).consumption.map((entry) => entry.status)).toEqual(['blocked', 'claimed-locally', 'blocked']);
      const expired = await store.reserveNumbering(scope, { orgUnitId: 'org-a', deviceId: 'expired-projection-device', shiftId: 'expired-projection-shift', entityType: 'citation', series: 'C', requestedSize: 2, validUntil: '2026-09-27T12:00:00.000Z' }, '2026-09-28T12:00:00.000Z', '2026-09-29T12:00:00.000Z');
      expect((await store.getNumberingConsumption(scope, expired.reservationId)).consumption.map((entry) => entry.status)).toEqual(['expired', 'expired']);

      const service = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {
        now: () => '2026-09-28T12:00:00.000Z', policyResolver: { resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 86_400_000 }) },
        itemApplier: { apply: async () => ({ serverEntityId: 'server-tail-reuse' }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      } as never) as OfflineSyncService & { closeNumberingReservation(id: string): Promise<{ status: string }>; settleNumberingReservation(id: string): Promise<{ status: string }> };
      const oldTailReservation = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'tail-reuse-device', shiftId: 'tail-old', entityType: 'citation', requestedSize: 3 });
      await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'tail-reuse-device', deviceBatchId: 'tail-old-apply', items: [{ queueItemId: 'tail-old-applied', entityType: 'citation', localEntityId: 'tail-old-applied-local', idempotencyKey: 'tail-old-applied-key', payloadHash: hash, payloadJson: {}, reservedNumber: oldTailReservation.startNumber, reservationId: oldTailReservation.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
      await service.cancelNumberingReservation(oldTailReservation.reservationId);
      const replacement = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'tail-reuse-device', shiftId: 'tail-new', entityType: 'citation', requestedSize: 2 });
      expect(replacement.startNumber).toBe(oldTailReservation.startNumber + 1);
      const staleTail = await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'tail-reuse-device', deviceBatchId: 'tail-old-id-rejected', items: [{ queueItemId: 'tail-old-id-item', entityType: 'citation', localEntityId: 'tail-old-id-local', idempotencyKey: 'tail-old-id-key', payloadHash: hash, payloadJson: {}, reservedNumber: replacement.startNumber, reservationId: oldTailReservation.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
      expect(staleTail.items[0]).toMatchObject({ status: 'rejected', errorCode: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE', context: { number: replacement.startNumber, reservationId: oldTailReservation.reservationId } });
      const tail = await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'tail-reuse-device', deviceBatchId: 'tail-new-submit', items: [{ queueItemId: 'tail-new-item', entityType: 'citation', localEntityId: 'tail-new-local', idempotencyKey: 'tail-new-key', payloadHash: hash, payloadJson: {}, reservedNumber: replacement.startNumber, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
      expect(tail.items[0]).toMatchObject({ queueItemId: 'tail-new-item', status: 'applied' });

      const closing = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'projection-terminal-device', shiftId: 'projection-terminal', entityType: 'citation', requestedSize: 3 });
      await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'projection-terminal-device', deviceBatchId: 'projection-terminal-apply', items: [{ queueItemId: 'projection-terminal-applied', entityType: 'citation', localEntityId: 'projection-terminal-local', idempotencyKey: 'projection-terminal-key', payloadHash: hash, payloadJson: {}, reservedNumber: closing.startNumber, reservationId: closing.reservationId, createdLocallyAt: '2026-09-28T12:00:00.000Z' }] });
      await store.reconcileNumberingReservation(scope, closing.reservationId, { claimedNumbers: [closing.startNumber + 1] }, '2026-09-28T12:00:00.000Z');
      expect((await service.closeNumberingReservation(closing.reservationId)).status).toBe('consumed');
      expect((await store.getNumberingConsumption(scope, closing.reservationId)).consumption.map((entry) => entry.status)).toEqual(['applied', 'claimed-locally', 'expired']);
      const settling = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'projection-settle-device', shiftId: 'projection-settle', entityType: 'citation', requestedSize: 2 });
      await store.reconcileNumberingReservation(scope, settling.reservationId, { claimedNumbers: [settling.startNumber] }, '2026-09-28T12:00:00.000Z');
      expect((await service.settleNumberingReservation(settling.reservationId)).status).toBe('consumed');
      expect((await store.getNumberingConsumption(scope, settling.reservationId)).consumption.map((entry) => entry.status)).toEqual(['claimed-locally', 'expired']);
      const race = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'projection-race-device', shiftId: 'projection-race', entityType: 'citation', requestedSize: 3 });
      await Promise.all([
        store.reconcileNumberingReservation(scope, race.reservationId, { claimedNumbers: [race.endNumber] }, '2026-09-28T12:00:00.000Z'),
        service.cancelNumberingReservation(race.reservationId),
      ]);
      const raced = await store.getNumberingConsumption(scope, race.reservationId);
      expect(raced.consumption.at(-1)?.status).toMatch(/^(claimed-locally|expired)$/);
      expect(raced.consumption.some((entry) => entry.status === 'available')).toBe(false);
      const reconciledClosed = await service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'projection-reconcile-closed-device', shiftId: 'projection-reconcile-closed', entityType: 'citation', requestedSize: 2 });
      await service.closeNumberingReservation(reconciledClosed.reservationId);
      await store.reconcileNumberingReservation(scope, reconciledClosed.reservationId, { claimedNumbers: [reconciledClosed.startNumber] }, '2026-09-28T12:00:00.000Z');
      expect((await store.getNumberingConsumption(scope, reconciledClosed.reservationId)).consumption.map((entry) => entry.status)).toEqual(['expired', 'expired']);
    });
  }, 60_000);

  it('commits effect, consumption, receipt and final event on one app-role item transaction, with sibling rollback', async () => {
    type ProbeTransaction = {
      query<T extends Record<string, unknown> = Record<string, unknown>>(
        statement: string,
        values?: unknown[],
      ): Promise<{ rows: T[] }>;
    };
    const itemByTransaction = new WeakMap<object, string>();
    const transactions = new Map<string, object>();
    const writeEvent = async (trx: ProbeTransaction) => {
      const queueItemId = itemByTransaction.get(trx);
      expect(queueItemId).toEqual(expect.any(String));
      expect(trx).toBe(transactions.get(queueItemId!));
      await trx.query(
        `insert into offline.ctg9_item_effect_probe
        (tenant_id,queue_item_id,phase,transaction_id)
        values ($1::uuid,$2,'event',txid_current())`,
        [tenantA, queueItemId],
      );
      if (queueItemId === 'atomic-event-fail') throw new Error('event append failed');
    };
    const append = vi.fn(writeEvent);
    const appendMany = vi.fn(async (trx: ProbeTransaction) => writeEvent(trx));
    const applier = {
      apply: vi.fn(async (trx: ProbeTransaction, item: { queueItemId: string }) => {
        const session = await trx.query<{ who: string; isolation: string; tenant: string }>(`
          select current_user as who, current_setting('transaction_isolation') as isolation,
                 current_setting('app.tenant_id',true) as tenant`);
        expect(session.rows[0]).toEqual({
          who: 'stynx_app',
          isolation: 'read committed',
          tenant: tenantA,
        });
        itemByTransaction.set(trx, item.queueItemId);
        transactions.set(item.queueItemId, trx);
        await trx.query(
          `insert into offline.ctg9_item_effect_probe
          (tenant_id,queue_item_id,phase,transaction_id)
          values ($1::uuid,$2,'effect',txid_current())`,
          [tenantA, item.queueItemId],
        );
        if (item.queueItemId === 'atomic-deadlock') {
          await trx.query(`do $$ begin
            raise exception 'forced deadlock after effect write' using errcode='40P01';
          end $$`);
        }
        return { serverEntityId: `server-${item.queueItemId}` };
      }),
    };
    const service = new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      {
        now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: {
          resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 60_000 }),
        },
        itemApplier: applier,
        eventPort: { appendInTransaction: append, appendManyInTransaction: appendMany },
      } as never,
    ) as OfflineSyncService & {
      getNumberingConsumption(id: string): Promise<{
        consumption: Array<{ number: number; status: string; serverEntityId: string | null }>;
      }>;
      getSyncItemReceipt(key: string): Promise<{ status: string; errorCode?: string }>;
      getSyncBatchReceipt(
        deviceId: string,
        deviceBatchId: string,
      ): Promise<{ status: string; responseStatus: number | null }>;
    };
    const contexts = moduleRef.get(RequestContextMutator);
    const item = (queueItemId: string, number: number) => {
      const payloadJson = { atomicProbe: queueItemId };
      return {
        queueItemId,
        entityType: 'citation',
        localEntityId: `local-${queueItemId}`,
        idempotencyKey: `key-${queueItemId}`,
        payloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payloadJson)).digest('hex')}`,
        payloadJson,
        reservedNumber: number,
        createdLocallyAt: '2026-09-28T12:00:00.000Z',
      };
    };
    await contexts.runWithRequestContext(
      {
        requestId: 'ctg9-atomic-real-postgres',
        tenantId: tenantA,
        actorId: 'actor-a',
        startedAt: new Date('2026-09-28T12:00:00.000Z'),
      },
      async () => {
        const reservation = await service.reserveNumbering({
          orgUnitId: 'org-a',
          deviceId: 'atomic-device',
          shiftId: 'atomic-shift',
          entityType: 'citation',
          requestedSize: 3,
        });
        const [success, eventFail, deadlock] = [
          reservation.startNumber,
          reservation.startNumber + 1,
          reservation.startNumber + 2,
        ];
        const result = await service.submitSyncBatch({
          orgUnitId: 'org-a',
          deviceId: 'atomic-device',
          deviceBatchId: 'atomic-partial',
          items: [item('atomic-success', success), item('atomic-event-fail', eventFail)],
        });
        expect(result.items[0]).toMatchObject({ status: 'applied' });
        expect(result.items[1]).not.toMatchObject({ status: 'applied' });
        expect(await service.getSyncItemReceipt('key-atomic-success')).toMatchObject({
          status: 'applied',
        });
        expect(await service.getSyncItemReceipt('key-atomic-event-fail')).not.toMatchObject({
          status: 'applied',
        });
        await service
          .submitSyncBatch({
            orgUnitId: 'org-a',
            deviceId: 'atomic-device',
            deviceBatchId: 'atomic-deadlock-batch',
            items: [item('atomic-deadlock', deadlock)],
          })
          .catch(() => undefined);
        expect(await service.getSyncItemReceipt('key-atomic-deadlock')).toMatchObject({
          status: 'received',
        });
        expect(
          await service.getSyncBatchReceipt('atomic-device', 'atomic-deadlock-batch'),
        ).toMatchObject({ status: 'open', responseStatus: null });
        const consumption = (await service.getNumberingConsumption(reservation.reservationId))
          .consumption;
        expect(consumption.find((entry) => entry.number === success)).toMatchObject({
          status: 'applied',
          serverEntityId: 'server-atomic-success',
        });
        expect(consumption.find((entry) => entry.number === eventFail)).not.toMatchObject({
          status: 'applied',
        });
        expect(consumption.find((entry) => entry.number === deadlock)).not.toMatchObject({
          status: 'applied',
        });
      },
    );
    const admin = await pg.connectAsAdmin();
    try {
      const probe = await admin.query<{
        queue_item_id: string;
        phase: string;
        transaction_id: string;
      }>(
        `
        select queue_item_id,phase,transaction_id from offline.ctg9_item_effect_probe
        where tenant_id=$1::uuid order by queue_item_id,phase`,
        [tenantA],
      );
      expect(probe.rows).toEqual([
        {
          queue_item_id: 'atomic-success',
          phase: 'effect',
          transaction_id: probe.rows[0]?.transaction_id,
        },
        {
          queue_item_id: 'atomic-success',
          phase: 'event',
          transaction_id: probe.rows[0]?.transaction_id,
        },
      ]);
      expect(append.mock.calls.length + appendMany.mock.calls.length).toBe(2);
      expect(applier.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ queueItemId: 'atomic-success' }),
        expect.anything(),
      );
    } finally {
      await admin.end();
    }
  }, 60_000);

  it('rejects an enclosing transaction before creating a batch or item row', async () => {
    const contexts = moduleRef.get(RequestContextMutator);
    const database = moduleRef.get(Database);
    const service = new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) },
      {
        now: () => '2026-09-28T12:00:00.000Z',
        policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) },
      } as never,
    );
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'held-command',
      items: [
        {
          queueItemId: 'held-item',
          entityType: 'citation',
          localEntityId: 'local-held',
          idempotencyKey: 'held-key',
          payloadHash: `sha256:${'b'.repeat(64)}`,
          payloadJson: {},
          createdLocallyAt: '2026-09-28T12:00:00.000Z',
        },
      ],
    };
    await contexts.runWithRequestContext(
      {
        requestId: 'ctg9-held',
        tenantId: tenantA,
        actorId: 'actor-a',
        startedAt: new Date('2026-09-28T12:00:00.000Z'),
      },
      async () => {
        await database.tx(
          async () => {
            await expect(service.submitSyncBatch(input)).rejects.toMatchObject({
              code: expect.stringMatching(/TRANSACTION|CONNECTION/),
            });
          },
          { role: 'app' },
        );
      },
    );
    const admin = await pg.connectAsAdmin();
    try {
      const rows = await admin.query(
        `select id from offline.sync_queue_items where tenant_id=$1::uuid and id='held-item'`,
        [tenantA],
      );
      expect(rows.rows).toEqual([]);
    } finally {
      await admin.end();
    }
  }, 60_000);

  it('refuses hidden second connections in strict independent item mode without exhausting the pool', async () => {
    const database = moduleRef.get(Database) as Database & {
      txIndependent<T>(
        fn: (trx: unknown) => Promise<T>,
        options?: Record<string, unknown>,
      ): Promise<T>;
    };
    const run = (index: number) =>
      database.withRequestContext({ tenantId: tenantA, actorId: `actor-${index}` }, async () => {
        await expect(
          database.txIndependent(
            async () => {
              await database.withRequestContext(
                { tenantId: tenantA, actorId: `actor-${index}` },
                async () => {
                  await database.tx(async () => undefined, { role: 'app' });
                },
              );
            },
            { role: 'app', isolation: 'read committed', strictItemMode: true },
          ),
        ).rejects.toMatchObject({ code: expect.stringMatching(/CONNECTION|TRANSACTION/) });
      });
    await Promise.all([run(1), run(2)]);
  }, 10_000);

  it('forces RLS on every added offline table and hides both legacy and new rows across tenants', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      const tables = await admin.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(`
        select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
        join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relkind='r'
        order by c.relname`);
      expect(tables.rows.length).toBeGreaterThan(4);
      expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
      await admin.query('begin');
      await admin.query('set local role stynx_app');
      await admin.query(`select set_config('app.tenant_id',$1,true)`, [tenantB]);
      const hidden = await admin.query(
        `select id from offline.sync_queue_items where id='legacy-item'`,
      );
      expect(hidden.rows).toEqual([]);
      const service = new OfflineSyncService(
        new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId: tenantB, actorId: 'actor-b' }) },
        { policyResolver: { resolve: async () => ({ maxBatchItems: 150 }) } } as never,
      ) as OfflineSyncService & {
        getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<unknown>;
      };
      const contexts = moduleRef.get(RequestContextMutator);
      await contexts.runWithRequestContext(
        {
          requestId: 'ctg9-cross-tenant',
          tenantId: tenantB,
          actorId: 'actor-b',
          startedAt: new Date('2026-09-28T12:00:00.000Z'),
        },
        async () => {
          await expect(
            service.getSyncBatchReceipt('device-a', 'legacy-batch'),
          ).rejects.toMatchObject({ status: 404 });
        },
      );
      await admin.query('commit');
    } catch (error) {
      await admin.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      await admin.end();
    }
  }, 60_000);
});

describe('OFS 0001-only upgrade guard', () => {
  it('fails with typed upgrade-required 503 before using 1.5.0 E6 against 0001-only PostgreSQL', async () => {
    const old = await createPostgresTestDatabase('stynx_ctg9_0001_only', { useTemplate: false });
    let oldModule: TestingModule | undefined;
    try {
      oldModule = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: old.connectionString('old-owner') },
              app: { connectionString: asRole(old.connectionString('old-app'), 'stynx_app') },
              reader: {
                connectionString: asRole(old.connectionString('old-reader'), 'stynx_reader'),
              },
            },
            migrations: { enabled: true },
          }),
        ],
      }).compile();
      await oldModule.init();
      const admin = await old.connectAsAdmin();
      try {
        await admin.query(await readFile(resolve(migrationDir, '0001_offline_sync.sql'), 'utf8'));
        await admin.query(
          `insert into tenancy.tenants (id,slug,name,is_active,created_at,updated_at)
          values ($1::uuid,'ctg9-old','Old',true,clock_timestamp(),clock_timestamp())`,
          [tenantA],
        );
        await admin.query(
          `insert into offline.numbering_ranges
          (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status)
          values ('10000000-0000-4000-8000-0000000000a1',$1::uuid,'org-a','citation','C',1000,1099,1000,'active')`,
          [tenantA],
        );
      } finally {
        await admin.end();
      }
      const contexts = oldModule.get(RequestContextMutator);
      const store = new PostgresOfflineSyncStore(oldModule);
      const error = await contexts
        .runWithRequestContext(
          {
            requestId: 'ctg9-upgrade-required',
            tenantId: tenantA,
            actorId: 'actor-a',
            startedAt: new Date('2026-09-28T12:00:00.000Z'),
          },
          () =>
            store.reserveNumbering(
              { tenantId: tenantA, actorId: 'actor-a' },
              {
                orgUnitId: 'org-a',
                deviceId: 'device-a',
                shiftId: 'shift-a',
                entityType: 'citation',
                requestedSize: 1,
              },
              '2026-09-28T12:00:00.000Z',
              '2026-09-29T12:00:00.000Z',
            ),
        )
        .catch((cause: unknown) => cause);
      expect((error as Error).constructor.name).toBe('OfflineSyncUpgradeRequiredError');
      expect(error).toMatchObject({ code: 'OFFLINE_SYNC_UPGRADE_REQUIRED' });
      expect((error as { getStatus(): number }).getStatus()).toBe(503);
      const verify = await old.connectAsAdmin();
      try {
        const rows = await verify.query(
          `select id from offline.numbering_reservations where tenant_id=$1::uuid`,
          [tenantA],
        );
        expect(rows.rows).toEqual([]);
      } finally {
        await verify.end();
      }
    } finally {
      await oldModule?.close();
      await old.dispose();
    }
  }, 60_000);
});
