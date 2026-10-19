import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { OfflineSyncService } from '../../src/offline-sync.service.js';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity.js';
import type {
  CTG9SubmitSyncBatchInput,
  CTG9SubmitSyncBatchResult,
  OfflineSyncItemContext,
  StynxOfflineSyncModuleOptions,
} from '../../src/types.js';

export const MINOR_TENANT_A = '00000000-0000-4000-8000-0000000000a9';
export const MINOR_TENANT_B = '00000000-0000-4000-8000-0000000000b9';
const at = '2026-10-10T12:00:00.000Z';
const payload = { nested: { b: 2, a: 1 }, value: 7 };
const batch = (id: string, overrides: Record<string, unknown> = {}): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: id,
  items: [
    {
      queueItemId: id,
      entityType: 'citation',
      localEntityId: id,
      idempotencyKey: `key-${id}`,
      payloadJson: payload,
      payloadHash: canonicalOfflineSyncPayloadHash(payload),
      createdLocallyAt: at,
      ...overrides,
    },
  ],
});
interface RuntimeHarness {
  service(options?: Partial<StynxOfflineSyncModuleOptions>, tenantId?: string): OfflineSyncService;
  run<T>(tenantId: string, operation: () => Promise<T>): Promise<T>;
  assertClosedReplay(actual: CTG9SubmitSyncBatchResult, original: CTG9SubmitSyncBatchResult): void;
}
/** The same public behavior is exercised through independent memory and real-PostgreSQL stores. */
export function registerOfflineMinorRuntimeContracts(harness: () => RuntimeHarness): void {
  it('UPS-OFS-11 retains raw malformed digest proof without consuming canonical identity and preserves it after corrected submission', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'corrected-server' }));
    const append = vi.fn(async () => undefined);
    const hash = vi.fn(async (value: { payloadJson: Record<string, unknown> }) =>
      canonicalOfflineSyncPayloadHash(value.payloadJson),
    );
    const service = h.service({
      itemApplier: { apply },
      payloadHashPort: { hash },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
    });
    const rejectedInput = batch('raw-malformed', { payloadHash: 'untrusted digest / ação 😀' });
    const rejected = await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(rejectedInput));
    expect(rejected.receipt.items).toMatchObject([
      { status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
    ]);
    const identity = {
      deviceId: 'device-a',
      deviceBatchId: 'raw-malformed',
      queueItemId: 'raw-malformed',
    };
    const proof = await h.run(MINOR_TENANT_A, () => service.getSyncIntegrityRejection(identity));
    expect(proof).toEqual({
      ...identity,
      tenantId: MINOR_TENANT_A,
      idempotencyKey: 'key-raw-malformed',
      receivedPayloadHash: 'untrusted digest / ação 😀',
      rejectedAt: at,
      errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
    });
    expect(
      (await h.run(MINOR_TENANT_A, () => service.listSyncQueueItems({ deviceId: 'device-a' })))
        .items,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ queueItemId: 'raw-malformed' })]),
    );
    await expect(
      h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-raw-malformed')),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      h.run(MINOR_TENANT_B, () =>
        h.service({}, MINOR_TENANT_B).getSyncIntegrityRejection(identity),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'OFFLINE_SYNC_INTEGRITY_REJECTION_NOT_FOUND' });
    expect(apply).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    const corrected = { ...batch('raw-malformed'), deviceBatchId: 'raw-corrected' };
    expect(
      (await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(corrected))).receipt.items,
    ).toMatchObject([{ status: 'applied' }]);
    expect(apply).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(await h.run(MINOR_TENANT_A, () => service.getSyncIntegrityRejection(identity))).toEqual(
      proof,
    );
    h.assertClosedReplay(
      await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(rejectedInput)),
      rejected,
    );
    expect(hash).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
  });

  it('UPS-OFS-11 records exact received and original hashes for valid-looking key reuse while retaining original immutable item/receipt', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'original-server' }));
    const append = vi.fn(async () => undefined);
    const service = h.service({
      itemApplier: { apply },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
    });
    const original = batch('original-integrity');
    await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(original));
    const originalReceipt = await h.run(MINOR_TENANT_A, () =>
      service.getSyncItemReceipt('key-original-integrity'),
    );
    const alteredPayload = { value: 999 };
    const altered = batch('altered-integrity', {
      idempotencyKey: 'key-original-integrity',
      payloadJson: alteredPayload,
      payloadHash: canonicalOfflineSyncPayloadHash(alteredPayload),
    });
    expect(
      (await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(altered))).receipt.items,
    ).toMatchObject([{ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(
      await h.run(MINOR_TENANT_A, () =>
        service.getSyncIntegrityRejection({
          deviceId: 'device-a',
          deviceBatchId: 'altered-integrity',
          queueItemId: 'altered-integrity',
        }),
      ),
    ).toMatchObject({
      receivedPayloadHash: canonicalOfflineSyncPayloadHash(alteredPayload),
      storedPayloadHash: canonicalOfflineSyncPayloadHash(payload),
      originalQueueItemId: 'original-integrity',
    });
    expect(
      await h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-original-integrity')),
    ).toEqual(originalReceipt);
    expect(apply).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
  });

  it('UPS-OFS-11 passes trusted context to an independent custom document-format hash port', async () => {
    const h = harness();
    const documentHash = (value: Record<string, unknown>) =>
      `sha256:${createHash('sha256')
        .update(`citation-v1:${JSON.stringify(value)}`)
        .digest('hex')}`;
    const hash = vi.fn(async (value: { payloadJson: Record<string, unknown> }) =>
      documentHash(value.payloadJson),
    );
    const apply = vi.fn(async () => ({ serverEntityId: 'custom-server' }));
    const service = h.service({
      payloadHashPort: { hash },
      itemApplier: { apply },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    });
    const body = batch('custom-hash', {
      payloadHash: documentHash(payload),
      tenantId: MINOR_TENANT_B,
      actorId: 'forged',
    });
    expect(
      (await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(body))).receipt.items,
    ).toMatchObject([{ status: 'applied' }]);
    expect(hash).toHaveBeenCalledWith(
      expect.objectContaining({ payloadJson: payload }),
      expect.objectContaining({
        tenantId: MINOR_TENANT_A,
        actorId: 'authenticated-actor',
        agentId: 'authenticated-actor',
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        batchId: 'custom-hash',
        receiptId: 'key-custom-hash',
        now: at,
      }),
    );
    expect(apply).toHaveBeenCalledOnce();
  });

  it('UPS-OFS-10 defers a genuine pre-apply pair before any domain effect or event even with the legacy window disabled', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'pair-server' }));
    const append = vi.fn(async () => undefined);
    const base = {
      itemApplier: { apply },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
    };
    await h.run(MINOR_TENANT_A, () => h.service(base).submitSyncBatch(batch('pre-sibling')));
    const pair = { firstItemId: 'pre-current', secondItemId: 'pre-sibling' };
    const detect = vi.fn(async () => ({ suspected: true, pairs: [pair] }));
    const service = h.service({
      ...base,
      preApplyDetector: { detect },
      policyResolver: {
        resolve: async () => ({ concurrencyWindowMinutes: 0, reservationTtlMs: 86_400_000 }),
      },
    });
    const reservation = await h.run(MINOR_TENANT_A, () =>
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'pre-check',
        entityType: 'citation',
        requestedSize: 1,
      }),
    );
    const result = await h.run(MINOR_TENANT_A, () =>
      service.submitSyncBatch(
        batch('pre-current', {
          reservedNumber: reservation.startNumber,
          reservationId: reservation.reservationId,
        }),
      ),
    );
    expect(
      (
        await h.run(MINOR_TENANT_A, () =>
          service.getNumberingConsumption(reservation.reservationId),
        )
      ).consumption,
    ).toMatchObject([{ number: reservation.startNumber, status: 'available' }]);
    expect(result.receipt.items[0]).toMatchObject({ status: 'conflict' });
    expect(apply).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(detect).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ queueItemId: 'pre-current' }),
      expect.objectContaining({ receiptId: 'key-pre-current', tenantId: MINOR_TENANT_A }),
    );
    expect(
      await h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-pre-current')),
    ).toMatchObject({
      status: 'conflict',
      stynx: { concurrencySuspected: true, concurrentPairs: [pair] },
    });
  });

  it('UPS-OFS-10 keeps pre-apply context distinct and records the merged final pre/post pair evidence', async () => {
    const h = harness();
    const contexts: OfflineSyncItemContext[] = [];
    const apply = vi.fn(async (_trx: unknown, _value: unknown, context: OfflineSyncItemContext) => {
      contexts.push(context);
      return { serverEntityId: 'merged-server' };
    });
    const base = {
      itemApplier: { apply },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    };
    for (const id of ['merge-a', 'merge-b'])
      await h.run(MINOR_TENANT_A, () => h.service(base).submitSyncBatch(batch(id)));
    const pre = { firstItemId: 'merge-current', secondItemId: 'merge-a' };
    const post = { firstItemId: 'merge-current', secondItemId: 'merge-b' };
    const service = h.service({
      ...base,
      preApplyDetector: { detect: async () => ({ suspected: true, pairs: [pre] }) },
      concurrencyDetector: { detect: async () => ({ suspected: true, pairs: [post] }) },
      policyResolver: {
        resolve: async () => ({ concurrencyApplication: 'apply', concurrencyWindowMinutes: 30 }),
      },
    });
    await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(batch('merge-current')));
    expect(contexts.at(-1)).toMatchObject({
      receiptId: 'key-merge-current',
      concurrencySuspected: true,
      concurrentPairs: [pre],
    });
    expect(
      await h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-merge-current')),
    ).toMatchObject({
      status: 'conflict',
      stynx: { concurrencySuspected: true, concurrentPairs: [pre, post] },
    });
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it('UPS-OFS-10 records a post-only pair after a clean precheck instead of persisting false suspicion', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'post-server' }));
    const base = {
      itemApplier: { apply },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    };
    await h.run(MINOR_TENANT_A, () => h.service(base).submitSyncBatch(batch('post-sibling')));
    const pair = { firstItemId: 'post-current', secondItemId: 'post-sibling' };
    const service = h.service({
      ...base,
      preApplyDetector: { detect: async () => ({ suspected: false, pairs: [] }) },
      concurrencyDetector: { detect: async () => ({ suspected: true, pairs: [pair] }) },
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 30 }) },
    });
    expect(
      (await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(batch('post-current')))).receipt
        .items[0],
    ).toMatchObject({ status: 'conflict' });
    expect(
      await h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-post-current')),
    ).toMatchObject({ stynx: { concurrencySuspected: true, concurrentPairs: [pair] } });
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it('UPS-OFS-10 rolls back failed item conflict projections while preserving another tenant completed during the failure', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'rollback-server' }));
    const safe = {
      itemApplier: { apply },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    };
    await h.run(MINOR_TENANT_A, () => h.service(safe).submitSyncBatch(batch('rollback-sibling')));
    const originalReceipt = await h.run(MINOR_TENANT_A, () =>
      h.service(safe).getSyncItemReceipt('key-rollback-sibling'),
    );
    const foreign = h.service(safe, MINOR_TENANT_B);
    await h.run(MINOR_TENANT_B, () => foreign.submitSyncBatch(batch('rollback-foreign-sibling')));
    const foreignConflict = h.service(
      {
        ...safe,
        preApplyDetector: {
          detect: async () => ({
            suspected: true,
            pairs: [
              {
                firstItemId: 'rollback-foreign-conflict',
                secondItemId: 'rollback-foreign-sibling',
              },
            ],
          }),
        },
      },
      MINOR_TENANT_B,
    );
    await h.run(MINOR_TENANT_B, () =>
      foreignConflict.submitSyncBatch(batch('rollback-foreign-conflict')),
    );
    const foreignBefore = await h.run(MINOR_TENANT_B, () => foreignConflict.listSyncConflicts({}));
    expect(foreignBefore.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queueItemId: 'rollback-foreign-conflict' }),
      ]),
    );

    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failed = h.service({
      ...safe,
      concurrencyDetector: {
        detect: async () => ({
          suspected: true,
          pairs: [{ firstItemId: 'rollback-current', secondItemId: 'rollback-sibling' }],
        }),
      },
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 30 }) },
      eventPort: {
        appendInTransaction: async () => {
          entered();
          await blocked;
          throw new Error('event boundary failure');
        },
        appendManyInTransaction: async () => undefined,
      },
    });
    const failing = h.run(MINOR_TENANT_A, () => failed.submitSyncBatch(batch('rollback-current')));
    await started;
    try {
      await h.run(MINOR_TENANT_B, () => foreign.submitSyncBatch(batch('rollback-foreign')));
    } finally {
      release();
    }
    expect((await failing).receipt).toMatchObject({
      status: 'open',
      items: [{ status: 'received', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' }],
    });
    expect(
      await h.run(MINOR_TENANT_A, () => h.service(safe).getSyncItemReceipt('key-rollback-sibling')),
    ).toEqual(originalReceipt);
    expect(
      await h.run(MINOR_TENANT_B, () => foreign.getSyncItemReceipt('key-rollback-foreign')),
    ).toMatchObject({ status: 'applied' });
    expect(await h.run(MINOR_TENANT_B, () => foreignConflict.listSyncConflicts({}))).toEqual(
      foreignBefore,
    );
    expect((await h.run(MINOR_TENANT_A, () => failed.listSyncConflicts({}))).items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queueItemId: 'rollback-current' }),
        expect.objectContaining({ queueItemId: 'rollback-sibling' }),
      ]),
    );
  });
  it('UPS-OFS-10 deduplicates a reversed post-apply pair against pre-apply evidence', async () => {
    const h = harness();
    const base = {
      itemApplier: { apply: async () => ({ serverEntityId: 'dedup-server' }) },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    };
    await h.run(MINOR_TENANT_A, () => h.service(base).submitSyncBatch(batch('dedup-sibling')));
    const pair = { firstItemId: 'dedup-current', secondItemId: 'dedup-sibling' };
    const service = h.service({
      ...base,
      preApplyDetector: { detect: async () => ({ suspected: true, pairs: [pair] }) },
      concurrencyDetector: {
        detect: async () => ({
          suspected: true,
          pairs: [{ firstItemId: pair.secondItemId, secondItemId: pair.firstItemId }],
        }),
      },
      policyResolver: {
        resolve: async () => ({ concurrencyApplication: 'apply', concurrencyWindowMinutes: 30 }),
      },
    });
    await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(batch('dedup-current')));
    expect(
      await h.run(MINOR_TENANT_A, () => service.getSyncItemReceipt('key-dedup-current')),
    ).toMatchObject({ status: 'conflict', stynx: { concurrentPairs: [pair] } });
  });

  it('UPS-OFS-11 retains the first raw rejection when another item keeps its batch open across retry', async () => {
    const h = harness();
    const apply = vi.fn(async () => {
      throw new Error('retryable second item');
    });
    const service = h.service({
      itemApplier: { apply },
      eventPort: {
        appendInTransaction: async () => undefined,
        appendManyInTransaction: async () => undefined,
      },
    });
    const body = batch('raw-open', { payloadHash: 'raw-invalid-open' });
    body.items.push(batch('raw-open-second').items[0]!);
    const identity = {
      deviceId: body.deviceId,
      deviceBatchId: body.deviceBatchId,
      queueItemId: 'raw-open',
    };
    expect((await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(body))).receipt.status).toBe(
      'open',
    );
    const first = await h.run(MINOR_TENANT_A, () => service.getSyncIntegrityRejection(identity));
    expect((await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(body))).receipt.status).toBe(
      'open',
    );
    expect(await h.run(MINOR_TENANT_A, () => service.getSyncIntegrityRejection(identity))).toEqual(
      first,
    );
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('UPS-OFS-10 propagates invalid pre-apply configuration instead of converting it into a retryable item outcome', async () => {
    const h = harness();
    const apply = vi.fn(async () => ({ serverEntityId: 'must-not-apply' }));
    const append = vi.fn(async () => undefined);
    const service = h.service({
      itemApplier: { apply },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
      preApplyDetector: { detect: async () => ({ suspected: true, pairs: [] }) },
    });
    await expect(
      h.run(MINOR_TENANT_A, () => service.submitSyncBatch(batch('bad-pre-contract'))),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(apply).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect((await h.run(MINOR_TENANT_A, () => service.listSyncConflicts({}))).items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ queueItemId: 'bad-pre-contract' })]),
    );
  });

  it('UPS-OFS-09 fences an initial-pending later-batch retry against the original open batch and preserves original receipt binding', async () => {
    const h = harness();
    const apply = vi.fn(async () => {
      throw new Error('original interrupted apply');
    });
    const append = vi.fn(async () => undefined);
    const service = h.service({
      initialQueueStatus: 'pending',
      itemApplier: { apply },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
    });
    const original = batch('initial-cross-batch');
    expect(
      (await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(original))).receipt,
    ).toMatchObject({ status: 'open', items: [{ status: 'pending' }] });
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    apply.mockImplementation(async () => {
      entered();
      await blocked;
      return { serverEntityId: 'cross-batch-once' } as never;
    });
    const later = { ...original, deviceBatchId: 'initial-cross-later' };
    const retry = h.run(MINOR_TENANT_A, () => service.submitSyncBatch(later));
    await started;
    const resume = h.run(MINOR_TENANT_A, () => service.submitSyncBatch(original));
    release();
    const [retried, resumed] = await Promise.all([retry, resume]);
    expect(retried.receipt.items[0]).toMatchObject({ status: 'applied' });
    expect(resumed.receipt.items[0]).toMatchObject({ status: 'applied' });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ idempotencyKey: 'key-initial-cross-batch:retry:2' }),
    );
    expect(
      (
        await h.run(MINOR_TENANT_A, () =>
          service.listSyncItemReceipts({ deviceBatchId: original.deviceBatchId }),
        )
      ).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiptId: 'key-initial-cross-batch',
          queueItemId: 'initial-cross-batch',
          deviceBatchId: original.deviceBatchId,
          status: 'applied',
        }),
      ]),
    );
    expect(
      (
        await h.run(MINOR_TENANT_A, () =>
          service.listSyncItemReceipts({ deviceBatchId: later.deviceBatchId }),
        )
      ).items,
    ).toEqual([]);
    expect(await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(original))).toEqual(resumed);
    expect(await h.run(MINOR_TENANT_A, () => service.submitSyncBatch(later))).toEqual(retried);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledOnce();
  });
}
