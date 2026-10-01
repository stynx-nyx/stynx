import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import { OfflineSyncRangeUnavailableError, OfflineSyncReservationReplayError } from '../../src/errors';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import type { OfflineSyncItemContext, StynxOfflineSyncModuleOptions } from '../../src/types';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-09 (receiptId), UPS-OFS-11 (#317). Real PostgreSQL,
// 0001→0002→0003, app-role pool bound at connection startup so FORCE RLS applies.
const tenantA = '00000000-0000-4000-8000-0000000000a5';
const tenantB = '00000000-0000-4000-8000-0000000000b5';
const payload = {};
const hash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const migrationDir = resolve(__dirname, '../../migrations');
const asRole = (connectionString: string, role: 'stynx_app'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;
const reserve = { orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 3 };
const item = (id: string, key: string | null = id) => ({
  queueItemId: id, entityType: 'citation', localEntityId: `local-${id}`, payloadHash: hash, payloadJson: payload,
  createdLocallyAt: '2026-09-28T12:00:00.000Z', ...(key === null ? {} : { idempotencyKey: key }),
});

describe('UPS-OFS-05/-09/-11 PostgreSQL reservation idempotency and listings', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let now = '2026-09-28T12:00:00.000Z';
  const contexts: Record<string, unknown>[] = [];
  const service = (tenantId: string, options: Partial<StynxOfflineSyncModuleOptions> = {}) =>
    new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef), { current: () => ({ tenantId, actorId: `actor-${tenantId.slice(-2)}` }) }, {
      now: () => now,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null }) },
      itemApplier: { apply: async (_trx: unknown, value: { queueItemId: string }, context: OfflineSyncItemContext) => {
        contexts.push({ ...context });
        return { serverEntityId: `server-${value.queueItemId}` };
      } },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      ...options,
    } as StynxOfflineSyncModuleOptions);
  const run = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    moduleRef.get(RequestContextMutator).runWithRequestContext({ requestId: `ofs-317-${Math.random()}`, tenantId,
      actorId: `actor-${tenantId.slice(-2)}`, startedAt: new Date(now) }, fn);
  const transport = (key: string) => ({ transportIdempotencyKey: key, method: 'POST' as const, path: '/offline-sync/sync-batches' });

  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_317', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: pg.connectionString('ofs317-owner') },
          app: { connectionString: asRole(pg.connectionString('ofs317-app'), 'stynx_app'), max: 10 },
          reader: { connectionString: pg.connectionString('ofs317-reader') },
        },
        migrations: { enabled: true },
      })],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      for (const name of ['0001_offline_sync.sql', '0002_durable_sync.sql', '0003_reservation_idempotency.sql'])
        await admin.query(await readFile(resolve(migrationDir, name), 'utf8'));
      await admin.query(`insert into tenancy.tenants (id,slug,name,is_active,created_at,updated_at) values
        ($1::uuid,'ofs-317-a','OFS 317 A',true,clock_timestamp(),clock_timestamp()),
        ($2::uuid,'ofs-317-b','OFS 317 B',true,clock_timestamp(),clock_timestamp())`, [tenantA, tenantB]);
      await admin.query(`insert into offline.numbering_ranges
        (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values
        ('20000000-0000-4000-8000-0000000000a5',$1::uuid,'org-a','citation','C',1,60,1,'active'),
        ('20000000-0000-4000-8000-0000000000b5',$2::uuid,'org-a','citation','C',1,60,1,'active'),
        ('20000000-0000-4000-8000-0000000000a6',$1::uuid,'org-x','citation','X',1,1,2,'exhausted')`, [tenantA, tenantB]);
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);

  it('UPS-OFS-05 replays one key under concurrency with a single consumed interval and isolates tenants', async () => {
    const a = service(tenantA);
    const replies = await Promise.all(Array.from({ length: 8 }, () => run(tenantA, () => a.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-key' }))));
    expect(new Set(replies.map(reply => reply.reservationId)).size).toBe(1);
    expect([replies[0]!.startNumber, replies[0]!.endNumber]).toEqual([1, 3]);
    const conflict = await run(tenantA, () => a.reserveNumbering({ ...reserve, requestedSize: 4, idempotencyKey: 'reserve-key' })).catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(OfflineSyncReservationReplayError);
    const otherTenant = await run(tenantB, () => service(tenantB).reserveNumbering({ ...reserve, idempotencyKey: 'reserve-key' }));
    expect(otherTenant.reservationId).not.toBe(replies[0]!.reservationId);
    expect([otherTenant.tenantId, otherTenant.startNumber]).toEqual([tenantB, 1]);
    const devices = await Promise.all(['d-1', 'd-2', 'd-3', 'd-4'].map(deviceId =>
      run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId, idempotencyKey: `key-${deviceId}` }))));
    const intervals = devices.map(reply => [reply.startNumber, reply.endNumber] as const).sort((x, y) => x[0] - y[0]);
    expect(intervals).toEqual([[4, 6], [7, 9], [10, 12], [13, 15]]);
    const keyless = await run(tenantA, () => a.reserveNumbering(reserve));
    expect(keyless.startNumber).toBe(16);
    const admin = await pg.connectAsAdmin();
    try {
      const stored = await admin.query<{ count: string }>(`select count(*) from offline.numbering_reservations
        where tenant_id=$1::uuid and idempotency_key='reserve-key'`, [tenantA]);
      expect(stored.rows[0]!.count).toBe('1');
      const keylessRow = await admin.query<{ idempotency_key: string | null; idempotency_fingerprint: string | null }>(
        `select idempotency_key,idempotency_fingerprint from offline.numbering_reservations where id=$1::uuid`, [keyless.reservationId]);
      expect(keylessRow.rows).toEqual([{ idempotency_key: null, idempotency_fingerprint: null }]);
    } finally {
      await admin.end();
    }
  }, 60_000);

  it('UPS-OFS-05 replays a key after validUntil and a policy change, returning the current reservation state', async () => {
    const saved = now;
    let policy: { reservationTtlMs?: number } = { reservationTtlMs: 3_600_000 };
    const a = service(tenantA, { policyResolver: { resolve: async () => ({ ...policy, maxBatchItems: null }) } });
    const keyed = { ...reserve, deviceId: 'replay-device', validUntil: '2026-09-28T12:30:00Z', idempotencyKey: 'replay-after-expiry' };
    const first = await run(tenantA, () => a.reserveNumbering(keyed));
    now = '2026-09-29T12:00:00.000Z';
    policy = {};
    const replay = await run(tenantA, () => a.reserveNumbering({ ...keyed, validUntil: '2026-09-28T12:30:00.000Z' }));
    expect(replay).toEqual({ ...first, status: 'reserved', validUntil: '2026-09-28T12:30:00.000Z' });
    now = saved;
    policy = { reservationTtlMs: 3_600_000 };
    const cancelled = await run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId: 'replay-cancel', idempotencyKey: 'replay-cancelled' }));
    await run(tenantA, () => a.cancelNumberingReservation(cancelled.reservationId));
    now = '2026-09-30T00:00:00.000Z';
    policy = {};
    await expect(run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId: 'replay-cancel', idempotencyKey: 'replay-cancelled' })))
      .resolves.toMatchObject({ reservationId: cancelled.reservationId, status: 'cancelled' });
    await expect(run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId: 'other', idempotencyKey: 'replay-cancelled' })))
      .rejects.toBeInstanceOf(OfflineSyncReservationReplayError);
    now = saved;
  }, 60_000);

  it('UPS-OFS-11 rejects a forged cursor with 400 before reaching PostgreSQL', async () => {
    const forged = Buffer.from(JSON.stringify(['2026-99-99T99:00:00.000000Z', 'x'])).toString('base64url');
    const a = service(tenantA);
    await expect(run(tenantA, () => a.listSyncQueueItems({ cursor: forged }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', response: { statusCode: 400 } });
    await expect(run(tenantA, () => a.listSyncConflicts({ cursor: forged }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  }, 60_000);

  it('UPS-OFS-05 reports exhausted, inactive and insufficient ranges under the published code', async () => {
    const a = service(tenantA);
    const exhausted = await run(tenantA, () => a.reserveNumbering({ ...reserve, orgUnitId: 'org-x', series: 'X', requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
    expect([exhausted.code, exhausted.reason]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'exhausted']);
    const inactive = await run(tenantA, () => a.reserveNumbering({ ...reserve, rangeId: '20000000-0000-4000-8000-0000000000a6', requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
    expect(inactive.reason).toBe('inactive');
    const capacity = await run(tenantA, () => a.reserveNumbering({ ...reserve, requestedSize: 100 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
    expect([capacity.reason, capacity.getStatus()]).toEqual(['insufficient_capacity', 409]);
  }, 60_000);

  it('UPS-OFS-11 lists receipts, queue items and conflicts with filters, stable keyset order and tenant isolation', async () => {
    const pairs = [{ firstItemId: 'l-a2', secondItemId: 'l-b1' }];
    const a = service(tenantA, {
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 5, maxBatchItems: null }) },
      concurrencyDetector: { detect: async (_trx, value) => ({ suspected: value.queueItemId === 'l-b1', pairs }) },
    });
    now = '2026-09-28T13:00:00.000Z';
    await run(tenantA, () => a.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'list-a', deviceBatchId: 'lb-1', items: [item('l-a1'), item('l-a2'), item('l-a3', null)] }, transport('lt-1')));
    now = '2026-09-28T13:00:01.000Z';
    await run(tenantA, () => a.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'list-b', deviceBatchId: 'lb-2', items: [item('l-b1')] }, transport('lt-2')));
    await run(tenantB, () => service(tenantB).submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'list-a', deviceBatchId: 'lb-9', items: [item('l-z1')] }, transport('lt-9')));

    expect(contexts.find(context => context.batchId === 'lb-1')).toMatchObject({ receiptId: 'l-a1', tenantId: tenantA });
    const pages: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await run(tenantA, () => a.listSyncItemReceipts({ limit: 1, ...(cursor ? { cursor } : {}) }));
      pages.push(...page.items.map(receipt => receipt.queueItemId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    // One row per page: every tenant-A receipt exactly once, newest insertion first.
    expect(pages).toEqual(['l-b1', 'l-a3', 'l-a2', 'l-a1']);
    expect(new Set(pages).size).toBe(pages.length);
    const receipts = await run(tenantA, () => a.listSyncItemReceipts({ deviceId: 'list-a' }));
    expect(receipts.items.map(receipt => receipt.deviceBatchId)).toEqual(['lb-1', 'lb-1', 'lb-1']);
    // Item receipts order by their database insertion time (received_at defaults to clock_timestamp()).
    expect(receipts.items.find(receipt => receipt.queueItemId === 'l-a1')).toEqual({ receiptId: 'l-a1', queueItemId: 'l-a1',
      deviceId: 'list-a', deviceBatchId: 'lb-1', payloadHash: hash, status: 'applied', receivedAt: expect.stringMatching(/Z$/u) });
    expect((await run(tenantA, () => a.listSyncItemReceipts({ status: 'received', deviceBatchId: 'lb-1' }))).items)
      .toMatchObject([{ queueItemId: 'l-a3', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }]);
    expect((await run(tenantA, () => a.listSyncItemReceipts({ status: 'conflict' }))).items.map(receipt => receipt.queueItemId).sort()).toEqual(['l-a2', 'l-b1']);

    const queue = await run(tenantA, () => a.listSyncQueueItems({ deviceId: 'list-a', limit: 2 }));
    expect(queue.items.map(queued => queued.queueItemId)).toEqual(['l-a3', 'l-a2']);
    const rest = await run(tenantA, () => a.listSyncQueueItems({ deviceId: 'list-a', limit: 2, cursor: queue.nextCursor! }));
    expect(rest).toMatchObject({ items: [{ queueItemId: 'l-a1', deviceBatchId: 'lb-1', status: 'applied', receivedAt: '2026-09-28T13:00:00.000Z' }], nextCursor: null });
    expect((await run(tenantA, () => a.listSyncQueueItems({ status: 'conflict', entityType: 'citation' }))).items.map(queued => queued.queueItemId)).toEqual(['l-b1', 'l-a2']);
    expect((await run(tenantA, () => a.listSyncQueueItems({ entityType: 'other' }))).items).toEqual([]);

    const batches = await run(tenantA, () => a.listSyncBatchReceipts({ deviceId: 'list-b' }));
    expect(batches.items).toMatchObject([{ deviceId: 'list-b', deviceBatchId: 'lb-2', batchSequence: null, status: 'closed', responseStatus: 201 }]);
    expect((await run(tenantA, () => a.listSyncBatchReceipts({ status: 'open' }))).items).toEqual([]);
    const allBatches = await run(tenantA, () => a.listSyncBatchReceipts({ limit: 1 }));
    expect((await run(tenantA, () => a.listSyncBatchReceipts({ limit: 1, cursor: allBatches.nextCursor! }))).items[0]!.deviceBatchId)
      .not.toBe(allBatches.items[0]!.deviceBatchId);

    const conflicts = await run(tenantA, () => a.listSyncConflicts({ status: 'open', conflictType: 'concurrency' }));
    expect(conflicts.items.map(conflict => conflict.queueItemId).sort()).toEqual(['l-a2', 'l-b1']);
    expect(conflicts.items[0]).toMatchObject({ tenantId: tenantA, status: 'open', createdAt: '2026-09-28T13:00:01.000Z' });
    const firstConflict = await run(tenantA, () => a.listSyncConflicts({ limit: 1 }));
    const secondConflict = await run(tenantA, () => a.listSyncConflicts({ limit: 1, cursor: firstConflict.nextCursor! }));
    expect(secondConflict.items[0]!.conflictId).not.toBe(firstConflict.items[0]!.conflictId);
    expect((await run(tenantA, () => a.listSyncConflicts({ queueItemId: 'l-a2', status: 'resolved' }))).items).toEqual([]);

    const b = service(tenantB);
    const foreign = await run(tenantB, () => Promise.all([b.listSyncItemReceipts(), b.listSyncQueueItems(), b.listSyncConflicts(), b.listSyncBatchReceipts()]));
    expect(foreign.map(page => page.items.length)).toEqual([1, 1, 0, 1]);
    expect(foreign[1]!.items[0]).toMatchObject({ queueItemId: 'l-z1', tenantId: tenantB });
    // Even a forged tenant argument cannot cross RLS: the app transaction is bound to tenant B.
    const store = new PostgresOfflineSyncStore(moduleRef);
    const forged = await run(tenantB, () => store.listSyncQueueItems({ tenantId: tenantA, actorId: 'actor-b5' }, {}));
    expect(forged.items).toEqual([]);
  }, 60_000);

  it('UPS-OFS-11 lists resolved E6 conflicts with resolution fields', async () => {
    const e6 = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef), { current: () => ({ tenantId: tenantA, actorId: 'actor-a5' }) }, { now: () => now });
    await run(tenantA, () => e6.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'e6-dev', deviceBatchId: 'e6-b', items: [{ ...item('e6-q'), payloadHash: `sha256:${'c'.repeat(64)}` } as never] }));
    const opened = await run(tenantA, () => e6.openConflict('e6-q', { conflictType: 'version', description: 'stale' }));
    await run(tenantA, () => e6.resolveConflict(opened.conflictId, { resolution: 'server-wins' }));
    const listed = await run(tenantA, () => e6.listSyncConflicts({ status: 'resolved' }));
    expect(listed.items).toMatchObject([{ conflictId: opened.conflictId, resolution: 'server-wins', resolvedBy: 'actor-a5', status: 'resolved' }]);
    expect((await run(tenantA, () => e6.listSyncQueueItems({ deviceId: 'e6-dev' }))).items).toMatchObject([{ queueItemId: 'e6-q', deviceBatchId: 'e6-b', status: 'rejected' }]);
  }, 60_000);
});
