import { describe, expect, it, vi } from 'vitest';
import { OfflineSyncConfigurationError } from '../../src/errors';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { GAP_AT, GAP_TENANT_A } from '../support/offline-sync-acceptance-gaps';

import {
  registerDomainOutcomeContracts,
  domainBatch,
  domainFailure,
  domainEvents,
} from '../support/offline-domain-outcomes';

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
    expect(
      (await subject.listSyncBatchReceipts({ deviceId: input.deviceId })).items[0],
    ).toMatchObject({ status: 'open', responseStatus: null });
    fault.mockRestore();
    expect((await subject.submitSyncBatch(input)).receipt.status).toBe('closed');
    expect(
      (await subject.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId })).items,
    ).toHaveLength(1);
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
});
