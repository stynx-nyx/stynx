import { OfflineSyncError as _OfflineSyncError } from '../../src/errors';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import type { SyncBatchItemInput, TrustedOfflineSyncScope } from '../../src/types';

const scope: TrustedOfflineSyncScope = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  actorId: 'agent-a',
};
const now = '2026-08-25T12:00:00.000Z';
const rangeRow = {
  id: '10000000-0000-4000-8000-000000000001',
  tenant_id: scope.tenantId,
  org_unit_id: 'org-a',
  entity_type: 'record',
  series: 'REC',
  start_number: '1',
  end_number: '10',
  next_number: '2',
  status: 'active' as const,
};
const reservationRow = {
  id: '20000000-0000-4000-8000-000000000001',
  tenant_id: scope.tenantId,
  range_id: rangeRow.id,
  org_unit_id: 'org-a',
  entity_type: 'record',
  series: 'REC',
  agent_id: scope.actorId,
  device_id: 'device-a',
  shift_id: 'shift-a',
  start_number: '2',
  end_number: '3',
  next_number: '2',
  valid_until: new Date('2026-08-26T12:00:00.000Z'),
  status: 'reserved' as const,
};
const queueRow = {
  id: 'queue-1',
  tenant_id: scope.tenantId,
  org_unit_id: 'org-a',
  agent_id: scope.actorId,
  device_id: 'device-a',
  entity_type: 'record',
  local_entity_id: 'local-1',
  idempotency_key: 'idem-1',
  payload_hash: `sha256:${'a'.repeat(64)}`,
  payload_json: { value: 1 },
  created_locally_at: new Date(now),
  reserved_number: '2',
  status: 'received' as const,
  received_at: now,
};
const conflictRow = {
  id: '30000000-0000-4000-8000-000000000001',
  tenant_id: scope.tenantId,
  sync_queue_item_id: queueRow.id,
  local_entity_id: queueRow.local_entity_id,
  payload_hash: queueRow.payload_hash,
  conflict_type: 'version',
  description: 'different',
  status: 'open' as const,
  resolution: null,
  resolved_by: null,
  resolved_at: null,
};
const item: SyncBatchItemInput = {
  queueItemId: queueRow.id,
  entityType: queueRow.entity_type,
  localEntityId: queueRow.local_entity_id,
  idempotencyKey: queueRow.idempotency_key,
  payloadHash: queueRow.payload_hash,
  payloadJson: queueRow.payload_json,
  createdLocallyAt: now,
  reservedNumber: 2,
};

function harness(query: ReturnType<typeof vi.fn>) {
  const database = {
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  };
  const moduleRef = { get: vi.fn(() => database) };
  return { database, moduleRef, store: new PostgresOfflineSyncStore(moduleRef as never) };
}

describe('PostgresOfflineSyncStore', () => {
  it('reserves and maps a numbering range and reservation', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from offline.numbering_ranges')) return { rows: [rangeRow] };
      if (sql.includes('insert into offline.numbering_reservations'))
        return { rows: [reservationRow] };
      return { rows: [] };
    });
    const { moduleRef, store } = harness(query);
    await expect(
      store.reserveNumbering(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          shiftId: 'shift-a',
          entityType: 'record',
          requestedSize: 2,
          rangeId: rangeRow.id,
          validUntil: '2026-08-27T00:00:00.000Z',
        },
        now,
        '2026-08-26T00:00:00.000Z',
      ),
    ).resolves.toMatchObject({
      reservationId: reservationRow.id,
      startNumber: 2,
      endNumber: 3,
      validUntil: '2026-08-26T12:00:00.000Z',
    });
    expect(moduleRef.get).toHaveBeenCalledWith(expect.any(Function), { strict: false });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('update offline.numbering_ranges'), [
      scope.tenantId,
      3,
      4,
      now,
      rangeRow.id,
    ]);

    const defaultQuery = vi.fn(async (sql: string) => {
      if (sql.includes('from offline.numbering_ranges')) return { rows: [rangeRow] };
      if (sql.includes('insert into offline.numbering_reservations'))
        return { rows: [reservationRow] };
      return { rows: [] };
    });
    await harness(defaultQuery).store.reserveNumbering(
      scope,
      {
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize: 1,
      },
      now,
      '2026-08-26T00:00:00.000Z',
    );
    expect(defaultQuery.mock.calls[2]?.[1]?.at(-1)).toBe('2026-08-26T00:00:00.000Z');
  });

  it.each([
    [[], 'OFFLINE_SYNC_RANGE_NOT_FOUND'],
    [[{ ...rangeRow, status: 'cancelled' }], 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [[{ ...rangeRow, org_unit_id: 'other' }], 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [[{ ...rangeRow, entity_type: 'other' }], 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [[{ ...rangeRow, next_number: 10 }], 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
  ])('fails closed for an unusable numbering range %#', async (rows, code) => {
    const { store } = harness(vi.fn(async () => ({ rows })));
    await expect(
      store.reserveNumbering(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          shiftId: 'shift-a',
          entityType: 'record',
          requestedSize: 2,
        },
        now,
        now,
      ),
    ).rejects.toMatchObject({ code });
  });

  it('cancels a reserved numbering allocation and maps the optional reason', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [reservationRow] })
      .mockResolvedValueOnce({ rows: [{ ...reservationRow, status: 'cancelled' }] });
    const { store } = harness(query);
    await expect(
      store.cancelNumberingReservation(scope, reservationRow.id, { reason: 'operator' }, now),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(query.mock.calls[1]?.[1]).toEqual([
      scope.tenantId,
      reservationRow.id,
      'operator',
      scope.actorId,
      now,
    ]);

    const noReasonQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [reservationRow] })
      .mockResolvedValueOnce({ rows: [{ ...reservationRow, status: 'cancelled' }] });
    await harness(noReasonQuery).store.cancelNumberingReservation(
      scope,
      reservationRow.id,
      {},
      now,
    );
    expect(noReasonQuery.mock.calls[1]?.[1]?.[2]).toEqual(null);
  });

  it.each([
    [[], 'OFFLINE_SYNC_RESERVATION_NOT_FOUND'],
    [[{ ...reservationRow, status: 'consumed' }], 'OFFLINE_SYNC_RESERVATION_STATE'],
  ])('rejects an invalid cancellation state %#', async (rows, code) => {
    const { store } = harness(vi.fn(async () => ({ rows })));
    await expect(
      store.cancelNumberingReservation(scope, reservationRow.id, {}, now),
    ).rejects.toMatchObject({ code });
  });

  it('stores new batch items, maps nullable reserved numbers, and reports conflicts', async () => {
    const conflictQueue = { ...queueRow, reserved_number: null, status: 'conflict' as const };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [conflictQueue] });
    const { store } = harness(query);
    await expect(
      store.submitSyncBatch(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          deviceBatchId: 'batch-a',
          items: [
            item,
            {
              ...item,
              queueItemId: 'queue-2',
              payloadHash: `sha256:${'b'.repeat(64)}`,
              reservedNumber: undefined,
            },
          ],
        },
        now,
      ),
    ).resolves.toMatchObject({
      acceptedItems: 2,
      duplicateItems: 0,
      conflicts: ['queue-1'],
      items: [{ reservedNumber: 2 }, { status: 'conflict' }],
    });
  });

  it('returns existing payloads and resolves an insert race', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [queueRow] });
    const { store } = harness(query);
    await expect(
      store.submitSyncBatch(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          deviceBatchId: 'batch-a',
          items: [
            item,
            { ...item, queueItemId: 'queue-2', payloadHash: `sha256:${'b'.repeat(64)}` },
          ],
        },
        now,
      ),
    ).resolves.toMatchObject({ duplicateItems: 2 });
  });

  it('maps queue-id uniqueness and preserves unrelated insert failures', async () => {
    for (const failure of [{ code: '23505' }, new Error('database unavailable')]) {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);
      const promise = harness(query).store.submitSyncBatch(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          deviceBatchId: 'batch-a',
          items: [item],
        },
        now,
      );
      if ('code' in failure)
        await expect(promise).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ID_REUSED' });
      else await expect(promise).rejects.toBe(failure);
    }
  });

  it('fails closed when a payload race cannot be resolved', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      harness(query).store.submitSyncBatch(
        scope,
        {
          orgUnitId: 'org-a',
          deviceId: 'device-a',
          deviceBatchId: 'batch-a',
          items: [item],
        },
        now,
      ),
    ).rejects.toThrow('Payload-hash conflict did not resolve');
  });

  it('opens and maps a conflict', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [conflictRow] });
    await expect(
      harness(query).store.openConflict(
        scope,
        queueRow.id,
        {
          conflictType: 'version',
          description: 'different',
        },
        now,
      ),
    ).resolves.toEqual({
      conflictId: conflictRow.id,
      tenantId: scope.tenantId,
      queueItemId: queueRow.id,
      localEntityId: queueRow.local_entity_id,
      payloadHash: queueRow.payload_hash,
      conflictType: 'version',
      description: 'different',
      status: 'open',
    });
  });

  it('rejects opening a conflict for an absent queue item', async () => {
    await expect(
      harness(vi.fn(async () => ({ rows: [] }))).store.openConflict(
        scope,
        queueRow.id,
        { conflictType: 'version', description: 'different' },
        now,
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND' });
  });

  it.each(['server-wins', 'device-wins'] as const)(
    'resolves %s and maps all resolution fields',
    async (resolution) => {
      const resolved = {
        ...conflictRow,
        status: 'resolved' as const,
        resolution,
        resolved_by: scope.actorId,
        resolved_at: new Date(now),
        description: 'operator decision',
      };
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [conflictRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [resolved] });
      const { store } = harness(query);
      await expect(
        store.resolveConflict(
          scope,
          conflictRow.id,
          {
            resolution,
            ...(resolution === 'server-wins' ? { description: 'operator decision' } : {}),
          },
          now,
        ),
      ).resolves.toMatchObject({
        status: 'resolved',
        resolution,
        resolvedBy: scope.actorId,
        resolvedAt: now,
      });
      expect(query.mock.calls[1]?.[1]?.[2]).toBe(
        resolution === 'server-wins' ? 'rejected' : 'applied',
      );
    },
  );

  it.each([
    [[], 'OFFLINE_SYNC_CONFLICT_NOT_FOUND'],
    [[{ ...conflictRow, status: 'resolved' }], 'OFFLINE_SYNC_CONFLICT_STATE'],
  ])('rejects an invalid conflict resolution state %#', async (rows, code) => {
    await expect(
      harness(vi.fn(async () => ({ rows }))).store.resolveConflict(
        scope,
        conflictRow.id,
        { resolution: 'manual-review' },
        now,
      ),
    ).rejects.toMatchObject({ code });
  });

  it('delegates the durable block transition with tenant and actor context', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from offline.numbering_reservations')) return { rows: [reservationRow] };
      if (sql.includes('update offline.numbering_reservations'))
        return { rows: [{ ...reservationRow, status: 'blocked' }] };
      return { rows: [], rowCount: 1 };
    });
    const { store } = harness(query);
    await expect(store.blockNumberingReservation(scope, reservationRow.id, { reason: 'lost device' }, now))
      .resolves.toMatchObject({ status: 'blocked' });
    expect(query.mock.calls.some(([sql, values]) => sql.includes('update offline.numbering_reservations') &&
      values[3] === scope.actorId && values[6] === 'lost device')).toBe(true);
  });

  it('fails closed when a conflict port cannot find or resolve its target', async () => {
    // ADR-MOBILE-OFFLINE-0003 D2.2: `open` is now an accepted result; any other status is refused.
    const resolve = vi.fn(async () => ({ ...conflictRow, status: 'closed' as never }));
    await expect(harness(vi.fn(async () => ({ rows: [] }))).store.resolveWithPort(
      scope, conflictRow.id, { resolution: 'manual-review' }, now, { resolve } as never,
    )).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_NOT_FOUND' });
    const query = vi.fn(async (sql: string) => sql.includes('from offline.sync_conflict_evidence')
      ? { rows: [] }
      : { rows: [{ org_unit_id: 'org-a', device_id: 'device-a', agent_id: scope.actorId, device_batch_id: 'batch-a' }] });
    await expect(harness(query).store.resolveWithPort(
      scope, conflictRow.id, { resolution: 'manual-review' }, now, { resolve } as never,
    )).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('returns an already cancelled CTG9 reservation without rewriting its audit history', async () => {
    const query = vi.fn(async () => ({ rows: [{ ...reservationRow, status: 'cancelled' }] }));
    const { store } = harness(query);
    await expect(store.cancelNumberingReservation(
      { ...scope, ctg9: true } as never, reservationRow.id, {}, now,
    )).resolves.toMatchObject({ status: 'cancelled' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('passes explicitly supplied durable execution ports and actor through the store boundary', async () => {
    const database = { hasHeldConnection: () => false, tx: vi.fn() };
    const store = new PostgresOfflineSyncStore({ get: () => database } as never);
    const durableInput = {
      orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'batch-a',
      items: [{ ...item, reservedNumber: Number.MAX_SAFE_INTEGER + 1 }],
    };
    const options = {
      agentId: 'delegated-agent', policy: { concurrencyWindowMinutes: 5 }, ports: {},
      transport: { method: 'POST', path: '/sync', transportIdempotencyKey: 'transport-1' },
    };
    await expect(store.submitDurableSyncBatch(scope, durableInput, options as never, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(store.submitDurableSyncBatch(scope, durableInput, {
      method: 'POST', path: '/sync', transportIdempotencyKey: 'transport-2',
    } as never, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect(database.tx).not.toHaveBeenCalled();
  });
});
