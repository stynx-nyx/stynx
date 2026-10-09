import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import { OfflineSyncError, OfflineSyncRangeUnavailableError, OfflineSyncReservationReplayError } from '../../src/errors';
import { OFFLINE_SYNC_NO_SHIFT } from '../../src/numbering';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import type { OfflineSyncItemContext, StynxOfflineSyncModuleOptions } from '../../src/types';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-09 (receiptId), UPS-OFS-10, UPS-OFS-11, UPS-OFS-12 (#317;
// ADR-MOBILE-OFFLINE-0003 D4 and D5). Real PostgreSQL, 0001→0002→0003, app-role pool bound at
// connection startup so FORCE RLS applies.
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

describe('UPS-OFS-05/-09/-10/-11/-12 PostgreSQL reservation idempotency, listings, integrity and ranges', () => {
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
      deviceId: 'list-a', deviceBatchId: 'lb-1', payloadHash: hash, status: 'applied', receivedAt: expect.stringMatching(/Z$/u),
      stynx: { version: 1, receiptId: 'l-a1', appliedAt: '2026-09-28T13:00:00.000Z', serverEntityId: 'server-l-a1', attempts: 1 } });
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
  it('UPS-OFS-11 filters conflicts by device through the queue-item join, exposes deviceId and keeps tenants apart', async () => {
    const a = service(tenantA);
    const e6B = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef), { current: () => ({ tenantId: tenantB, actorId: 'actor-b5' }) }, { now: () => now });
    await run(tenantB, () => e6B.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'list-a', deviceBatchId: 'e6-zb', items: [{ ...item('e6-zq'), payloadHash: `sha256:${'d'.repeat(64)}` } as never] }));
    const foreignConflict = await run(tenantB, () => e6B.openConflict('e6-zq', { conflictType: 'version', description: 'stale' }));
    const byDevice = await run(tenantA, () => a.listSyncConflicts({ deviceId: 'list-a' }));
    expect(byDevice.items.map(conflict => [conflict.queueItemId, conflict.deviceId])).toEqual([['l-a2', 'list-a']]);
    expect(byDevice.items[0]).toMatchObject({ tenantId: tenantA, conflictType: 'concurrency', status: 'open', createdAt: '2026-09-28T13:00:01.000Z' });
    expect((await run(tenantA, () => a.listSyncConflicts({ deviceId: 'list-b', conflictType: 'concurrency', status: 'open' }))).items).toMatchObject([{ queueItemId: 'l-b1', deviceId: 'list-b' }]);
    expect((await run(tenantA, () => a.listSyncConflicts({ deviceId: 'e6-dev', status: 'resolved' }))).items).toMatchObject([{ queueItemId: 'e6-q', deviceId: 'e6-dev', resolution: 'server-wins' }]);
    expect((await run(tenantA, () => a.listSyncConflicts({ deviceId: 'nobody' }))).items).toEqual([]);
    const all = await run(tenantA, () => a.listSyncConflicts());
    expect(all.items.map(conflict => conflict.deviceId).sort()).toEqual(['e6-dev', 'list-a', 'list-b']);
    const firstPage = await run(tenantA, () => a.listSyncConflicts({ deviceId: 'list-a', limit: 1 }));
    expect([firstPage.items.length, firstPage.nextCursor]).toEqual([1, null]);
    await expect(run(tenantA, () => a.listSyncConflicts({ deviceId: '' }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'deviceId is required.' });
    // Tenant B sees only its own conflict on that device, and tenant A never sees it.
    const foreign = await run(tenantB, () => e6B.listSyncConflicts({ deviceId: 'list-a' }));
    expect(foreign.items).toMatchObject([{ conflictId: foreignConflict.conflictId, queueItemId: 'e6-zq', deviceId: 'list-a', tenantId: tenantB }]);
    expect(all.items.map(conflict => conflict.conflictId)).not.toContain(foreignConflict.conflictId);
  }, 60_000);

  it('UPS-OFS-10 diverts non-canonical hashes to per-item integrity rejections without a CHECK violation, keeps the key unconsumed and E6 at 400', async () => {
    const a = service(tenantA);
    const oneByte = 'x';
    const longHash = 'h'.repeat(128);
    const input = { orgUnitId: 'org-a', deviceId: 'hash-dev', deviceBatchId: 'hb-1', items: [
      { ...item('h-1'), payloadHash: oneByte }, { ...item('h-2'), payloadHash: longHash }, item('h-3'), { ...item('h-4'), payloadHash: `sha256:${'A'.repeat(64)}` },
    ] };
    const result = await run(tenantA, () => a.submitSyncBatch(input, transport('ht-1')));
    expect(result.receipt).toMatchObject({ status: 'closed', responseStatus: 201 });
    expect(result.receipt.items).toEqual([
      { queueItemId: 'h-1', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'h-2', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'h-3', status: 'applied' },
      { queueItemId: 'h-4', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
    ]);
    expect(result.items.map(stored => [stored.queueItemId, stored.status, stored.payloadHash])).toEqual([
      ['h-1', 'rejected', oneByte], ['h-2', 'rejected', longHash], ['h-3', 'applied', hash], ['h-4', 'rejected', `sha256:${'A'.repeat(64)}`],
    ]);
    expect(contexts.filter(context => context.batchId === 'hb-1').map(context => context.receiptId)).toEqual(['h-3']);
    for (const key of ['h-1', 'h-2', 'h-4'])
      await expect(run(tenantA, () => a.getSyncItemReceipt(key))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND' });
    expect((await run(tenantA, () => a.listSyncQueueItems({ deviceId: 'hash-dev' }))).items.map(queued => queued.queueItemId)).toEqual(['h-3']);
    expect((await run(tenantA, () => a.listSyncItemReceipts({ deviceId: 'hash-dev' }))).items.map(receipt => receipt.receiptId)).toEqual(['h-3']);
    const receipt = await run(tenantA, () => a.getSyncBatchReceipt('hash-dev', 'hb-1'));
    expect(receipt.items.filter(entry => entry.status === 'rejected').map(entry => entry.queueItemId).sort()).toEqual(['h-1', 'h-2', 'h-4']);
    // A closed-batch replay returns the recorded outcome without another effect.
    const replay = await run(tenantA, () => a.submitSyncBatch(input, transport('ht-1')));
    expect(replay.receipt.items).toEqual(result.receipt.items);
    expect(contexts.filter(context => context.batchId === 'hb-1')).toHaveLength(1);
    const admin = await pg.connectAsAdmin();
    try {
      const attempts = await admin.query<{ queue_item_id: string; payload_hash: string; status: string; error_code: string; idempotency_key: string }>(
        `select queue_item_id,idempotency_key,payload_hash,status,error_code from offline.sync_item_attempts
          where tenant_id=$1::uuid and device_id='hash-dev' and device_batch_id='hb-1' order by queue_item_id`, [tenantA]);
      expect(attempts.rows).toEqual([
        { queue_item_id: 'h-1', idempotency_key: 'h-1', payload_hash: oneByte, status: 'rejected', error_code: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
        { queue_item_id: 'h-2', idempotency_key: 'h-2', payload_hash: longHash, status: 'rejected', error_code: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
        { queue_item_id: 'h-4', idempotency_key: 'h-4', payload_hash: `sha256:${'A'.repeat(64)}`, status: 'rejected', error_code: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      ]);
      const rows = await admin.query<{ queue_rows: string; receipt_rows: string; consumption_rows: string }>(
        `select (select count(*) from offline.sync_queue_items where tenant_id=$1::uuid and id in ('h-1','h-2','h-4')) as queue_rows,
                (select count(*) from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key in ('h-1','h-2','h-4')) as receipt_rows,
                (select count(*) from offline.sync_conflicts where tenant_id=$1::uuid and sync_queue_item_id in ('h-1','h-2','h-4')) as consumption_rows`, [tenantA]);
      expect(rows.rows[0]).toEqual({ queue_rows: '0', receipt_rows: '0', consumption_rows: '0' });
    } finally {
      await admin.end();
    }
    // The same keys resubmitted with canonical hashes in a later batch apply: the keys were never consumed.
    const later = await run(tenantA, () => a.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'hash-dev', deviceBatchId: 'hb-2', items: [item('h-1'), item('h-2')] }, transport('ht-2')));
    expect(later.receipt.items).toEqual([{ queueItemId: 'h-1', status: 'applied' }, { queueItemId: 'h-2', status: 'applied' }]);
    // An existing original with a non-canonical resubmission is still a per-item rejection; the original is untouched.
    const again = await run(tenantA, () => a.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'hash-dev', deviceBatchId: 'hb-3', items: [{ ...item('h-5', 'h-1'), payloadHash: oneByte }] }, transport('ht-3')));
    expect(again.receipt.items).toEqual([{ queueItemId: 'h-5', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(await run(tenantA, () => a.getSyncItemReceipt('h-1'))).toEqual({ queueItemId: 'h-1', status: 'applied',
      stynx: { version: 1, receiptId: 'h-1', appliedAt: '2026-09-28T13:00:01.000Z', serverEntityId: 'server-h-1', attempts: 1 } });
    // Structural hashes stay a batch-wide 400 in CTG9 mode; E6 mode keeps its 400 for any non-canonical value.
    await expect(run(tenantA, () => a.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'hash-dev', deviceBatchId: 'hb-4', items: [{ ...item('h-6'), payloadHash: 'é'.repeat(128) }] }, transport('ht-4'))))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'payloadHash must be a string of 1 to 255 bytes.' });
    const e6 = new OfflineSyncService(new PostgresOfflineSyncStore(moduleRef), { current: () => ({ tenantId: tenantA, actorId: 'actor-a5' }) }, { now: () => now });
    const refused = await run(tenantA, () => e6.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'hash-dev', deviceBatchId: 'hb-e6', items: [{ ...item('h-7'), payloadHash: oneByte } as never] })).catch((error: unknown) => error as OfflineSyncError);
    expect([refused.code, refused.getStatus(), refused.message]).toEqual(['OFFLINE_SYNC_INVALID_INPUT', 400, 'payloadHash must be a canonical sha256-prefixed hexadecimal digest.']);
    expect((await run(tenantA, () => a.listSyncBatchReceipts({ deviceId: 'hash-dev' }))).items.map(batch => batch.deviceBatchId)).toEqual(['hb-3', 'hb-2', 'hb-1']);
  }, 60_000);

  it('UPS-OFS-12 accepts the no-shift sentinel, serves a consumer-written range under RLS without overlap, never revives a cancelled range, and isolates tenants', async () => {
    const a = service(tenantA);
    const database = moduleRef.get(Database);
    const permit = { ...reserve, orgUnitId: 'org-c', entityType: 'permit' };
    const rangeId = '20000000-0000-4000-8000-0000000000c5';
    const rangeRow = (admin: { query: <T>(sql: string, values: unknown[]) => Promise<{ rows: T[] }> }) =>
      admin.query<{ status: string; next_number: string }>(`select status,next_number from offline.numbering_ranges where id=$1::uuid`, [rangeId]).then(result => result.rows[0]);
    // D5 item 1: the sentinel is an ordinary shift value; every other `stynx:` shift is invalid input.
    const shiftless = await run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId: 'shiftless', shiftId: OFFLINE_SYNC_NO_SHIFT, requestedSize: 1, idempotencyKey: 'no-shift-1' }));
    expect(shiftless.shiftId).toBe('stynx:no-shift');
    expect(await run(tenantA, () => a.reserveNumbering({ ...reserve, deviceId: 'shiftless', shiftId: OFFLINE_SYNC_NO_SHIFT, requestedSize: 1, idempotencyKey: 'no-shift-1' }))).toEqual(shiftless);
    await expect(run(tenantA, () => a.reserveNumbering({ ...reserve, shiftId: 'stynx:reserved' }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'shiftId uses a reserved namespace.' });
    // D5 item 2: a consumer writes the range under the application role, tenant context and FORCE RLS.
    await run(tenantA, () => database.tx(trx => trx.query(`insert into offline.numbering_ranges
      (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number)
      values ($1::uuid,$2::uuid,'org-c','permit','P',100,111,100)`, [rangeId, tenantA])));
    const concurrent = await Promise.all(Array.from({ length: 6 }, (_, index) => run(tenantA, () => a.reserveNumbering({ ...permit, deviceId: `c-${index}`, requestedSize: 2 }))));
    expect(concurrent.map(reserved => [reserved.startNumber, reserved.endNumber]).sort((x, y) => x[0]! - y[0]!)).toEqual([[100, 101], [102, 103], [104, 105], [106, 107], [108, 109], [110, 111]]);
    expect(new Set(concurrent.map(reserved => reserved.rangeId))).toEqual(new Set([rangeId]));
    const exhausted = await run(tenantA, () => a.reserveNumbering({ ...permit, requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
    expect([exhausted.code, exhausted.reason]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'exhausted']);
    const admin = await pg.connectAsAdmin();
    try {
      expect(await rangeRow(admin)).toEqual({ status: 'exhausted', next_number: '112' });
      // Returning the unused tail reactivates the exhausted range.
      const tail = concurrent.find(reserved => reserved.endNumber === 111)!;
      await run(tenantA, () => a.cancelNumberingReservation(tail.reservationId));
      expect(await rangeRow(admin)).toEqual({ status: 'active', next_number: '110' });
      // The consumer cancels the range under the row lock that reservations take.
      await run(tenantA, () => database.tx(async trx => {
        await trx.query(`select 1 from offline.numbering_ranges where tenant_id=$1::uuid and id=$2::uuid for update`, [tenantA, rangeId]);
        await trx.query(`update offline.numbering_ranges set status='cancelled',updated_at=clock_timestamp() where tenant_id=$1::uuid and id=$2::uuid`, [tenantA, rangeId]);
      }));
      const inactive = await run(tenantA, () => a.reserveNumbering({ ...permit, series: 'P', requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
      expect([inactive.code, inactive.reason, inactive.getStatus()]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'inactive', 409]);
      const byId = await run(tenantA, () => a.reserveNumbering({ ...permit, rangeId, requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
      expect(byId.reason).toBe('inactive');
      // With `series` omitted a cancelled range is not a candidate.
      await expect(run(tenantA, () => a.reserveNumbering({ ...permit, requestedSize: 1 }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
      // Cancelling the new tail reservation neither revives nor rewinds the cancelled range.
      const previousTail = concurrent.find(reserved => reserved.endNumber === 109)!;
      await run(tenantA, () => a.cancelNumberingReservation(previousTail.reservationId));
      expect(await rangeRow(admin)).toEqual({ status: 'cancelled', next_number: '110' });
      const still = await run(tenantA, () => a.reserveNumbering({ ...permit, series: 'P', requestedSize: 1 })).catch((error: unknown) => error as OfflineSyncRangeUnavailableError);
      expect(still.reason).toBe('inactive');
      // A second active series is selected when the series is omitted.
      await run(tenantA, () => database.tx(trx => trx.query(`insert into offline.numbering_ranges
        (tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values ($1::uuid,'org-c','permit','Q',200,209,200)`, [tenantA])));
      expect(await run(tenantA, () => a.reserveNumbering({ ...permit, requestedSize: 1 }))).toMatchObject({ series: 'Q', startNumber: 200, endNumber: 200 });
    } finally {
      await admin.end();
    }
    // D5 item 2 under two tenants: consumer-written ranges are invisible and unwritable across tenants.
    const b = service(tenantB);
    await expect(run(tenantB, () => b.reserveNumbering({ ...permit, requestedSize: 1 }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
    const unseen = await run(tenantB, () => database.tx(trx => trx.query<{ count: string }>(`select count(*) as count from offline.numbering_ranges where id=$1::uuid`, [rangeId])));
    expect(unseen.rows[0]!.count).toBe('0');
    const forged = await run(tenantB, () => database.tx(trx => trx.query(`insert into offline.numbering_ranges
      (tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values ($1::uuid,'org-c','permit','R',1,9,1)`, [tenantA]))).catch((error: unknown) => error as { code?: string });
    expect(forged.code).toBe('42501');
    await run(tenantB, () => database.tx(trx => trx.query(`insert into offline.numbering_ranges
      (tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number) values ($1::uuid,'org-c','permit','P',500,509,500)`, [tenantB])));
    expect(await run(tenantB, () => b.reserveNumbering({ ...permit, requestedSize: 2 }))).toMatchObject({ tenantId: tenantB, series: 'P', startNumber: 500, endNumber: 501 });
    expect((await run(tenantA, () => a.reserveNumbering({ ...permit, series: 'Q', requestedSize: 1 }))).startNumber).toBe(201);
  }, 60_000);
});
