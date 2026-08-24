import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { RequestContextMutator } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import type { SubmitSyncBatchInput, TrustedOfflineSyncScope } from '../../src/types';

const tenantA = '00000000-0000-4000-8000-0000000000a1';
const tenantB = '00000000-0000-4000-8000-0000000000b1';
const rangeA = '10000000-0000-4000-8000-0000000000a1';
const rangeB = '10000000-0000-4000-8000-0000000000b1';
const now = '2026-08-24T12:00:00.000Z';

describe('PostgresOfflineSyncStore', () => {
  let postgres: PostgresTestDatabase | undefined;
  let moduleRef: TestingModule | undefined;
  let contexts: RequestContextMutator;
  let store: PostgresOfflineSyncStore;
  let migration: string;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_offline_sync', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('offline-sync-owner') },
            app: { connectionString: postgres.connectionString('offline-sync-app') },
            reader: { connectionString: postgres.connectionString('offline-sync-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    migration = await readFile(
      resolve(__dirname, '../../migrations/0001_offline_sync.sql'),
      'utf8',
    );
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(migration);
      await admin.query(migration);
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values
           ($1::uuid, 'offline-a', 'Offline A', true, clock_timestamp(), clock_timestamp()),
           ($2::uuid, 'offline-b', 'Offline B', true, clock_timestamp(), clock_timestamp())`,
        [tenantA, tenantB],
      );
      await admin.query(
        `insert into offline.numbering_ranges (
           id, tenant_id, org_unit_id, entity_type, series,
           start_number, end_number, next_number, status
         ) values
           ($1::uuid, $2::uuid, 'org-a', 'crash-record', 'CRASH', 1000, 1099, 1000, 'active'),
           ($3::uuid, $4::uuid, 'org-b', 'crash-record', 'CRASH', 1000, 1099, 1000, 'active')`,
        [rangeA, tenantA, rangeB, tenantB],
      );
    } finally {
      await admin.end();
    }
    contexts = moduleRef.get(RequestContextMutator);
    store = new PostgresOfflineSyncStore(moduleRef);
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('applies idempotently with forced RLS and tenant-leading payload uniqueness', async () => {
    const admin = await postgres!.connectAsAdmin();
    try {
      const rls = await admin.query<{ table_name: string; forced: boolean }>(
        `select c.relname as table_name, c.relforcerowsecurity as forced
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'offline'
            and c.relname in (
              'numbering_ranges', 'numbering_reservations',
              'sync_queue_items', 'sync_conflicts'
            )
          order by c.relname`,
      );
      expect(rls.rows).toHaveLength(4);
      expect(rls.rows.every((row) => row.forced)).toBe(true);
      const indexes = await admin.query<{ indexdef: string }>(
        `select indexdef from pg_indexes
          where schemaname = 'offline' and tablename = 'sync_queue_items'`,
      );
      expect(indexes.rows.some((row) => row.indexdef.includes('(tenant_id, payload_hash)'))).toBe(
        true,
      );
    } finally {
      await admin.end();
    }
  });

  it('reserves entity-scoped ranges atomically inside the trusted tenant context', async () => {
    const reservationA = await runAs({ tenantId: tenantA, actorId: 'agent-a' }, () =>
      store.reserveNumbering(
        { tenantId: tenantA, actorId: 'agent-a' },
        {
          rangeId: rangeA,
          orgUnitId: 'org-a',
          entityType: 'crash-record',
          deviceId: 'device-a',
          shiftId: 'shift-a',
          requestedSize: 10,
        },
        now,
        '2026-08-25T12:00:00.000Z',
      ),
    );
    expect(reservationA).toMatchObject({
      tenantId: tenantA,
      entityType: 'crash-record',
      startNumber: 1000,
      endNumber: 1009,
    });
    await expect(
      runAs({ tenantId: tenantB, actorId: 'agent-b' }, () =>
        store.reserveNumbering(
          { tenantId: tenantB, actorId: 'agent-b' },
          {
            rangeId: rangeA,
            orgUnitId: 'org-a',
            entityType: 'crash-record',
            deviceId: 'device-b',
            shiftId: 'shift-b',
            requestedSize: 1,
          },
          now,
          '2026-08-25T12:00:00.000Z',
        ),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
  });

  it('deduplicates payload hashes per tenant and RLS hides the other tenant', async () => {
    const batchA = batch('a');
    await expect(
      runAs({ tenantId: tenantA, actorId: 'agent-a' }, () =>
        store.submitSyncBatch({ tenantId: tenantA, actorId: 'agent-a' }, batchA, now),
      ),
    ).resolves.toMatchObject({ duplicateItems: 0 });
    await expect(
      runAs({ tenantId: tenantA, actorId: 'agent-a' }, () =>
        store.submitSyncBatch(
          { tenantId: tenantA, actorId: 'agent-a' },
          {
            ...batchA,
            deviceBatchId: 'batch-a-retry',
            items: [
              { ...batchA.items[0]!, queueItemId: 'queue-a-retry', idempotencyKey: 'idem-a-retry' },
            ],
          },
          now,
        ),
      ),
    ).resolves.toMatchObject({ duplicateItems: 1 });
    await expect(
      runAs({ tenantId: tenantB, actorId: 'agent-b' }, () =>
        store.submitSyncBatch({ tenantId: tenantB, actorId: 'agent-b' }, batch('b'), now),
      ),
    ).resolves.toMatchObject({ duplicateItems: 0 });

    const visibleA = await visibleAs(tenantA);
    expect(visibleA).toEqual([{ tenant_id: tenantA }]);
    const visibleB = await visibleAs(tenantB);
    expect(visibleB).toEqual([{ tenant_id: tenantB }]);
  });

  async function visibleAs(tenantId: string): Promise<Array<{ tenant_id: string }>> {
    const client = await postgres!.connectAsAdmin();
    try {
      await client.query('begin');
      await client.query('set local role stynx_app');
      await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await client.query<{ tenant_id: string }>(
        'select tenant_id from offline.sync_queue_items order by id',
      );
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  function runAs<T>(scope: TrustedOfflineSyncScope, work: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      contexts.runWithRequestContext(
        {
          requestId: `request-${scope.actorId}`,
          tenantId: scope.tenantId,
          actorId: scope.actorId,
          startedAt: new Date(now),
        },
        work,
      ),
    );
  }
});

function batch(suffix: string): SubmitSyncBatchInput {
  return {
    orgUnitId: `org-${suffix}`,
    deviceId: `device-${suffix}`,
    deviceBatchId: `batch-${suffix}`,
    items: [
      {
        queueItemId: `queue-${suffix}`,
        entityType: 'crash-record',
        localEntityId: `crash-local-${suffix}`,
        idempotencyKey: `idem-${suffix}`,
        payloadHash: `sha256:${'a'.repeat(64)}`,
        payloadJson: { severity: 'minor' },
        createdLocallyAt: now,
        reservedNumber: 1000,
      },
    ],
  };
}
