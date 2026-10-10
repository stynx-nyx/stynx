import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { CTG9OfflineSyncController } from '../../src/ctg9-offline-sync.controller';
import { OfflineSyncController } from '../../src/offline-sync.controller';
import {
  activeReservationError,
  legacyReservation,
  reservationShiftScope,
} from '../../src/reservation-admission';
import { OFFLINE_SYNC_NO_SHIFT } from '../../src/numbering';
import type { CTG9ReserveNumberingInput, CTG9NumberingReservation } from '../../src/types';

const tenantId = '00000000-0000-4000-8000-0000000000d4';
const scope = { tenantId, actorId: 'actor-a' };
const now = '2026-10-10T12:00:00.000Z';
const later = '2026-10-11T12:00:00.000Z';
const body = (overrides: Partial<CTG9ReserveNumberingInput> = {}): CTG9ReserveNumberingInput => ({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  shiftId: null,
  entityType: 'citation',
  requestedSize: 2,
  ...overrides,
});
function fixture() {
  const store = new InMemoryOfflineSyncStore();
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-0000000000d4',
    tenantId,
    orgUnitId: 'org-a',
    entityType: 'citation',
    series: 'A',
    startNumber: 1,
    endNumber: 100,
    nextNumber: 1,
    status: 'active',
  });
  const policy = vi.fn(async () => ({ reservationTtlMs: 86_400_000 }));
  const service = new OfflineSyncService(
    store,
    { current: () => scope },
    { now: () => now, policyResolver: { resolve: policy } },
  );
  return { store, service, policy };
}

describe('UPS-OFS-09 nullable durable reservation admission', () => {
  it('normalizes only the active scope and preserves exact nullable/string legacy projection boundaries', () => {
    expect(reservationShiftScope(null)).toBe(null);
    expect(reservationShiftScope(OFFLINE_SYNC_NO_SHIFT)).toBe(null);
    expect(reservationShiftScope('real-shift')).toBe('real-shift');
    const original = { shiftId: 'real-shift', status: 'reserved' } as CTG9NumberingReservation;
    expect(legacyReservation(original)).toEqual(original);
    expect(legacyReservation(original)).not.toBe(original);
    expect(() => legacyReservation({ ...original, shiftId: null })).toThrowError(
      expect.objectContaining({ code: 'OFFLINE_SYNC_RESERVATION_STATE' }),
    );
    expect(() => legacyReservation({ ...original, status: 'blocked' })).toThrowError(
      expect.objectContaining({ code: 'OFFLINE_SYNC_RESERVATION_STATE' }),
    );
    expect(activeReservationError().getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
      message: 'An active numbering reservation already exists for this device and shift.',
      retryable: false,
    });
    expect(original).toEqual({ shiftId: 'real-shift', status: 'reserved' });
  });

  it('replays exact nullable evidence before policy evaluation, while sentinel reuse under the same key conflicts', async () => {
    const { service, policy, store } = fixture();
    const request = body({ idempotencyKey: 'null-key' });
    const first = await service.reserveDurableNumbering(request);
    expect(first).toMatchObject({
      shiftId: null,
      startNumber: 1,
      endNumber: 2,
      agentId: scope.actorId,
    });
    policy.mockRejectedValue(new Error('policy must not run on replay'));
    expect(await service.reserveDurableNumbering(request)).toEqual(first);
    expect(policy).toHaveBeenCalledOnce();
    await expect(
      service.reserveDurableNumbering({ ...request, shiftId: OFFLINE_SYNC_NO_SHIFT }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT' });
    await expect(
      store.reserveDurableNumbering(scope, body({ shiftId: OFFLINE_SYNC_NO_SHIFT }), now, later),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_ACTIVE_RESERVATION' });
    expect(
      (await store.reserveDurableNumbering(scope, body({ deviceId: 'capacity-check' }), now, later))
        .startNumber,
    ).toBe(3);
  });

  it('allows historical E6 multiples but refuses both mixed-origin orders without consuming range capacity', async () => {
    const { store } = fixture();
    const legacy = { ...body(), shiftId: OFFLINE_SYNC_NO_SHIFT };
    const first = await store.reserveNumbering(scope, legacy, now, later);
    const second = await store.reserveNumbering(scope, legacy, now, later);
    expect([first.shiftId, second.shiftId]).toEqual([OFFLINE_SYNC_NO_SHIFT, OFFLINE_SYNC_NO_SHIFT]);
    await expect(store.reserveDurableNumbering(scope, body(), now, later)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
    });
    const other = fixture();
    await other.store.reserveDurableNumbering(scope, body(), now, later);
    await expect(other.store.reserveNumbering(scope, legacy, now, later)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
    });
    expect(
      (await store.reserveDurableNumbering(scope, body({ deviceId: 'capacity-check' }), now, later))
        .startNumber,
    ).toBe(5);
    expect(
      (
        await other.store.reserveDurableNumbering(
          scope,
          body({ deviceId: 'capacity-check' }),
          now,
          later,
        )
      ).startNumber,
    ).toBe(3);
  });

  it('serializes simultaneous durable allocation and keeps cancellation tenant-scoped and idempotent', async () => {
    const { service, store } = fixture();
    const results = await Promise.allSettled([
      service.reserveDurableNumbering(body()),
      service.reserveDurableNumbering(body()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: 'OFFLINE_SYNC_ACTIVE_RESERVATION' }),
      }),
    ]);
    const first = results.find((r) => r.status === 'fulfilled')!;
    if (first.status !== 'fulfilled') throw new Error('missing allocation');
    await expect(
      store.cancelDurableNumberingReservation(
        { ...scope, tenantId: 'other' },
        first.value.reservationId,
        {},
        now,
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    const cancelled = await service.cancelDurableNumberingReservation(first.value.reservationId, {
      reason: 'operator release',
    });
    expect(cancelled).toMatchObject({ shiftId: null, status: 'cancelled' });
    expect(await service.cancelDurableNumberingReservation(first.value.reservationId)).toEqual(
      cancelled,
    );
    expect((await service.reserveDurableNumbering(body())).startNumber).toBe(1);
  });

  it('refuses legacy cancellation before changing nullable or blocked reservations and their consumption', async () => {
    const { service, store } = fixture();
    const value = await service.reserveDurableNumbering(body());
    const before = await store.getNumberingConsumption(scope, value.reservationId);
    await expect(
      store.cancelNumberingReservation(scope, value.reservationId, {}, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect(await store.getNumberingConsumption(scope, value.reservationId)).toEqual(before);
    const blocked = await store.blockNumberingReservation(scope, value.reservationId, {}, now);
    expect(blocked).toMatchObject({ status: 'blocked' });
    await expect(
      store.cancelNumberingReservation(scope, value.reservationId, {}, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect(await store.getNumberingConsumption(scope, value.reservationId)).toEqual({
      ...before,
      status: 'blocked',
      consumption: before.consumption.map((entry) => ({ ...entry, status: 'blocked' })),
    });
  });

  it('refuses expired-to-blocked reactivation when another live reservation owns the scope', async () => {
    const { store } = fixture();
    const old = await store.reserveDurableNumbering(scope, body(), now, later);
    // A persisted expired projection may retain its original future validity timestamp.
    const state = store as unknown as { reservations: Map<string, CTG9NumberingReservation> };
    state.reservations.set(`${tenantId}:${old.reservationId}`, { ...old, status: 'expired' });
    const live = await store.reserveDurableNumbering(scope, body(), now, later);
    const before = await store.getNumberingConsumption(scope, old.reservationId);
    await expect(
      store.blockNumberingReservation(scope, old.reservationId, {}, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_ACTIVE_RESERVATION' });
    expect(await store.getNumberingConsumption(scope, old.reservationId)).toEqual(before);
    expect((await store.getNumberingConsumption(scope, live.reservationId)).status).toBe(
      'reserved',
    );
  });

  it.each([
    { shiftId: undefined },
    { shiftId: '' },
    { shiftId: 'stynx:reserved' },
    { shiftId: '\ud800' },
    { deviceId: 'x'.repeat(256) },
    { orgUnitId: '\0' },
    { entityType: '' },
    { series: 'é'.repeat(41) },
    { rangeId: 'not-a-uuid' },
    { idempotencyKey: '' },
    { requestedSize: 0 },
    { requestedSize: 101 },
    { requestedSize: 1.5 },
    { validUntil: now },
  ])('refuses malformed durable input without allocation: %j', async (invalid) => {
    const { service, store } = fixture();
    const reserve = vi.spyOn(store, 'reserveDurableNumbering');
    await expect(service.reserveDurableNumbering(body(invalid as never))).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_INVALID_INPUT',
    });
    expect(reserve).not.toHaveBeenCalled();
    reserve.mockRestore();
    expect((await store.reserveDurableNumbering(scope, body(), now, later)).startNumber).toBe(1);
  });

  it('fails closed when custom stores omit a durable port while retaining legacy methods', async () => {
    const f = fixture();
    const reserve = vi.spyOn(f.store, 'reserveDurableNumbering');
    Object.defineProperty(f.store, 'replayDurableNumberingReservation', { value: undefined });
    await expect(
      f.service.reserveDurableNumbering(body({ idempotencyKey: 'key' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(reserve).not.toHaveBeenCalled();
    Object.defineProperty(f.store, 'reserveDurableNumbering', { value: undefined });
    await expect(f.service.reserveDurableNumbering(body())).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
    Object.defineProperty(f.store, 'cancelDurableNumberingReservation', { value: undefined });
    await expect(f.service.cancelDurableNumberingReservation('id')).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
    expect(typeof f.store.reserveNumbering).toBe('function');
  });

  it('requires durable policy, a finite clock and a strictly future finite TTL before allocation', async () => {
    const f = fixture();
    const reserve = vi.spyOn(f.store, 'reserveDurableNumbering');
    const make = (options: ConstructorParameters<typeof OfflineSyncService>[2]) =>
      new OfflineSyncService(f.store, { current: () => scope }, options);
    await expect(make({}).reserveDurableNumbering(body())).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
    await expect(
      make({ now: () => 'invalid', policyResolver: { resolve: f.policy } }).reserveDurableNumbering(
        body(),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    for (const reservationTtlMs of [undefined, 0, -1, Infinity, 8.64e15])
      await expect(
        make({
          now: () => now,
          policyResolver: { resolve: async () => ({ reservationTtlMs }) },
        }).reserveDurableNumbering(body()),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      f.service.reserveDurableNumbering(body({ validUntil: 'invalid' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      f.service.cancelDurableNumberingReservation('id', { reason: 'é'.repeat(251) }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect(reserve).not.toHaveBeenCalled();
    Object.defineProperty(f.store, 'getSyncIntegrityRejection', { value: undefined });
    await expect(
      f.service.getSyncIntegrityRejection({ deviceId: 'd', deviceBatchId: 'b', queueItemId: 'q' }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    await expect(
      f.store.reserveNumbering(scope, body() as never, now, later),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('exposes a nonallocating trusted replay seam and rejects missing custom replay/configuration or malformed identity', async () => {
    const f = fixture();
    const value = await f.service.reserveNumbering({
      ...body({ idempotencyKey: 'historical-replay' }),
      shiftId: OFFLINE_SYNC_NO_SHIFT,
    });
    const reserve = vi.spyOn(f.store, 'reserveDurableNumbering');
    f.policy.mockRejectedValue(new Error('no policy resolution during replay'));
    expect(
      await f.service.replayDurableNumberingReservation(
        body({ idempotencyKey: 'historical-replay', shiftId: OFFLINE_SYNC_NO_SHIFT }),
      ),
    ).toEqual(value);
    expect(
      await f.service.replayDurableNumberingReservation(body({ idempotencyKey: 'absent' })),
    ).toBe(null);
    expect(await f.service.replayDurableNumberingReservation(body())).toBe(null);
    expect(reserve).not.toHaveBeenCalled();
    expect(f.policy).toHaveBeenCalledOnce();
    await expect(
      f.service.replayDurableNumberingReservation(body({ deviceId: '' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    const noPolicy = new OfflineSyncService(f.store, { current: () => scope }, {});
    await expect(noPolicy.replayDurableNumberingReservation(body())).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
    Object.defineProperty(f.store, 'replayDurableNumberingReservation', { value: undefined });
    await expect(f.service.replayDurableNumberingReservation(body())).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
  });

  it.each([42, '\0', '\ud800', 'é'.repeat(251)])(
    'rejects invalid cancellation reason before calling a custom store: %j',
    async (reason) => {
      const f = fixture();
      const cancel = vi.spyOn(f.store, 'cancelDurableNumberingReservation');
      await expect(
        f.service.cancelDurableNumberingReservation('id', { reason } as never),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it('routes CTG9 reservation operations to durable seams and preserves the E6 controller route', async () => {
    const f = fixture();
    const reserve = vi.spyOn(f.service, 'reserveDurableNumbering');
    const cancel = vi.spyOn(f.service, 'cancelDurableNumberingReservation');
    const oldReserve = vi.spyOn(f.service, 'reserveNumbering');
    const durable = new CTG9OfflineSyncController(f.service);
    const value = await durable.reserveNumbering(body());
    await durable.cancelNumbering(value.reservationId, {});
    expect(reserve).toHaveBeenCalledWith(body());
    expect(cancel).toHaveBeenCalledWith(value.reservationId, {});
    expect(oldReserve).not.toHaveBeenCalled();
    const legacy = new OfflineSyncController(f.service);
    await legacy.reserveNumbering({ ...body(), shiftId: 'legacy-shift' });
    expect(oldReserve).toHaveBeenCalledOnce();
    await expect(
      Promise.resolve().then(() =>
        durable.reserveNumbering({ ...body(), tenantId: 'forged' } as never),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONTEXT_OVERRIDE' });
    expect(reserve).toHaveBeenCalledOnce();
  });
});
