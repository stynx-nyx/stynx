import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import type {
  OfflineSyncContextPort,
  StynxOfflineSyncModuleOptions,
  SubmitSyncBatchInput,
} from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-01…04. These are contract sensors for the CTG9 extension.
const tenant = '00000000-0000-4000-8000-0000000000a1';
const tenantB = '00000000-0000-4000-8000-0000000000b1';
const at = '2026-09-28T12:00:00.000Z';
const digest = (payload: unknown) =>
  `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const payload = { normativePackageId: 'rules-1', normativePackageVersion: '1.0.0' };
const item = (key = 'item-1', id = key, reservedNumber?: number, reservationId?: string) => ({
  queueItemId: id,
  entityType: 'citation',
  localEntityId: `local-${id}`,
  idempotencyKey: key,
  payloadHash: digest(payload),
  payloadJson: payload,
  createdLocallyAt: at,
  ...(reservedNumber === undefined ? {} : { reservedNumber }),
  ...(reservationId === undefined ? {} : { reservationId }),
});
const batch = (id: string, items = [item()]): SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: id,
  items,
});
type ExtendedService = OfflineSyncService & {
  blockNumberingReservation(id: string, input?: { reason?: string }): Promise<{ status: string }>;
  closeNumberingReservation(id: string, input?: { reason?: string }): Promise<{ status: string }>;
  reconcileNumberingReservation(
    id: string,
    input: { claimedNumbers: number[] },
  ): Promise<{
    consumption: Array<{ number: number; status: string }>;
    missingOnServer: number[];
  }>;
  settleNumberingReservation(id: string, input?: { reason?: string }): Promise<{ status: string }>;
  getNumberingConsumption(
    id: string,
  ): Promise<{ consumption: Array<{ number: number; status: string }> }>;
  getSyncBatchReceipt(
    deviceId: string,
    deviceBatchId: string,
  ): Promise<{
    status: string;
    responseStatus: number | null;
    responseBodyBytes: Uint8Array | null;
    items: Array<{ status: string; errorCode?: string }>;
  }>;
  getSyncItemReceipt(idempotencyKey: string): Promise<{
    status: string;
    errorCode?: string;
    context?: Record<string, unknown>;
  }>;
};
function harness(options: Record<string, unknown> = {}) {
  const store = new InMemoryOfflineSyncStore();
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-0000000000a1',
    tenantId: tenant,
    orgUnitId: 'org-a',
    entityType: 'citation',
    series: 'C',
    startNumber: 1000,
    endNumber: 1300,
    nextNumber: 1000,
    status: 'active',
  });
  const scope = { tenantId: tenant, actorId: 'authenticated-actor' };
  const context: OfflineSyncContextPort = { current: () => scope };
  const service = new OfflineSyncService(store, context, {
    now: () => at,
    policyResolver: {
      resolve: async () => ({
        reservationTtlMs: 86_400_000,
        maxBatchItems: 100,
        concurrencyWindowMinutes: 30,
      }),
    },
    ...options,
  } as StynxOfflineSyncModuleOptions) as ExtendedService;
  return { service, store, scope };
}

describe('CTG9 OFS service contract', () => {
  it('UPS-OFS-01 resolves tenant/org/operation TTL and business agent independently of actor', async () => {
    const resolve = vi.fn(async ({ tenantId, orgUnitId, operation }: Record<string, string>) => {
      expect([tenantId, orgUnitId]).toEqual([tenant, 'org-a']);
      expect(operation).toEqual(expect.any(String));
      return { reservationTtlMs: 60_000, maxBatchItems: 150 };
    });
    const agent = vi.fn(async () => 'business-agent');
    const { service } = harness({ policyResolver: { resolve }, agentResolver: { resolve: agent } });
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'citation',
      requestedSize: 2,
    });
    expect(resolve).toHaveBeenCalledOnce();
    expect(agent).toHaveBeenCalledOnce();
    expect(reservation).toMatchObject({
      agentId: 'business-agent',
      validUntil: '2026-09-28T12:01:00.000Z',
    });
  });

  it('UPS-OFS-01 keeps the published 24h default without a resolver', async () => {
    const { service } = harness({ policyResolver: undefined });
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'citation',
      requestedSize: 3,
    });
    expect(reservation.validUntil).toBe('2026-09-29T12:00:00.000Z');
    await service.cancelNumberingReservation(reservation.reservationId);
    await expect(
      service.cancelNumberingReservation(reservation.reservationId),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    await service.submitSyncBatch(batch('legacy-first', [item('legacy-key-one', 'legacy-one')]));
    await expect(
      service.submitSyncBatch({
        ...batch('legacy-second', [item('legacy-key-two', 'legacy-two')]),
        mode: 'ctg9',
      } as SubmitSyncBatchInput),
    ).resolves.toMatchObject({ duplicateItems: 1 });
    await expect(
      service.submitSyncBatch(
        batch(
          'too-large',
          Array.from({ length: 101 }, (_, i) => item(`key-${i}`, `queue-${i}`)),
        ),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('UPS-OFS-01 makes configured-policy lifecycle transitions idempotent', async () => {
    const { service } = harness();
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'citation',
      requestedSize: 3,
    });
    const reconciled = await service.reconcileNumberingReservation(reservation.reservationId, {
      claimedNumbers: [1000],
    });
    expect(reconciled.consumption.map(({ number, status }) => [number, status])).toEqual([
      [1000, 'claimed-locally'],
      [1001, 'available'],
      [1002, 'available'],
    ]);
    const blocked = await service.blockNumberingReservation(reservation.reservationId, {
      reason: 'shift closed',
    });
    expect(blocked.status).toBe('blocked');
    expect(
      await service.blockNumberingReservation(reservation.reservationId, {
        reason: 'shift closed',
      }),
    ).toEqual(blocked);
    await expect(
      service.closeNumberingReservation(reservation.reservationId),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await service.getNumberingConsumption(reservation.reservationId)).consumption,
    ).toHaveLength(3);
  });

  it('UPS-OFS-01 releases only an unused tail after one number was applied and never reissues it', async () => {
    const { service } = harness({
      itemApplier: { apply: async () => ({ serverEntityId: 'server-1000' }) },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    });
    const first = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'citation',
      requestedSize: 3,
    });
    await service.submitSyncBatch(batch('consume-first', [item('applied-key', 'applied-queue', 1000)]));
    expect(
      (await service.getNumberingConsumption(first.reservationId)).consumption[0],
    ).toMatchObject({ number: 1000, status: 'applied', serverEntityId: 'server-1000' });
    const cancelled = await service.cancelNumberingReservation(first.reservationId);
    expect(cancelled.status).toBe('cancelled');
    expect(await service.cancelNumberingReservation(first.reservationId)).toEqual(cancelled);
    const second = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-b',
      shiftId: 'shift-b',
      entityType: 'citation',
      requestedSize: 2,
    });
    expect(second.startNumber).toBe(1001);
    expect(
      (await service.getNumberingConsumption(first.reservationId)).consumption[0],
    ).toMatchObject({ number: 1000, status: 'applied' });
  });

  it('UPS-OFS-01 records the no-coverage outcome before any domain effect', async () => {
    const zero = harness();
    const noCoverage = await zero.service.submitSyncBatch(batch('zero-coverage', [item('zero-key', 'zero-item', 1000)]));
    expect(noCoverage.receipt.items[0]).toMatchObject({
      queueItemId: 'zero-item', status: 'rejected', errorCode: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE',
      context: { number: 1000, reservationId: null },
    });
  });

  it('UPS-OFS-01 rejects ambiguous reservation coverage without choosing a series by creation time', async () => {
    const ambiguous = harness();
    ambiguous.store.seedNumberingRange({
      id: '10000000-0000-4000-8000-0000000000d1', tenantId: tenant, orgUnitId: 'org-a',
      entityType: 'citation', series: 'D', startNumber: 1000, endNumber: 1300, nextNumber: 1000, status: 'active',
    });
    await ambiguous.service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-c', entityType: 'citation', series: 'C', requestedSize: 1 });
    await ambiguous.service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-d', entityType: 'citation', series: 'D', requestedSize: 1 });
    const ambiguousResult = await ambiguous.service.submitSyncBatch(batch('ambiguous-coverage', [item('ambiguous-key', 'ambiguous-item', 1000)]));
    expect(ambiguousResult.receipt.items[0]).toMatchObject({
      status: 'rejected', errorCode: 'OFFLINE_SYNC_NUMBERING_AMBIGUOUS',
      context: { number: 1000, reservationId: null },
    });
  });

  it('UPS-OFS-01 records a closed reservation as an expired conflict', async () => {
    const closed = harness();
    const closedReservation = await closed.service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'closed', entityType: 'citation', requestedSize: 1 });
    await closed.service.closeNumberingReservation(closedReservation.reservationId);
    const closedResult = await closed.service.submitSyncBatch(batch('closed-coverage', [item('closed-key', 'closed-item', 1000, closedReservation.reservationId)]));
    expect(closedResult.receipt.items[0]).toMatchObject({
      status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
      context: { number: 1000, reservationId: closedReservation.reservationId },
    });
  });

  it('UPS-OFS-01 compares validUntil with createdLocallyAt and records an expired conflict', async () => {
    const expired = harness();
    const expiredReservation = await expired.service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'expired', entityType: 'citation', requestedSize: 1, validUntil: '2026-09-29T12:00:00.000Z' });
    const expiredItem = { ...item('expired-key', 'expired-item', 1000, expiredReservation.reservationId), createdLocallyAt: '2026-09-30T12:00:00.000Z' };
    const expiredResult = await expired.service.submitSyncBatch(batch('expired-coverage', [expiredItem]));
    expect(expiredResult.receipt.items[0]).toMatchObject({
      status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
      context: { number: 1000, reservationId: expiredReservation.reservationId },
    });
  });

  it('UPS-OFS-01 records an already-applied number as a conflict without a second effect', async () => {
    const apply = vi.fn(async () => ({ serverEntityId: 'server-applied' }));
    const alreadyApplied = harness({
      itemApplier: { apply },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    });
    const appliedReservation = await alreadyApplied.service.reserveNumbering({ orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'applied', entityType: 'citation', requestedSize: 1 });
    await alreadyApplied.service.submitSyncBatch(batch('first-consumption', [item('applied-number-key', 'first-consumption-item', 1000, appliedReservation.reservationId)]));
    const repeatedNumber = await alreadyApplied.service.submitSyncBatch(batch('repeated-consumption', [item('reused-number-key', 'reused-number-item', 1000, appliedReservation.reservationId)]));
    expect(repeatedNumber.receipt.items[0]).toMatchObject({
      status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',
      context: { number: 1000, reservationId: appliedReservation.reservationId },
    });
    expect(alreadyApplied.store.getQueueItem(tenant, 'reused-number-item')?.status).toBe('conflict');
    expect(apply).toHaveBeenCalledOnce();
  });

  it('UPS-OFS-02 admits scoped >100 items and distinct keys with identical payload bytes', async () => {
    const resolve = vi.fn(async () => ({ maxBatchItems: 150, reservationTtlMs: 60_000 }));
    const { service } = harness({ policyResolver: { resolve } });
    const items = Array.from({ length: 101 }, (_, i) => item(`key-${i}`, `queue-${i}`));
    const result = await service.submitSyncBatch({
      ...batch('large', items),
      batchSequence: 1,
    } as SubmitSyncBatchInput);
    expect(result.acceptedItems).toBe(101);
    expect(result.duplicateItems).toBe(0);
    expect((await service.getSyncBatchReceipt('device-a', 'large')).items).toHaveLength(101);
    expect(resolve).toHaveBeenCalled();
  });

  it('UPS-OFS-02 preserves batch identity, sequence and original tenant-scoped receipts', async () => {
    const { service, scope } = harness();
    const first = { ...batch('first'), batchSequence: 1 } as SubmitSyncBatchInput;
    const original = await service.submitSyncBatch(first);
    expect(await service.submitSyncBatch(first)).toEqual(original);
    await expect(
      service.submitSyncBatch({ ...first, items: [item('different', 'different')] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.submitSyncBatch({ ...batch('other'), batchSequence: 1 } as SubmitSyncBatchInput),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.submitSyncBatch({ ...batch('gap'), batchSequence: 3 } as SubmitSyncBatchInput),
    ).rejects.toMatchObject({ status: 422 });
    expect(await service.getSyncItemReceipt('item-1')).toMatchObject({
      status: expect.any(String),
    });
    scope.tenantId = tenantB;
    await expect(service.getSyncBatchReceipt('device-a', 'first')).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getSyncItemReceipt('item-1')).rejects.toMatchObject({ status: 404 });
  });

  it('UPS-OFS-02 stores unkeyed legacy items without applying them and reserves the synthetic namespace', async () => {
    const applier = { apply: vi.fn() };
    const { service, store } = harness({ itemApplier: applier });
    const legacy = { ...item('', 'legacy-1'), idempotencyKey: undefined };
    await service.submitSyncBatch(batch('legacy', [legacy] as never));
    const receipt = await service.getSyncBatchReceipt('device-a', 'legacy');
    expect(receipt.items).toEqual([
      expect.objectContaining({
        status: 'received',
        errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',
      }),
    ]);
    expect(applier.apply).not.toHaveBeenCalled();
    const synthetic = createHash('sha256')
      .update([tenant, 'device-a', 'legacy', 'legacy-1'].join('\0'))
      .digest('hex');
    expect(store.getQueueItem(tenant, 'legacy-1')?.idempotencyKey).toBe(
      `stynx:legacy:v1:${synthetic}`,
    );
    await expect(
      service.submitSyncBatch(batch('reserved-prefix', [item('stynx:legacy:v1:spoof')])),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('UPS-OFS-02 deduplicates host-resolved unkeyed identity across batches without applying it', async () => {
    const identity = {
      resolve: vi.fn(
        async ({ deviceId, localEntityId }: { deviceId: string; localEntityId: string }) =>
          `legacy:${deviceId}:${localEntityId}`,
      ),
    };
    const applier = { apply: vi.fn() };
    const { service, scope } = harness({
      legacyItemIdentityResolver: identity,
      itemApplier: applier,
    });
    const unkeyed = (queueItemId: string, localEntityId: string) => ({
      ...item('', queueItemId),
      idempotencyKey: undefined,
      localEntityId,
    });
    const first = await service.submitSyncBatch(
      batch('legacy-one', [unkeyed('queue-one', 'local-one')] as never),
    );
    const repeated = await service.submitSyncBatch(
      batch('legacy-two', [unkeyed('queue-two', 'local-one')] as never),
    );
    const independent = await service.submitSyncBatch(
      batch('legacy-three', [unkeyed('queue-three', 'local-two')] as never),
    );
    expect(identity.resolve).toHaveBeenCalledTimes(3);
    expect(repeated.items[0]).toMatchObject({ queueItemId: 'queue-two', status: 'received' });
    expect((await service.getSyncBatchReceipt('device-a', 'legacy-two')).items).toEqual([
      expect.objectContaining({
        queueItemId: 'queue-two',
        status: 'received',
        context: { originalQueueItemId: 'queue-one' },
      }),
    ]);
    expect(independent.items[0]).not.toEqual(first.items[0]);
    expect(first.items[0]).toMatchObject({ status: 'received' });
    expect(independent.items[0]).toMatchObject({ status: 'received' });
    expect(JSON.stringify(first)).not.toContain('stynx:legacy:v1:');
    scope.tenantId = tenantB;
    const otherTenant = await service.submitSyncBatch(
      batch('legacy-other-tenant', [unkeyed('queue-other-tenant', 'local-one')] as never),
    );
    expect(otherTenant.items[0]).not.toEqual(first.items[0]);
    expect(otherTenant.items[0]).toMatchObject({ status: 'received' });
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('UPS-OFS-02 rejects an empty host legacy identity before storing or applying an item', async () => {
    const applier = { apply: vi.fn() };
    const { service, store } = harness({
      legacyItemIdentityResolver: { resolve: async () => '' },
      itemApplier: applier,
    });
    await expect(
      service.submitSyncBatch(
        batch('empty-identity', [
          { ...item('', 'empty-identity-item'), idempotencyKey: undefined },
        ] as never),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.getQueueItem(tenant, 'empty-identity-item')).toBeUndefined();
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('UPS-OFS-02 retains original key/hash receipt after an integrity-conflict attempt', async () => {
    const { service } = harness();
    await service.submitSyncBatch(batch('initial'));
    const original = await service.getSyncItemReceipt('item-1');
    const changed = {
      ...item(),
      queueItemId: 'different-queue',
      payloadJson: { changed: true },
      payloadHash: digest({ changed: true }),
    };
    const second = await service.submitSyncBatch(batch('changed', [changed]));
    expect(second.items[0]).toMatchObject({ status: 'rejected' });
    expect(await service.getSyncItemReceipt('item-1')).toEqual(original);
  });

  it('UPS-OFS-02 rejects duplicate declared and synthetic keys in one batch before any write', async () => {
    const applier = { apply: vi.fn(async () => ({ serverEntityId: 'must-not-run' })) };
    const declared = harness({ itemApplier: applier });
    await expect(declared.service.submitSyncBatch(batch('same-declared-key', [
      item('duplicate-key', 'declared-one'), item('duplicate-key', 'declared-two'),
    ]))).rejects.toMatchObject({ status: 400 });
    expect(declared.store.getQueueItem(tenant, 'declared-one')).toBeUndefined();
    expect(declared.store.getQueueItem(tenant, 'declared-two')).toBeUndefined();
    expect(applier.apply).not.toHaveBeenCalled();

    const synthetic = harness({
      itemApplier: applier,
      legacyItemIdentityResolver: { resolve: async () => 'same-host-identity' },
    });
    await expect(synthetic.service.submitSyncBatch(batch('same-synthetic-key', [
      { ...item('', 'synthetic-one'), idempotencyKey: undefined },
      { ...item('', 'synthetic-two'), idempotencyKey: undefined },
    ] as never))).rejects.toMatchObject({ status: 400 });
    expect(synthetic.store.getQueueItem(tenant, 'synthetic-one')).toBeUndefined();
    expect(synthetic.store.getQueueItem(tenant, 'synthetic-two')).toBeUndefined();
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('UPS-OFS-02 continues after a queue ID reused by a later batch', async () => {
    const applier = { apply: vi.fn(async (_trx: unknown, current: { queueItemId: string }) => ({ serverEntityId: `server-${current.queueItemId}` })) };
    const { service } = harness({
      itemApplier: applier,
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    });
    await service.submitSyncBatch(batch('queue-id-first', [item('queue-id-original-key', 'reused-queue-id')]));
    const later = await service.submitSyncBatch(batch('queue-id-second', [
      item('queue-id-new-key', 'reused-queue-id'), item('queue-id-sibling-key', 'sibling-queue-id'),
    ]));
    expect(later.receipt.items).toMatchObject([
      { queueItemId: 'reused-queue-id', status: 'rejected', errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED' },
      { queueItemId: 'sibling-queue-id', status: 'applied' },
    ]);
    expect(applier.apply.mock.calls.map(([, current]) => current.queueItemId)).toEqual([
      'reused-queue-id', 'sibling-queue-id',
    ]);
  });

  it('UPS-OFS-02 fences simultaneous submissions of the same open batch to one item effect', async () => {
    const applier = { apply: vi.fn(async () => ({ serverEntityId: 'server-once' })) };
    const { service } = harness({
      itemApplier: applier,
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    });
    const input = { ...batch('same-open'), batchSequence: 1 } as SubmitSyncBatchInput;
    const [first, second] = await Promise.all([
      service.submitSyncBatch(input),
      service.submitSyncBatch(input),
    ]);
    expect(second).toEqual(first);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect((await service.getSyncBatchReceipt('device-a', 'same-open')).status).toBe('closed');
  });

  it('UPS-OFS-03 applies items serially and passes the identical transaction to the final event operation', async () => {
    const order: string[] = [];
    const transactions: unknown[] = [];
    const applier = {
      apply: vi.fn(async (trx: unknown, current: { queueItemId: string }) => {
        transactions.push(trx);
        order.push(`apply:${current.queueItemId}`);
        return { serverEntityId: `server-${current.queueItemId}` };
      }),
    };
    const events = {
      appendInTransaction: vi.fn(async (trx: unknown) => {
        expect(trx).toBe(transactions.at(-1));
        order.push('event');
      }),
      appendManyInTransaction: vi.fn(),
    };
    const { service } = harness({ itemApplier: applier, eventPort: events });
    const result = await service.submitSyncBatch(
      batch('atomic', [item('key-one', 'queue-one'), item('key-two', 'queue-two')]),
    );
    expect(result.items.map(({ status }) => status)).toEqual(['applied', 'applied']);
    expect(order).toEqual(['apply:queue-one', 'event', 'apply:queue-two', 'event']);
    expect(transactions[0]).not.toBe(transactions[1]);
    expect(events.appendInTransaction).toHaveBeenCalledTimes(2);
    expect(events.appendManyInTransaction).not.toHaveBeenCalled();
  });

  it('UPS-OFS-03 rolls back a failed item while preserving successful siblings and open retryable receipts', async () => {
    const applier = {
      apply: vi.fn(async (_trx: unknown, current: { queueItemId: string }) => {
        if (current.queueItemId === 'deadlock')
          throw Object.assign(new Error('retry exhausted'), { code: '40P01' });
        return { serverEntityId: `server-${current.queueItemId}` };
      }),
    };
    const events = {
      appendInTransaction: vi.fn(async () => undefined),
      appendManyInTransaction: vi.fn(),
    };
    const { service } = harness({ itemApplier: applier, eventPort: events });
    const result = await service.submitSyncBatch(
      batch('partial', [
        item('first', 'first'),
        item('deadlock-key', 'deadlock'),
        item('third', 'third'),
      ]),
    );
    expect(result.items[0]).toMatchObject({ status: 'applied' });
    expect(result.items[1]).not.toMatchObject({ status: 'applied' });
    expect(result.items[2]).toMatchObject({ status: 'applied' });
    expect(await service.getSyncItemReceipt('deadlock-key')).not.toMatchObject({
      status: 'applied',
    });
    expect(events.appendInTransaction).toHaveBeenCalledTimes(2);
  });

  it('UPS-OFS-04 suppresses suspicion for an authorized handoff or a disabled window', async () => {
    const detect = vi.fn(async () => ({
      suspected: true,
      pairs: [{ firstItemId: 'a', secondItemId: 'b' }],
    }));
    const handoff = { permits: vi.fn(async () => true) };
    const { service } = harness({ concurrencyDetector: { detect }, handoffPort: handoff });
    await service.submitSyncBatch(batch('handoff-a', [item('handoff-key-a', 'a')]));
    await service.submitSyncBatch({
      ...batch('handoff-b', [item('handoff-key-b', 'b')]),
      deviceId: 'device-b',
    });
    expect(handoff.permits).toHaveBeenCalled();
    expect((await service.getSyncItemReceipt('handoff-key-a')).status).not.toBe('conflict');
    expect((await service.getSyncItemReceipt('handoff-key-b')).status).not.toBe('conflict');
    const disabledDetect = vi.fn();
    const disabled = harness({
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: null }) },
      concurrencyDetector: { detect: disabledDetect },
    });
    await disabled.service.submitSyncBatch(batch('disabled', [item('disabled-key', 'disabled')]));
    expect(disabledDetect).not.toHaveBeenCalled();
    const missingDetect = vi.fn();
    const missing = harness({
      policyResolver: { resolve: async () => ({ maxBatchItems: 100 }) },
      concurrencyDetector: { detect: missingDetect },
    });
    await missing.service.submitSyncBatch(batch('missing-window', [item('missing-window-key', 'missing-window-item')]));
    expect(missingDetect).not.toHaveBeenCalled();
  });

  it('UPS-OFS-04 marks both cross-device acts, honors handoff, and rejects forbidden actions', async () => {
    const detect = vi.fn(async () => ({
      suspected: true,
      pairs: [{ firstItemId: 'queue-a', secondItemId: 'queue-b' }],
    }));
    const handoff = { permits: vi.fn(async () => false) };
    const allowedActions = new Set(['manual-review']);
    const allowedActionsFor = vi.fn(async () => ['manual-review'] as const);
    const conflictResolver = {
      resolve: vi.fn(async (_trx: unknown, _id: string, action: string) => {
        if (!allowedActions.has(action)) {
          throw Object.assign(new Error(`Action ${action} is forbidden for concurrency`), {
            status: 409,
          });
        }
        return { conflictId: _id, queueItemId: 'queue-a', status: 'resolved', resolution: action,
          conflictType: 'concurrency', localEntityId: 'local-queue-a', payloadHash: digest(payload),
          description: 'resolved', resolvedBy: 'authenticated-actor', resolvedAt: at };
      }),
      allowedActions: allowedActionsFor,
    };
    const { service } = harness({
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 30 }) },
      concurrencyDetector: { detect },
      handoffPort: handoff,
      conflictResolver,
    });
    await service.submitSyncBatch(batch('one', [item('key-a', 'queue-a')]));
    await service.submitSyncBatch({
      ...batch('two', [item('key-b', 'queue-b')]),
      deviceId: 'device-b',
    });
    expect(detect).toHaveBeenCalled();
    const first = await service.getSyncItemReceipt('key-a');
    const second = await service.getSyncItemReceipt('key-b');
    expect(first.status).toBe('conflict');
    expect(second.status).toBe('conflict');
    const conflictId = first.context?.conflictId;
    expect(conflictId).toEqual(expect.any(String));
    expect(first.context).toMatchObject({
      allowedActions: ['manual-review'], relatedQueueItemId: 'queue-b',
    });
    expect(allowedActionsFor).toHaveBeenCalled();
    await expect(
      service.resolveConflict(conflictId as string, { resolution: 'device-wins' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(conflictResolver.resolve).not.toHaveBeenCalled();
    await expect(service.resolveConflict(conflictId as string, { resolution: 'manual-review' }))
      .resolves.toMatchObject({ status: 'resolved', resolution: 'manual-review' });
    expect(conflictResolver.resolve).toHaveBeenCalledWith(
      expect.anything(),
      conflictId,
      'manual-review',
      expect.anything(),
    );
  });

  it('UPS-OFS-01 close and settle make available values expired while preserving claims and applied evidence', async () => {
    const { service } = harness({
      itemApplier: { apply: async () => ({ serverEntityId: 'server-settled' }) },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    });
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'settlement', entityType: 'citation', requestedSize: 3,
    });
    await service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [1001] });
    await service.submitSyncBatch(batch('settled-number', [item('settled-key', 'settled-item', 1000, reservation.reservationId)]));
    expect(await service.settleNumberingReservation(reservation.reservationId, { reason: 'shift settled' }))
      .toMatchObject({ status: 'consumed' });
    expect((await service.getNumberingConsumption(reservation.reservationId)).consumption.map(({ status }) => status))
      .toEqual(['applied', 'claimed-locally', 'expired']);
  });
});
