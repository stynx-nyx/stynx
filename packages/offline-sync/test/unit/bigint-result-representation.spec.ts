import { executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { pgGetNumberingRange } from '../../src/postgres-ranges.js';
import { pgReplayDurableReservation } from '../../src/postgres-reservations.js';
import { pgListReconciliations } from '../../src/postgres-reconciliation.js';
import { pgListBatches } from '../../src/postgres-listing.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import { reservationFingerprint } from '../../src/listing.js';

const tenantId = '11111111-1111-1111-1111-111111111111';
const id = '22222222-2222-2222-2222-222222222222';
const scope = { tenantId, actorId: 'agent-1' };
const instant = '2026-10-23T00:00:00.000Z';
const decimal = '9007199254740993';
const rounded = Number(decimal);
const reservationInput = {
  orgUnitId: 'org-1', deviceId: 'device-1', shiftId: 'shift-1', entityType: 'citation',
  requestedSize: 1, rangeId: id, series: 'A', validUntil: instant, idempotencyKey: 'replay-1',
};

function databaseWith(row: Record<string, unknown>) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [row] }));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const transaction = { query, run };
  return {
    query,
    database: { tx: vi.fn(async (consume: (trx: typeof transaction) => unknown) => consume(transaction)) },
  };
}

function reservationRow(value: string | number) {
  return {
    id, range_id: id, tenant_id: tenantId, org_unit_id: 'org-1', entity_type: 'citation',
    series: 'A', agent_id: 'agent-1', device_id: 'device-1', shift_id: 'shift-1',
    start_number: value, end_number: value, next_number: value, valid_until: instant,
    status: 'reserved', reservation_origin: 'e6',
    idempotency_fingerprint: reservationFingerprint(scope, reservationInput),
  };
}

// Reflect only injects the deliberately narrow database test port at the runtime
// boundary. It does not assert that this fixture implements Database/Transaction;
// every SQL definition still executes through the real checked executor.
describe.each([
  { representation: 'stock decimal string', value: decimal },
  { representation: 'configured rounded numeric parser', value: rounded },
])('int8 results above MAX_SAFE_INTEGER: $representation', ({ value }) => {
  it('retains the range mapper Number conversion without claiming precision', async () => {
    const { database, query } = databaseWith({
      ...reservationRow(value), status: 'active', consumer_attributes: null,
      created_by: null, created_at: instant, updated_at: null, cancelled_by: null,
      cancelled_at: null, cancellation_reason: null, creation_fingerprint: null, creation_receipt: null,
    });
    const result: unknown = await Reflect.apply(pgGetNumberingRange, undefined, [database, scope, id]);
    expect(result).toMatchObject({ startNumber: rounded, endNumber: rounded, nextNumber: rounded });
    expect(BigInt(rounded)).not.toBe(BigInt(decimal));
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains the durable reservation replay mapper Number conversion', async () => {
    const { database, query } = databaseWith(reservationRow(value));
    const result: unknown = await Reflect.apply(pgReplayDurableReservation, undefined, [database, scope, reservationInput]);
    expect(result).toMatchObject({ startNumber: rounded, endNumber: rounded, nextNumber: rounded });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains the legacy reservation replay mapper Number conversion', async () => {
    const { database, query } = databaseWith(reservationRow(value));
    const store: unknown = Reflect.construct(PostgresOfflineSyncStore, [{ get: () => database }]);
    const result: unknown = await Reflect.apply(PostgresOfflineSyncStore.prototype.replayNumberingReservation, store, [scope, reservationInput]);
    expect(result).toMatchObject({ startNumber: rounded, endNumber: rounded, nextNumber: rounded });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains reconciliation claimed-number conversion and previously rounded persisted result JSON', async () => {
    const persistedResult = {
      reservationId: id, status: 'reserved',
      consumption: [{ number: rounded, status: 'available', serverEntityId: null, finalizedAt: null }],
      missingOnServer: [rounded], unexpectedOnServer: [rounded],
    };
    const { database, query } = databaseWith({
      id, tenant_id: tenantId, reservation_id: id, actor_id: 'agent-1', created_at: instant,
      claimed_numbers: [value], user_ref: null, idempotency_key: null,
      request_fingerprint: null, result_json: persistedResult,
    });
    const result: unknown = await Reflect.apply(pgListReconciliations, undefined, [database, scope, { reservationId: id, limit: 1 }]);
    expect(result).toMatchObject({ items: [{ claimedNumbers: [rounded], result: persistedResult }] });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains batch-listing Number conversion without traversing huge numbering ranges', async () => {
    const { database, query } = databaseWith({
      device_id: 'device-1', device_batch_id: 'batch-1', batch_sequence: value,
      status: 'open', response_status: null, created_at: instant, sort_at: instant,
    });
    const result: unknown = await Reflect.apply(pgListBatches, undefined, [database, scope, { limit: 1 }]);
    expect(result).toMatchObject({ items: [{ batchSequence: rounded }] });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
