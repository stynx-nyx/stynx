import { createHash } from 'node:crypto';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { CTG9OfflineSyncController } from '../../src/ctg9-offline-sync.controller';
import { batchContextFingerprint, transportCompositeKey } from '../../src/transport';
import type {
  OfflineSyncStore,
  StynxOfflineSyncModuleOptions,
  SubmitSyncBatchInput,
  SyncConflict,
} from '../../src/types';

const scope = { tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', actorId: 'agent-1' };
const now = '2026-09-28T12:00:00.000Z';
const payload = { source: 'offline' };
const batch: SubmitSyncBatchInput = {
  orgUnitId: 'org-1', deviceId: 'device-1', deviceBatchId: 'batch-1',
  items: [{
    queueItemId: 'queue-1', entityType: 'citation', localEntityId: 'local-1',
    idempotencyKey: 'key-1',
    payloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
    payloadJson: payload, createdLocallyAt: now,
  }],
};

function serviceWith(options: Partial<StynxOfflineSyncModuleOptions> = {}, store: Record<string, unknown> = {}) {
  return new OfflineSyncService(store as OfflineSyncStore, { current: () => scope }, {
    now: () => now,
    policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000, maxBatchItems: 100 }) },
    ...options,
  });
}

describe('offline sync boundary coverage', () => {
  it('refuses a missing, nonfinite, or nonpositive reservation TTL before using the store', async () => {
    const reserveNumbering = vi.fn();
    for (const reservationTtlMs of [undefined, Number.POSITIVE_INFINITY, 0]) {
      const service = serviceWith({
        policyResolver: { resolve: async () => ({ reservationTtlMs }) },
      }, { reserveNumbering });
      await expect(service.reserveNumbering({
        orgUnitId: 'org-1', deviceId: 'device-1', shiftId: 'shift-1',
        entityType: 'citation', requestedSize: 1,
      })).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'reservation policy is missing.',
      });
    }
    expect(reserveNumbering).not.toHaveBeenCalled();
  });

  it('rejects malformed reservation identifiers before durable batch dispatch', async () => {
    const submitDurableSyncBatch = vi.fn();
    const service = serviceWith({}, { submitDurableSyncBatch });
    for (const reservationId of [42, 'not-a-uuid']) {
      const invalid = { ...batch, items: [{ ...batch.items[0]!, reservationId }] };
      await expect(service.submitSyncBatch(invalid as unknown as SubmitSyncBatchInput))
        .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'reservationId must be a UUID.' });
    }
    expect(submitDurableSyncBatch).not.toHaveBeenCalled();
  });

  it('uses a store-specific conflict resolver when the store offers one', async () => {
    const conflict = { conflictId: 'conflict-1', status: 'resolved' } as SyncConflict;
    const resolveWithPort = vi.fn(async () => conflict);
    const port = { resolve: vi.fn() };
    const service = serviceWith({ conflictResolver: port as never }, { resolveWithPort });

    await expect(service.resolveConflict('conflict-1', { resolution: 'manual-review' }))
      .resolves.toBe(conflict);
    expect(resolveWithPort).toHaveBeenCalledWith(scope, 'conflict-1', { resolution: 'manual-review' }, now, port);
    expect(port.resolve).not.toHaveBeenCalled();
  });

  it('delegates conflict resolution to the configured port when the store has no specialized path', async () => {
    const conflict = { conflictId: 'conflict-2', status: 'resolved' } as SyncConflict;
    const resolve = vi.fn(async () => conflict);
    const service = serviceWith({ conflictResolver: { resolve } as never });

    await expect(service.resolveConflict('conflict-2', { resolution: 'manual-review' }))
      .resolves.toBe(conflict);
    expect(resolve).toHaveBeenCalledWith(expect.anything(), 'conflict-2', 'manual-review', {
      ...scope, agentId: scope.actorId, orgUnitId: '', deviceId: '', batchId: '', now,
    });
  });

  it('uses an agent resolver and an empty policy when a policy source returns no value', async () => {
    const submitDurableSyncBatch = vi.fn(async () => ({ receipt: { status: 'closed' } }));
    const resolve = vi.fn(async () => 'business-agent');
    const service = serviceWith({
      policyResolver: { resolve: async () => undefined } as never,
      agentResolver: { resolve },
    }, { submitDurableSyncBatch });

    await expect(service.submitSyncBatch(batch)).resolves.toMatchObject({ receipt: { status: 'closed' } });
    expect(resolve).toHaveBeenCalledWith(scope, 'submit-sync-batch');
    expect(submitDurableSyncBatch).toHaveBeenCalledWith(scope, batch, expect.objectContaining({
      agentId: 'business-agent', policy: {},
    }), now);
  });

  it('uses the request URL or canonical route when originalUrl is absent', async () => {
    const submitSyncBatch = vi.fn(async () => ({ receipt: { status: 'closed' } }));
    const controller = new CTG9OfflineSyncController({ submitSyncBatch } as never);
    const response = { status: vi.fn(), setHeader: vi.fn() };

    await controller.submitBatch(batch, 'K1', { body: batch, url: '/proxy/sync?trace=1' }, response);
    await controller.submitBatch(batch, 'K2', { body: batch }, response);
    expect(submitSyncBatch.mock.calls[0]?.[1]).toMatchObject({ path: '/proxy/sync' });
    expect(submitSyncBatch.mock.calls[1]?.[1]).toMatchObject({ path: '/offline-sync/sync-batches' });
  });

  it('separates transport users and absent optional item fields in canonical hashes', () => {
    const transport = { transportIdempotencyKey: 'K1', method: 'POST' as const, path: '/sync' };
    expect(transportCompositeKey(scope, transport))
      .not.toBe(transportCompositeKey(scope, { ...transport, transportUserId: 'other-user' }));
    const original = batchContextFingerprint(batch, scope.actorId);
    const withoutLocalTime = { ...batch, items: [{
      ...batch.items[0]!, createdLocallyAt: undefined,
    }] };
    expect(batchContextFingerprint(withoutLocalTime, scope.actorId)).not.toBe(original);
  });
});
