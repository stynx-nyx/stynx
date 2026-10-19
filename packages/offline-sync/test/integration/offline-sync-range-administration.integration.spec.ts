import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import {
  registerRangeAdministrationContracts,
  RANGE_TENANT_A,
  RANGE_TENANT_B,
  RANGE_AT,
  rangeInput,
} from '../support/range-administration-contract.js';

const sql = (name: string) => readFile(resolve(__dirname, '../../migrations', name), 'utf8');
async function fixture(upgrade = true) {
  const pg = await createPostgresTestDatabase('stynx_ofs_ranges', { useTemplate: false });
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: pg.connectionString('range-owner') },
          app: { connectionString: pg.appConnectionString('range-app'), max: 10 },
          reader: { connectionString: pg.connectionString('range-reader') },
        },
        migrations: { enabled: true },
      }),
    ],
  }).compile();
  await moduleRef.init();
  await pg.ensureRoleLogin('stynx_app');
  const admin = await pg.connectAsAdmin();
  try {
    for (const name of [
      '0001_offline_sync.sql',
      '0002_durable_sync.sql',
      '0003_reservation_idempotency.sql',
      '0004_pending_state_and_conflict_actions.sql',
      '0005_initial_queue_status.sql',
      '0006_nullable_active_reservations.sql',
      ...(upgrade
        ? [
            '0007_range_administration.sql',
            '0008_import_receipts.sql',
            '0009_numbering_reconciliations.sql',
          ]
        : []),
    ]) {
      await admin.query('begin');
      await admin.query(await sql(name));
      await admin.query('commit');
    }
    await admin.query(
      "insert into tenancy.tenants(id,slug,name) values ($1,'range-a','Range A'),($2,'range-b','Range B')",
      [RANGE_TENANT_A, RANGE_TENANT_B],
    );
  } finally {
    await admin.end();
  }
  return { pg, moduleRef };
}

describe('UPS-OFS-09 PostgreSQL range administration and populated0007 upgrade', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  const run = <T>(tenantId: string, actorId: string, operation: () => Promise<T>) =>
    moduleRef
      .get(RequestContextMutator)
      .runWithRequestContext(
        { requestId: randomUUID(), tenantId, actorId, startedAt: new Date() },
        operation,
      );
  const service = (tenantId = RANGE_TENANT_A, actorId = 'audit-actor', now = RANGE_AT) =>
    new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId, actorId }) },
      {
        now: () => now,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) },
        agentResolver: { resolve: async () => 'distinct-business-agent' },
      },
    );
  const call = <T>(operation: (value: OfflineSyncService) => Promise<T>) =>
    run(RANGE_TENANT_A, 'audit-actor', () => operation(service()));
  beforeAll(async () => {
    ({ pg, moduleRef } = await fixture());
  }, 60000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60000);
  registerRangeAdministrationContracts(() => ({ service, run }));

  it('retains historical range/reservation/consumption bytes and exposes only actual old timestamps on0007 upgrade', async () => {
    const old = await fixture(false);
    const admin = await old.pg.connectAsAdmin();
    try {
      const id = randomUUID();
      const reservationId = randomUUID();
      await admin.query(
        "insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,created_at) values ($1,$2,'old','citation','legacy',1,10,3,'active','2025-01-02T03:04:05.678Z')",
        [id, RANGE_TENANT_A],
      );
      await admin.query(
        "insert into offline.numbering_reservations(id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,valid_until,status,idempotency_key,idempotency_fingerprint) values ($1,$2,$3,'old','citation','legacy','historical-agent','old-device','old-shift',1,2,1,'2030-01-01','reserved','old-operation','historical-fingerprint-bytes')",
        [reservationId, RANGE_TENANT_A, id],
      );
      const before = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_ranges r order by id',
        )
      ).rows;
      const reservationBefore = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
        )
      ).rows;
      const consumptionBefore = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_consumption r order by number',
        )
      ).rows;
      await admin.query('begin');
      await admin.query(await sql('0007_range_administration.sql'));
      await admin.query('commit');
      expect(
        (
          await admin.query(
            "select (to_jsonb(r)-array['consumer_attributes','created_by','cancelled_by','cancellation_reason','cancelled_at','creation_key','creation_fingerprint','creation_receipt'])::text as bytes from offline.numbering_ranges r order by id",
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
          )
        ).rows,
      ).toEqual(reservationBefore);
      expect(
        (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_consumption r order by number',
          )
        ).rows,
      ).toEqual(consumptionBefore);
      const oldService = new OfflineSyncService(
        new PostgresOfflineSyncStore(old.moduleRef),
        { current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'now-actor' }) },
        {},
      );
      const result = await old.moduleRef.get(RequestContextMutator).runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId: RANGE_TENANT_A,
          actorId: 'now-actor',
          startedAt: new Date(),
        },
        () => oldService.getNumberingRange(id),
      );
      expect(result).toEqual({
        id,
        tenantId: RANGE_TENANT_A,
        orgUnitId: 'old',
        entityType: 'citation',
        series: 'legacy',
        startNumber: 1,
        endNumber: 10,
        nextNumber: 3,
        status: 'active',
        createdAt: '2025-01-02T03:04:05.678Z',
      });
      expect(result).not.toHaveProperty('createdBy');
      expect(result).not.toHaveProperty('consumerAttributes');
      // Continue the genuinely populated 0007 database through both later migrations.
      const historicalRows = async () => ({
        ranges: (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_ranges r order by id',
          )
        ).rows,
        reservations: (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
          )
        ).rows,
        consumption: (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_consumption r order by number',
          )
        ).rows,
      });
      const populated0007 = await historicalRows();
      for (const name of ['0008_import_receipts.sql', '0009_numbering_reconciliations.sql']) {
        await admin.query('begin');
        await admin.query(await sql(name));
        await admin.query('commit');
      }
      expect(await historicalRows()).toEqual(populated0007);
      expect(
        (await admin.query('select count(*)::int as count from offline.numbering_reconciliations'))
          .rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await admin.query('rollback');
      await admin.end();
      await old.moduleRef.close();
      await old.pg.dispose();
    }
  }, 60000);

  it('reports missing0007 before any range creation and preserves populated ranges', async () => {
    const old = await fixture(false);
    const admin = await old.pg.connectAsAdmin();
    try {
      const oldService = new OfflineSyncService(
        new PostgresOfflineSyncStore(old.moduleRef),
        { current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }) },
        { now: () => RANGE_AT },
      );
      await expect(
        old.moduleRef.get(RequestContextMutator).runWithRequestContext(
          {
            requestId: randomUUID(),
            tenantId: RANGE_TENANT_A,
            actorId: 'actor',
            startedAt: new Date(),
          },
          () => oldService.createNumberingRange(rangeInput('missing007')),
        ),
      ).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_UPGRADE_REQUIRED',
        message: 'Offline-sync migration 0007 is required.',
      });
      expect(
        (await admin.query('select count(*)::int as count from offline.numbering_ranges')).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await admin.end();
      await old.moduleRef.close();
      await old.pg.dispose();
    }
  }, 60000);

  it('guards archived creation receipts, first cancellation facts, allocated bounds and terminal state at the restricted SQL boundary', async () => {
    const value = await call((s) =>
      s.createNumberingRange(
        rangeInput('sql-history', {
          idempotencyKey: 'sql-history-key',
          consumerAttributes: { v: 1 },
        }),
      ),
    );
    const app = new Client({ connectionString: pg.appConnectionString('range-history-app') });
    await app.connect();
    try {
      await app.query(
        "select set_config('app.tenant_id',$1,false),set_config('app.actor_id','audit-actor',false)",
        [RANGE_TENANT_A],
      );
      expect((await app.query('select current_user,session_user')).rows).toEqual([
        { current_user: 'stynx_app', session_user: 'stynx_app' },
      ]);
      await call((s) =>
        s.reserveDurableNumbering({
          orgUnitId: 'org-a',
          entityType: 'citation',
          rangeId: value.id,
          deviceId: 'history-device',
          shiftId: null,
          requestedSize: 1,
        }),
      );
      const before = (
        await app.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_ranges r where id=$1',
          [value.id],
        )
      ).rows;
      for (const [column, content] of [
        ['id', randomUUID()],
        ['org_unit_id', 'changed'],
        ['entity_type', 'changed'],
        ['series', 'changed'],
        ['start_number', 9],
        ['end_number', 100],
        ['created_by', 'forged'],
        ['created_at', '2025-01-01'],
        ['creation_key', 'replacement'],
        ['creation_fingerprint', `sha256:${'f'.repeat(64)}`],
        ['creation_receipt', '{}'],
        ['consumer_attributes', '{}'],
      ])
        await expect(
          app.query(`update offline.numbering_ranges set ${column}=$2 where id=$1`, [
            value.id,
            content,
          ]),
        ).rejects.toMatchObject({ code: 'STY48' });
      await expect(
        app.query('delete from offline.numbering_ranges where id=$1', [value.id]),
      ).rejects.toMatchObject({ code: 'STY49' });
      expect(
        (
          await app.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_ranges r where id=$1',
            [value.id],
          )
        ).rows,
      ).toEqual(before);
      const cancelled = await call((s) =>
        s.cancelNumberingRange(value.id, { reason: 'first-facts' }),
      );
      for (const [column, content] of [
        ['status', 'active'],
        ['cancelled_by', 'forged'],
        ['cancelled_at', '2025-01-01'],
        ['cancellation_reason', 'changed'],
      ])
        await expect(
          app.query(`update offline.numbering_ranges set ${column}=$2 where id=$1`, [
            value.id,
            content,
          ]),
        ).rejects.toMatchObject({ code: 'STY48' });
      expect(await call((s) => s.getNumberingRange(value.id))).toEqual(cancelled);
      await app.query("select set_config('app.tenant_id',$1,false)", [RANGE_TENANT_B]);
      expect(
        (await app.query('select * from offline.numbering_ranges where id=$1', [value.id])).rows,
      ).toEqual([]);
      expect(
        (
          await app.query(
            'update offline.numbering_ranges set next_number=next_number where id=$1',
            [value.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await app.query('delete from offline.numbering_ranges where id=$1', [value.id])).rowCount,
      ).toBe(0);
      await expect(
        app.query(
          "insert into offline.numbering_ranges(tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values ($1,'forged','citation','forged',1,2,1)",
          [RANGE_TENANT_A],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
  });

  it('requires real transaction actor provenance for app SQL, complete administered cancellation and actual-owner import exception', async () => {
    const value = await call((service) => service.createNumberingRange(rangeInput('actor-guard')));
    const app = new Client({ connectionString: pg.appConnectionString('range-actor-guard') });
    const admin = await pg.connectAsAdmin();
    await app.connect();
    const insert = `insert into offline.numbering_ranges(tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,created_by) values ($1,'actor-sql','citation',$2,1,10,1,$3) returning created_by`;
    try {
      await app.query(
        "select set_config('app.tenant_id',$1,false),set_config('app.actor_id','real-actor',false)",
        [RANGE_TENANT_A],
      );
      await expect(
        app.query(insert, [RANGE_TENANT_A, 'forged-actor', 'forged-actor']),
      ).rejects.toMatchObject({ code: 'STY48' });
      await app.query('reset app.actor_id');
      await expect(
        app.query(insert, [RANGE_TENANT_A, 'missing-actor', 'forged-actor']),
      ).rejects.toMatchObject({ code: 'STY48' });
      for (const blank of ['\t', '\u00a0']) {
        await app.query("select set_config('app.actor_id',$1,false)", [blank]);
        await expect(
          app.query(insert, [RANGE_TENANT_A, `blank-${Buffer.from(blank).toString('hex')}`, blank]),
        ).rejects.toMatchObject({ code: 'STY48' });
      }
      await app.query("select set_config('app.actor_id',' padded-actor ',false)");
      expect(
        (await app.query(insert, [RANGE_TENANT_A, 'padded-actor', ' padded-actor '])).rows,
      ).toEqual([{ created_by: ' padded-actor ' }]);
      await app.query("select set_config('app.actor_id','real-actor',false)");
      expect((await app.query(insert, [RANGE_TENANT_A, 'real-actor', 'real-actor'])).rows).toEqual([
        { created_by: 'real-actor' },
      ]);
      await expect(
        app.query("update offline.numbering_ranges set status='cancelled' where id=$1", [value.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        app.query(
          "update offline.numbering_ranges set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by='forged' where id=$1",
          [value.id],
        ),
      ).rejects.toMatchObject({ code: 'STY48' });
      await app.query('reset app.actor_id');
      await expect(
        app.query(
          "update offline.numbering_ranges set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by='real-actor' where id=$1",
          [value.id],
        ),
      ).rejects.toMatchObject({ code: 'STY48' });
      expect(await call((service) => service.getNumberingRange(value.id))).toEqual(value);
      await app.query("select set_config('app.actor_id','real-actor',false)");
      await expect(
        app.query(
          `insert into offline.numbering_ranges(tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,created_by,status,cancelled_by,cancelled_at) values ($1,'actor-sql','citation','forged-first-cancel',1,10,1,'real-actor','cancelled','forged',clock_timestamp())`,
          [RANGE_TENANT_A],
        ),
      ).rejects.toMatchObject({ code: 'STY48' });
      const owner = (
        await admin.query(
          "select current_user,pg_get_userbyid(relowner) as owner from pg_class where oid='offline.numbering_ranges'::regclass",
        )
      ).rows[0]!;
      expect(owner.current_user).toBe(owner.owner);
      await admin.query("select set_config('app.actor_id','different-maintainer',false)");
      expect(
        (await admin.query(insert, [RANGE_TENANT_A, 'owner-import', 'historical-import-actor']))
          .rows,
      ).toEqual([{ created_by: 'historical-import-actor' }]);
    } finally {
      await app.end();
      await admin.query('reset role');
      await admin.end();
    }
  });

  it('fails closed on corrupted immutable creation snapshot evidence instead of reconstructing a later receipt', async () => {
    const body = rangeInput('corrupt-receipt', { idempotencyKey: 'corrupt-receipt-key' });
    const value = await call((s) => s.createNumberingRange(body));
    const admin = await pg.connectAsAdmin();
    let original: unknown;
    try {
      original = (
        await admin.query('select creation_receipt from offline.numbering_ranges where id=$1', [
          value.id,
        ])
      ).rows[0]!.creation_receipt;
      await admin.query(
        'alter table offline.numbering_ranges disable trigger numbering_ranges_history_guard',
      );
      await admin.query("update offline.numbering_ranges set creation_receipt='{}' where id=$1", [
        value.id,
      ]);
      await admin.query(
        'alter table offline.numbering_ranges enable trigger numbering_ranges_history_guard',
      );
      await expect(call((s) => s.createNumberingRange(body))).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
      });
      expect(await call((s) => s.getNumberingRange(value.id))).toEqual(value);
    } finally {
      await admin.query(
        'alter table offline.numbering_ranges disable trigger numbering_ranges_history_guard',
      );
      await admin.query(
        'update offline.numbering_ranges set creation_receipt=$2::jsonb where id=$1',
        [value.id, JSON.stringify(original)],
      );
      await admin.query(
        'alter table offline.numbering_ranges enable trigger numbering_ranges_history_guard',
      );
      await admin.end();
    }
  });

  it.each(['cancel-first', 'allocate-first'] as const)(
    'serializes %s with allocation using the same range row lock and retains all reservation history',
    async (order) => {
      const value = await call((s) => s.createNumberingRange(rangeInput(order)));
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reserve = () =>
        service().reserveDurableNumbering({
          orgUnitId: 'org-a',
          entityType: 'citation',
          rangeId: value.id,
          deviceId: order,
          shiftId: null,
          requestedSize: 2,
        });
      let reservationId: string | undefined;
      let claimBefore: unknown[] = [];
      const first = run(RANGE_TENANT_A, 'audit-actor', () =>
        moduleRef.get(Database).tx(
          async (trx) => {
            await trx.query('select id from offline.numbering_ranges where id=$1 for update', [
              value.id,
            ]);
            entered();
            await blocked;
            if (order === 'cancel-first')
              return service().cancelNumberingRange(value.id, { reason: 'race-winner' });
            const allocated = await reserve();
            reservationId = allocated.reservationId;
            await service().reconcileNumberingReservation(allocated.reservationId, {
              claimedNumbers: [allocated.startNumber],
            });
            claimBefore = (
              await trx.query(
                'select to_jsonb(c)::text as bytes from offline.numbering_consumption c where reservation_id=$1 order by number',
                [allocated.reservationId],
              )
            ).rows;
            return allocated;
          },
          { isolation: 'read committed', requireActor: true, retry: false },
        ),
      );
      await started;
      const second = run(RANGE_TENANT_A, 'audit-actor', () =>
        order === 'cancel-first'
          ? reserve()
          : service().cancelNumberingRange(value.id, { reason: 'after-allocation' }),
      ).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      const admin = await pg.connectAsAdmin();
      try {
        let observed = false;
        for (let i = 0; i < 100; i++) {
          const waits = (
            await admin.query(
              "select count(*)::int as count from pg_stat_activity where application_name='range-app' and wait_event_type='Lock'",
            )
          ).rows[0]!.count;
          if (waits > 0) {
            observed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(observed).toBe(true);
        release();
        await first;
        const last = await second;
        const current = await call((s) => s.getNumberingRange(value.id));
        expect(current.status).toBe('cancelled');
        expect(current.nextNumber).toBe(order === 'cancel-first' ? 10 : 12);
        if (order === 'cancel-first')
          expect(last).toMatchObject({
            error: { code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE', reason: 'inactive' },
          });
        else expect(last).toMatchObject({ result: { status: 'cancelled', nextNumber: 12 } });
        expect(
          (
            await admin.query(
              'select count(*)::int as count from offline.numbering_reservations where range_id=$1',
              [value.id],
            )
          ).rows,
        ).toEqual([{ count: order === 'cancel-first' ? 0 : 1 }]);
        const claims = (
          await admin.query(
            'select to_jsonb(c)::text as bytes from offline.numbering_consumption c where reservation_id in (select id from offline.numbering_reservations where range_id=$1) order by number',
            [value.id],
          )
        ).rows;
        expect(claims).toEqual(claimBefore);
        if (order === 'allocate-first') {
          expect(claims).toHaveLength(1);
          expect(
            (await call((service) => service.getNumberingConsumption(reservationId!))).consumption,
          ).toMatchObject([
            { number: 10, status: 'claimed-locally' },
            { number: 11, status: 'available' },
          ]);
        } else expect(claims).toHaveLength(0);
      } finally {
        release();
        // Drain both owned operations before closing the observer connection.
        // A rejected operation remains a failure; cleanup never suppresses it.
        await Promise.allSettled([first, second]);
        try {
          await first;
          await second;
        } finally {
          await admin.end();
        }
      }
    },
  );
});
