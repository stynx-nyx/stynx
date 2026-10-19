import { describe, expect, it, vi } from 'vitest';
import { OfflineSyncConfigurationError } from '../../src/errors.js';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity.js';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { GAP_AT, GAP_TENANT_A, GAP_TENANT_B } from '../support/offline-sync-acceptance-gaps.js';

import {
  registerDomainOutcomeContracts,
  domainBatch,
  domainFailure,
  domainEvents,
} from '../support/offline-domain-outcomes.js';

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
};
const memoryScope = { tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' };
const legacyBatch = (id: string): import('../../src/types.js').SubmitSyncBatchInput => {
  const input = domainBatch(id);
  const payloadJson = { legacyEffect: id };
  return {
    ...input,
    items: [
      {
        ...input.items[0]!,
        idempotencyKey: `key-${id}`,
        payloadJson,
        payloadHash: canonicalOfflineSyncPayloadHash(payloadJson),
      },
    ],
  };
};
const memoryService = (
  store: InMemoryOfflineSyncStore,
  options: Partial<import('../../src/types.js').StynxOfflineSyncModuleOptions> = {},
) =>
  new OfflineSyncService(
    store,
    { current: () => memoryScope },
    {
      now: () => GAP_AT,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
      eventPort: domainEvents(),
      ...options,
    },
  );

describe('Domain-outcome contracts through the memory store', () => {
  registerDomainOutcomeContracts(() => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange({
      id: '10000000-0000-4000-8000-0000000000d1',
      tenantId: GAP_TENANT_A,
      orgUnitId: 'org-a',
      entityType: 'citation',
      series: 'C',
      startNumber: 1,
      endNumber: 100,
      nextNumber: 1,
      status: 'active',
    });
    let clock = Date.parse(GAP_AT);
    return {
      fatalReceiptMaterialization: 'absent' as const,
      service: (options = {}, tenantId = GAP_TENANT_A) =>
        new OfflineSyncService(
          store,
          { current: () => ({ tenantId, actorId: 'authenticated-audit-actor' }) },
          {
            now: () => new Date(clock).toISOString(),
            policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
            ...options,
          },
        ),
      readConflictCode: async (conflictId) =>
        (
          store as unknown as {
            conflictStynx: Map<string, import('../../src/types.js').OfflineSyncStynxContext>;
          }
        ).conflictStynx.get(`${GAP_TENANT_A}:${conflictId}`)!.errorCode!,
      readConflictActions: async (conflictId) =>
        (
          store as unknown as { conflictAllowedActions: Map<string, readonly string[]> }
        ).conflictAllowedActions.get(`${GAP_TENANT_A}:${conflictId}`)!,
      run: async (_tenantId, operation) => operation(),
      tick: () => {
        clock += 1000;
      },
    };
  });
  it('D1.1 restores actual memory-store effects before classifier invocation', async () => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange({
      id: '10000000-0000-4000-8000-0000000000e2',
      tenantId: GAP_TENANT_A,
      orgUnitId: 'org-a',
      entityType: 'citation',
      series: 'M',
      startNumber: 1,
      endNumber: 100,
      nextNumber: 1,
      status: 'active',
    });
    const scope = { tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' };
    const seed = new OfflineSyncService(
      store,
      { current: () => scope },
      {
        now: () => GAP_AT,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
        itemApplier: { apply: async () => ({ serverEntityId: 'existing-domain' }) },
        eventPort: domainEvents(),
      },
    );
    await seed.submitSyncBatch(domainBatch('memory-existing'));
    const classify = vi.fn(() => {
      expect((store as unknown as { conflicts: Map<string, unknown> }).conflicts.size).toBe(0);
      return { status: 'received' as const };
    });
    const subject = new OfflineSyncService(
      store,
      { current: () => scope },
      {
        now: () => GAP_AT,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
        itemApplier: {
          apply: async () => {
            await store.openConflict(
              scope,
              'memory-existing',
              { conflictType: 'domain', description: 'failed effect wrote this' },
              GAP_AT,
            );
            throw domainFailure();
          },
        },
        eventPort: domainEvents(),
        domainOutcomeClassifier: { classify },
      },
    );
    const input = domainBatch('memory-effect-rollback');
    const reservation = await subject.reserveDurableNumbering({
      orgUnitId: input.orgUnitId,
      deviceId: input.deviceId,
      shiftId: null,
      entityType: 'citation',
      requestedSize: 1,
    });
    const result = await subject.submitSyncBatch({
      ...input,
      items: [{ ...input.items[0]!, reservedNumber: reservation.startNumber }],
    });
    expect((await subject.getNumberingConsumption(reservation.reservationId)).consumption).toEqual([
      {
        number: reservation.startNumber,
        status: 'available',
        serverEntityId: null,
        finalizedAt: null,
      },
    ]);
    expect(result.receipt.items[0]).toMatchObject({
      status: 'received',
      stynx: { terminalReceived: true },
    });
    expect((await subject.listSyncConflicts({})).items).toEqual([]);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('D1.1 rolls back the full memory refusal when a stored-conflict write faults', async () => {
    const store = new InMemoryOfflineSyncStore();
    const internal = store as unknown as { saveConflict(...args: unknown[]): void };
    const original = internal.saveConflict.bind(store);
    // Fault injection after an actual owned write; the store transaction is never replaced.
    const fault = vi.spyOn(internal, 'saveConflict').mockImplementationOnce((...args) => {
      original(...args);
      throw new Error('memory refusal write fault');
    });
    const subject = new OfflineSyncService(
      store,
      { current: () => ({ tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' }) },
      {
        now: () => GAP_AT,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
        itemApplier: {
          apply: async () => {
            throw domainFailure();
          },
        },
        eventPort: domainEvents(),
        domainOutcomeClassifier: {
          classify: () => ({
            status: 'conflict',
            conflict: { type: 'domain', description: 'consumer collision' },
          }),
        },
      },
    );
    const input = domainBatch('memory-refusal-atomic');
    await expect(subject.submitSyncBatch(input)).rejects.toThrow('memory refusal write fault');
    expect(
      (await subject.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId })).items,
    ).toEqual([]);
    expect((await subject.listSyncItemReceipts({ deviceId: input.deviceId })).items).toEqual([]);
    const refused = store as unknown as {
      conflictAllowedActions: Map<string, unknown>;
      conflictStynx: Map<string, unknown>;
      conflictDomainContexts: Map<string, unknown>;
    };
    expect([...refused.conflictAllowedActions]).toEqual([]);
    expect([...refused.conflictStynx]).toEqual([]);
    expect([...refused.conflictDomainContexts]).toEqual([]);
    expect(
      (await subject.listSyncBatchReceipts({ deviceId: input.deviceId })).items[0],
    ).toMatchObject({ status: 'open', responseStatus: null });
    fault.mockRestore();
    expect((await subject.submitSyncBatch(input)).receipt.status).toBe('closed');
    expect(
      (await subject.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId })).items,
    ).toHaveLength(1);
  });
  it('D1.1 does not resurrect failed applier effects when their pending resolver subsequently refuses', async () => {
    const store = new InMemoryOfflineSyncStore();
    const scope = { tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' };
    const shadow = domainBatch('failed-applier-shadow');
    const shadowItem = { ...shadow.items[0]!, idempotencyKey: 'failed-applier-shadow-key' };
    let resume!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((done) => {
      resume = done;
    });
    const ready = new Promise<void>((done) => {
      entered = done;
    });
    const refusal = new Error('resolver refused after its applier rolled back');
    let conflictId = '';
    let resolution!: Promise<unknown>;
    const subject = new OfflineSyncService(
      store,
      { current: () => scope },
      {
        now: () => GAP_AT,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
        domainOutcomeClassifier: { classify: () => undefined },
        eventPort: domainEvents(),
        itemApplier: {
          apply: async () => {
            // These genuine public writes are effects of this failing item, not an unrelated writer.
            await store.submitSyncBatch(scope, { ...shadow, items: [shadowItem] }, GAP_AT);
            const conflict = await store.openConflict(
              scope,
              shadowItem.queueItemId,
              { conflictType: 'domain', description: 'uncommitted applier effect' },
              GAP_AT,
            );
            conflictId = conflict.conflictId;
            resolution = store.resolveWithPort(
              scope,
              conflictId,
              { resolution: 'manual_review' },
              GAP_AT,
              {
                allowedActions: async () => ['manual_review'],
                resolve: async () => {
                  entered();
                  await paused;
                  throw refusal;
                },
              },
            );
            await ready;
            throw domainFailure();
          },
        },
      },
    );
    try {
      const result = await subject.submitSyncBatch(domainBatch('failed-applier-parent'));
      expect(result.receipt.items[0]).toMatchObject({
        status: 'received',
        errorCode: 'BUSINESS_CLOSED',
        stynx: { retryable: true },
      });
      expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
      expect(
        (await subject.listSyncConflicts({ queueItemId: shadowItem.queueItemId })).items,
      ).toEqual([]);
    } finally {
      resume();
    }
    await expect(resolution).rejects.toBe(refusal);
    expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
    expect(
      (await subject.listSyncConflicts({ queueItemId: shadowItem.queueItemId })).items,
    ).toEqual([]);
    expect((await subject.listSyncConflictActions({ conflictId })).items).toEqual([]);
  });
  it('D1.1 refuses configured unsupported custom stores and legacy mode before invoking a domain port', async () => {
    const store = new InMemoryOfflineSyncStore();
    const unsupported = new Proxy(store, {
      get(target, key, receiver) {
        if (key === 'supportsDomainOutcomeClassifier') return undefined;
        const value = Reflect.get(target, key, receiver) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const apply = vi.fn(async () => {
      throw domainFailure();
    });
    const classify = vi.fn(() => ({ status: 'received' as const }));
    const options = {
      now: () => GAP_AT,
      itemApplier: { apply },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
    };
    const scope = {
      current: () => ({ tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' }),
    };
    const custom = new OfflineSyncService(unsupported, scope, {
      ...options,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
    });
    await expect(custom.submitSyncBatch(domainBatch('unsupported-custom'))).rejects.toBeInstanceOf(
      OfflineSyncConfigurationError,
    );
    const legacy = new OfflineSyncService(store, scope, options);
    await expect(legacy.submitSyncBatch(domainBatch('unsupported-legacy'))).rejects.toBeInstanceOf(
      OfflineSyncConfigurationError,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    expect(
      (
        await store.listSyncQueueItems(
          { tenantId: GAP_TENANT_A, actorId: 'authenticated-audit-actor' },
          {},
        )
      ).items,
    ).toEqual([]);
  });
  it('D4.1 serializes an unrelated same-tenant E6 writer through failed-item rollback while another tenant progresses', async () => {
    const store = new InMemoryOfflineSyncStore();
    const entered = deferred(),
      release = deferred();
    const failure = new OfflineSyncConfigurationError('original paused applier failure');
    const subject = memoryService(store, {
      itemApplier: {
        apply: async () => {
          entered.release();
          await release.promise;
          throw failure;
        },
      },
    });
    const batch = subject
      .submitSyncBatch(domainBatch('isolated-failed-parent'))
      .catch((error: unknown) => error);
    await entered.promise;
    let writerFinished = false;
    const unrelated = legacyBatch('unrelated-e6-writer');
    const writer = (async () => {
      const result = await store.submitSyncBatch(memoryScope, unrelated, GAP_AT);
      const conflict = await store.openConflict(
        memoryScope,
        unrelated.items[0]!.queueItemId,
        { conflictType: 'domain', description: 'independent committed effect' },
        GAP_AT,
      );
      writerFinished = true;
      return { result, conflict };
    })();
    const otherScope = { ...memoryScope, tenantId: GAP_TENANT_B };
    const otherInput = legacyBatch('independent-other-tenant');
    let otherResult!: import('../../src/types.js').SyncConflict;
    let finishedWhilePaused: boolean;
    try {
      await store.submitSyncBatch(otherScope, otherInput, GAP_AT);
      const otherConflict = await store.openConflict(
        otherScope,
        otherInput.items[0]!.queueItemId,
        { conflictType: 'domain', description: 'other tenant' },
        GAP_AT,
      );
      otherResult = await store.resolveConflict(
        otherScope,
        otherConflict.conflictId,
        { resolution: 'server-wins' },
        GAP_AT,
      );
      await new Promise<void>((done) => setImmediate(done));
      finishedWhilePaused = writerFinished;
    } finally {
      release.release();
    }
    expect(await batch).toBe(failure);
    const { conflict } = await writer;
    expect(finishedWhilePaused).toBe(false);
    expect(otherResult).toMatchObject({ tenantId: GAP_TENANT_B, status: 'resolved' });
    expect((await subject.listSyncQueueItems({ deviceId: unrelated.deviceId })).items).toHaveLength(
      1,
    );
    expect(
      (await subject.listSyncConflicts({ queueItemId: unrelated.items[0]!.queueItemId })).items,
    ).toEqual([expect.objectContaining({ conflictId: conflict.conflictId, status: 'open' })]);
    const resolved = await store.resolveWithPort(
      memoryScope,
      conflict.conflictId,
      { resolution: 'manual_review' },
      GAP_AT,
      {
        allowedActions: async () => ['manual_review'],
        resolve: async () => ({ ...conflict, status: 'resolved' }),
      },
    );
    expect(resolved).toMatchObject({
      conflictId: conflict.conflictId,
      status: 'resolved',
      resolvedBy: memoryScope.actorId,
    });
    expect(
      (await subject.listSyncConflictActions({ conflictId: conflict.conflictId })).items,
    ).toHaveLength(1);
  });

  it('D4.1 preserves an independent E6 writer and action history while a shared resolution rolls back only its own nested effects', async () => {
    const store = new InMemoryOfflineSyncStore();
    const original = legacyBatch('shared-resolution-root');
    await store.submitSyncBatch(memoryScope, original, GAP_AT);
    const originalConflict = await store.openConflict(
      memoryScope,
      original.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'shared root' },
      GAP_AT,
    );
    const shadow = legacyBatch('shared-resolution-own-shadow');
    const entered = deferred(),
      release = deferred();
    const failure = new Error('actual shared resolution refusal');
    let shadowId = '';
    const failing = store
      .resolveWithPort(
        memoryScope,
        originalConflict.conflictId,
        { resolution: 'manual_review' },
        GAP_AT,
        {
          allowedActions: async () => ['manual_review'],
          resolve: async () => {
            await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
            const conflict = await store.openConflict(
              memoryScope,
              shadow.items[0]!.queueItemId,
              { conflictType: 'domain', description: 'own shadow' },
              GAP_AT,
            );
            shadowId = conflict.conflictId;
            entered.release();
            await release.promise;
            throw failure;
          },
        },
      )
      .catch((error: unknown) => error);
    await entered.promise;
    const unrelated = legacyBatch('shared-resolution-independent-writer');
    let writerFinished = false;
    const writer = (async () => {
      await store.submitSyncBatch(memoryScope, unrelated, GAP_AT);
      const conflict = await store.openConflict(
        memoryScope,
        unrelated.items[0]!.queueItemId,
        { conflictType: 'domain', description: 'independent committed history' },
        GAP_AT,
      );
      const resolved = await store.resolveWithPort(
        memoryScope,
        conflict.conflictId,
        { resolution: 'manual_review' },
        GAP_AT,
        {
          allowedActions: async () => ['manual_review'],
          resolve: async () => ({ ...conflict, status: 'resolved' }),
        },
      );
      writerFinished = true;
      return resolved;
    })();
    let finishedWhilePaused: boolean;
    try {
      await new Promise<void>((done) => setImmediate(done));
      finishedWhilePaused = writerFinished;
    } finally {
      release.release();
    }
    expect(await failing).toBe(failure);
    const resolved = await writer;
    expect(finishedWhilePaused).toBe(true);
    expect(
      (await store.listSyncQueueItems(memoryScope, { deviceId: unrelated.deviceId })).items,
    ).toHaveLength(1);
    expect(
      (await store.listSyncConflicts(memoryScope, { queueItemId: unrelated.items[0]!.queueItemId }))
        .items,
    ).toEqual([expect.objectContaining({ conflictId: resolved.conflictId, status: 'resolved' })]);
    expect(
      (await store.listSyncConflictActions(memoryScope, { conflictId: resolved.conflictId })).items,
    ).toEqual([
      expect.objectContaining({ conflictId: resolved.conflictId, resultingStatus: 'resolved' }),
    ]);
    expect(
      (await store.listSyncQueueItems(memoryScope, { deviceId: shadow.deviceId })).items,
    ).toEqual([]);
    expect(
      (await store.listSyncConflicts(memoryScope, { queueItemId: shadow.items[0]!.queueItemId }))
        .items,
    ).toEqual([]);
    expect(
      (await store.listSyncConflictActions(memoryScope, { conflictId: shadowId })).items,
    ).toEqual([]);
    expect(
      (await store.listSyncConflicts(memoryScope, { queueItemId: original.items[0]!.queueItemId }))
        .items,
    ).toEqual([
      expect.objectContaining({ conflictId: originalConflict.conflictId, status: 'open' }),
    ]);
  });

  it('D4.1 never acknowledges a duplicate identity read from another shared owner that later rolls back', async () => {
    const store = new InMemoryOfflineSyncStore();
    const original = legacyBatch('uncommitted-payload-root');
    await store.submitSyncBatch(memoryScope, original, GAP_AT);
    const originalConflict = await store.openConflict(
      memoryScope,
      original.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'payload root' },
      GAP_AT,
    );
    const shadow = legacyBatch('uncommitted-payload-shadow');
    const entered = deferred(),
      release = deferred();
    const failure = new Error('rollback uncommitted payload identity');
    const failing = store
      .resolveWithPort(
        memoryScope,
        originalConflict.conflictId,
        { resolution: 'manual_review' },
        GAP_AT,
        {
          allowedActions: async () => ['manual_review'],
          resolve: async () => {
            await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
            entered.release();
            await release.promise;
            throw failure;
          },
        },
      )
      .catch((error: unknown) => error);
    await entered.promise;
    const freshItem = {
      ...shadow.items[0]!,
      queueItemId: 'independent-samehash-new-id',
      idempotencyKey: 'independent-samehash-new-key',
    };
    const prefixItem = legacyBatch('independent-refused-prefix').items[0]!;
    const freshInput = {
      ...shadow,
      deviceBatchId: 'independent-samehash-batch',
      items: [prefixItem, freshItem],
    };
    const attempt = store.submitSyncBatch(memoryScope, freshInput, GAP_AT).then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    try {
      await new Promise<void>((done) => setImmediate(done));
    } finally {
      release.release();
    }
    expect(await failing).toBe(failure);
    const outcome = await attempt;
    expect(outcome).toMatchObject({ error: { code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 } });
    expect(store.getQueueItem(GAP_TENANT_A, prefixItem.queueItemId)).toBe(undefined);
    expect(store.getQueueItem(GAP_TENANT_A, freshItem.queueItemId)).toBe(undefined);
    const fresh = await store.submitSyncBatch(memoryScope, freshInput, GAP_AT);
    expect(fresh).toMatchObject({
      duplicateItems: 0,
      items: [{ queueItemId: prefixItem.queueItemId }, { queueItemId: freshItem.queueItemId }],
    });
    expect(
      (await store.listSyncQueueItems(memoryScope, { deviceId: shadow.deviceId })).items
        .map((item) => item.queueItemId)
        .sort(),
    ).toEqual([prefixItem.queueItemId, freshItem.queueItemId].sort());
    expect(store.getQueueItem(GAP_TENANT_A, shadow.items[0]!.queueItemId)).toBe(undefined);
  });

  it('D4.1 fences a detached successful resolver after its owning applier fails', async () => {
    const store = new InMemoryOfflineSyncStore();
    const entered = deferred(),
      release = deferred();
    const shadow = legacyBatch('detached-success-effect');
    const failure = new OfflineSyncConfigurationError('owning applier failed');
    let child!: Promise<unknown>,
      conflictId = '';
    const subject = memoryService(store, {
      itemApplier: {
        apply: async () => {
          await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
          const conflict = await store.openConflict(
            memoryScope,
            shadow.items[0]!.queueItemId,
            { conflictType: 'domain', description: 'uncommitted shadow' },
            GAP_AT,
          );
          conflictId = conflict.conflictId;
          child = store
            .resolveWithPort(memoryScope, conflictId, { resolution: 'manual_review' }, GAP_AT, {
              allowedActions: async () => ['manual_review'],
              resolve: async () => {
                entered.release();
                await release.promise;
                return { ...conflict, status: 'resolved' };
              },
            })
            .catch((error: unknown) => error);
          await entered.promise;
          throw failure;
        },
      },
    });
    try {
      await expect(subject.submitSyncBatch(domainBatch('detached-failed-owner'))).rejects.toBe(
        failure,
      );
    } finally {
      release.release();
    }
    expect(await child).toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
    expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
    expect(
      (await subject.listSyncConflicts({ queueItemId: shadow.items[0]!.queueItemId })).items,
    ).toEqual([]);
    expect((await subject.listSyncConflictActions({ conflictId })).items).toEqual([]);
  });

  it('D4.1 refuses late allowedActions success before invoking a resolver from a closed owning frame', async () => {
    const store = new InMemoryOfflineSyncStore();
    const entered = deferred(),
      release = deferred();
    const shadow = legacyBatch('late-allowed-actions');
    const failure = new OfflineSyncConfigurationError('closed before resolution admission');
    const resolve = vi.fn(async () => {
      throw new Error('stale resolver must never start');
    });
    let child!: Promise<unknown>,
      conflictId = '';
    const subject = memoryService(store, {
      itemApplier: {
        apply: async () => {
          await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
          const conflict = await store.openConflict(
            memoryScope,
            shadow.items[0]!.queueItemId,
            { conflictType: 'domain', description: 'awaiting admission' },
            GAP_AT,
          );
          conflictId = conflict.conflictId;
          child = store
            .resolveWithPort(memoryScope, conflictId, { resolution: 'manual_review' }, GAP_AT, {
              allowedActions: async () => {
                entered.release();
                await release.promise;
                return ['manual_review'];
              },
              resolve,
            })
            .catch((error: unknown) => error);
          await entered.promise;
          throw failure;
        },
      },
    });
    try {
      await expect(subject.submitSyncBatch(domainBatch('late-allowed-owner'))).rejects.toBe(
        failure,
      );
    } finally {
      release.release();
    }
    expect(await child).toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
    expect(resolve).not.toHaveBeenCalled();
    expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
    expect(
      (await subject.listSyncConflicts({ queueItemId: shadow.items[0]!.queueItemId })).items,
    ).toEqual([]);
    expect((await subject.listSyncConflictActions({ conflictId })).items).toEqual([]);
  });

  for (const status of ['resolved', 'open'] as const)
    it(`D4.1 refuses a successful applier whose owned ${status} resolver is still appending its final event`, async () => {
      const store = new InMemoryOfflineSyncStore();
      const entered = deferred(),
        release = deferred();
      const shadow = legacyBatch(`pending-event-${status}`);
      let child!: Promise<unknown>,
        conflictId = '';
      const subject = memoryService(store, {
        itemApplier: {
          apply: async () => {
            await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
            const conflict = await store.openConflict(
              memoryScope,
              shadow.items[0]!.queueItemId,
              { conflictType: 'domain', description: 'pending final event' },
              GAP_AT,
            );
            conflictId = conflict.conflictId;
            child = store
              .resolveWithPort(
                memoryScope,
                conflictId,
                { resolution: 'manual_review' },
                GAP_AT,
                {
                  allowedActions: async () => ['manual_review'],
                  resolve: async () => ({ ...conflict, status }),
                },
                {
                  appendInTransaction: async () => {
                    entered.release();
                    await release.promise;
                  },
                  appendManyInTransaction: async () => undefined,
                },
              )
              .catch((error: unknown) => error);
            await entered.promise;
            return { serverEntityId: 'must-not-commit-parent' };
          },
        },
      });
      let result!: Awaited<ReturnType<OfflineSyncService['submitSyncBatch']>>;
      try {
        result = await subject.submitSyncBatch(domainBatch(`unfinished-event-parent-${status}`));
      } finally {
        release.release();
      }
      expect(result.receipt.items[0]).toMatchObject({
        status: 'rejected',
        errorCode: 'OFFLINE_SYNC_CONFLICT_STATE',
      });
      expect(result.receipt.items[0]).not.toHaveProperty('serverEntityId');
      expect(result.receipt.items[0]!.stynx).not.toHaveProperty('appliedAt');
      expect(await child).toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
      expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
      expect(
        (await subject.listSyncConflicts({ queueItemId: shadow.items[0]!.queueItemId })).items,
      ).toEqual([]);
      expect((await subject.listSyncConflictActions({ conflictId })).items).toEqual([]);
    });

  it('D4.1 rolls back completed owned E6 indexes and action history while preserving historical facts and allowing exact-key CTG9 application', async () => {
    const store = new InMemoryOfflineSyncStore();
    const historical = legacyBatch('historical-before-rollback');
    await store.submitSyncBatch(memoryScope, historical, GAP_AT);
    const historicConflict = await store.openConflict(
      memoryScope,
      historical.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'historical' },
      GAP_AT,
    );
    await store.resolveWithPort(
      memoryScope,
      historicConflict.conflictId,
      { resolution: 'manual_review' },
      GAP_AT,
      {
        allowedActions: async () => ['manual_review'],
        resolve: async () => ({ ...historicConflict, status: 'resolved' }),
      },
    );
    const historyBefore = await store.listSyncConflictActions(memoryScope, {
      conflictId: historicConflict.conflictId,
    });
    const shadow = legacyBatch('completed-owned-shadow');
    let conflictId = '';
    const failure = new OfflineSyncConfigurationError(
      'applier fails after completed nested resolution',
    );
    const subject = memoryService(store, {
      itemApplier: {
        apply: async () => {
          await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
          const conflict = await store.openConflict(
            memoryScope,
            shadow.items[0]!.queueItemId,
            { conflictType: 'domain', description: 'completed own effect' },
            GAP_AT,
          );
          conflictId = conflict.conflictId;
          await store.resolveWithPort(
            memoryScope,
            conflictId,
            { resolution: 'manual_review' },
            GAP_AT,
            {
              allowedActions: async () => ['manual_review'],
              resolve: async () => ({ ...conflict, status: 'resolved' }),
            },
          );
          throw failure;
        },
      },
    });
    await expect(subject.submitSyncBatch(domainBatch('completed-owned-parent'))).rejects.toBe(
      failure,
    );
    expect((await subject.listSyncQueueItems({ deviceId: shadow.deviceId })).items).toEqual([]);
    expect((await subject.listSyncConflictActions({ conflictId })).items).toEqual([]);
    expect(
      await store.listSyncConflictActions(memoryScope, { conflictId: historicConflict.conflictId }),
    ).toEqual(historyBefore);
    const apply = vi.fn(async () => ({ serverEntityId: 'fresh-after-index-rollback' }));
    const next = memoryService(store, { itemApplier: { apply } });
    const result = await next.submitSyncBatch({
      ...shadow,
      deviceBatchId: 'post-rollback-durable',
    });
    expect(result.receipt.items[0]).toMatchObject({
      queueItemId: shadow.items[0]!.queueItemId,
      status: 'applied',
      stynx: { serverEntityId: 'fresh-after-index-rollback' },
    });
    expect(result.receipt.items[0]!.stynx).not.toHaveProperty('legacyReceived');
    expect(apply).toHaveBeenCalledTimes(1);
    const replay = await next.submitSyncBatch({
      ...shadow,
      deviceBatchId: 'post-rollback-durable',
    });
    expect(replay.receipt.responseBodyBytes).toEqual(result.receipt.responseBodyBytes);
    expect(apply).toHaveBeenCalledTimes(1);
    // Payload lookup must also forget the discarded E6 identity, not alias this new public item.
    const legacy = await store.submitSyncBatch(
      memoryScope,
      {
        ...shadow,
        deviceBatchId: 'new-e6-after-rollback',
        items: [
          {
            ...shadow.items[0]!,
            queueItemId: 'post-rollback-e6-new-id',
            idempotencyKey: 'post-rollback-e6-new-key',
          },
        ],
      },
      GAP_AT,
    );
    expect(legacy).toMatchObject({
      duplicateItems: 0,
      items: [{ queueItemId: 'post-rollback-e6-new-id' }],
    });
  });

  it('D4.1 refuses nested durable batches, cross-tenant ownership and recursive same-conflict resolution without self-deadlock', async () => {
    const store = new InMemoryOfflineSyncStore();
    let nestedBatch!: Promise<unknown>, wrongTenant: unknown;
    let nestedBeforeOwner = false;
    const subject = memoryService(store, {
      itemApplier: {
        apply: async (_trx, item) => {
          if (item.queueItemId !== 'nested-owner')
            return { serverEntityId: 'unexpected-nested-effect' };
          let settled = false;
          nestedBatch = subject
            .submitSyncBatch(domainBatch('nested-durable-refused'))
            .catch((error: unknown) => error)
            .then((value) => {
              settled = true;
              return value;
            });
          await new Promise<void>((done) => setImmediate(done));
          nestedBeforeOwner = settled;
          wrongTenant = await store
            .submitSyncBatch(
              { ...memoryScope, tenantId: GAP_TENANT_B },
              legacyBatch('nested-wrong-tenant'),
              GAP_AT,
            )
            .catch((error: unknown) => error);
          return { serverEntityId: 'safe-owner-effect' };
        },
      },
    });
    const result = await subject.submitSyncBatch(domainBatch('nested-owner'));
    expect(result.receipt.items[0]).toMatchObject({
      status: 'applied',
      stynx: { serverEntityId: 'safe-owner-effect' },
    });
    expect(nestedBeforeOwner).toBe(true);
    expect(await nestedBatch).toMatchObject({
      code: 'OFFLINE_SYNC:BATCH:in-progress',
      status: 503,
    });
    expect(wrongTenant).toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
    expect(
      (await store.listSyncQueueItems({ ...memoryScope, tenantId: GAP_TENANT_B }, {})).items,
    ).toEqual([]);
    const legacy = legacyBatch('recursive-resolution');
    await store.submitSyncBatch(memoryScope, legacy, GAP_AT);
    const conflict = await store.openConflict(
      memoryScope,
      legacy.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'recursive' },
      GAP_AT,
    );
    let nested!: Promise<unknown>,
      completedBeforeParent = false;
    await store.resolveWithPort(
      memoryScope,
      conflict.conflictId,
      { resolution: 'manual_review' },
      GAP_AT,
      {
        allowedActions: async () => ['manual_review'],
        resolve: async () => {
          nested = store
            .resolveWithPort(
              memoryScope,
              conflict.conflictId,
              { resolution: 'manual_review' },
              GAP_AT,
              {
                allowedActions: async () => ['manual_review'],
                resolve: async () => ({ ...conflict, status: 'resolved' }),
              },
            )
            .catch((error: unknown) => error)
            .then((value: unknown) => {
              completedBeforeParent = true;
              return value;
            });
          await new Promise<void>((done) => setImmediate(done));
          expect(completedBeforeParent).toBe(true);
          return { ...conflict, status: 'resolved' };
        },
      },
    );
    expect(await nested).toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_STATE',
      status: 409,
      message: 'A conflict cannot recursively resolve itself.',
    });
  });

  it('D4.1 refuses overlapping sibling resolutions of one queue and permits completed owned resolution reuse', async () => {
    const store = new InMemoryOfflineSyncStore();
    const shadow = legacyBatch('owned-queue-reuse');
    const entered = deferred(),
      release = deferred();
    let overlap: unknown,
      firstId = '',
      siblingId = '';
    const forbidden = vi.fn(async () => {
      throw new Error('overlapping sibling must not enter');
    });
    const subject = memoryService(store, {
      itemApplier: {
        apply: async () => {
          await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
          const first = await store.openConflict(
            memoryScope,
            shadow.items[0]!.queueItemId,
            { conflictType: 'domain', description: 'first queue conflict' },
            GAP_AT,
          );
          const sibling = await store.openConflict(
            memoryScope,
            shadow.items[0]!.queueItemId,
            { conflictType: 'domain', description: 'second queue conflict' },
            GAP_AT,
          );
          firstId = first.conflictId;
          siblingId = sibling.conflictId;
          const pending = store.resolveWithPort(
            memoryScope,
            firstId,
            { resolution: 'manual_review' },
            GAP_AT,
            {
              allowedActions: async () => ['manual_review'],
              resolve: async () => {
                entered.release();
                await release.promise;
                return { ...first, status: 'open' };
              },
            },
          );
          await entered.promise;
          try {
            overlap = await store
              .resolveWithPort(memoryScope, siblingId, { resolution: 'manual_review' }, GAP_AT, {
                allowedActions: async () => ['manual_review'],
                resolve: forbidden,
              })
              .catch((error: unknown) => error);
          } finally {
            release.release();
          }
          await pending;
          await store.resolveWithPort(
            memoryScope,
            firstId,
            { resolution: 'manual_review' },
            GAP_AT,
            {
              allowedActions: async () => ['manual_review'],
              resolve: async () => ({ ...first, status: 'resolved' }),
            },
          );
          return { serverEntityId: 'owned-queue-parent-committed' };
        },
      },
    });
    const result = await subject.submitSyncBatch(domainBatch('owned-queue-parent'));
    expect(result.receipt.items[0]).toMatchObject({
      status: 'applied',
      stynx: { serverEntityId: 'owned-queue-parent-committed' },
    });
    expect(overlap).toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_STATE',
      status: 409,
      message: 'A queue item cannot recursively resolve itself.',
    });
    expect(forbidden).not.toHaveBeenCalled();
    const actions = await store.listSyncConflictActions(memoryScope, { conflictId: firstId });
    expect(actions.items.map((action) => action.resultingStatus)).toEqual(['resolved', 'open']);
    expect(new Set(actions.items.map((action) => action.actionId)).size).toBe(2);
    expect(
      (await store.listSyncConflictActions(memoryScope, { conflictId: siblingId })).items,
    ).toEqual([]);
    expect(
      (await store.listSyncConflicts(memoryScope, { queueItemId: shadow.items[0]!.queueItemId }))
        .items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conflictId: firstId, status: 'resolved' }),
        expect.objectContaining({ conflictId: siblingId, status: 'open' }),
      ]),
    );
  });

  it('D4.1 refuses an owned callback waiting on another owner queue while preserving both independent histories', async () => {
    const store = new InMemoryOfflineSyncStore();
    const a = legacyBatch('cross-owner-a'),
      b = legacyBatch('cross-owner-b');
    await store.submitSyncBatch(memoryScope, a, GAP_AT);
    await store.submitSyncBatch(memoryScope, b, GAP_AT);
    const first = await store.openConflict(
      memoryScope,
      a.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'queue A' },
      GAP_AT,
    );
    const second = await store.openConflict(
      memoryScope,
      b.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'queue B' },
      GAP_AT,
    );
    const entered = deferred(),
      release = deferred();
    const pending = store.resolveWithPort(
      memoryScope,
      second.conflictId,
      { resolution: 'manual_review' },
      GAP_AT,
      {
        allowedActions: async () => ['manual_review'],
        resolve: async () => {
          entered.release();
          await release.promise;
          return { ...second, status: 'resolved' };
        },
      },
    );
    await entered.promise;
    let nested: unknown;
    const forbidden = vi.fn(async () => {
      throw new Error('foreign owner port must not enter');
    });
    try {
      const resolved = await store.resolveWithPort(
        memoryScope,
        first.conflictId,
        { resolution: 'manual_review' },
        GAP_AT,
        {
          allowedActions: async () => ['manual_review'],
          resolve: async () => {
            nested = await store
              .resolveWithPort(
                memoryScope,
                second.conflictId,
                { resolution: 'manual_review' },
                GAP_AT,
                { allowedActions: async () => ['manual_review'], resolve: forbidden },
              )
              .catch((error: unknown) => error);
            return { ...first, status: 'resolved' };
          },
        },
      );
      expect(resolved).toMatchObject({ conflictId: first.conflictId, status: 'resolved' });
    } finally {
      release.release();
    }
    expect(await pending).toMatchObject({ conflictId: second.conflictId, status: 'resolved' });
    expect(nested).toMatchObject({
      code: 'OFFLINE_SYNC_CONFLICT_STATE',
      status: 409,
      message: 'An owned callback cannot wait for another queue owner.',
    });
    expect(forbidden).not.toHaveBeenCalled();
    for (const conflict of [first, second])
      expect(
        (await store.listSyncConflictActions(memoryScope, { conflictId: conflict.conflictId }))
          .items,
      ).toEqual([
        expect.objectContaining({ conflictId: conflict.conflictId, resultingStatus: 'resolved' }),
      ]);
  });

  it('D4.1 rolls back an unfinished child started while admitting a numbering refusal without leaving orphan evidence', async () => {
    const store = new InMemoryOfflineSyncStore();
    const historical = legacyBatch('refusal-child-historical');
    await store.submitSyncBatch(memoryScope, historical, GAP_AT);
    const conflict = await store.openConflict(
      memoryScope,
      historical.items[0]!.queueItemId,
      { conflictType: 'domain', description: 'existing conflict before refusal' },
      GAP_AT,
    );
    const entered = deferred(),
      release = deferred();
    let child!: Promise<unknown>;
    const subject = memoryService(store, {
      itemApplier: { apply: async () => ({ serverEntityId: 'numbering-must-refuse-first' }) },
      conflictResolver: {
        allowedActions: async () => {
          child = store
            .resolveWithPort(
              memoryScope,
              conflict.conflictId,
              { resolution: 'manual_review' },
              GAP_AT,
              {
                allowedActions: async () => ['manual_review'],
                resolve: async () => ({ ...conflict, status: 'resolved' }),
              },
              {
                appendInTransaction: async () => {
                  entered.release();
                  await release.promise;
                },
                appendManyInTransaction: async () => undefined,
              },
            )
            .catch((error: unknown) => error);
          await entered.promise;
          return ['reject'];
        },
        resolve: async () => ({ ...conflict, status: 'resolved' }),
      },
    });
    const input = domainBatch('numbering-refusal-pending-child');
    try {
      await expect(
        subject.submitSyncBatch({ ...input, items: [{ ...input.items[0]!, reservedNumber: 999 }] }),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
    } finally {
      release.release();
    }
    expect(await child).toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', status: 409 });
    expect((await subject.listSyncQueueItems({ deviceId: input.deviceId })).items).toEqual([]);
    expect(
      (await subject.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId })).items,
    ).toEqual([]);
    await expect(subject.getSyncItemReceipt(input.items[0]!.idempotencyKey!)).rejects.toMatchObject(
      { code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND', status: 404 },
    );
    expect(
      (await subject.listSyncConflictActions({ conflictId: conflict.conflictId })).items,
    ).toEqual([]);
    expect(
      (await subject.listSyncConflicts({ queueItemId: historical.items[0]!.queueItemId })).items,
    ).toEqual([expect.objectContaining({ conflictId: conflict.conflictId, status: 'open' })]);
  });

  for (const phase of ['allowedActions', 'resolve', 'event'] as const)
    it(`D4.1 rolls back all nested effects of a directly failing ${phase} callback and preserves its exact refusal`, async () => {
      const store = new InMemoryOfflineSyncStore();
      const original = legacyBatch('direct-resolution-original');
      await store.submitSyncBatch(memoryScope, original, GAP_AT);
      const originalConflict = await store.openConflict(
        memoryScope,
        original.items[0]!.queueItemId,
        { conflictType: 'domain', description: 'original canonical conflict' },
        GAP_AT,
      );
      const shadow = legacyBatch('direct-resolution-shadow');
      const failure = new Error('actual direct resolution callback refusal');
      let shadowConflict = '';
      const effect = async () => {
        await store.submitSyncBatch(memoryScope, shadow, GAP_AT);
        const conflict = await store.openConflict(
          memoryScope,
          shadow.items[0]!.queueItemId,
          { conflictType: 'domain', description: 'nested shadow' },
          GAP_AT,
        );
        shadowConflict = conflict.conflictId;
        await store.resolveWithPort(
          memoryScope,
          shadowConflict,
          { resolution: 'manual_review' },
          GAP_AT,
          {
            allowedActions: async () => ['manual_review'],
            resolve: async () => ({ ...conflict, status: 'resolved' }),
          },
        );
        throw failure;
      };
      await expect(
        store.resolveWithPort(
          memoryScope,
          originalConflict.conflictId,
          { resolution: 'manual_review' },
          GAP_AT,
          {
            allowedActions: async () => {
              if (phase === 'allowedActions') await effect();
              return ['manual_review'];
            },
            resolve: async () => {
              if (phase === 'resolve') await effect();
              return { ...originalConflict, status: 'resolved' };
            },
          },
          {
            appendInTransaction: async () => {
              if (phase === 'event') await effect();
            },
            appendManyInTransaction: async () => undefined,
          },
        ),
      ).rejects.toBe(failure);
      expect(
        (await store.listSyncQueueItems(memoryScope, { deviceId: shadow.deviceId })).items,
      ).toEqual([]);
      expect(
        (await store.listSyncConflicts(memoryScope, { queueItemId: shadow.items[0]!.queueItemId }))
          .items,
      ).toEqual([]);
      expect(
        (await store.listSyncConflictActions(memoryScope, { conflictId: shadowConflict })).items,
      ).toEqual([]);
      expect(
        (
          await store.listSyncConflicts(memoryScope, {
            queueItemId: original.items[0]!.queueItemId,
          })
        ).items,
      ).toEqual([
        expect.objectContaining({ conflictId: originalConflict.conflictId, status: 'open' }),
      ]);
      const apply = vi.fn(async () => ({
        serverEntityId: 'direct-resolution-fresh-after-rollback',
      }));
      const result = await memoryService(store, { itemApplier: { apply } }).submitSyncBatch({
        ...shadow,
        deviceBatchId: 'direct-resolution-post-rollback',
      });
      expect(result.receipt.items[0]).toMatchObject({
        status: 'applied',
        stynx: { serverEntityId: 'direct-resolution-fresh-after-rollback' },
      });
      expect(apply).toHaveBeenCalledTimes(1);
    });
});
