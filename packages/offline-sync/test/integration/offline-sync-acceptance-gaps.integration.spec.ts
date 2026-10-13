import { readdir, readFile } from 'node:fs/promises';
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
import { OutboxService } from '@stynx-nyx/outbox';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import {
  GAP_AT,
  GAP_TENANT_A,
  GAP_TENANT_B,
  registerOfflineGapContracts,
} from '../support/offline-sync-acceptance-gaps';

// INV-OFFLINE-001: real SQL, direct restricted-role login, tenant/actor context on every connection.
describe('Offline acceptance gap contracts through real PostgreSQL', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let beforeUpgrade: unknown;
  let afterUpgrade: unknown;
  let upgradeHistoryCount: string;
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_161_gaps', { useTemplate: false });
    await pg.ensureRoleLogin('stynx_app');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('gaps-owner') },
            app: { connectionString: pg.appConnectionString('gaps-app'), max: 10 },
            reader: { connectionString: pg.connectionString('gaps-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      const directory = resolve(__dirname, '../../migrations');
      const migrations = (await readdir(directory))
        .filter((name) => /^\d{4}.*\.sql$/u.test(name))
        .sort();
      for (const name of migrations.filter((name) => Number(name.slice(0, 4)) < 9))
        await admin.query(await readFile(resolve(directory, name), 'utf8'));
      await admin.query(
        `insert into tenancy.tenants(id,slug,name) values ($1,'gaps-a','Gaps A'),($2,'gaps-b','Gaps B')`,
        [GAP_TENANT_A, GAP_TENANT_B],
      );
      await admin.query(
        `insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values ('10000000-0000-4000-8000-0000000000d1',$1,'org-a','citation','C',1,100,1,'active')`,
        [GAP_TENANT_A],
      );
      const context = {
        current: () => ({ tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' }),
      };
      const oldService = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef), context, {
        now: () => GAP_AT,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
      });
      await moduleRef.get(RequestContextMutator).runWithRequestContext(
        {
          requestId: 'populated-upgrade',
          tenantId: GAP_TENANT_A,
          actorId: 'authenticated-audit-actor',
          startedAt: new Date(GAP_AT),
        },
        () =>
          oldService.reserveDurableNumbering({
            orgUnitId: 'org-a',
            deviceId: 'populated-upgrade-device',
            shiftId: null,
            entityType: 'citation',
            requestedSize: 2,
          }),
      );
      const capture = async () => ({
        reservations: (
          await admin.query(
            `select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id`,
          )
        ).rows,
        consumption: (
          await admin.query(
            `select to_jsonb(c)::text as bytes from offline.numbering_consumption c order by reservation_id,number`,
          )
        ).rows,
      });
      beforeUpgrade = await capture();
      for (const name of migrations.filter((name) => Number(name.slice(0, 4)) >= 9))
        await admin.query(await readFile(resolve(directory, name), 'utf8'));
      afterUpgrade = await capture();
      upgradeHistoryCount = (
        await admin.query(`select count(*)::text as count from offline.numbering_reconciliations`)
      ).rows[0].count;
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);
  registerOfflineGapContracts(() => {
    let clock = Date.parse(GAP_AT);
    return {
      service: (options = {}, tenantId = GAP_TENANT_A) =>
        new OfflineSyncService(
          new PostgresOfflineSyncStore(moduleRef),
          { current: () => ({ tenantId, actorId: 'authenticated-audit-actor' }) },
          {
            now: () => new Date(clock).toISOString(),
            policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
            ...options,
          },
        ),
      run: (tenantId, operation) =>
        moduleRef.get(RequestContextMutator).runWithRequestContext(
          {
            requestId: 'gaps-contract',
            tenantId,
            actorId: 'authenticated-audit-actor',
            startedAt: new Date(clock),
          },
          operation,
        ),
      appendResolution: async (trx, event) => {
        await new OutboxService(moduleRef.get(Database), {
          dispatchableEntities: [],
        }).appendInTransaction(trx, event);
      },
      tick: () => {
        clock += 1000;
      },
    };
  });
  it('V-13 populated forward upgrade preserves reservation and consumption bytes without inventing historical reconciliations', () => {
    expect(afterUpgrade).toEqual(beforeUpgrade);
    expect(upgradeHistoryCount).toBe('0');
  });
  it('V-13 reconciliation history enforces FORCE RLS, direct restricted login and append-only application grants', async () => {
    const execute = <T>(tenantId: string, operation: () => Promise<T>) =>
      moduleRef.get(RequestContextMutator).runWithRequestContext(
        {
          requestId: 'history-sql',
          tenantId,
          actorId: 'authenticated-audit-actor',
          startedAt: new Date(GAP_AT),
        },
        operation,
      );
    const database = moduleRef.get(Database);
    const query = (tenantId: string, text: string, values: unknown[] = []) =>
      execute(tenantId, () => database.tx((trx) => trx.query(text, values)));
    const flags = await query(
      GAP_TENANT_A,
      `select c.relrowsecurity,c.relforcerowsecurity,current_user::text as role from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='offline' and c.relname='numbering_reconciliations'`,
    );
    expect(flags.rows).toEqual([
      { relrowsecurity: true, relforcerowsecurity: true, role: 'stynx_app' },
    ]);
    expect(
      (
        await query(
          GAP_TENANT_A,
          `select count(*)::text as count from offline.numbering_reconciliations`,
        )
      ).rows,
    ).toEqual([{ count: '4' }]);
    expect(
      (
        await query(
          GAP_TENANT_B,
          `select count(*)::text as count from offline.numbering_reconciliations`,
        )
      ).rows,
    ).toEqual([{ count: '0' }]);
    for (const text of [
      `update offline.numbering_reconciliations set actor_id='tampered'`,
      `delete from offline.numbering_reconciliations`,
    ])
      await expect(query(GAP_TENANT_A, text)).rejects.toMatchObject({ code: '42501' });
    const row = (
      await query(
        GAP_TENANT_A,
        `select to_jsonb(r) as row from offline.numbering_reconciliations r limit 1`,
      )
    ).rows[0]!.row;
    await expect(
      query(
        GAP_TENANT_B,
        `insert into offline.numbering_reconciliations select (jsonb_populate_record(null::offline.numbering_reconciliations,$1::jsonb)).*`,
        [JSON.stringify({ ...row, id: '90000000-0000-4000-8000-0000000000d1' })],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await query(
          GAP_TENANT_A,
          `select count(*)::text as count from offline.numbering_reconciliations`,
        )
      ).rows,
    ).toEqual([{ count: '4' }]);
  });
});
