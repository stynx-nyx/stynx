import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import {
  CLOCK_TENANT_A,
  CLOCK_TENANT_B,
  CLOCK_ACTOR,
  registerConsumptionClockContracts,
} from '../support/consumption-clock-contract';

describe('UPS-OFS-01 real restricted PostgreSQL consumption operation clock', () => {
  const effects: string[] = [];
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let store: PostgresOfflineSyncStore;
  const run = <T>(tenantId: string, operation: () => Promise<T>) =>
    moduleRef
      .get(RequestContextMutator)
      .runWithRequestContext(
        { requestId: randomUUID(), tenantId, actorId: CLOCK_ACTOR, startedAt: new Date() },
        operation,
      );
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_read_clock', { useTemplate: false });
    await pg.ensureRoleLogin('stynx_reader');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('clock-owner') },
            app: { connectionString: pg.appConnectionString('clock-app') },
            reader: { connectionString: pg.appConnectionString('clock-reader', 'stynx_reader') },
          },
          migrations: { enabled: true },
          retry: false,
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      for (const name of [
        '0001_offline_sync.sql',
        '0002_durable_sync.sql',
        '0003_reservation_idempotency.sql',
        '0004_pending_state_and_conflict_actions.sql',
        '0005_initial_queue_status.sql',
        '0006_nullable_active_reservations.sql',
        '0007_range_administration.sql',
        '0008_import_receipts.sql',
        '0009_numbering_reconciliations.sql',
      ])
        await admin.query(await readFile(resolve(__dirname, '../../migrations', name), 'utf8'));
      await admin.query(
        "insert into tenancy.tenants(id,slug,name)values($1,'clock-a','Clock A'),($2,'clock-b','Clock B')",
        [CLOCK_TENANT_A, CLOCK_TENANT_B],
      );
    } finally {
      await admin.end();
    }
    store = new PostgresOfflineSyncStore(moduleRef);
  }, 60000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60000);
  registerConsumptionClockContracts(() => ({
    store,
    run,
    effects: () => [...effects],
    service: (now, tenantId = CLOCK_TENANT_A) =>
      new OfflineSyncService(
        store,
        { current: () => ({ tenantId, actorId: CLOCK_ACTOR }) },
        {
          now,
          itemApplier: {
            apply: async () => {
              effects.push('apply');
              return { serverEntityId: 'clock-applied-server' };
            },
          },
          eventPort: {
            appendInTransaction: async () => {
              effects.push('event');
            },
            appendManyInTransaction: async () => {
              effects.push('events');
            },
          },
          policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) },
        },
      ),
    snapshot: async (id) => {
      const admin = await pg.connectAsAdmin();
      try {
        const row = (
          await admin.query(
            `select jsonb_build_object(
        'reservation',(select to_jsonb(r) from offline.numbering_reservations r where id=$1),
        'range',(select to_jsonb(r) from offline.numbering_ranges r where id=(select range_id from offline.numbering_reservations where id=$1)),
        'consumption',(select coalesce(jsonb_agg(to_jsonb(c) order by number),'[]'::jsonb) from offline.numbering_consumption c where reservation_id=$1)
      ) as raw`,
            [id],
          )
        ).rows[0];
        return row.raw;
      } finally {
        await admin.end();
      }
    },
  }));
  it('uses direct restricted application login and FORCE RLS independently of owner snapshots', async () => {
    await run(CLOCK_TENANT_A, () =>
      moduleRef.get(Database).tx(async (trx) => {
        const row = (await trx.query('select current_user,session_user')).rows[0];
        expect(row).toEqual({ current_user: 'stynx_app', session_user: 'stynx_app' });
        const tables = await trx.query(
          "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relname in ('numbering_ranges','numbering_reservations','numbering_consumption') order by c.relname",
        );
        expect(tables.rows).toEqual(
          ['numbering_consumption', 'numbering_ranges', 'numbering_reservations'].map(
            (relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true }),
          ),
        );
      }),
    );
  });
});
