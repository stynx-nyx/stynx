import { expect, it } from 'vitest';
import type { OfflineSyncService } from '../../src/offline-sync.service.js';
import type { CreateNumberingRangeInput } from '../../src/types.js';

export const RANGE_TENANT_A = '00000000-0000-4000-8000-0000000000a5';
export const RANGE_TENANT_B = '00000000-0000-4000-8000-0000000000b5';
export const RANGE_AT = '2026-10-10T12:00:00.000Z';
export const rangeInput = (
  series: string,
  overrides: Partial<CreateNumberingRangeInput> = {},
): CreateNumberingRangeInput => ({
  orgUnitId: 'org-a',
  entityType: 'citation',
  series,
  startNumber: 10,
  endNumber: 99,
  ...overrides,
});
interface RangeHarness {
  service(tenantId?: string, actorId?: string, now?: string): OfflineSyncService;
  run<T>(tenantId: string, actorId: string, operation: () => Promise<T>): Promise<T>;
}
/** Public behavioral parity, exercised independently through memory and real restricted-role PG. */
export function registerRangeAdministrationContracts(harness: () => RangeHarness): void {
  const call = <T>(
    operation: (service: OfflineSyncService) => Promise<T>,
    tenantId = RANGE_TENANT_A,
    actorId = 'audit-actor',
    now = RANGE_AT,
  ) => {
    const h = harness();
    return h.run(tenantId, actorId, () => operation(h.service(tenantId, actorId, now)));
  };

  it('creates a server-owned active range with exact opaque attributes and actual audit provenance', async () => {
    const attributes = { nested: { legal: ['ação', 1, null] }, empty: {} };
    const body = rangeInput('provenance', { consumerAttributes: attributes });
    const created = await call((service) => service.createNumberingRange(body));
    expect(created).toEqual({
      ...body,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      tenantId: RANGE_TENANT_A,
      nextNumber: 10,
      status: 'active',
      createdBy: 'audit-actor',
      createdAt: RANGE_AT,
    });
    expect(created.consumerAttributes).toEqual(attributes);
    expect(await call((service) => service.getNumberingRange(created.id))).toEqual(created);
    expect(body.consumerAttributes).toEqual(attributes);
  });

  it('returns the immutable initial creation snapshot after allocation and cancellation, excluding replay actor/time from its fingerprint', async () => {
    const body = rangeInput('snapshot', {
      idempotencyKey: 'snapshot-operation',
      consumerAttributes: { b: 2, a: 1 },
    });
    const initial = await call((service) => service.createNumberingRange(body));
    const reservation = await call((service) =>
      service.reserveDurableNumbering({
        orgUnitId: body.orgUnitId,
        entityType: body.entityType,
        rangeId: initial.id,
        deviceId: 'snapshot-device',
        shiftId: null,
        requestedSize: 3,
      }),
    );
    expect(reservation.startNumber).toBe(10);
    const allocated = await call((service) => service.getNumberingRange(initial.id));
    expect(allocated).toMatchObject({ nextNumber: 13, status: 'active' });
    const cancelled = await call(
      (service) => service.cancelNumberingRange(initial.id, { reason: 'final cancellation' }),
      RANGE_TENANT_A,
      'first-canceller',
      '2026-10-10T12:10:00.000Z',
    );
    expect(cancelled).toMatchObject({
      nextNumber: 13,
      status: 'cancelled',
      cancelledBy: 'first-canceller',
      cancellationReason: 'final cancellation',
      cancelledAt: '2026-10-10T12:10:00.000Z',
    });
    expect(
      await call(
        (service) => service.createNumberingRange({ ...body, consumerAttributes: { a: 1, b: 2 } }),
        RANGE_TENANT_A,
        'replay-actor',
        '2026-10-11T12:00:00.000Z',
      ),
    ).toEqual(initial);
    expect(await call((service) => service.getNumberingRange(initial.id))).toEqual(cancelled);
    expect(
      await call(
        (service) => service.cancelNumberingRange(initial.id, { reason: 'must not overwrite' }),
        RANGE_TENANT_A,
        'later-canceller',
        '2026-10-12T12:00:00.000Z',
      ),
    ).toEqual(cancelled);
    const consumption = await call((service) =>
      service.getNumberingConsumption(reservation.reservationId),
    );
    expect(consumption.consumption).toMatchObject([
      { number: 10, status: 'available' },
      { number: 11, status: 'available' },
      { number: 12, status: 'available' },
    ]);
    await expect(
      call((service) =>
        service.reserveDurableNumbering({
          orgUnitId: body.orgUnitId,
          entityType: body.entityType,
          rangeId: initial.id,
          deviceId: 'after-cancel',
          shiftId: null,
          requestedSize: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE', reason: 'inactive' });
  });

  it('distinguishes absent attributes from empty attributes and conflicting operation content without allocating', async () => {
    const body = rangeInput('absence', { idempotencyKey: 'absence-operation' });
    const created = await call((service) => service.createNumberingRange(body));
    expect(created).not.toHaveProperty('consumerAttributes');
    for (const changed of [
      { consumerAttributes: {} },
      { startNumber: 9 },
      { endNumber: 100 },
      { series: 'different-series' },
      { orgUnitId: 'different-org' },
      { entityType: 'different-entity' },
    ])
      await expect(
        call((service) => service.createNumberingRange({ ...body, ...changed })),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_IDEMPOTENCY_CONFLICT' });
    expect(await call((service) => service.getNumberingRange(created.id))).toEqual(created);
    const page = await call((service) =>
      service.listNumberingRanges({ id: created.id, series: 'absence' } as never),
    ).catch((error) => error);
    expect(page).toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('admits one concurrent equal key and refuses distinct operation keys on the same unique scope', async () => {
    const body = rangeInput('concurrent', { idempotencyKey: 'concurrent-key' });
    const values = await Promise.all([
      call((service) => service.createNumberingRange(body)),
      call((service) => service.createNumberingRange(body), RANGE_TENANT_A, 'second-audit-actor'),
    ]);
    expect(values[0]).toEqual(values[1]);
    await expect(
      call((service) => service.createNumberingRange({ ...body, idempotencyKey: 'distinct-key' })),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_CONFLICT' });
    await expect(
      call((service) => service.createNumberingRange(rangeInput('concurrent'))),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_CONFLICT' });
    expect(
      (await call((service) => service.listNumberingRanges({ series: 'concurrent' }))).items,
    ).toEqual([values[0]]);
  });

  it('scopes operation keys, get and cancel to trusted tenant without disclosing another tenant range', async () => {
    const body = rangeInput('tenant-isolation', { idempotencyKey: 'shared-tenant-key' });
    const a = await call((service) => service.createNumberingRange(body));
    const b = await call((service) => service.createNumberingRange(body), RANGE_TENANT_B);
    expect(a.id).not.toBe(b.id);
    expect(b.tenantId).toBe(RANGE_TENANT_B);
    await expect(
      call((service) => service.getNumberingRange(a.id), RANGE_TENANT_B),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND', status: 404 });
    await expect(
      call((service) => service.cancelNumberingRange(a.id, {}), RANGE_TENANT_B),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND', status: 404 });
    expect(
      (
        await call(
          (service) => service.listNumberingRanges({ series: body.series }),
          RANGE_TENANT_B,
        )
      ).items,
    ).toEqual([b]);
    expect(await call((service) => service.getNumberingRange(a.id))).toEqual(a);
  });

  it('lists exact filters with ascending exclusive UUID pages and default50/max200 bounds without effects', async () => {
    const created = await Promise.all(
      Array.from({ length: 53 }, (_, i) =>
        call((service) =>
          service.createNumberingRange(rangeInput(`page-${i}`, { orgUnitId: 'paging-org' })),
        ),
      ),
    );
    const sorted = [...created].sort((a, b) => a.id.localeCompare(b.id));
    const first = await call((service) => service.listNumberingRanges({ orgUnitId: 'paging-org' }));
    expect(first.items).toEqual(sorted.slice(0, 50));
    expect(first.nextCursor).toBe(sorted[49]!.id);
    const second = await call((service) =>
      service.listNumberingRanges({ orgUnitId: 'paging-org', cursor: first.nextCursor! }),
    );
    expect(second).toEqual({ items: sorted.slice(50), nextCursor: null });
    expect(
      await call((service) => service.listNumberingRanges({ orgUnitId: 'paging-org', limit: 200 })),
    ).toEqual({ items: sorted, nextCursor: null });
    expect(
      await call((service) =>
        service.listNumberingRanges({
          orgUnitId: 'paging-org',
          entityType: 'citation',
          series: 'page-1',
          status: 'active',
          limit: 1,
        }),
      ),
    ).toEqual({ items: [created[1]], nextCursor: null });
    expect(await call((service) => service.listNumberingRanges({ orgUnitId: 'absent' }))).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await call((service) => service.getNumberingRange(sorted[0]!.id))).toEqual(sorted[0]);
  });

  it('refuses exhausted cancellation and records optional reason absence without counter rewind', async () => {
    const exhausted = await call((service) =>
      service.createNumberingRange(rangeInput('exhausted', { startNumber: 1, endNumber: 1 })),
    );
    await call((service) =>
      service.reserveDurableNumbering({
        orgUnitId: exhausted.orgUnitId,
        entityType: exhausted.entityType,
        rangeId: exhausted.id,
        requestedSize: 1,
        deviceId: 'exhausted-device',
        shiftId: null,
      }),
    );
    await expect(
      call((service) => service.cancelNumberingRange(exhausted.id, {})),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_STATE' });
    expect(await call((service) => service.getNumberingRange(exhausted.id))).toMatchObject({
      status: 'exhausted',
      nextNumber: 2,
    });
    const plain = await call((service) => service.createNumberingRange(rangeInput('no-reason')));
    const cancelled = await call((service) => service.cancelNumberingRange(plain.id, {}));
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      nextNumber: 10,
      cancelledBy: 'audit-actor',
      cancelledAt: RANGE_AT,
    });
    expect(cancelled).not.toHaveProperty('cancellationReason');
  });

  it('detaches caller attributes and returned snapshots, and replays prior evidence without admitting a new clock', async () => {
    const body = rangeInput('detached', {
      idempotencyKey: 'detached-key',
      consumerAttributes: { nested: { value: 1 } },
    });
    const value = await call((service) => service.createNumberingRange(body));
    const original = JSON.parse(JSON.stringify(value));
    (body.consumerAttributes!.nested as { value: number }).value = 2;
    (value.consumerAttributes!.nested as { value: number }).value = 3;
    expect(await call((service) => service.getNumberingRange(value.id))).toEqual(original);
    const request = { ...body, consumerAttributes: { nested: { value: 1 } } };
    expect(
      await call(
        (service) => service.createNumberingRange(request),
        RANGE_TENANT_A,
        'later-actor',
        'invalid-clock',
      ),
    ).toEqual(original);
    const cancelled = await call((service) => service.cancelNumberingRange(value.id));
    expect(
      await call(
        (service) => service.cancelNumberingRange(value.id),
        RANGE_TENANT_A,
        'later-actor',
        'invalid-clock',
      ),
    ).toEqual(cancelled);
    await expect(
      call(
        (service) => service.createNumberingRange(rangeInput('invalid-new-clock')),
        RANGE_TENANT_A,
        'audit-actor',
        'invalid-clock',
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    const active = await call((service) =>
      service.createNumberingRange(rangeInput('invalid-cancel-clock')),
    );
    await expect(
      call(
        (service) => service.cancelNumberingRange(active.id),
        RANGE_TENANT_A,
        'audit-actor',
        'invalid-clock',
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(await call((service) => service.getNumberingRange(active.id))).toEqual(active);
  });

  it('admits exact4096-byte attributes and safe end+1 while refusing a single additional byte', async () => {
    const consumerAttributes = { v: 'é'.repeat(2044) };
    expect(Buffer.byteLength(JSON.stringify(consumerAttributes))).toBe(4096);
    const max = await call((service) =>
      service.createNumberingRange(
        rangeInput('max-attrs', {
          consumerAttributes,
          startNumber: Number.MAX_SAFE_INTEGER - 1,
          endNumber: Number.MAX_SAFE_INTEGER - 1,
        }),
      ),
    );
    expect(max.consumerAttributes).toEqual(consumerAttributes);
    expect(max.nextNumber).toBe(Number.MAX_SAFE_INTEGER - 1);
    await expect(
      call((service) =>
        service.createNumberingRange(
          rangeInput('too-large-attrs', { consumerAttributes: { v: consumerAttributes.v + 'a' } }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });
}
