import { describe, expect, it, vi } from 'vitest';
import { prepareOfflineSyncItem } from '../../src/pre-apply';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';
import type {
  CTG9SyncBatchItemInput,
  DurableBatchExecutionOptions,
  OfflineSyncItemContext,
  StynxOfflineSyncModuleOptions,
} from '../../src/types';

const item: CTG9SyncBatchItemInput = {
  queueItemId: 'current',
  localEntityId: 'local',
  entityType: 'citation',
  idempotencyKey: 'receipt-current',
  payloadJson: {},
  payloadHash: `sha256:${'a'.repeat(64)}`,
};
const context: OfflineSyncItemContext = {
  tenantId: '00000000-0000-4000-8000-0000000000a1',
  actorId: 'actor-a',
  agentId: 'business-agent',
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  batchId: 'batch-a',
  receiptId: 'receipt-current',
  now: '2026-10-10T12:00:00.000Z',
};
const trx = { query: vi.fn() } as never;
const execution = (
  result: unknown,
  overrides: Partial<DurableBatchExecutionOptions> = {},
): DurableBatchExecutionOptions => ({
  transportIdempotencyKey: 'transport-a',
  method: 'POST',
  path: '/sync-batches',
  agentId: 'business-agent',
  policy: {},
  ports: { preApplyDetector: { detect: async () => result as never } },
  transport: { transportIdempotencyKey: 'transport-a', method: 'POST', path: '/sync-batches' },
  ...overrides,
});

describe('UPS-OFS-10 pre-apply trusted witness admission', () => {
  it.each([
    null,
    undefined,
    {},
    { suspected: 'true', pairs: [] },
    { suspected: false, pairs: [{}] },
    { suspected: true, pairs: [] },
    { suspected: true, pairs: null },
  ])('refuses malformed detector result %j before handoff', async (result) => {
    const permits = vi.fn(async () => true);
    const opts = execution(result);
    await expect(
      prepareOfflineSyncItem(
        trx,
        item,
        context,
        { ...opts, ports: { ...opts.ports, handoffPort: { permits } } },
        async () => true,
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(permits).not.toHaveBeenCalled();
  });
  it.each([
    { firstItemId: 'other-a', secondItemId: 'other-b' },
    { firstItemId: 'current', secondItemId: 'current' },
    { firstItemId: '', secondItemId: 'current' },
    { firstItemId: 'current', secondItemId: 7 },
    { firstItemId: 'current', secondItemId: 'cross-tenant' },
  ])(
    'refuses pair %j before a permissive handoff can exempt invalid/foreign witnesses',
    async (pair) => {
      const permits = vi.fn(async () => true);
      const opts = execution({ suspected: true, pairs: [pair] });
      await expect(
        prepareOfflineSyncItem(
          trx,
          item,
          context,
          { ...opts, ports: { ...opts.ports, handoffPort: { permits } } },
          async (id) => ['current', 'sibling'].includes(id),
        ),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
      expect(permits).not.toHaveBeenCalled();
    },
  );
  it('validates witnesses under the supplied transaction, deduplicates reversed pairs and removes permitted handoffs', async () => {
    const pair = { firstItemId: 'current', secondItemId: 'sibling' };
    const permitted = { firstItemId: 'current', secondItemId: 'handoff' };
    const detect = vi.fn(async () => ({
      suspected: true,
      pairs: [pair, { firstItemId: 'sibling', secondItemId: 'current' }, permitted],
    }));
    const permits = vi.fn(async (_trx, witness) => witness.secondItemId === 'handoff');
    const exists = vi.fn(async () => true);
    const opts = execution(null, {
      ports: { preApplyDetector: { detect }, handoffPort: { permits } },
    });
    expect(await prepareOfflineSyncItem(trx, item, context, opts, exists)).toEqual({
      context: { ...context, concurrencySuspected: true, concurrentPairs: [pair] },
      pairs: [pair],
      defer: true,
    });
    expect(detect).toHaveBeenCalledWith(trx, item, context);
    expect(permits).toHaveBeenCalledTimes(2);
    expect(permits).toHaveBeenCalledWith(trx, permitted, context);
    expect(exists).toHaveBeenCalledWith('sibling');
  });
  it('uses effective suspicion after every pair is handoff-exempt and leaves the input context immutable', async () => {
    const opts = execution(null, {
      ports: {
        preApplyDetector: {
          detect: async () => ({
            suspected: true,
            pairs: [{ firstItemId: 'current', secondItemId: 'sibling' }],
          }),
        },
        handoffPort: { permits: async () => true },
      },
    });
    expect(await prepareOfflineSyncItem(trx, item, context, opts, async () => true)).toEqual({
      context: { ...context, concurrencySuspected: false, concurrentPairs: [] },
      pairs: [],
      defer: false,
    });
    expect(context).not.toHaveProperty('concurrencySuspected');
  });
  it.each(['defer', 'apply'] as const)(
    'honors explicit %s policy independently of the legacy concurrency window',
    async (policy) => {
      const pair = { firstItemId: 'current', secondItemId: 'sibling' };
      const opts = execution(
        { suspected: true, pairs: [pair] },
        { policy: { concurrencyApplication: policy, concurrencyWindowMinutes: 0 } },
      );
      expect(
        await prepareOfflineSyncItem(trx, item, context, opts, async () => true),
      ).toMatchObject({ defer: policy === 'defer', pairs: [pair] });
    },
  );
  it('rejects invalid policy even when no pre-apply detector is configured', async () => {
    const opts = execution(null, {
      ports: {},
      policy: { concurrencyApplication: 'silent-apply' as never },
    });
    await expect(
      prepareOfflineSyncItem(trx, item, context, opts, async () => true),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(trx.query).not.toHaveBeenCalled();
  });
  it.each([
    { initialQueueStatus: 'pending' },
    { initialQueueStatus: 'received' },
    { payloadHashPort: { hash: async () => 'unused' } },
    { preApplyDetector: { detect: async () => ({ suspected: false, pairs: [] }) } },
  ])('refuses CTG9-only options in an E6 module: %j', (options) => {
    expect(() =>
      StynxOfflineSyncModule.inMemory(options as StynxOfflineSyncModuleOptions),
    ).toThrowError(expect.objectContaining({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' }));
    expect(() => StynxOfflineSyncModule.inMemory()).not.toThrow();
  });
});
