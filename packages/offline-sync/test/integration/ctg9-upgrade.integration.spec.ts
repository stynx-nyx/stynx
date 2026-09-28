import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
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
      expect(queueItemId).toBeTruthy();
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
