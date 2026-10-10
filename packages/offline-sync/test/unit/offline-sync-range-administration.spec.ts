import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import {
  registerRangeAdministrationContracts,
  RANGE_TENANT_A,
  RANGE_AT,
  rangeInput,
} from '../support/range-administration-contract';

describe('UPS-OFS-09 memory range administration', () => {
  const store = new InMemoryOfflineSyncStore();
  registerRangeAdministrationContracts(() => ({
    service: (tenantId = RANGE_TENANT_A, actorId = 'audit-actor', now = RANGE_AT) =>
      new OfflineSyncService(
        store,
        { current: () => ({ tenantId, actorId }) },
        {
          now: () => now,
          policyResolver: { resolve: async () => ({ reservationTtlMs: 86400000 }) },
          agentResolver: { resolve: async () => 'distinct-business-agent' },
        },
      ),
    run: async (_tenantId, _actorId, operation) => operation(),
  }));

  it('does not invent provenance for historical in-memory seeds', async () => {
    const seeded = {
      id: '10000000-0000-4000-8000-0000000000a5',
      tenantId: RANGE_TENANT_A,
      orgUnitId: 'old',
      entityType: 'citation',
      series: 'legacy',
      startNumber: 1,
      endNumber: 5,
      nextNumber: 1,
      status: 'active' as const,
    };
    store.seedNumberingRange(seeded);
    const service = new OfflineSyncService(store, {
      current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
    });
    expect(await service.getNumberingRange(seeded.id)).toEqual(seeded);
    expect(await service.getNumberingRange(seeded.id)).not.toHaveProperty('createdAt');
    expect(await service.getNumberingRange(seeded.id)).not.toHaveProperty('createdBy');
  });

  it.each([
    'createNumberingRange',
    'getNumberingRange',
    'listNumberingRanges',
    'cancelNumberingRange',
  ] as const)('refuses absent custom-store %s before calling legacy APIs', async (method) => {
    const legacy = { reserveNumbering: vi.fn() };
    const service = new OfflineSyncService(legacy as never, {
      current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
    });
    const call =
      method === 'createNumberingRange'
        ? () => service.createNumberingRange(rangeInput('custom'))
        : method === 'getNumberingRange'
          ? () => service.getNumberingRange('10000000-0000-4000-8000-0000000000a5')
          : method === 'listNumberingRanges'
            ? () => service.listNumberingRanges()
            : () => service.cancelNumberingRange('10000000-0000-4000-8000-0000000000a5', {});
    await expect(call()).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(legacy.reserveNumbering).not.toHaveBeenCalled();
  });

  it.each([
    { startNumber: 1.5 },
    { startNumber: NaN },
    { startNumber: Infinity },
    { startNumber: Number.MAX_SAFE_INTEGER + 1 },
    { startNumber: 11, endNumber: 10 },
    { endNumber: Number.MAX_SAFE_INTEGER },
    { endNumber: '20' },
    { orgUnitId: '' },
    { orgUnitId: 'é'.repeat(128) },
    { entityType: 'é'.repeat(51) },
    { series: 'é'.repeat(41) },
    { series: '\0' },
    { idempotencyKey: '' },
    { idempotencyKey: 'é'.repeat(128) },
    { consumerAttributes: [] },
    { consumerAttributes: null },
    ...[
      'id',
      'tenantId',
      'actorId',
      'agentId',
      'nextNumber',
      'status',
      'createdBy',
      'createdAt',
      'updatedAt',
      'cancelledBy',
      'cancelledAt',
      'cancellationReason',
    ].map((field) => ({ [field]: 'forged' })),
  ])(
    'refuses malformed creation or owned-field override before a store write: %j',
    async (invalid) => {
      const create = vi.fn();
      const service = new OfflineSyncService({ createNumberingRange: create } as never, {
        current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
      });
      await expect(
        service.createNumberingRange({ ...rangeInput('invalid'), ...invalid } as never),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { limit: null },
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { cursor: 'not-uuid' },
    { status: 'reserved' },
    { series: '' },
    { tenantId: 'forged' },
    { nextNumber: 1 },
  ])('refuses invalid filters/cursors before a store read: %j', async (invalid) => {
    const list = vi.fn();
    const service = new OfflineSyncService({ listNumberingRanges: list } as never, {
      current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
    });
    await expect(service.listNumberingRanges(invalid as never)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_INVALID_INPUT',
    });
    expect(list).not.toHaveBeenCalled();
  });

  it.each(['', ' \t\n', '\u00a0\u2003', 'é'.repeat(251), '\0', '\ud800', 42])(
    'refuses invalid cancellation reason before a store write: %j',
    async (reason) => {
      const cancel = vi.fn();
      const service = new OfflineSyncService({ cancelNumberingRange: cancel } as never, {
        current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
      });
      await expect(
        service.cancelNumberingRange('10000000-0000-4000-8000-0000000000a5', { reason } as never),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it('rejects accessors, hidden keys, symbols, nonplain inputs and nonJSON attributes without evaluating caller getters', async () => {
    const create = vi.fn();
    const service = new OfflineSyncService({ createNumberingRange: create } as never, {
      current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }),
    });
    const getter = vi.fn(() => 'unexpected');
    const accessor = { ...rangeInput('accessor') };
    Object.defineProperty(accessor, 'series', { enumerable: true, get: getter });
    const hidden = { ...rangeInput('hidden') };
    Object.defineProperty(hidden, 'extra', { value: 'hidden', enumerable: false });
    const symbol = { ...rangeInput('symbol'), [Symbol('extra')]: true };
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const badAttributes = [{ value: undefined }, { value: NaN }, { value: new Date() }, cycle];
    for (const input of [
      null,
      [],
      new Date(),
      accessor,
      hidden,
      symbol,
      ...badAttributes.map((consumerAttributes) => ({ ...rangeInput('json'), consumerAttributes })),
    ])
      await expect(service.createNumberingRange(input as never)).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_INVALID_INPUT',
      });
    expect(getter).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes valid uppercase UUIDs and refuses malformed identities/cancel overrides before custom-store calls', async () => {
    const get = vi.fn(async () => null);
    const cancel = vi.fn();
    const service = new OfflineSyncService(
      { getNumberingRange: get, cancelNumberingRange: cancel } as never,
      { current: () => ({ tenantId: RANGE_TENANT_A, actorId: 'actor' }) },
    );
    await expect(
      service.getNumberingRange('10000000-0000-4000-8000-0000000000A5'),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
    expect(get).toHaveBeenCalledExactlyOnceWith(
      { tenantId: RANGE_TENANT_A, actorId: 'actor' },
      '10000000-0000-4000-8000-0000000000a5',
    );
    for (const id of ['', 'not-uuid', null, 42]) {
      await expect(service.getNumberingRange(id as never)).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_INVALID_INPUT',
      });
      await expect(service.cancelNumberingRange(id as never)).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_INVALID_INPUT',
      });
    }
    for (const input of [null, [], { tenantId: 'forged' }, { status: 'active' }, { nextNumber: 1 }])
      await expect(
        service.cancelNumberingRange('10000000-0000-4000-8000-0000000000a5', input as never),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect(cancel).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
  });
});
