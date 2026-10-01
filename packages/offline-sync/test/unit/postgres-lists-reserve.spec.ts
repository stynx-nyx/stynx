import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@stynx-nyx/data';
import { OfflineSyncReservationReplayError, OfflineSyncUpgradeRequiredError } from '../../src/errors';
import { encodeCursor, reservationFingerprint } from '../../src/listing';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import { pgListBatches, pgListConflicts, pgListItemReceipts, pgListQueueItems } from '../../src/postgres-listing';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-11 (#317): SQL-boundary sensors for the PostgreSQL store.
const scope = { tenantId: '00000000-0000-4000-8000-000000000001', actorId: 'actor-a' };
const input = { orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'record', requestedSize: 1 };
const at = new Date('2026-09-28T12:00:00.000Z');

function storeWith(query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) {
  const database = { tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) } as unknown as Database;
  return { store: new PostgresOfflineSyncStore({ get: () => database } as never), database };
}

describe('PostgreSQL reservation idempotency boundary', () => {
  it('locks the tenant key, then replays the stored reservation without touching the range', async () => {
    const row = { id: 'r-1', tenant_id: scope.tenantId, range_id: 'g-1', org_unit_id: 'org-a', entity_type: 'record', series: 'S', agent_id: 'actor-a',
      device_id: 'device-a', shift_id: 'shift-a', start_number: '5', end_number: '5', next_number: '5', valid_until: at, status: 'reserved' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      return { rows: [{ ...row, idempotency_fingerprint: reservationFingerprint(scope, input) }] };
    });
    const { store } = storeWith(query);
    await expect(store.reserveNumbering(scope, { ...input, idempotencyKey: 'k' }, 'now', 'default')).resolves.toMatchObject({ reservationId: 'r-1', startNumber: 5 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![1]).toEqual([`${scope.tenantId}:numbering-reserve:k`]);
    await expect(store.reserveNumbering(scope, { ...input, requestedSize: 2, idempotencyKey: 'k' }, 'now', 'default')).rejects.toBeInstanceOf(OfflineSyncReservationReplayError);
  });

  it('writes the key and fingerprint only for keyed reservations', async () => {
    const range = { id: 'g-1', tenant_id: scope.tenantId, org_unit_id: 'org-a', entity_type: 'record', series: 'S', start_number: '1', end_number: '9', next_number: '1', status: 'active' };
    const statements: { sql: string; values?: unknown[] }[] = [];
    const { store } = storeWith(async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('from offline.numbering_ranges')) return { rows: [range] };
      if (sql.includes('insert into offline.numbering_reservations')) return { rows: [{ id: 'r-2', tenant_id: scope.tenantId, range_id: 'g-1', org_unit_id: 'org-a',
        entity_type: 'record', series: 'S', agent_id: 'actor-a', device_id: 'device-a', shift_id: 'shift-a', start_number: '1', end_number: '1', next_number: '1', valid_until: at, status: 'reserved' }] };
      return { rows: [] };
    });
    await store.reserveNumbering(scope, { ...input, idempotencyKey: 'new-key' }, 'now', '2026-09-29T00:00:00.000Z');
    const keyed = statements.find(statement => statement.sql.includes('insert into offline.numbering_reservations'))!;
    expect(keyed.sql).toContain('idempotency_key, idempotency_fingerprint');
    expect(keyed.values!.slice(13)).toEqual(['new-key', expect.stringMatching(/^sha256:/u)]);
    statements.length = 0;
    await store.reserveNumbering(scope, input, 'now', '2026-09-29T00:00:00.000Z');
    const keyless = statements.find(statement => statement.sql.includes('insert into offline.numbering_reservations'))!;
    expect(keyless.sql).not.toContain('idempotency');
    expect(keyless.values).toHaveLength(13);
    expect(statements.some(statement => statement.sql.includes('pg_advisory_xact_lock'))).toBe(false);
  });

  it('names migration 0003 only for keyed requests against a schema without it', async () => {
    const missing = Object.assign(new Error('column "idempotency_key" does not exist'), { code: '42703' });
    const { store } = storeWith(async () => { throw missing; });
    await expect(store.reserveNumbering(scope, { ...input, idempotencyKey: 'k' }, 'now', 'default')).rejects.toMatchObject({ message: 'Offline-sync migration 0003 is required.' });
    await expect(store.reserveNumbering(scope, input, 'now', 'default')).rejects.toMatchObject({ message: 'Offline-sync migration 0002 is required.' });
    const other = new Error('boom');
    const failing = storeWith(async () => { throw other; }).store;
    await expect(failing.reserveNumbering(scope, { ...input, idempotencyKey: 'k' }, 'now', 'default')).rejects.toBe(other);
  });
});

describe('PostgreSQL listing boundary', () => {
  it('binds tenant, filters, keyset cursor and limit+1 for each listing', async () => {
    const calls: unknown[][] = [];
    const database = { tx: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({ query: async (_sql: string, values: unknown[]) => { calls.push(values); return { rows: [] }; } })) } as unknown as Database;
    const at6 = '2026-09-28T12:00:00.000000Z';
    await pgListBatches(database, scope, { deviceId: 'd', status: 'closed', limit: 5, cursor: encodeCursor([at6, 'd', 'b']) });
    await pgListItemReceipts(database, scope, { deviceId: 'd', deviceBatchId: 'b', status: 'applied', cursor: encodeCursor([at6, 'k']) });
    await pgListQueueItems(database, scope, { deviceId: 'd', status: 'applied', entityType: 'e', limit: 1 });
    await pgListConflicts(database, scope, { status: 'open', conflictType: 'c', queueItemId: 'q', cursor: encodeCursor([at6, 'id']) });
    expect(calls).toEqual([
      [scope.tenantId, 'd', 'closed', at6, 'd', 'b', 6],
      [scope.tenantId, 'd', 'b', 'applied', at6, 'k', 51],
      [scope.tenantId, 'd', 'applied', 'e', null, null, 2],
      [scope.tenantId, 'open', 'c', 'q', at6, 'id', 51],
    ]);
  });

  it('maps optional columns and a missing schema to the published upgrade error', async () => {
    const rows = [{ id: 'c-2', tenant_id: scope.tenantId, sync_queue_item_id: 'q', local_entity_id: 'l', payload_hash: 'h', conflict_type: 'x', description: 'd',
      status: 'open', resolution: null, resolved_by: null, resolved_at: null, created_at: at, sort_at: '2026-09-28T12:00:00.000000Z' },
    { id: 'c-1', tenant_id: scope.tenantId, sync_queue_item_id: 'q', local_entity_id: 'l', payload_hash: 'h', conflict_type: 'x', description: 'd',
      status: 'resolved', resolution: 'reject', resolved_by: 'actor-a', resolved_at: at, created_at: at, sort_at: '2026-09-28T12:00:00.000000Z' }];
    const database = { tx: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows }) })) } as unknown as Database;
    const page = await pgListConflicts(database, scope, { limit: 1 });
    expect(page.items).toEqual([{ conflictId: 'c-2', tenantId: scope.tenantId, queueItemId: 'q', localEntityId: 'l', payloadHash: 'h', conflictType: 'x',
      description: 'd', status: 'open', createdAt: at.toISOString() }]);
    expect(page.nextCursor).toBe(encodeCursor(['2026-09-28T12:00:00.000000Z', 'c-2']));
    expect((await pgListConflicts(database, scope, {})).items[1]).toMatchObject({ resolution: 'reject', resolvedBy: 'actor-a', resolvedAt: at.toISOString() });
    const receipt = { idempotency_key: 'k', queue_item_id: 'q', device_id: 'd', device_batch_id: 'b', payload_hash: 'h', status: 'rejected', error_code: 'E',
      context_json: { a: 1 }, received_at: at, sort_at: 'x' };
    const receipts = { tx: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [receipt] }) })) } as unknown as Database;
    expect((await pgListItemReceipts(receipts, scope, {})).items[0]).toMatchObject({ errorCode: 'E', context: { a: 1 } });
    const batch = { device_id: 'd', device_batch_id: 'b', batch_sequence: '3', status: 'closed', response_status: 201, created_at: at, sort_at: 'x' };
    const batches = { tx: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [batch] }) })) } as unknown as Database;
    expect((await pgListBatches(batches, scope, {})).items[0]!.batchSequence).toBe(3);
    const queue = { id: 'q', tenant_id: scope.tenantId, device_batch_id: 'b', org_unit_id: 'o', agent_id: 'a', device_id: 'd', entity_type: 'e', local_entity_id: 'l',
      idempotency_key: 'k', payload_hash: 'h', payload_json: {}, created_locally_at: at, reserved_number: '7', status: 'received', received_at: at, sort_at: 'x' };
    const queues = { tx: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [queue] }) })) } as unknown as Database;
    expect((await pgListQueueItems(queues, scope, {})).items[0]!.reservedNumber).toBe(7);
    for (const code of ['42703', '42P01']) {
      const missing = { tx: vi.fn(async () => { throw Object.assign(new Error('missing'), { code }); }) } as unknown as Database;
      await expect(pgListQueueItems(missing, scope, {})).rejects.toBeInstanceOf(OfflineSyncUpgradeRequiredError);
    }
    const boom = new Error('boom');
    await expect(pgListQueueItems({ tx: vi.fn(async () => { throw boom; }) } as unknown as Database, scope, {})).rejects.toBe(boom);
    await expect(pgListQueueItems({ tx: vi.fn(async () => { throw 'plain'; }) } as unknown as Database, scope, {})).rejects.toBe('plain');
  });
});
