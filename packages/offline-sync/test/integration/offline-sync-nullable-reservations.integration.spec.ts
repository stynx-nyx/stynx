import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import { OFFLINE_SYNC_NO_SHIFT } from '../../src/numbering.js';
import { reservationFingerprint } from '../../src/listing.js';
import type { CTG9ReserveNumberingInput } from '../../src/types.js';

const tenantA = '00000000-0000-4000-8000-0000000000d4';
const tenantB = '00000000-0000-4000-8000-0000000000e4';
const rangeA = '10000000-0000-4000-8000-0000000000d4';
const rangeB = '10000000-0000-4000-8000-0000000000e4';
const actorId = 'authenticated-reservation-actor';
const migration = () =>
  readFile(resolve(__dirname, '../../migrations/0006_nullable_active_reservations.sql'), 'utf8');
const input = (
  deviceId: string,
  overrides: Partial<CTG9ReserveNumberingInput> = {},
): CTG9ReserveNumberingInput => ({
  orgUnitId: 'org-a',
  deviceId,
  shiftId: null,
  entityType: 'citation',
  requestedSize: 2,
  rangeId: rangeA,
  ...overrides,
});
async function fixture(upgrade = true) {
  const pg = await createPostgresTestDatabase('stynx_ofs_nullable', { useTemplate: false });
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: pg.connectionString('nullable-owner') },
          app: { connectionString: pg.appConnectionString('nullable-app'), max: 10 },
          reader: { connectionString: pg.connectionString('nullable-reader') },
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
    ])
      await admin.query(await readFile(resolve(__dirname, '../../migrations', name), 'utf8'));
    await admin.query(
      "insert into tenancy.tenants(id,slug,name) values ($1,'nullable-a','Nullable A'),($2,'nullable-b','Nullable B')",
      [tenantA, tenantB],
    );
    await admin.query(
      `insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values
      ($1,$3,'org-a','citation','A',1,10000,1,'active'),($2,$3,'org-a','citation','B',1,10000,1,'active')`,
      [rangeA, rangeB, tenantA],
    );
    if (upgrade) {
      await admin.query('begin');
      await admin.query(await migration());
      await admin.query('commit');
      for (const name of [
        '0007_range_administration.sql',
        '0008_import_receipts.sql',
        '0009_numbering_reconciliations.sql',
      ]) {
        await admin.query('begin');
        await admin.query(await readFile(resolve(__dirname, '../../migrations', name), 'utf8'));
        await admin.query('commit');
      }
    }
  } finally {
    await admin.end();
  }
  return { pg, moduleRef };
}

const insertSql = `insert into offline.numbering_reservations
  (id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin)
  values ($1,$2,$3,'org-a','citation',$4,$5,$6,$7,100,101,100,$8,$9,$10) returning id,shift_id,reservation_origin,status`;
async function insert(
  client: Client,
  device: string,
  overrides: {
    shift?: string | null;
    range?: string;
    series?: string;
    origin?: string;
    status?: string;
    until?: string;
    id?: string;
  } = {},
) {
  return client.query(insertSql, [
    overrides.id ?? randomUUID(),
    tenantA,
    overrides.range ?? rangeA,
    overrides.series ?? 'A',
    actorId,
    device,
    overrides.shift ?? null,
    overrides.until ?? new Date(Date.now() + 86400000).toISOString(),
    overrides.status ?? 'reserved',
    overrides.origin ?? 'ctg9',
  ]);
}
async function waitForLock(admin: Client, name: string) {
  for (let i = 0; i < 100; i++) {
    const row = (
      await admin.query(
        "select wait_event_type from pg_stat_activity where application_name=$1 and state='active'",
        [name],
      )
    ).rows[0];
    if (row?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected an observed PostgreSQL lock wait for ${name}`);
}

describe('UPS-OFS-09 PostgreSQL nullable reservation admission and upgrade', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  const run = <T>(operation: () => Promise<T>, tenantId = tenantA) =>
    moduleRef
      .get(RequestContextMutator)
      .runWithRequestContext(
        { requestId: randomUUID(), tenantId, actorId, startedAt: new Date() },
        operation,
      );
  const service = () =>
    new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId }) },
      { policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) } },
    );
  const app = async (name: string, tenantId = tenantA) => {
    const client = new Client({ connectionString: pg.appConnectionString(name) });
    await client.connect();
    await client.query(
      "select set_config('app.tenant_id',$1,false),set_config('app.actor_id',$2,false)",
      [tenantId, actorId],
    );
    return client;
  };
  beforeAll(async () => {
    ({ pg, moduleRef } = await fixture());
  }, 60000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60000);

  it('keeps exact null and sentinel replay identities, historical E6 fingerprints and trusted audit actor', async () => {
    const body = input('replay', { idempotencyKey: 'nullable-key' });
    const first = await run(() => service().reserveDurableNumbering(body));
    expect(first).toMatchObject({ shiftId: null, tenantId: tenantA, agentId: actorId });
    expect(await run(() => service().reserveDurableNumbering(body))).toEqual(first);
    await expect(
      run(() => service().reserveDurableNumbering({ ...body, shiftId: OFFLINE_SYNC_NO_SHIFT })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT' });
    const admin = await pg.connectAsAdmin();
    try {
      expect(
        (
          await admin.query(
            'select shift_id,reservation_origin,audit_actor_id from offline.numbering_reservations where id=$1',
            [first.reservationId],
          )
        ).rows,
      ).toEqual([{ shift_id: null, reservation_origin: 'ctg9', audit_actor_id: actorId }]);
      const historical = input('historical', {
        shiftId: OFFLINE_SYNC_NO_SHIFT,
        idempotencyKey: 'old-key',
      });
      const old = await run(() =>
        service().reserveNumbering({ ...historical, shiftId: OFFLINE_SYNC_NO_SHIFT }),
      );
      const before = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_reservations r where id=$1',
          [old.reservationId],
        )
      ).rows;
      expect(await run(() => service().reserveDurableNumbering(historical))).toEqual(old);
      expect(
        (
          await admin.query(
            'select idempotency_fingerprint from offline.numbering_reservations where id=$1',
            [old.reservationId],
          )
        ).rows,
      ).toEqual([
        {
          idempotency_fingerprint: reservationFingerprint(
            { tenantId: tenantA, actorId },
            historical,
          ),
        },
      ]);
      expect(
        (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_reservations r where id=$1',
            [old.reservationId],
          )
        ).rows,
      ).toEqual(before);
    } finally {
      await admin.end();
    }
  });

  it('preserves pure E6 multiples and rejects mixed origins, blocked leases and active reactivation', async () => {
    const client = await app('mixed-origins');
    try {
      await insert(client, 'legacy-multiple', { origin: 'e6', shift: OFFLINE_SYNC_NO_SHIFT });
      await insert(client, 'legacy-multiple', { origin: 'e6', shift: OFFLINE_SYNC_NO_SHIFT });
      await expect(insert(client, 'legacy-multiple')).rejects.toMatchObject({ code: 'STY44' });
      await insert(client, 'durable-first');
      await expect(
        insert(client, 'durable-first', { origin: 'e6', shift: OFFLINE_SYNC_NO_SHIFT }),
      ).rejects.toMatchObject({ code: 'STY44' });
      await insert(client, 'blocked-first', { status: 'blocked' });
      await expect(insert(client, 'blocked-first')).rejects.toMatchObject({ code: 'STY44' });
      const expiredId = randomUUID();
      await insert(client, 'reactivation', { id: expiredId, status: 'expired' });
      await insert(client, 'reactivation');
      await expect(
        client.query("update offline.numbering_reservations set status='blocked' where id=$1", [
          expiredId,
        ]),
      ).rejects.toMatchObject({ code: 'STY44' });
      expect(
        (
          await client.query('select status from offline.numbering_reservations where id=$1', [
            expiredId,
          ])
        ).rows,
      ).toEqual([{ status: 'expired' }]);
      expect(
        (
          await client.query(
            "select count(*)::int as count from offline.numbering_reservations where device_id='legacy-multiple'",
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    } finally {
      await client.end();
    }
  });

  it('preserves claimed numbers on nullable cancellation and refuses legacy cancellation before mutation', async () => {
    const value = await run(() =>
      service().reserveDurableNumbering(input('cancel', { requestedSize: 3 })),
    );
    const store = new PostgresOfflineSyncStore(moduleRef);
    await run(() =>
      store.reconcileNumberingReservation(
        { tenantId: tenantA, actorId },
        value.reservationId,
        { claimedNumbers: [value.startNumber] },
        new Date().toISOString(),
      ),
    );
    const before = await run(() =>
      store.getNumberingConsumption({ tenantId: tenantA, actorId }, value.reservationId),
    );
    await expect(
      run(() => service().cancelNumberingReservation(value.reservationId)),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect(
      await run(() =>
        store.getNumberingConsumption({ tenantId: tenantA, actorId }, value.reservationId),
      ),
    ).toEqual(before);
    const cancelled = await run(() =>
      service().cancelDurableNumberingReservation(value.reservationId, {
        reason: 'explicit release',
      }),
    );
    expect(cancelled).toMatchObject({ shiftId: null, status: 'cancelled' });
    expect(
      await run(() => service().cancelDurableNumberingReservation(value.reservationId)),
    ).toEqual(cancelled);
    const next = await run(() => service().reserveDurableNumbering(input('cancel')));
    expect(next.startNumber).toBe(value.startNumber + 1);
    await expect(
      run(
        () => store.getNumberingConsumption({ tenantId: tenantB, actorId }, value.reservationId),
        tenantB,
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
  });

  it('enforces direct restricted login, FORCE RLS, tenant scope and immutable reservation scope/origin', async () => {
    const a = await app('scope-rls-a');
    const b = await app('scope-rls-b', tenantB);
    const admin = await pg.connectAsAdmin();
    try {
      expect((await a.query('select current_user,session_user')).rows).toEqual([
        { current_user: 'stynx_app', session_user: 'stynx_app' },
      ]);
      expect(
        (
          await admin.query(
            "select relrowsecurity,relforcerowsecurity from pg_class where oid='offline.numbering_reservation_scopes'::regclass",
          )
        ).rows,
      ).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
      const id = randomUUID();
      await insert(a, 'immutable', { id });
      const before = (
        await a.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_reservations r where id=$1',
          [id],
        )
      ).rows;
      for (const [column, value] of [
        ['tenant_id', tenantB],
        ['device_id', 'changed'],
        ['shift_id', 'changed'],
        ['reservation_origin', 'e6'],
      ])
        await expect(
          a.query(`update offline.numbering_reservations set ${column}=$2 where id=$1`, [
            id,
            value,
          ]),
        ).rejects.toMatchObject({ code: 'STY46' });
      expect(
        (
          await a.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_reservations r where id=$1',
            [id],
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await b.query(
            "select * from offline.numbering_reservation_scopes where device_id='immutable'",
          )
        ).rows,
      ).toEqual([]);
      await expect(
        b.query(
          "insert into offline.numbering_reservation_scopes values ($1,'forged','[null]',gen_random_uuid())",
          [tenantA],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        a.query("delete from offline.numbering_reservation_scopes where device_id='immutable'"),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await a.end();
      await b.end();
      await admin.end();
    }
  });

  it('aborts a stale repeatable-read writer on a different range with 40001 rather than admitting a second scope owner', async () => {
    const first = await app('rr-first');
    const second = await app('rr-second');
    const admin = await pg.connectAsAdmin();
    let pending: Promise<unknown> | undefined;
    try {
      await first.query('begin isolation level repeatable read');
      await second.query('begin isolation level repeatable read');
      await first.query('select count(*) from offline.numbering_reservations');
      await second.query('select count(*) from offline.numbering_reservations');
      await insert(first, 'rr-race');
      pending = insert(second, 'rr-race', { range: rangeB, series: 'B' }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await waitForLock(admin, 'rr-second');
      await first.query('commit');
      expect(await pending).toMatchObject({ error: { code: '40001' } });
      await second.query('rollback');
      expect(
        (
          await admin.query(
            "select count(*)::int as count from offline.numbering_reservations where device_id='rr-race'",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      await expect(
        run(() =>
          moduleRef.get(Database).tx(() => service().reserveDurableNumbering(input('nested-rr')), {
            isolation: 'repeatable read',
          }),
        ),
      ).rejects.toMatchObject({ code: 'TRANSACTION_IDENTITY_MISMATCH' });
      expect(
        (
          await admin.query(
            "select count(*)::int as count from offline.numbering_reservations where device_id='nested-rr'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await first.query('rollback');
      await second.query('rollback');
      await pending;
      await first.end();
      await second.end();
      await admin.end();
    }
  });

  it('rechecks proposed expiry after an observed advisory-lock wait without falsely refusing an already expired proposal', async () => {
    const holder = await app('expiry-holder');
    const contender = await app('expiry-contender');
    const admin = await pg.connectAsAdmin();
    let pending: Promise<unknown> | undefined;
    try {
      await insert(contender, 'expiry-wait');
      await holder.query('begin');
      await holder.query(
        "select pg_advisory_xact_lock(hashtextextended('stynx-offline-active:' || jsonb_build_array($1::uuid::text,'expiry-wait',null)::text,0))",
        [tenantA],
      );
      const until = (
        await admin.query("select (clock_timestamp()+interval '1 second')::text as until")
      ).rows[0]!.until;
      pending = insert(contender, 'expiry-wait', { until }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await waitForLock(admin, 'expiry-contender');
      await holder.query('select pg_sleep(1.1)');
      await holder.query('commit');
      expect(await pending).toMatchObject({ value: { rowCount: 1 } });
      expect(
        (
          await admin.query(
            "select count(*)::int as count from offline.numbering_reservations where device_id='expiry-wait' and valid_until>clock_timestamp()",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await holder.query('rollback');
      await pending;
      await holder.end();
      await contender.end();
      await admin.end();
    }
  });

  it('serializes normal READ COMMITTED allocation on different ranges and supports explicit validity plus trusted business agent', async () => {
    const configured = () =>
      new OfflineSyncService(
        new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId: tenantA, actorId }) },
        {
          policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) },
          agentResolver: { resolve: async () => 'resolved-business-agent' },
        },
      );
    const validUntil = new Date(Date.now() + 86400000).toISOString();
    const result = await Promise.allSettled([
      run(() =>
        configured().reserveDurableNumbering(
          input('rc-race', { rangeId: undefined, series: 'A', validUntil }),
        ),
      ),
      run(() =>
        configured().reserveDurableNumbering(
          input('rc-race', { rangeId: rangeB, series: undefined }),
        ),
      ),
    ]);
    expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((value) => value.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: 'OFFLINE_SYNC_ACTIVE_RESERVATION' }),
      }),
    ]);
    const winner = result.find((value) => value.status === 'fulfilled')!;
    if (winner.status !== 'fulfilled') throw new Error('missing committed allocation');
    expect(winner.value.agentId).toBe('resolved-business-agent');
    const cancelled = await run(() =>
      configured().cancelDurableNumberingReservation(winner.value.reservationId),
    );
    expect(cancelled.status).toBe('cancelled');
    const next = await run(() =>
      configured().reserveDurableNumbering(
        input('rc-no-series', { rangeId: undefined, series: undefined, validUntil }),
      ),
    );
    expect(next.validUntil).toBe(validUntil);
    expect(next.rangeId).toBe(rangeA);
  });

  it('replays the winning keyed allocation under the store lock without a second range allocation', async () => {
    const store = new PostgresOfflineSyncStore(moduleRef);
    const body = input('same-key-race', { idempotencyKey: 'same-key-race-key' });
    const scope = { tenantId: tenantA, actorId };
    const now = new Date().toISOString();
    const until = new Date(Date.now() + 86400000).toISOString();
    const admin = await pg.connectAsAdmin();
    try {
      const before = Number(
        (
          await admin.query('select next_number from offline.numbering_ranges where id=$1', [
            rangeA,
          ])
        ).rows[0]!.next_number,
      );
      const [first, replay] = await Promise.all([
        run(() => store.reserveDurableNumbering(scope, body, now, until)),
        run(() => store.reserveDurableNumbering(scope, body, now, until)),
      ]);
      expect(first).toEqual(replay);
      expect(first.agentId).toBe(actorId);
      expect(
        Number(
          (
            await admin.query('select next_number from offline.numbering_ranges where id=$1', [
              rangeA,
            ])
          ).rows[0]!.next_number,
        ),
      ).toBe(before + body.requestedSize);
      expect(
        (
          await admin.query(
            "select count(*)::int as count from offline.numbering_reservations where idempotency_key='same-key-race-key'",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await admin.end();
    }
  });

  it('reports missing0006 before allocating and preserves the old schema and range bytes', async () => {
    const old = await fixture(false);
    const admin = await old.pg.connectAsAdmin();
    try {
      const before = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_ranges r order by id',
        )
      ).rows;
      const oldService = new OfflineSyncService(
        new PostgresOfflineSyncStore(old.moduleRef),
        { current: () => ({ tenantId: tenantA, actorId }) },
        { policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) } },
      );
      await expect(
        old.moduleRef
          .get(RequestContextMutator)
          .runWithRequestContext(
            { requestId: randomUUID(), tenantId: tenantA, actorId, startedAt: new Date() },
            () => oldService.reserveDurableNumbering(input('missing006')),
          ),
      ).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_UPGRADE_REQUIRED',
        message: 'Offline-sync migration 0006 is required.',
      });
      expect(
        (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_ranges r order by id',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await admin.query('select count(*)::int as count from offline.numbering_reservations'))
          .rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await admin.end();
      await old.moduleRef.close();
      await old.pg.dispose();
    }
  }, 60000);

  it('rolls duplicate populated upgrades back atomically with exact identities and preserves valid historical bytes on upgrade', async () => {
    const old = await fixture(false);
    const admin = await old.pg.connectAsAdmin();
    try {
      const ids = [randomUUID(), randomUUID()];
      const legacyInsert = insertSql
        .replace(',reservation_origin)', ')')
        .replace(',$10)', ')')
        .replace(' returning id,shift_id,reservation_origin,status', ' returning id');
      for (const id of ids)
        await admin.query(legacyInsert, [
          id,
          tenantA,
          rangeA,
          'A',
          actorId,
          'upgrade-duplicate',
          OFFLINE_SYNC_NO_SHIFT,
          new Date(Date.now() + 86400000).toISOString(),
          'reserved',
        ]);
      const before = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
        )
      ).rows;
      await admin.query('begin');
      const failure = (await admin.query(await migration()).catch((error: unknown) => error)) as {
        code: string;
        detail: string;
      };
      expect(failure.code).toBe('STY45');
      for (const id of ids) expect(failure.detail).toContain(id);
      expect(failure.detail).toContain(tenantA);
      expect(failure.detail).toContain('upgrade-duplicate');
      await admin.query('rollback');
      expect(
        (
          await admin.query(
            "select to_regclass('offline.numbering_reservation_scopes') as relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      expect(
        (
          await admin.query(
            "select count(*)::int as count from information_schema.columns where table_schema='offline' and table_name='numbering_reservations' and column_name='reservation_origin'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await admin.query(
            'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
          )
        ).rows,
      ).toEqual(before);
      await admin.query(
        "update offline.numbering_reservations set status='cancelled' where id=$1",
        [ids[1]],
      );
      const validBefore = (
        await admin.query(
          'select to_jsonb(r)::text as bytes from offline.numbering_reservations r order by id',
        )
      ).rows;
      await admin.query('begin');
      await admin.query(await migration());
      await admin.query('commit');
      expect(
        (
          await admin.query(
            "select (to_jsonb(r)-'reservation_origin')::text as bytes from offline.numbering_reservations r order by id",
          )
        ).rows,
      ).toEqual(validBefore);
      expect(
        (
          await admin.query(
            'select shift_id,reservation_origin from offline.numbering_reservations order by id',
          )
        ).rows,
      ).toEqual([
        { shift_id: OFFLINE_SYNC_NO_SHIFT, reservation_origin: 'e6' },
        { shift_id: OFFLINE_SYNC_NO_SHIFT, reservation_origin: 'e6' },
      ]);
    } finally {
      await admin.query('rollback');
      await admin.end();
      await old.moduleRef.close();
      await old.pg.dispose();
    }
  }, 60000);
});
