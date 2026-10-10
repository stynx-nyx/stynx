import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import { OfflineSyncUpgradeRequiredError } from '../../src/errors';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import type {
  CTG9SubmitSyncBatchInput,
  CTG9SyncBatchItemInput,
  OfflineSyncConflictResolver,
  OfflineSyncItemContext,
  StynxOfflineSyncModuleOptions,
  SyncConflict,
} from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

// INV-OFFLINE-001; UPS-OFS-06, UPS-OFS-07, UPS-OFS-08 (#317; ADR-MOBILE-OFFLINE-0003 D1, D2, D3). Real
// PostgreSQL, 0001→0004, app-role pool bound at connection startup so FORCE RLS applies, two tenants.
const tenantA = '00000000-0000-4000-8000-0000000000a7';
const tenantB = '00000000-0000-4000-8000-0000000000b7';
const at = '2026-09-28T12:00:00.000Z';
const later = '2026-09-28T14:00:00.000Z';
const payload = { value: 7 };
const hash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const migrationDir = resolve(__dirname, '../../migrations');
const migrations = [
  '0001_offline_sync.sql',
  '0002_durable_sync.sql',
  '0003_reservation_idempotency.sql',
  '0004_pending_state_and_conflict_actions.sql',
];
const reserve = {
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  shiftId: 'shift-a',
  entityType: 'citation',
  requestedSize: 2,
};
const item = (
  id: string,
  key = id,
  overrides: Partial<CTG9SyncBatchItemInput> = {},
): CTG9SyncBatchItemInput => ({
  queueItemId: id,
  entityType: 'citation',
  localEntityId: `local-${id}`,
  idempotencyKey: key,
  payloadHash: hash,
  payloadJson: payload,
  createdLocallyAt: at,
  ...overrides,
});
const batch = (
  deviceId: string,
  deviceBatchId: string,
  items: CTG9SyncBatchItemInput[],
): CTG9SubmitSyncBatchInput => ({ orgUnitId: 'org-a', deviceId, deviceBatchId, items });
const transport = (key: string) => ({
  transportIdempotencyKey: `t-${key}`,
  method: 'POST' as const,
  path: '/offline-sync/sync-batches',
});
const resolverOf = (
  allowed: readonly string[],
  attributes?: Record<string, unknown>,
): OfflineSyncConflictResolver & { resolve: ReturnType<typeof vi.fn> } => ({
  allowedActions: async () => allowed as never,
  resolve: vi.fn(
    async (_trx: unknown, conflictId: string, action: string) =>
      ({
        conflictId,
        tenantId: tenantA,
        queueItemId: 'host',
        localEntityId: 'host',
        payloadHash: hash,
        conflictType: 'domain',
        description: 'host',
        status: action === 'manual_review' ? 'open' : 'resolved',
        ...(attributes ? { consumerAttributes: attributes } : {}),
      }) as SyncConflict,
  ),
});

describe('UPS-OFS-06/-07/-08 PostgreSQL pending state, open manual review and typed context', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  const events: { idempotencyKey: string; entityId: string }[] = [];
  const applied: { queueItemId: string; batchId: string }[] = [];
  const applier = {
    apply: vi.fn(
      async (_trx: unknown, value: { queueItemId: string }, context: OfflineSyncItemContext) => {
        applied.push({ queueItemId: value.queueItemId, batchId: context.batchId });
        return { serverEntityId: `server-${value.queueItemId}` };
      },
    ),
  };
  const service = (tenantId: string, options: Partial<StynxOfflineSyncModuleOptions> = {}) =>
    new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId, actorId: `actor-${tenantId.slice(-2)}` }) },
      {
        now: () => at,
        policyResolver: {
          resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null }),
        },
        itemApplier: applier,
        eventPort: {
          appendInTransaction: async (_trx, event) => {
            events.push({ idempotencyKey: event.idempotencyKey, entityId: event.entityId });
          },
          appendManyInTransaction: async () => undefined,
        },
        ...options,
      } as StynxOfflineSyncModuleOptions,
    );
  const run = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    moduleRef
      .get(RequestContextMutator)
      .runWithRequestContext(
        {
          requestId: `ofs-157-${Math.random()}`,
          tenantId,
          actorId: `actor-${tenantId.slice(-2)}`,
          startedAt: new Date(at),
        },
        fn,
      );
  const sql = <T extends Record<string, unknown>>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ) =>
    run(tenantId, () => moduleRef.get(Database).tx((trx) => trx.query<T>(text, values))).then(
      (result) => result.rows,
    );
  /** Reserves two numbers and submits one keyed item created after the reservation expired: a `conflict` item with a domain conflict. */
  const expiredConflict = async (
    svc: OfflineSyncService,
    deviceId: string,
    id: string,
    allowed = ['reject', 'retry_after_correction'],
  ) => {
    const reservation = await run(tenantA, () => svc.reserveNumbering({ ...reserve, deviceId }));
    const result = await run(tenantA, () =>
      svc.submitSyncBatch(
        batch(deviceId, `${id}-b1`, [
          item(id, id, {
            reservedNumber: reservation.startNumber,
            reservationId: reservation.reservationId,
            createdLocallyAt: later,
          }),
        ]),
        transport(`${id}-b1`),
      ),
    );
    const receipt = result.receipt.items[0]!;
    expect(receipt).toMatchObject({
      status: 'conflict',
      errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
      context: { conflictId: expect.any(String), allowedActions: allowed },
    });
    return {
      reservation,
      conflictId: (receipt.context as { conflictId: string }).conflictId,
      result,
    };
  };

  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_157', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('ofs157-owner') },
            app: { connectionString: pg.appConnectionString('ofs157-app'), max: 10 },
            reader: { connectionString: pg.connectionString('ofs157-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      for (const name of migrations)
        await admin.query(await readFile(resolve(migrationDir, name), 'utf8'));
      await admin.query(
        `insert into tenancy.tenants (id,slug,name,is_active,created_at,updated_at) values
        ($1::uuid,'ofs-157-a','OFS 157 A',true,clock_timestamp(),clock_timestamp()),
        ($2::uuid,'ofs-157-b','OFS 157 B',true,clock_timestamp(),clock_timestamp())`,
        [tenantA, tenantB],
      );
      await admin.query(
        `insert into offline.numbering_ranges
        (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values
        ('30000000-0000-4000-8000-0000000000a7',$1::uuid,'org-a','citation','C',1,90,1,'active'),
        ('30000000-0000-4000-8000-0000000000b7',$2::uuid,'org-a','citation','C',1,90,1,'active')`,
        [tenantA, tenantB],
      );
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);

  it('UPS-OFS-06 (D1) retry_after_correction moves the item and its receipt to pending and the conflict to resolved in one transaction; a closed-batch replay returns the original bytes; a different hash leaves it pending; a later same-device batch re-applies once under two concurrent submissions with a distinct event key and no reissued number', async () => {
    const resolver = resolverOf(['reject', 'retry_after_correction']);
    const a = service(tenantA, { conflictResolver: resolver });
    const { reservation, conflictId, result } = await expiredConflict(a, 'dev-p', 'p-1');
    const retryItem = (overrides: Partial<CTG9SyncBatchItemInput>) => item('p-1', 'p-1', overrides);
    expect(
      await run(tenantA, () =>
        a.resolveConflict(conflictId, {
          resolution: 'retry_after_correction',
          description: 'corrected',
          userRef: 'user-p',
        }),
      ),
    ).toMatchObject({
      status: 'resolved',
      resolution: 'retry_after_correction',
      resolvedBy: 'actor-a7',
      resolvedAt: at,
    });
    const state = await sql<{
      item_status: string;
      receipt_status: string;
      receipt_error: string | null;
      conflict_status: string;
      actions: string;
      attempts: number;
    }>(
      tenantA,
      `
      select q.status as item_status, r.status as receipt_status, r.error_code as receipt_error, c.status as conflict_status,
             (select count(*) from offline.sync_conflict_actions where tenant_id=q.tenant_id and conflict_id=c.id) as actions,
             (r.context_json->'stynx'->>'attempts')::int as attempts
      from offline.sync_queue_items q
      join offline.sync_item_receipts r on r.tenant_id=q.tenant_id and r.idempotency_key=q.idempotency_key
      join offline.sync_conflicts c on c.tenant_id=q.tenant_id and c.sync_queue_item_id=q.id
      where q.tenant_id=$1::uuid and q.id='p-1'`,
      [tenantA],
    );
    expect(state).toEqual([
      {
        item_status: 'pending',
        receipt_status: 'pending',
        receipt_error: null,
        conflict_status: 'resolved',
        actions: '1',
        attempts: 1,
      },
    ]);
    expect(
      (await run(tenantA, () => a.listSyncQueueItems({ status: 'pending' }))).items,
    ).toMatchObject([
      {
        queueItemId: 'p-1',
        deviceBatchId: 'p-1-b1',
        stynx: { attempts: 1, reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED' },
      },
    ]);
    expect(await run(tenantA, () => a.getSyncItemReceipt('p-1'))).toMatchObject({
      status: 'pending',
      context: { conflictId },
      stynx: { version: 1, receiptId: 'p-1', attempts: 1 },
    });
    // D1 item 5: a closed batch replays the original bytes; a read never applies.
    const replay = await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-p', 'p-1-b1', [
          retryItem({
            reservedNumber: reservation.startNumber,
            reservationId: reservation.reservationId,
            createdLocallyAt: later,
          }),
        ]),
        transport('p-1-b1'),
      ),
    );
    expect(replay).toEqual(result);
    expect(applied).toEqual([]);
    // Same key with a different hash is an integrity rejection; the item stays pending.
    const changed = await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-p', 'p-1-b2', [retryItem({ payloadHash: otherHash })]),
        transport('p-1-b2'),
      ),
    );
    expect(changed.receipt.items).toEqual([
      { queueItemId: 'p-1', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
    ]);
    expect(
      (
        await run(tenantA, () =>
          a.listSyncConflicts({ queueItemId: 'p-1', conflictType: 'integrity' }),
        )
      ).items,
    ).toMatchObject([
      {
        status: 'open',
        payloadHash: hash,
        stynx: { receivedPayloadHash: otherHash, storedPayloadHash: hash },
      },
    ]);
    expect((await run(tenantA, () => a.getSyncItemReceipt('p-1'))).status).toBe('pending');
    // Another device under the same key receives the committed status without applying.
    const foreign = await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-q', 'q-b1', [item('q-1', 'p-1')]), transport('q-b1')),
    );
    expect(foreign.receipt.items).toMatchObject([
      {
        queueItemId: 'q-1',
        status: 'pending',
        context: { originalQueueItemId: 'p-1', conflictId },
      },
    ]);
    expect(foreign.receipt.items[0]!.errorCode).toBe(undefined);
    expect(applied).toEqual([]);
    // D1 item 4: the same device, a later batch id, the same key and hash and a corrected reservation.
    const corrected = await run(tenantA, () =>
      a.reserveNumbering({ ...reserve, deviceId: 'dev-p' }),
    );
    const retry = retryItem({
      reservedNumber: corrected.startNumber,
      reservationId: corrected.reservationId,
    });
    const [second, third] = await Promise.all([
      run(tenantA, () => a.submitSyncBatch(batch('dev-p', 'p-1-b3', [retry]), transport('p-1-b3'))),
      run(tenantA, () => a.submitSyncBatch(batch('dev-p', 'p-1-b4', [retry]), transport('p-1-b4'))),
    ]);
    expect(applied).toEqual([
      { queueItemId: 'p-1', batchId: expect.stringMatching(/^p-1-b[34]$/u) },
    ]);
    expect([second.receipt.items[0], third.receipt.items[0]]).toMatchObject([
      { queueItemId: 'p-1', status: 'applied' },
      { queueItemId: 'p-1', status: 'applied' },
    ]);
    expect([second.receipt.items[0]!.errorCode, third.receipt.items[0]!.errorCode]).toEqual([
      undefined,
      undefined,
    ]);
    expect(events).toEqual([{ idempotencyKey: 'p-1:retry:2', entityId: 'server-p-1' }]);
    const receipt = await run(tenantA, () => a.getSyncItemReceipt('p-1'));
    expect(receipt).toMatchObject({
      queueItemId: 'p-1',
      status: 'applied',
      context: { conflictId },
      stynx: {
        version: 1,
        receiptId: 'p-1',
        appliedAt: at,
        serverEntityId: 'server-p-1',
        attempts: 2,
      },
    });
    // The earlier attempt's failure fields are not carried into the applied receipt.
    expect(receipt.errorCode).toBe(undefined);
    expect(receipt.stynx).toEqual({
      version: 1,
      receiptId: 'p-1',
      appliedAt: at,
      serverEntityId: 'server-p-1',
      attempts: 2,
    });
    // The receipt keeps its original batch binding; the re-applying batches recorded their outcome as attempts.
    expect(
      (await run(tenantA, () => a.listSyncItemReceipts({ deviceId: 'dev-p' }))).items,
    ).toMatchObject([{ receiptId: 'p-1', deviceBatchId: 'p-1-b1', status: 'applied' }]);
    const attempts = await sql<{
      device_batch_id: string;
      status: string;
      applied_at: string | null;
    }>(
      tenantA,
      `
      select device_batch_id,status,context_json->'stynx'->>'appliedAt' as applied_at from offline.sync_item_attempts
      where tenant_id=$1::uuid and idempotency_key='p-1' and device_batch_id in ('p-1-b3','p-1-b4') order by device_batch_id`,
      [tenantA],
    );
    expect(attempts.map((row) => row.status)).toEqual(['applied', 'applied']);
    expect(attempts.filter((row) => row.applied_at === at)).toHaveLength(1);
    // D1 item 6: the corrected number is consumed once; the expired reservation never consumed its number.
    expect(
      (await run(tenantA, () => a.getNumberingConsumption(corrected.reservationId))).consumption[0],
    ).toMatchObject({
      number: corrected.startNumber,
      status: 'applied',
      serverEntityId: 'server-p-1',
    });
    expect(
      (
        await run(tenantA, () => a.getNumberingConsumption(reservation.reservationId))
      ).consumption.filter((entry) => entry.status === 'applied'),
    ).toEqual([]);
    expect((await run(tenantA, () => a.listSyncQueueItems({ status: 'pending' }))).items).toEqual(
      [],
    );
    // Replays of both re-applying batches return their stored bytes with no further effect.
    expect(
      (
        await run(tenantA, () =>
          a.submitSyncBatch(batch('dev-p', 'p-1-b4', [retry]), transport('p-1-b4')),
        )
      ).receipt.items[0]!.status,
    ).toBe('applied');
    expect(applied).toHaveLength(1);
    // Tenant B never sees any of it.
    expect(
      (await run(tenantB, () => service(tenantB).listSyncQueueItems({ deviceId: 'dev-p' }))).items,
    ).toEqual([]);
  }, 60_000);

  it('UPS-OFS-06 (D1) refuses the transition with the existing 409 when an effect was committed (applied with a concurrency suspicion), when another conflict is open, and when the item is not in conflict', async () => {
    const resolver = resolverOf(['retry_after_correction', 'reject', 'manual_review']);
    const pairs = [{ firstItemId: 'c-1', secondItemId: 'c-2' }];
    const a = service(tenantA, {
      conflictResolver: resolver,
      policyResolver: {
        resolve: async () => ({
          reservationTtlMs: 3_600_000,
          maxBatchItems: null,
          concurrencyWindowMinutes: 5,
        }),
      },
      concurrencyDetector: {
        detect: async (_trx, value) => ({ suspected: value.queueItemId === 'c-2', pairs }),
      },
    });
    await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-c1', 'cb-1', [item('c-1')]), transport('cb-1')),
    );
    const suspected = await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-c2', 'cb-2', [item('c-2')]), transport('cb-2')),
    );
    expect(suspected.receipt.items).toEqual([{ queueItemId: 'c-2', status: 'conflict' }]);
    const suspectedReceipt = await run(tenantA, () => a.getSyncItemReceipt('c-2'));
    const concurrency = (suspectedReceipt.context as { conflictId: string }).conflictId;
    expect(suspectedReceipt).toMatchObject({
      status: 'conflict',
      context: {
        conflictId: concurrency,
        relatedQueueItemId: 'c-1',
        allowedActions: ['retry_after_correction', 'reject', 'manual_review'],
      },
      stynx: {
        version: 1,
        receiptId: 'c-2',
        appliedAt: at,
        serverEntityId: 'server-c-2',
        attempts: 1,
        relatedQueueItemId: 'c-1',
        reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED',
        retryable: true,
      },
    });
    expect(await run(tenantA, () => a.getSyncItemReceipt('c-1'))).toMatchObject({
      status: 'conflict',
      stynx: {
        appliedAt: at,
        serverEntityId: 'server-c-1',
        relatedQueueItemId: 'c-2',
        reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED',
      },
    });
    expect(
      (await run(tenantA, () => a.listSyncConflicts({ queueItemId: 'c-1' }))).items[0],
    ).toMatchObject({
      conflictType: 'concurrency',
      stynx: { relatedQueueItemId: 'c-2', reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED' },
    });
    await expect(
      run(tenantA, () => a.resolveConflict(concurrency, { resolution: 'retry_after_correction' })),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION',
      response: { statusCode: 409 },
      message: 'The item cannot return to pending.',
    });
    expect(
      await sql(
        tenantA,
        `select status from offline.sync_conflicts where tenant_id=$1::uuid and id=$2::uuid`,
        [tenantA, concurrency],
      ),
    ).toEqual([{ status: 'open' }]);
    expect(
      await sql(
        tenantA,
        `select status from offline.sync_queue_items where tenant_id=$1::uuid and id='c-2'`,
        [tenantA],
      ),
    ).toEqual([{ status: 'conflict' }]);
    // Another open conflict on the item (an integrity conflict) blocks the transition; the refusal writes no history row.
    const { conflictId } = await expiredConflict(a, 'dev-x', 'x-1', [
      'retry_after_correction',
      'reject',
      'manual_review',
    ]);
    await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-x', 'x-b2', [item('x-1', 'x-1', { payloadHash: otherHash })]),
        transport('x-b2'),
      ),
    );
    await expect(
      run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'retry_after_correction' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect(
      await sql(
        tenantA,
        `select count(*) from offline.sync_conflict_actions where tenant_id=$1::uuid and conflict_id=$2::uuid`,
        [tenantA, conflictId],
      ),
    ).toEqual([{ count: '0' }]);
    // A rejected item (no coverage) has a domain conflict but is not `conflict`.
    const rejected = await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-r', 'rb-1', [item('r-1', 'r-1', { reservedNumber: 999 })]),
        transport('rb-1'),
      ),
    );
    expect(rejected.receipt.items[0]!.status).toBe('rejected');
    await expect(
      run(tenantA, () =>
        a.resolveConflict(
          (rejected.receipt.items[0]!.context as { conflictId: string }).conflictId,
          { resolution: 'retry_after_correction' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect((await run(tenantA, () => a.listSyncQueueItems({ status: 'pending' }))).items).toEqual(
      [],
    );
  }, 60_000);

  it('V-08 UPS-OFS-07 (D2) manual_review leaves the conflict open with a null resolution and one history row per action; a later final action resolves it; a forbidden action and an unknown resolver status are refused; tenant B sees no history and the app role cannot update or delete it', async () => {
    const resolver = resolverOf(['manual_review', 'reject', 'retry_after_correction'], {
      reviewer: 'desk-3',
    });
    const a = service(tenantA, { conflictResolver: resolver });
    const { conflictId } = await expiredConflict(a, 'dev-m', 'm-1', [
      'manual_review',
      'reject',
      'retry_after_correction',
    ]);
    const first = await run(tenantA, () =>
      a.resolveConflict(conflictId, {
        resolution: 'manual_review',
        description: 'needs a supervisor',
        userRef: 'user-1',
      }),
    );
    expect(first).toEqual({
      conflictId,
      tenantId: tenantA,
      queueItemId: 'host',
      localEntityId: 'host',
      payloadHash: hash,
      conflictType: 'domain',
      description: 'host',
      status: 'open',
      stynx: {
        version: 1,
        receiptId: 'm-1',
        reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
        errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
        attempts: 1,
        retryable: true,
        consumerAttributes: { reviewer: 'desk-3' },
      },
    });
    const row = await sql<{
      status: string;
      resolution: string | null;
      resolved_at: string | null;
      item_status: string;
    }>(
      tenantA,
      `
      select c.status,c.resolution,c.resolved_at,q.status as item_status from offline.sync_conflicts c
      join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id where c.tenant_id=$1::uuid and c.id=$2::uuid`,
      [tenantA, conflictId],
    );
    expect(row).toEqual([
      { status: 'open', resolution: null, resolved_at: null, item_status: 'conflict' },
    ]);
    expect(
      (await run(tenantA, () => a.listSyncConflictActions({ conflictId }))).items,
    ).toMatchObject([
      {
        conflictId,
        tenantId: tenantA,
        action: 'manual_review',
        reason: 'needs a supervisor',
        userRef: 'user-1',
        actorId: 'actor-a7',
        resultingStatus: 'open',
        createdAt: expect.stringMatching(/Z$/u),
      },
    ]);
    expect(
      (
        await run(tenantA, () =>
          a.resolveConflict(conflictId, { resolution: 'manual_review', userRef: 'user-2' }),
        )
      ).status,
    ).toBe('open');
    await expect(
      run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'accept_server' })),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION',
      response: { statusCode: 409 },
    });
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    resolver.resolve.mockResolvedValueOnce({ conflictId, status: 'closed' } as never);
    await expect(
      run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'reject' })),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION',
      message: 'Conflict resolver did not resolve the conflict.',
    });
    const closed = await run(tenantA, () =>
      a.resolveConflict(conflictId, { resolution: 'reject', description: 'wrong agency' }),
    );
    expect(closed).toMatchObject({
      conflictId,
      status: 'resolved',
      resolution: 'reject',
      resolvedBy: 'actor-a7',
      resolvedAt: at,
      stynx: { consumerAttributes: { reviewer: 'desk-3' } },
    });
    expect(
      await sql(
        tenantA,
        `select status,resolution,resolution_reason,resolved_by from offline.sync_conflicts where tenant_id=$1::uuid and id=$2::uuid`,
        [tenantA, conflictId],
      ),
    ).toEqual([
      {
        status: 'resolved',
        resolution: 'reject',
        resolution_reason: 'wrong agency',
        resolved_by: 'actor-a7',
      },
    ]);
    const page = await run(tenantA, () => a.listSyncConflictActions({ conflictId, limit: 2 }));
    expect(
      page.items.map((action) => [action.action, action.resultingStatus, action.userRef ?? null]),
    ).toEqual([
      ['reject', 'resolved', null],
      ['manual_review', 'open', 'user-2'],
    ]);
    const rest = await run(tenantA, () =>
      a.listSyncConflictActions({ conflictId, limit: 2, cursor: page.nextCursor! }),
    );
    expect(rest).toMatchObject({
      items: [{ action: 'manual_review', reason: 'needs a supervisor', userRef: 'user-1' }],
      nextCursor: null,
    });
    // Evidence keeps the history of the closing action as before; the conflict listing exposes the platform object.
    expect(
      (await run(tenantA, () => a.listSyncConflicts({ queueItemId: 'm-1' }))).items,
    ).toMatchObject([
      {
        status: 'resolved',
        resolution: 'reject',
        stynx: {
          consumerAttributes: { reviewer: 'desk-3' },
          reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
        },
      },
    ]);
    // Tenant B: no history through the service or under its own app-role transaction; no update or delete for the app role.
    expect(
      (await run(tenantB, () => service(tenantB).listSyncConflictActions({ conflictId }))).items,
    ).toEqual([]);
    expect(
      await sql(
        tenantB,
        `select count(*) from offline.sync_conflict_actions where conflict_id=$1::uuid`,
        [conflictId],
      ),
    ).toEqual([{ count: '0' }]);
    await expect(
      sql(
        tenantA,
        `update offline.sync_conflict_actions set reason='edited' where conflict_id=$1::uuid`,
        [conflictId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      sql(tenantA, `delete from offline.sync_conflict_actions where conflict_id=$1::uuid`, [
        conflictId,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      await sql(
        tenantA,
        `select count(*) from offline.sync_conflict_actions where conflict_id=$1::uuid`,
        [conflictId],
      ),
    ).toEqual([{ count: '3' }]);
    // D2 item 7: without a resolver the legacy E6 resolution is unchanged and writes no history.
    const legacy = new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId: 'actor-a7' }) },
      { now: () => at },
    );
    await run(tenantA, () =>
      legacy.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'e6-dev',
        deviceBatchId: 'e6-b',
        items: [{ ...item('e6-q'), payloadHash: `sha256:${'c'.repeat(64)}` } as never],
      }),
    );
    const opened = await run(tenantA, () =>
      legacy.openConflict('e6-q', { conflictType: 'version', description: 'stale' }),
    );
    await expect(
      run(tenantA, () =>
        legacy.resolveConflict(opened.conflictId, { resolution: 'manual-review' }),
      ),
    ).resolves.toMatchObject({ status: 'resolved', resolution: 'manual-review' });
    expect(
      (await run(tenantA, () => legacy.listSyncConflictActions({ conflictId: opened.conflictId })))
        .items,
    ).toEqual([]);
  }, 60_000);

  it('UPS-OFS-07 (D2.5) applies current action policy before any resolver, history or state change and accepts a newly granted action', async () => {
    let allowed = ['manual_review', 'reject'];
    const allowedActions = vi.fn(async () => allowed as never);
    const resolver = { ...resolverOf(allowed), allowedActions };
    const a = service(tenantA, { conflictResolver: resolver });
    const { conflictId } = await expiredConflict(a, 'dev-policy', 'policy-db', allowed);
    allowedActions.mockClear();
    await run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'manual_review' }));
    const snapshot = async () => ({
      conflicts: await run(tenantA, () => a.listSyncConflicts({ queueItemId: 'policy-db' })),
      receipt: await run(tenantA, () => a.getSyncItemReceipt('policy-db')),
      queue: await run(tenantA, () => a.listSyncQueueItems({ deviceId: 'dev-policy' })),
      history: await run(tenantA, () => a.listSyncConflictActions({ conflictId })),
    });
    const before = await snapshot();
    allowed = ['manual_review'];
    await expect(
      run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'reject' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(await snapshot()).toEqual(before);
    allowed = ['accept_server'];
    await expect(
      run(tenantA, () => a.resolveConflict(conflictId, { resolution: 'accept_server' })),
    ).resolves.toMatchObject({ status: 'resolved', resolution: 'accept_server' });
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect(
      (await run(tenantA, () => a.listSyncConflictActions({ conflictId }))).items.map(
        (action) => action.action,
      ),
    ).toEqual(['accept_server', 'manual_review']);
    expect(allowedActions.mock.calls).toHaveLength(3);
    for (const call of allowedActions.mock.calls) {
      expect(call).toEqual([
        expect.any(Object),
        conflictId,
        {
          tenantId: tenantA,
          actorId: 'actor-a7',
          agentId: 'actor-a7',
          orgUnitId: 'org-a',
          deviceId: 'dev-policy',
          batchId: 'policy-db-b1',
          now: at,
        },
      ]);
    }
  }, 60_000);

  it.each([undefined, { desk: 9 }])(
    'UPS-OFS-08 (D3) resolving legacy conflict evidence preserves host keys and creates versioned context only for new attributes: %j',
    async (attributes) => {
      const resolver = resolverOf(['manual_review', 'reject'], attributes);
      const a = service(tenantA, { conflictResolver: resolver });
      const suffix = attributes ? 'attrs' : 'absent';
      const { conflictId } = await expiredConflict(a, `dev-legacy-${suffix}`, `legacy-${suffix}`, [
        'manual_review',
        'reject',
      ]);
      const host = { host: 'legacy', nested: { preserved: ['a', 7] } };
      const admin = await pg.connectAsAdmin();
      try {
        await admin.query(
          'update offline.sync_conflict_evidence set evidence=$3::jsonb where tenant_id=$1::uuid and conflict_id=$2::uuid',
          [tenantA, conflictId, JSON.stringify(host)],
        );
      } finally {
        await admin.end();
      }
      const expected = attributes
        ? { ...host, stynx: { version: 1, consumerAttributes: attributes } }
        : host;
      for (const action of ['manual_review', 'reject']) {
        const resolved = await run(tenantA, () =>
          a.resolveConflict(conflictId, { resolution: action }),
        );
        expect(resolved.stynx).toEqual(
          attributes ? { version: 1, consumerAttributes: attributes } : undefined,
        );
        expect(
          await sql(
            tenantA,
            'select evidence from offline.sync_conflict_evidence where tenant_id=$1::uuid and conflict_id=$2::uuid',
            [tenantA, conflictId],
          ),
        ).toEqual([
          {
            evidence:
              action === 'manual_review'
                ? expected
                : {
                    ...expected,
                    resolutionAction: 'reject',
                    resolutionReason: null,
                    resolutionUserRef: null,
                    resolvedAt: at,
                    resolvedBy: 'actor-a7',
                    resultingStatus: 'resolved',
                  },
          },
        ]);
        expect(
          (await run(tenantA, () => a.listSyncConflicts({ queueItemId: `legacy-${suffix}` })))
            .items[0]!.stynx,
        ).toEqual(resolved.stynx);
      }
    },
    60_000,
  );

  it('V-05 UPS-OFS-08 (D3) receipts, queue items and conflicts expose the versioned stynx object apart from context; failed items carry code, message and attempts; replay returns identical values; consumer attributes round-trip verbatim; rows written before the upgrade read without fabricated fields', async () => {
    const a = service(tenantA);
    applier.apply.mockImplementationOnce(async (_trx: unknown, value: { queueItemId: string }) => ({
      serverEntityId: `server-${value.queueItemId}`,
      consumerAttributes: { agency: 'A1', nested: { ok: true, list: [1, 'two'] } },
    }));
    const result = await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-d', 'db-1', [item('d-1'), item('d-2')]), transport('db-1')),
    );
    expect(result.receipt.items).toEqual([
      { queueItemId: 'd-1', status: 'applied' },
      { queueItemId: 'd-2', status: 'applied' },
    ]);
    const expected = {
      version: 1,
      receiptId: 'd-1',
      appliedAt: at,
      serverEntityId: 'server-d-1',
      attempts: 1,
      consumerAttributes: { agency: 'A1', nested: { ok: true, list: [1, 'two'] } },
    };
    expect(await run(tenantA, () => a.getSyncItemReceipt('d-1'))).toEqual({
      queueItemId: 'd-1',
      status: 'applied',
      stynx: expected,
    });
    expect(
      await sql(
        tenantA,
        `select context_json from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key='d-1'`,
        [tenantA],
      ),
    ).toEqual([{ context_json: { stynx: expected } }]);
    expect(
      (await run(tenantA, () => a.listSyncItemReceipts({ deviceBatchId: 'db-1' }))).items.map(
        (row) => [row.receiptId, row.stynx?.serverEntityId],
      ),
    ).toEqual([
      ['d-2', 'server-d-2'],
      ['d-1', 'server-d-1'],
    ]);
    expect(
      (await run(tenantA, () => a.listSyncQueueItems({ deviceId: 'dev-d' }))).items.find(
        (row) => row.queueItemId === 'd-1',
      ),
    ).toMatchObject({ status: 'applied', stynx: expected });
    expect((await run(tenantA, () => a.getSyncBatchReceipt('dev-d', 'db-1'))).items).toEqual([
      { queueItemId: 'd-1', status: 'applied', stynx: expected },
      {
        queueItemId: 'd-2',
        status: 'applied',
        stynx: {
          version: 1,
          receiptId: 'd-2',
          appliedAt: at,
          serverEntityId: 'server-d-2',
          attempts: 1,
        },
      },
    ]);
    // D3 item 4: replay returns the stored values; the attempt count does not move.
    expect(
      await run(tenantA, () =>
        a.submitSyncBatch(batch('dev-d', 'db-1', [item('d-1'), item('d-2')]), transport('db-1')),
      ),
    ).toEqual(result);
    expect(await run(tenantA, () => a.getSyncItemReceipt('d-1'))).toEqual({
      queueItemId: 'd-1',
      status: 'applied',
      stynx: expected,
    });
    // Failed items: a 4xx is rejected with code and message; any other error stays received and retryable, then counts a second attempt on resume.
    applier.apply.mockRejectedValueOnce(
      new HttpException({ errorCode: 'DOMAIN_REFUSED', message: 'agency closed' }, 422),
    );
    applier.apply.mockRejectedValueOnce(new Error('connection reset'));
    const failed = await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-d', 'db-2', [item('d-3'), item('d-4')]), transport('db-2')),
    );
    expect(failed.receipt.status).toBe('open');
    expect(await run(tenantA, () => a.getSyncItemReceipt('d-3'))).toEqual({
      queueItemId: 'd-3',
      status: 'rejected',
      errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
      stynx: {
        version: 1,
        receiptId: 'd-3',
        errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
        errorMessage: 'agency closed',
        attempts: 1,
        retryable: false,
      },
    });
    expect(await run(tenantA, () => a.getSyncItemReceipt('d-4'))).toEqual({
      queueItemId: 'd-4',
      status: 'received',
      errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
      stynx: {
        version: 1,
        receiptId: 'd-4',
        errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
        errorMessage: 'connection reset',
        attempts: 1,
        retryable: true,
      },
    });
    const resumed = await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-d', 'db-2', [item('d-3'), item('d-4')]), transport('db-2')),
    );
    expect(resumed.receipt.items.map((row) => row.status)).toEqual(['rejected', 'applied']);
    expect(await run(tenantA, () => a.getSyncItemReceipt('d-4'))).toEqual({
      queueItemId: 'd-4',
      status: 'applied',
      stynx: {
        version: 1,
        receiptId: 'd-4',
        appliedAt: at,
        serverEntityId: 'server-d-4',
        attempts: 2,
      },
    });
    // D3 item 3: oversized attributes reject the item and roll back its effect and event.
    const eventsBefore = events.length;
    applier.apply.mockResolvedValueOnce({
      serverEntityId: 'server-d-5',
      consumerAttributes: { blob: 'x'.repeat(5000) },
    });
    expect(
      (
        await run(tenantA, () =>
          a.submitSyncBatch(batch('dev-d', 'db-3', [item('d-5')]), transport('db-3')),
        )
      ).receipt.items,
    ).toEqual([
      { queueItemId: 'd-5', status: 'rejected', errorCode: 'OFFLINE_SYNC_INVALID_INPUT' },
    ]);
    expect(events).toHaveLength(eventsBefore);
    expect(
      await sql(
        tenantA,
        `select status from offline.sync_queue_items where tenant_id=$1::uuid and id='d-5'`,
        [tenantA],
      ),
    ).toEqual([{ status: 'rejected' }]);
    // Rows written before the upgrade: existing keys keep their bytes and no platform object is fabricated.
    await sql(
      tenantA,
      `insert into offline.sync_batches (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status)
      values ($1::uuid,'dev-old','old-b','org-a','agent','ctx','["old-1","old-2"]'::jsonb,'closed')`,
      [tenantA],
    );
    await sql(
      tenantA,
      `insert into offline.sync_item_receipts (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,context_json)
      values ($1::uuid,'old-1','old-1','dev-old','old-b',$2,'applied','{"legacy":true}'::jsonb), ($1::uuid,'old-2','old-2','dev-old','old-b',$2,'rejected',null)`,
      [tenantA, hash],
    );
    expect(await run(tenantA, () => a.getSyncItemReceipt('old-1'))).toEqual({
      queueItemId: 'old-1',
      status: 'applied',
      context: { legacy: true },
    });
    expect(await run(tenantA, () => a.getSyncItemReceipt('old-2'))).toEqual({
      queueItemId: 'old-2',
      status: 'rejected',
    });
    expect(
      (await run(tenantA, () => a.listSyncItemReceipts({ deviceId: 'dev-old' }))).items.map(
        (row) => [row.receiptId, row.context ?? null, row.stynx ?? null],
      ),
    ).toEqual([
      ['old-2', null, null],
      ['old-1', { legacy: true }, null],
    ]);
  }, 60_000);

  it('V-05 UPS-OFS-08 (D3.6) a same-key different-hash submission records one integrity conflict per received hash referencing the untouched original, with both hashes verbatim in the evidence and the attempt; reject is the only action without an override', async () => {
    const a = service(tenantA, { conflictResolver: resolverOf(['reject']) });
    await run(tenantA, () =>
      a.submitSyncBatch(batch('dev-i', 'ib-1', [item('i-1')]), transport('ib-1')),
    );
    const original = await run(tenantA, () => a.getSyncItemReceipt('i-1'));
    const first = await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-j', 'ib-2', [item('i-1b', 'i-1', { payloadHash: otherHash })]),
        transport('ib-2'),
      ),
    );
    expect(first.receipt.items).toEqual([
      { queueItemId: 'i-1b', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
    ]);
    const [conflict] = (
      await run(tenantA, () =>
        a.listSyncConflicts({ conflictType: 'integrity', queueItemId: 'i-1' }),
      )
    ).items;
    expect(conflict).toMatchObject({
      queueItemId: 'i-1',
      payloadHash: hash,
      conflictType: 'integrity',
      status: 'open',
      deviceId: 'dev-i',
      description: 'Payload hash differs from the stored item.',
      stynx: {
        version: 1,
        receiptId: 'i-1',
        reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
        receivedPayloadHash: otherHash,
        storedPayloadHash: hash,
        relatedQueueItemId: 'i-1b',
        retryable: false,
      },
    });
    expect(
      await sql(
        tenantA,
        `select queue_item_id,related_queue_item_id,allowed_actions,evidence->>'receivedPayloadHash' as received,evidence->>'storedPayloadHash' as stored
      from offline.sync_conflict_evidence where tenant_id=$1::uuid and conflict_id=$2::uuid`,
        [tenantA, conflict!.conflictId],
      ),
    ).toEqual([
      {
        queue_item_id: 'i-1',
        related_queue_item_id: 'i-1b',
        allowed_actions: ['reject'],
        received: otherHash,
        stored: hash,
      },
    ]);
    expect(
      await sql(
        tenantA,
        `select status,error_code,payload_hash,context_json->'stynx'->>'storedPayloadHash' as stored from offline.sync_item_attempts
      where tenant_id=$1::uuid and device_batch_id='ib-2'`,
        [tenantA],
      ),
    ).toEqual([
      {
        status: 'rejected',
        error_code: 'OFFLINE_SYNC_ITEM_INTEGRITY',
        payload_hash: otherHash,
        stored: hash,
      },
    ]);
    // The original, its receipt, status and effect are unchanged; a repetition reuses the conflict.
    expect(await run(tenantA, () => a.getSyncItemReceipt('i-1'))).toEqual(original);
    expect(
      await sql(
        tenantA,
        `select status,payload_hash from offline.sync_queue_items where tenant_id=$1::uuid and id='i-1'`,
        [tenantA],
      ),
    ).toEqual([{ status: 'applied', payload_hash: hash }]);
    await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-k', 'ib-3', [item('i-1c', 'i-1', { payloadHash: otherHash })]),
        transport('ib-3'),
      ),
    );
    expect(
      (
        await run(tenantA, () =>
          a.listSyncConflicts({ conflictType: 'integrity', queueItemId: 'i-1' }),
        )
      ).items,
    ).toHaveLength(1);
    // A non-canonical hash with an existing original records the conflict with the received value verbatim (D4 item 4).
    await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-i', 'ib-4', [item('i-1d', 'i-1', { payloadHash: 'Not-Canonical' })]),
        transport('ib-4'),
      ),
    );
    const conflicts = (
      await run(tenantA, () =>
        a.listSyncConflicts({ conflictType: 'integrity', queueItemId: 'i-1' }),
      )
    ).items;
    expect(conflicts.map((entry) => entry.stynx?.receivedPayloadHash).sort()).toEqual([
      'Not-Canonical',
      otherHash,
    ]);
    expect(conflicts.every((entry) => entry.payloadHash === hash)).toBe(true);
    // Without an original there is no conflict row: the attempt alone carries the received hash.
    await run(tenantA, () =>
      a.submitSyncBatch(
        batch('dev-i', 'ib-5', [item('i-9', 'i-9', { payloadHash: 'y' })]),
        transport('ib-5'),
      ),
    );
    expect(
      await sql(
        tenantA,
        `select count(*) from offline.sync_conflicts where tenant_id=$1::uuid and conflict_type='integrity' and sync_queue_item_id in ('i-1','i-9')`,
        [tenantA],
      ),
    ).toEqual([{ count: '2' }]);
    expect(
      await sql(
        tenantA,
        `select count(*) from offline.sync_queue_items where tenant_id=$1::uuid and id='i-9'`,
        [tenantA],
      ),
    ).toEqual([{ count: '0' }]);
    expect(
      await sql(
        tenantA,
        `select payload_hash,context_json->'stynx' as stynx from offline.sync_item_attempts where tenant_id=$1::uuid and device_batch_id='ib-5'`,
        [tenantA],
      ),
    ).toEqual([
      {
        payload_hash: 'y',
        stynx: {
          version: 1,
          receiptId: 'i-9',
          errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
          reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
          receivedPayloadHash: 'y',
          retryable: false,
        },
      },
    ]);
    // `reject` only: the retry is refused and the original never becomes pending.
    await expect(
      run(tenantA, () =>
        a.resolveConflict(conflict!.conflictId, { resolution: 'retry_after_correction' }),
      ),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION',
      message: 'Resolution action is not allowed.',
    });
    await expect(
      run(tenantA, () => a.resolveConflict(conflict!.conflictId, { resolution: 'reject' })),
    ).resolves.toMatchObject({ status: 'resolved', resolution: 'reject' });
    expect(await run(tenantA, () => a.getSyncItemReceipt('i-1'))).toEqual(original);
    expect(
      (await run(tenantB, () => service(tenantB).listSyncConflicts({ conflictType: 'integrity' })))
        .items,
    ).toEqual([]);
  }, 60_000);

  it('raises the typed upgrade-required error naming 0004 when the D1/D2 schema is missing', async () => {
    const old = await createPostgresTestDatabase('stynx_ofs_157_old', { useTemplate: false });
    let oldModule: TestingModule | undefined;
    try {
      oldModule = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: old.connectionString('ofs157-old-owner') },
              app: { connectionString: old.appConnectionString('ofs157-old-app'), max: 4 },
              reader: { connectionString: old.connectionString('ofs157-old-reader') },
            },
            migrations: { enabled: true },
          }),
        ],
      }).compile();
      await oldModule.init();
      const admin = await old.connectAsAdmin();
      try {
        for (const name of migrations.slice(0, 3))
          await admin.query(await readFile(resolve(migrationDir, name), 'utf8'));
        await admin.query(
          `insert into tenancy.tenants (id,slug,name,is_active,created_at,updated_at) values ($1::uuid,'ofs-157-old','OFS old',true,clock_timestamp(),clock_timestamp())`,
          [tenantA],
        );
        await admin.query(
          `insert into offline.numbering_ranges (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status)
          values ('30000000-0000-4000-8000-0000000000c7',$1::uuid,'org-a','citation','C',1,9,1,'active')`,
          [tenantA],
        );
      } finally {
        await admin.end();
      }
      const contexts = oldModule.get(RequestContextMutator);
      const resolver = resolverOf(['reject', 'retry_after_correction']);
      const svc = new OfflineSyncService(
        new PostgresOfflineSyncStore(oldModule),
        { current: () => ({ tenantId: tenantA, actorId: 'actor-a7' }) },
        {
          now: () => at,
          conflictResolver: resolver,
          itemApplier: applier,
          policyResolver: {
            resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null }),
          },
          eventPort: {
            appendInTransaction: async () => undefined,
            appendManyInTransaction: async () => undefined,
          },
        } as StynxOfflineSyncModuleOptions,
      );
      const inOld = <T>(fn: () => Promise<T>) =>
        contexts.runWithRequestContext(
          {
            requestId: 'ofs-157-old',
            tenantId: tenantA,
            actorId: 'actor-a7',
            startedAt: new Date(at),
          },
          fn,
        );
      const reservation = await inOld(() =>
        svc.reserveNumbering({ ...reserve, deviceId: 'dev-old' }),
      );
      const result = await inOld(() =>
        svc.submitSyncBatch(
          batch('dev-old', 'ob-1', [
            item('o-1', 'o-1', {
              reservedNumber: reservation.startNumber,
              reservationId: reservation.reservationId,
              createdLocallyAt: later,
            }),
          ]),
          transport('ob-1'),
        ),
      );
      const conflictId = (result.receipt.items[0]!.context as { conflictId: string }).conflictId;
      // The pending transition hits the 0003 CHECK; a closing action hits the missing history table. Both name 0004.
      for (const resolution of ['retry_after_correction', 'reject'] as const) {
        const error = await inOld(() => svc.resolveConflict(conflictId, { resolution })).catch(
          (caught: unknown) => caught as OfflineSyncUpgradeRequiredError,
        );
        expect(error).toBeInstanceOf(OfflineSyncUpgradeRequiredError);
        expect([error.getStatus(), error.message]).toEqual([
          503,
          'Offline-sync migration 0004 is required.',
        ]);
      }
      const admin2 = await old.connectAsAdmin();
      try {
        expect(
          (
            await admin2.query(`select status from offline.sync_conflicts where id=$1::uuid`, [
              conflictId,
            ])
          ).rows,
        ).toEqual([{ status: 'open' }]);
        expect(
          (
            await admin2.query(
              `select status from offline.sync_queue_items where tenant_id=$1::uuid and id='o-1'`,
              [tenantA],
            )
          ).rows,
        ).toEqual([{ status: 'conflict' }]);
      } finally {
        await admin2.end();
      }
    } finally {
      await oldModule?.close();
      await old.dispose();
    }
  }, 60_000);
});
