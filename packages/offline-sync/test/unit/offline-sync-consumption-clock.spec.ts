import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import type { OfflineSyncDurableStore } from '../../src/types';
import {
  CLOCK_TENANT_A,
  CLOCK_ACTOR,
  CLOCK_BEFORE,
  registerConsumptionClockContracts,
} from '../support/consumption-clock-contract';

describe('UPS-OFS-01 memory consumption operation clock', () => {
  let store: InMemoryOfflineSyncStore;
  const effects: string[] = [];
  beforeEach(() => {
    store = new InMemoryOfflineSyncStore();
    effects.length = 0;
  });
  registerConsumptionClockContracts(() => ({
    store,
    effects: () => [...effects],
    service: (now, tenantId = CLOCK_TENANT_A) =>
      new OfflineSyncService(
        store,
        { current: () => ({ tenantId, actorId: CLOCK_ACTOR }) },
        {
          now,
          itemApplier: {
            apply: async () => {
              effects.push('apply');
              return { serverEntityId: 'clock-applied-server' };
            },
          },
          eventPort: {
            appendInTransaction: async () => {
              effects.push('event');
            },
            appendManyInTransaction: async () => {
              effects.push('events');
            },
          },
          policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) },
        },
      ),
    run: async (_tenantId, operation) => operation(),
    snapshot: async (id) => ({
      consumption: await store.getNumberingConsumption(
        { tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR },
        id,
        CLOCK_BEFORE,
      ),
      ranges: await store.listNumberingRanges(
        { tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR },
        {},
      ),
    }),
  }));
});

describe('UPS-OFS-01 consumption clock validates before dispatch to custom stores', () => {
  for (const value of [
    undefined,
    null,
    0,
    false,
    {},
    [],
    Object(CLOCK_BEFORE),
    'not-an-instant',
    '2026-02-30T12:00:00Z',
  ]) {
    it(`does not dispatch a ${typeof value} invalid clock to a custom port`, async () => {
      let calls = 0;
      // Explicit custom-store unit port: proves service validation independently
      // of the shipped stores, which also validate their optional direct argument.
      const port = {
        getNumberingConsumption: async () => {
          calls++;
          return { reservationId: 'custom-id', status: 'reserved', consumption: [] };
        },
      } as unknown as OfflineSyncDurableStore;
      const service = new OfflineSyncService(
        port,
        { current: () => ({ tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR }) },
        { now: () => value as string },
      );
      await expect(service.getNumberingConsumption('custom-id')).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_INVALID_INPUT',
        status: 400,
      });
      expect(calls).toBe(0);
    });
  }
  it('forwards the exact microsecond string once and preserves an asynchronous custom-port response', async () => {
    let clocks = 0;
    const received: unknown[][] = [];
    const response = { reservationId: 'custom-id', status: 'reserved' as const, consumption: [] };
    const instant = '2026-10-10T20:00:00.123456Z';
    const port = {
      getNumberingConsumption: async (...args: unknown[]) => {
        received.push(args);
        await Promise.resolve();
        return response;
      },
    } as unknown as OfflineSyncDurableStore;
    const service = new OfflineSyncService(
      port,
      { current: () => ({ tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR }) },
      {
        now: () => {
          clocks++;
          return instant;
        },
      },
    );
    expect(await service.getNumberingConsumption('custom-id')).toBe(response);
    expect(received).toEqual([
      [{ tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR }, 'custom-id', instant],
    ]);
    expect(clocks).toBe(1);
  });
  it('propagates the exact clock throw without calling a custom store', async () => {
    let calls = 0;
    const failure = new Error('clock unavailable');
    const port = {
      getNumberingConsumption: async () => {
        calls++;
        return null;
      },
    } as unknown as OfflineSyncDurableStore;
    const service = new OfflineSyncService(
      port,
      { current: () => ({ tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR }) },
      {
        now: () => {
          throw failure;
        },
      },
    );
    await expect(service.getNumberingConsumption('custom-id')).rejects.toBe(failure);
    expect(calls).toBe(0);
  });
});
