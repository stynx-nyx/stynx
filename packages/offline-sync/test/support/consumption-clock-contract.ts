import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity.js';
import type { OfflineSyncService } from '../../src/offline-sync.service.js';
import type { OfflineSyncDurableStore } from '../../src/types.js';

export const CLOCK_TENANT_A = '00000000-0000-4000-8000-0000000000c8';
export const CLOCK_TENANT_B = '00000000-0000-4000-8000-0000000000d8';
export const CLOCK_ACTOR = 'clock-observer';
export const CLOCK_BEFORE = '2026-10-10T12:00:00.000Z';
const expiry = '2026-10-10T20:00:00.123456Z';
const scope = { tenantId: CLOCK_TENANT_A, actorId: CLOCK_ACTOR };
export interface ConsumptionClockHarness {
  store: OfflineSyncDurableStore;
  service(clock: () => string, tenantId?: string): OfflineSyncService;
  run<T>(tenantId: string, operation: () => Promise<T>): Promise<T>;
  snapshot(id: string): Promise<unknown>;
  effects(): unknown;
}
/** Same service/store behavior, independently hosted by memory and restricted-role PostgreSQL. */
export function registerConsumptionClockContracts(harness: () => ConsumptionClockHarness): void {
  const run = <T>(operation: () => Promise<T>, tenantId = CLOCK_TENANT_A) =>
    harness().run(tenantId, operation);
  const service = (clock = () => CLOCK_BEFORE, tenantId = CLOCK_TENANT_A) =>
    harness().service(clock, tenantId);
  const reserve = async (until = expiry, size = 3) =>
    run(async () => {
      const own = service();
      const range = await own.createNumberingRange({
        orgUnitId: 'clock-org',
        entityType: 'citation',
        series: randomUUID(),
        startNumber: 100,
        endNumber: 110,
      });
      return own.reserveDurableNumbering({
        orgUnitId: 'clock-org',
        entityType: 'citation',
        rangeId: range.id,
        deviceId: randomUUID(),
        shiftId: null,
        requestedSize: size,
        validUntil: until,
      });
    });
  const read = (id: string, at: string) => run(() => service(() => at).getNumberingConsumption(id));
  const vectors = [
    ['1', '099999', '100000', '100001'],
    ['12', '119999', '120000', '120001'],
    ['123', '122999', '123000', '123001'],
    ['1234', '123399', '123400', '123401'],
    ['12345', '123449', '123450', '123451'],
    ['123456', '123455', '123456', '123457'],
  ] as const;
  for (const [fraction, before, equal, after] of vectors) {
    it(`consumption read retains ${fraction.length}-digit precision at before/equal/after expiry`, async () => {
      const reservation = await reserve(`2026-10-10T20:00:00.${fraction}Z`);
      const original = await harness().snapshot(reservation.reservationId);
      expect(
        (await read(reservation.reservationId, `2026-10-10T20:00:00.${before}Z`)).consumption.map(
          (e) => e.status,
        ),
      ).toEqual(['available', 'available', 'available']);
      for (const instant of [equal, after]) {
        const result = await read(reservation.reservationId, `2026-10-10T20:00:00.${instant}Z`);
        expect(result.status).toBe('reserved');
        expect(result.consumption).toEqual(
          [100, 101, 102].map((number) => ({
            number,
            status: 'expired',
            serverEntityId: null,
            finalizedAt: null,
          })),
        );
      }
      expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
      expect(
        (await read(reservation.reservationId, `2026-10-10T20:00:00.${before}Z`)).consumption.map(
          (e) => e.status,
        ),
      ).toEqual(['available', 'available', 'available']);
    });
  }
  it('returns detached read entries without mutating stored consumption, reservation or range', async () => {
    const reservation = await reserve();
    const original = await harness().snapshot(reservation.reservationId);
    const result = await read(reservation.reservationId, CLOCK_BEFORE);
    Object.assign(result.consumption[0]!, {
      number: -9,
      status: 'applied',
      serverEntityId: 'forged',
      finalizedAt: expiry,
    });
    (result.consumption as unknown[]).pop();
    expect((await read(reservation.reservationId, CLOCK_BEFORE)).consumption).toEqual(
      [100, 101, 102].map((number) => ({
        number,
        status: 'available',
        serverEntityId: null,
        finalizedAt: null,
      })),
    );
    expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
  });
  it('captures the service observation clock once and propagates its exact thrown error', async () => {
    const reservation = await reserve();
    let calls = 0;
    const own = service(() => {
      calls++;
      return calls === 1 ? CLOCK_BEFORE : '2026-10-11T20:00:00Z';
    });
    expect(
      (await run(() => own.getNumberingConsumption(reservation.reservationId))).consumption.map(
        (e) => e.status,
      ),
    ).toEqual(['available', 'available', 'available']);
    expect(calls).toBe(1);
    const failure = new Error('clock boundary unavailable');
    const failed = service(() => {
      throw failure;
    });
    await expect(run(() => failed.getNumberingConsumption(reservation.reservationId))).rejects.toBe(
      failure,
    );
  });
  for (const value of [
    undefined,
    null,
    false,
    0,
    1n,
    {},
    [],
    Object(CLOCK_BEFORE),
    '',
    'not-an-instant',
    '2026-02-30T12:00:00Z',
    '2026-10-10T20:00:00.1234567Z',
    '2026-10-10T25:00:00Z',
    '2026-10-10T20:00:00+16:00',
  ]) {
    it(`refuses invalid service clock ${typeof value}:${String(value)} without fallback or writes`, async () => {
      const reservation = await reserve();
      const original = await harness().snapshot(reservation.reservationId);
      await expect(
        run(() =>
          service(() => value as string).getNumberingConsumption(reservation.reservationId),
        ),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', status: 400 });
      expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
    });
  }
  it('uses the normal wall clock for direct two-argument stores, while an explicit historical instant wins', async () => {
    const reservation = await reserve();
    const native = await run(() =>
      harness().store.getNumberingConsumption(scope, reservation.reservationId),
    );
    expect(native.consumption.map((e) => e.status)).toEqual(['expired', 'expired', 'expired']);
    expect(
      (
        await run(() =>
          harness().store.getNumberingConsumption(scope, reservation.reservationId, CLOCK_BEFORE),
        )
      ).consumption.map((e) => e.status),
    ).toEqual(['available', 'available', 'available']);
  });
  it('refuses invalid direct-store instants without coercion, fallback or persisted writes', async () => {
    const reservation = await reserve();
    const original = await harness().snapshot(reservation.reservationId);
    let coercions = 0;
    const coercible = {
      [Symbol.toPrimitive]: () => {
        coercions++;
        return CLOCK_BEFORE;
      },
    };
    for (const invalid of [
      null,
      false,
      0,
      1n,
      {},
      [],
      Object(CLOCK_BEFORE),
      coercible,
      '',
      'invalid',
      '2026-02-30T12:00:00Z',
      '2026-10-10T20:00:00.1234567Z',
    ]) {
      await expect(
        run(() =>
          harness().store.getNumberingConsumption(
            scope,
            reservation.reservationId,
            invalid as string,
          ),
        ),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', status: 400 });
    }
    expect(coercions).toBe(0);
    expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
  });
  it('retains claims and one reconciliation clock for both initial and final observations', async () => {
    const reservation = await reserve();
    let calls = 0;
    const own = service(() => {
      calls++;
      return calls === 1 ? CLOCK_BEFORE : '2026-10-11T20:00:00Z';
    });
    const result = await run(() =>
      own.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [100] }),
    );
    expect(calls).toBe(1);
    expect(result.consumption.map((e) => e.status)).toEqual([
      'claimed-locally',
      'available',
      'available',
    ]);
    const expired = await read(reservation.reservationId, expiry);
    expect(expired.consumption).toEqual([
      { number: 100, status: 'claimed-locally', serverEntityId: null, finalizedAt: null },
      ...[101, 102].map((number) => ({
        number,
        status: 'expired',
        serverEntityId: null,
        finalizedAt: null,
      })),
    ]);
  });
  it('preserves applied IDs/timestamps and claims after expiry without repeated effects or events', async () => {
    const reservation = await reserve();
    await run(() =>
      service().reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [101] }),
    );
    const id = randomUUID(),
      payload = { value: 7 };
    const submitted = await run(() =>
      service().submitSyncBatch({
        orgUnitId: 'clock-org',
        deviceId: reservation.deviceId,
        deviceBatchId: id,
        items: [
          {
            queueItemId: id,
            entityType: 'citation',
            localEntityId: id,
            idempotencyKey: id,
            payloadJson: payload,
            payloadHash: canonicalOfflineSyncPayloadHash(payload),
            createdLocallyAt: CLOCK_BEFORE,
            reservationId: reservation.reservationId,
            reservedNumber: 100,
          },
        ],
      }),
    );
    expect(submitted.receipt.items).toMatchObject([{ status: 'applied' }]);
    const original = await harness().snapshot(reservation.reservationId),
      effects = harness().effects();
    for (const instant of [expiry, '2026-10-11T20:00:00Z']) {
      const result = await read(reservation.reservationId, instant);
      expect(result.consumption).toEqual([
        {
          number: 100,
          status: 'applied',
          serverEntityId: 'clock-applied-server',
          finalizedAt: '2026-10-10T12:00:00.000Z',
        },
        { number: 101, status: 'claimed-locally', serverEntityId: null, finalizedAt: null },
        { number: 102, status: 'expired', serverEntityId: null, finalizedAt: null },
      ]);
    }
    expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
    expect(harness().effects()).toEqual(effects);
  });
  it('preserves applied operation microseconds across one to six meaningful fractional digits', async () => {
    const observations: Array<{
      supplied: string;
      finalizedAt: string | null;
      actualMicroseconds: string | null;
      expectedMicroseconds: string;
      raw: unknown;
    }> = [];
    for (const [fraction, microseconds] of [
      ['1', '100000'],
      ['12', '120000'],
      ['123', '123000'],
      ['1234', '123400'],
      ['12345', '123450'],
      ['123456', '123456'],
    ] as const) {
      const reservation = await reserve();
      const supplied = `2026-10-10T12:00:00.${fraction}Z`;
      const id = randomUUID(),
        payload = { value: 7 };
      const submitted = await run(() =>
        service(() => supplied).submitSyncBatch({
          orgUnitId: 'clock-org',
          deviceId: reservation.deviceId,
          deviceBatchId: id,
          items: [
            {
              queueItemId: id,
              entityType: 'citation',
              localEntityId: id,
              idempotencyKey: id,
              payloadJson: payload,
              payloadHash: canonicalOfflineSyncPayloadHash(payload),
              createdLocallyAt: CLOCK_BEFORE,
              reservationId: reservation.reservationId,
              reservedNumber: 100,
            },
          ],
        }),
      );
      expect(submitted.receipt.items).toMatchObject([{ status: 'applied' }]);
      const entry = (await read(reservation.reservationId, expiry)).consumption[0]!;
      expect(entry).toMatchObject({
        number: 100,
        status: 'applied',
        serverEntityId: 'clock-applied-server',
      });
      // Compare exact fractional value while retaining each public spelling.
      // One/two-digit UTC values may have the existing three-digit ISO spelling;
      // padding cannot rescue a lost fourth, fifth or sixth fractional digit.
      const match = /^2026-10-10T12:00:00\.(\d{1,6})Z$/u.exec(entry.finalizedAt ?? '');
      observations.push({
        supplied,
        finalizedAt: entry.finalizedAt,
        actualMicroseconds: match?.[1]?.padEnd(6, '0') ?? null,
        expectedMicroseconds: microseconds,
        raw: await harness().snapshot(reservation.reservationId),
      });
    }
    console.info('consumption finalizedAt microsecond observations', JSON.stringify(observations));
    expect(observations.map(({ actualMicroseconds }) => actualMicroseconds)).toEqual(
      observations.map(({ expectedMicroseconds }) => expectedMicroseconds),
    );
  });
  for (const state of ['blocked', 'consumed', 'cancelled'] as const) {
    it(`retains ${state} reservation precedence without changing persisted state during reads`, async () => {
      const reservation = await reserve();
      await run(() =>
        state === 'blocked'
          ? service().blockNumberingReservation(reservation.reservationId)
          : state === 'consumed'
            ? service().closeNumberingReservation(reservation.reservationId)
            : service().cancelDurableNumberingReservation(reservation.reservationId),
      );
      const original = await harness().snapshot(reservation.reservationId);
      for (const at of [CLOCK_BEFORE, expiry]) {
        const result = await read(reservation.reservationId, at);
        expect(result.status).toBe(state);
        expect(result.consumption.map((e) => e.status)).toEqual(
          Array(3).fill(state === 'blocked' ? 'blocked' : 'expired'),
        );
      }
      expect(await harness().snapshot(reservation.reservationId)).toEqual(original);
    });
  }
  it('keeps foreign-tenant and missing reservations as404', async () => {
    const reservation = await reserve();
    await expect(
      run(
        () =>
          service(() => CLOCK_BEFORE, CLOCK_TENANT_B).getNumberingConsumption(
            reservation.reservationId,
          ),
        CLOCK_TENANT_B,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(read(randomUUID(), CLOCK_BEFORE)).rejects.toMatchObject({
      status: 404,
      code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
    });
  });
}
