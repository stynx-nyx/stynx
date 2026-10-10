import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity';
import type { CTG9SubmitSyncBatchInput, StynxOfflineSyncModuleOptions } from '../../src/types';

const tenantId = '00000000-0000-4000-8000-0000000000a1';
const at = '2026-10-10T12:00:00.000Z';
const input = (id: string, keyed = true): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: id,
  items: [
    {
      queueItemId: id,
      entityType: 'citation',
      localEntityId: id,
      ...(keyed ? { idempotencyKey: `key-${id}` } : {}),
      payloadJson: { value: 7 },
      payloadHash: canonicalOfflineSyncPayloadHash({ value: 7 }),
      createdLocallyAt: at,
    },
  ],
});
function fixture() {
  const store = new InMemoryOfflineSyncStore();
  const apply = vi.fn(async () => {
    throw new Error('retryable interruption');
  });
  const append = vi.fn(async () => undefined);
  const hash = vi.fn(async (value: { payloadJson: Record<string, unknown> }) =>
    canonicalOfflineSyncPayloadHash(value.payloadJson),
  );
  const service = (initialQueueStatus?: 'received' | 'pending') =>
    new OfflineSyncService(store, { current: () => ({ tenantId, actorId: 'actor-a' }) }, {
      now: () => at,
      initialQueueStatus,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000, maxBatchItems: 20 }) },
      itemApplier: { apply },
      payloadHashPort: { hash },
      eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
    } as StynxOfflineSyncModuleOptions);
  return { service, store, apply, append, hash };
}

describe('UPS-OFS-09 captured CTG9 initial queue mode', () => {
  it.each(['received', 'pending'] as const)(
    'retains winning %s mode across interrupted same-batch resumes under the opposite option',
    async (mode) => {
      const f = fixture();
      const body = input(`resume-${mode}`);
      const first = await f.service(mode).submitSyncBatch(body);
      expect(first.receipt).toMatchObject({ status: 'open', items: [{ status: mode }] });
      expect(f.store.getQueueItem(tenantId, body.items[0]!.queueItemId)?.status).toBe(mode);
      const resumed = await f
        .service(mode === 'received' ? 'pending' : 'received')
        .submitSyncBatch(body);
      expect(resumed.receipt).toMatchObject({ status: 'open', items: [{ status: mode }] });
      expect(f.apply).toHaveBeenCalledTimes(2);
      expect(f.append).not.toHaveBeenCalled();
      f.apply.mockImplementation(async () => ({ serverEntityId: 'server-once' }) as never);
      const completed = await f
        .service(mode === 'received' ? 'pending' : 'received')
        .submitSyncBatch(body);
      expect(completed.receipt).toMatchObject({ status: 'closed', items: [{ status: 'applied' }] });
      expect(f.apply).toHaveBeenCalledTimes(3);
      expect(f.append).toHaveBeenCalledOnce();
      const calls = f.hash.mock.calls.length;
      expect(await f.service(mode).submitSyncBatch(body)).toEqual(completed);
      expect(f.hash).toHaveBeenCalledTimes(calls);
      expect(f.apply).toHaveBeenCalledTimes(3);
    },
  );

  it('defaults new CTG9 batches to received and leaves unkeyed items received under the pending option', async () => {
    const f = fixture();
    expect((await f.service().submitSyncBatch(input('default'))).receipt.items[0]).toMatchObject({
      status: 'received',
    });
    const legacy = await f.service('pending').submitSyncBatch(input('unkeyed', false));
    expect(legacy.receipt.items[0]).toMatchObject({
      status: 'received',
      errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',
    });
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('concurrent creators with opposite options retain the first admitted batch mode and one effect attempt', async () => {
    const f = fixture();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.apply.mockImplementation(async () => {
      entered();
      await blocked;
      throw new Error('retryable interruption');
    });
    const body = input('simultaneous');
    const winner = f.service('pending').submitSyncBatch(body);
    await started;
    const loser = f.service('received').submitSyncBatch(body);
    release();
    const [first, second] = await Promise.all([winner, loser]);
    expect(first).toEqual(second);
    expect(first.receipt.items[0]).toMatchObject({ status: 'pending' });
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.store.getQueueItem(tenantId, 'simultaneous')?.status).toBe('pending');
  });
});
