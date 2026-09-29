import { BadRequestException } from '@nestjs/common';
import type { Database } from '@stynx-nyx/data';
import {
  pgConsumption,
  pgGetBatch,
  pgGetItem,
  pgReconcile,
  pgSubmit,
  pgTransition,
} from '../../src/postgres-durable';
import type { CTG9SubmitSyncBatchInput, DurableBatchExecutionOptions } from '../../src/types';
import { batchContextFingerprint, transportCompositeKey, transportFingerprint } from '../../src/transport';

const scope = { tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1', actorId: 'agent-1' };
const now = '2026-09-28T00:00:00Z';
const reservation = {
  id: '0197481e-6f84-77e4-8d6d-41f0b6fca9c2', tenant_id: scope.tenantId,
  range_id: 'range-1', org_unit_id: 'org-1', entity_type: 'citation', series: 'C',
  agent_id: scope.actorId, device_id: 'device-1', shift_id: 'shift-1',
  start_number: '100', end_number: '101', next_number: '100',
  valid_until: new Date('2026-09-30T00:00:00Z'), status: 'reserved' as const, expired: false,
};
const batchRow = {
  device_id: 'device-1', device_batch_id: 'batch-1', batch_sequence: '2', status: 'closed',
  context_hash: 'hash', declared_keys: ['key-1'], lease_token: null,
  lease_generation: '1', lease_expires_at: null, response_status: 201,
  response_body_bytes: Buffer.from('{}'), response_headers: null,
  transport_key: null, transport_fingerprint: null,
};
const syncItem = {
  queueItemId: 'queue-1', entityType: 'citation', localEntityId: 'local-1',
  idempotencyKey: 'key-1', payloadHash: `sha256:${'a'.repeat(64)}`,
  payloadJson: { value: 1 }, createdLocallyAt: now,
};
const syncBatch: CTG9SubmitSyncBatchInput = {
  orgUnitId: 'org-1', deviceId: 'device-1', deviceBatchId: 'batch-1', items: [syncItem],
};
const transport = { transportIdempotencyKey: 'transport-1', method: 'POST' as const, path: '/offline-sync/sync-batches' };
const execution: DurableBatchExecutionOptions = {
  ...transport, agentId: scope.actorId, policy: {}, ports: {}, transport,
};

function databaseWith(...results: Array<{ rows?: unknown[]; rowCount?: number } | Error>) {
  const pending = [...results];
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => {
    const result = pending.shift();
    if (result instanceof Error) throw result;
    if (!result) throw new Error('Unexpected SQL query');
    return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 };
  });
  const database = {
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  } as unknown as Database;
  return { database, query };
}

function routedDatabase(route: (sql: string) => { rows?: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string) => {
    const result = route(sql);
    return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 };
  });
  const database = {
    hasHeldConnection: () => false,
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  } as unknown as Database;
  return { database, query };
}

function executableDatabase(options: {
  existing?: Record<string, unknown>;
  item?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  insertedReceipt?: boolean;
  finalRowCount?: number;
  sequence?: string;
  submittedBatch?: CTG9SubmitSyncBatchInput;
  routeOverride?: (sql: string) => { rows?: unknown[]; rowCount?: number } | undefined;
} = {}) {
  const bound = {
    device_id: syncBatch.deviceId,
    device_batch_id: syncBatch.deviceBatchId,
    transport_fingerprint: transportFingerprint(transport, options.submittedBatch ?? syncBatch),
  };
  const open = {
    ...verifiedClosedRow, status: 'open', lease_generation: '1',
    lease_token: 'lease-1', lease_valid: false, response_body_bytes: null,
  };
  const route = (sql: string) => {
    const overridden = options.routeOverride?.(sql);
    if (overridden !== undefined) return overridden;
    if (sql.includes('select *,lease_expires_at')) return { rows: options.existing ? [options.existing] : [] };
    if (sql.includes('select id,idempotency_key from offline.sync_queue_items')) return { rows: [] };
    if (sql.includes('select batch_sequence from offline.sync_batches'))
      return { rows: options.sequence === undefined ? [] : [{ batch_sequence: options.sequence }] };
    if (sql.includes('insert into offline.sync_batches') && sql.includes('returning *')) return { rows: [open] };
    if (sql.includes('select device_id,device_batch_id,transport_fingerprint')) return { rows: [bound] };
    if (sql.includes('set lease_expires_at=')) return { rowCount: 1 };
    if (sql.includes('select id,payload_hash,identity_mode,device_id'))
      return { rows: [options.item ?? { id: syncItem.queueItemId, payload_hash: syncItem.payloadHash,
        identity_mode: 'ctg9', device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
        org_unit_id: syncBatch.orgUnitId, agent_id: scope.actorId, status: 'received' }] };
    if (sql.includes('on conflict (tenant_id,idempotency_key) do nothing returning idempotency_key'))
      return { rowCount: options.insertedReceipt === false ? 0 : 1 };
    if (sql.includes('select * from offline.sync_item_receipts'))
      return { rows: [options.receipt ?? { idempotency_key: syncItem.idempotencyKey,
        queue_item_id: syncItem.queueItemId, payload_hash: syncItem.payloadHash, status: 'received',
        device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
        error_code: null, context_json: null }] };
    if (sql.includes('update offline.sync_batches set status=$4'))
      return { rowCount: options.finalRowCount ?? 1 };
    return {};
  };
  const { database, query } = routedDatabase(route);
  Object.assign(database, { txIndependent: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) });
  return { database, query };
}

const verifiedClosedRow = {
  ...batchRow,
  batch_sequence: null,
  context_hash: batchContextFingerprint(syncBatch, execution.agentId),
  response_body_bytes: Buffer.from('{"replayed":true}'),
};

describe('PostgreSQL offline sync durable read and transition boundaries', () => {
  it('returns absent and populated batch receipts with ordered item evidence', async () => {
    await expect(pgGetBatch(databaseWith({ rows: [] }).database, scope, 'device-1', 'absent'))
      .resolves.toBe(null);
    const { database, query } = databaseWith(
      { rows: [batchRow] },
      { rows: [{ queue_item_id: 'queue-1', status: 'rejected', error_code: 'INVALID', context_json: { reason: 'bad' } },
        { queue_item_id: 'queue-2', status: 'applied', error_code: null, context_json: null }] },
    );
    await expect(pgGetBatch(database, scope, 'device-1', 'batch-1')).resolves.toMatchObject({
      deviceId: 'device-1', deviceBatchId: 'batch-1', batchSequence: 2,
      responseStatus: 201, responseHeaders: {},
      items: [
        { queueItemId: 'queue-1', status: 'rejected', errorCode: 'INVALID', context: { reason: 'bad' } },
        { queueItemId: 'queue-2', status: 'applied' },
      ],
    });
    expect(query).toHaveBeenCalledTimes(2);
    await expect(pgGetBatch(databaseWith(
      { rows: [{ ...batchRow, batch_sequence: null, response_headers: { etag: 'v1' } }] },
      { rows: [] },
    ).database, scope, 'device-1', 'batch-1')).resolves.toMatchObject({
      batchSequence: null, responseHeaders: { etag: 'v1' }, items: [],
    });
  });

  it('returns absent and populated item receipts without inventing optional evidence', async () => {
    await expect(pgGetItem(databaseWith({ rows: [] }).database, scope, 'missing'))
      .resolves.toBe(null);
    await expect(pgGetItem(databaseWith({ rows: [{ queue_item_id: 'queue-1', status: 'conflict', error_code: 'CONFLICT', context_json: { batchId: 'batch-1' } }] }).database, scope, 'key-1'))
      .resolves.toEqual({ queueItemId: 'queue-1', status: 'conflict', errorCode: 'CONFLICT', context: { batchId: 'batch-1' } });
    await expect(pgGetItem(databaseWith({ rows: [{ queue_item_id: 'queue-2', status: 'applied', error_code: null, context_json: null }] }).database, scope, 'key-2'))
      .resolves.toEqual({ queueItemId: 'queue-2', status: 'applied' });
  });

  it('fails closed for missing reservations and idempotently returns a prior block', async () => {
    await expect(pgTransition(databaseWith({ rows: [] }).database, scope, reservation.id, 'blocked', {}, '2026-09-28T00:00:00Z', 'block'))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    const blocked = { ...reservation, status: 'blocked' };
    const existing = databaseWith({ rows: [blocked] });
    await expect(pgTransition(existing.database, scope, reservation.id, 'blocked', {}, '2026-09-28T00:00:00Z', 'block'))
      .resolves.toMatchObject({ status: 'blocked', startNumber: 100 });
    expect(existing.query).toHaveBeenCalledTimes(1);
  });

  it('persists a block, close, and settlement with the actor and optional user reference', async () => {
    for (const [status, action, input] of [
      ['blocked', 'block', {}],
      ['consumed', 'close', { reason: 'shift closed' }],
      ['consumed', 'settle', { reason: 'reviewed', userRef: 'review-1' }],
    ] as const) {
      const updated = { ...reservation, status };
      const { database, query } = databaseWith({ rows: [reservation] }, { rows: [updated] }, {});
      await expect(pgTransition(database, scope, reservation.id, status, input, '2026-09-28T00:00:00Z', action))
        .resolves.toMatchObject({ status, endNumber: 101 });
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[1]?.[1]).toEqual([
        scope.tenantId, reservation.id, status, scope.actorId, '2026-09-28T00:00:00Z',
        action, 'reason' in input ? input.reason : null, 'userRef' in input ? input.userRef : null,
      ]);
    }
  });

  it('rejects invalid transitions but permits a repeated settlement for a consumed allocation', async () => {
    const consumed = { ...reservation, status: 'consumed' };
    await expect(pgTransition(databaseWith({ rows: [consumed] }).database, scope, reservation.id, 'blocked', {}, now, 'block'))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    const { database, query } = databaseWith({ rows: [consumed] }, { rows: [consumed] }, {});
    await expect(pgTransition(database, scope, reservation.id, 'consumed', { userRef: 'review-2' }, now, 'settle'))
      .resolves.toMatchObject({ status: 'consumed' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('projects missing numbering slots and preserves durable applied evidence', async () => {
    for (const [status, expected] of [
      ['reserved', 'available'], ['blocked', 'blocked'], ['expired', 'expired'],
      ['cancelled', 'expired'], ['consumed', 'expired'],
    ] as const) {
      const { database } = databaseWith(
        { rows: [{ ...reservation, status }] },
        { rows: [{ number: '100', status: 'applied', server_entity_id: 'server-100', finalized_at: '2026-09-28T00:00:00Z' }] },
      );
      await expect(pgConsumption(database, scope, reservation.id)).resolves.toMatchObject({
        status,
        consumption: [
          { number: 100, status: 'applied', serverEntityId: 'server-100', finalizedAt: '2026-09-28T00:00:00.000Z' },
          { number: 101, status: expected, serverEntityId: null, finalizedAt: null },
        ],
      });
    }
    await expect(pgConsumption(databaseWith({ rows: [] }).database, scope, reservation.id))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(pgConsumption(databaseWith(
      { rows: [{ ...reservation, status: 'blocked' }] },
      { rows: [{ number: '100', status: 'available', server_entity_id: null, finalized_at: null }] },
    ).database, scope, reservation.id)).resolves.toMatchObject({
      consumption: [{ number: 100, status: 'blocked' }, { number: 101, status: 'blocked' }],
    });
    await expect(pgConsumption(databaseWith(
      { rows: [{ ...reservation, status: 'reserved', expired: true }] }, { rows: [] },
    ).database, scope, reservation.id)).resolves.toMatchObject({
      consumption: [{ number: 100, status: 'expired' }, { number: 101, status: 'expired' }],
    });
  });

  it('rejects out-of-range claims before changing reservation state', async () => {
    const { database, query } = databaseWith({ rows: [reservation] }, { rows: [] });
    await expect(pgReconcile(database, scope, reservation.id, { claimedNumbers: [999] }, '2026-09-28T00:00:00Z'))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('reconciles claims and reports missing and unexpected server evidence', async () => {
    const { database, query } = databaseWith(
      { rows: [reservation] },
      { rows: [] },
      { rows: [{ status: 'reserved' }] },
      {}, {},
      { rows: [reservation] },
      { rows: [
        { number: '100', status: 'claimed-locally', server_entity_id: null, finalized_at: null },
        { number: '101', status: 'applied', server_entity_id: 'server-101', finalized_at: now },
      ] },
    );
    await expect(pgReconcile(database, scope, reservation.id, { claimedNumbers: [100] }, now))
      .resolves.toMatchObject({ missingOnServer: [100], unexpectedOnServer: [101] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('claimed-locally'), [scope.tenantId, reservation.id, 100]);
  });

  it('returns unchanged evidence for a closed reservation and rejects a disappeared one', async () => {
    const closed = { ...reservation, status: 'consumed' };
    await expect(pgReconcile(databaseWith(
      { rows: [closed] }, { rows: [] },
      { rows: [{ status: 'consumed' }] },
      { rows: [closed] }, { rows: [] },
    ).database, scope, reservation.id, { claimedNumbers: [] }, now))
      .resolves.toMatchObject({ status: 'consumed', missingOnServer: [], unexpectedOnServer: [] });
    await expect(pgReconcile(databaseWith(
      { rows: [reservation] }, { rows: [] }, { rows: [] },
    ).database, scope, reservation.id, { claimedNumbers: [] }, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(pgReconcile(databaseWith(
      { rows: [closed] }, { rows: [] }, { rows: [{ status: 'consumed' }] },
      { rows: [closed] }, { rows: [] },
    ).database, scope, reservation.id, {}, now)).resolves.toMatchObject({ missingOnServer: [] });
  });

  it('maps migration DDL errors to upgrade-required and preserves unrelated SQL failures', async () => {
    const oldSchema = Object.assign(new Error('missing column'), { code: '42703' });
    await expect(pgGetItem(databaseWith(oldSchema).database, scope, 'key-1'))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_UPGRADE_REQUIRED' });
    const unrelated = Object.assign(new Error('connection lost'), { code: '08006' });
    await expect(pgGetItem(databaseWith(unrelated).database, scope, 'key-1'))
      .rejects.toBe(unrelated);
    const unclassified = new Error('unclassified failure');
    await expect(pgGetItem(databaseWith(unclassified).database, scope, 'key-1'))
      .rejects.toBe(unclassified);
  });

  it('rejects held connections and malformed item identity before opening a durable transaction', async () => {
    const held = Object.assign(databaseWith().database, { hasHeldConnection: () => true });
    await expect(pgSubmit(held, scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'INDEPENDENT_TRANSACTION_CONNECTION' });

    const database = Object.assign(databaseWith().database, { hasHeldConnection: () => false });
    const rejected = [
      { item: { ...syncItem, reservedNumber: 1.5 }, code: 'OFFLINE_SYNC_INVALID_INPUT' },
      { item: { ...syncItem, idempotencyKey: 'stynx:legacy:forged' }, code: 'OFFLINE_SYNC_INVALID_INPUT' },
    ];
    for (const { item, code } of rejected) {
      await expect(pgSubmit(database, scope, { ...syncBatch, items: [item] }, execution, now))
        .rejects.toMatchObject({ code });
    }
  });

  it('rejects empty or duplicate legacy identities and missing command ports', async () => {
    const database = Object.assign(databaseWith().database, { hasHeldConnection: () => false });
    const unkeyed = { ...syncItem, idempotencyKey: undefined };
    await expect(pgSubmit(database, scope, { ...syncBatch, items: [unkeyed] }, {
      ...execution, ports: { legacyItemIdentityResolver: { resolve: async () => '' } },
    }, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(pgSubmit(database, scope, { ...syncBatch, items: [syncItem, { ...syncItem, queueItemId: 'queue-2' }] }, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(pgSubmit(database, scope, { ...syncBatch, items: [{ ...syncItem, reservedNumber: 100 }] }, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) } },
    }, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
  });

  it('replays a closed batch after verifying context and binding the transport key', async () => {
    const fingerprint = transportFingerprint(transport, syncBatch);
    const { database, query } = routedDatabase((sql) => {
      if (sql.includes('select *,lease_expires_at')) return { rows: [verifiedClosedRow] };
      if (sql.includes('select device_id,device_batch_id,transport_fingerprint'))
        return { rows: [{ device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId, transport_fingerprint: fingerprint }] };
      return {};
    });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toEqual({ replayed: true });
    expect(query.mock.calls.some(([sql]) => sql.includes('sync_batch_transport_keys'))).toBe(true);
  });

  it('refuses changed batch context, a changed body for the same key, and key rebinding', async () => {
    const fingerprint = transportFingerprint(transport, syncBatch);
    const compositeKey = transportCompositeKey(scope, transport);
    for (const [row, binding, expected] of [
      [{ ...verifiedClosedRow, context_hash: 'different' }, null, 'OFFLINE_SYNC_BATCH_CONFLICT'],
      [{ ...verifiedClosedRow, transport_key: compositeKey, transport_fingerprint: 'different' }, null, 'UnprocessableEntityException'],
      [verifiedClosedRow, { device_id: 'other-device', device_batch_id: syncBatch.deviceBatchId, transport_fingerprint: fingerprint }, 'OFFLINE_SYNC_BATCH_CONFLICT'],
      [verifiedClosedRow, { device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId, transport_fingerprint: 'different' }, 'UnprocessableEntityException'],
    ] as const) {
      const { database } = routedDatabase((sql) => {
        if (sql.includes('select *,lease_expires_at')) return { rows: [row] };
        if (sql.includes('select device_id,device_batch_id,transport_fingerprint')) return { rows: binding ? [binding] : [] };
        return {};
      });
      await expect(pgSubmit(database, scope, syncBatch, execution, now))
        .rejects.toMatchObject(expected.startsWith('OFFLINE') ? { code: expected } : { name: expected });
    }
  });

  it('requires matching legacy row identity and a durable completed ACK before replay', async () => {
    const legacyRow = { ...verifiedClosedRow, status: 'legacy_closed_unverified' };
    const matchingItems = [{
      id: syncItem.queueItemId, entity_type: syncItem.entityType,
      local_entity_id: syncItem.localEntityId, idempotency_key: syncItem.idempotencyKey,
      payload_hash: syncItem.payloadHash,
    }];
    const route = (items: unknown[]) => routedDatabase((sql) => {
      if (sql.includes('select *,lease_expires_at')) return { rows: [legacyRow] };
      if (sql.includes('select id,entity_type,local_entity_id,idempotency_key,payload_hash'))
        return { rows: items };
      return {};
    }).database;
    await expect(pgSubmit(route([]), scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    await expect(pgSubmit(route(matchingItems), scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });

    const lookup = vi.fn(async () => ({
      status: 'completed', requestFingerprint: transportFingerprint(transport, syncBatch),
      expiresAt: Date.now() + 60_000, body: { replayedLegacy: true }, statusCode: 201,
      headers: { etag: 'legacy' },
    }));
    await expect(pgSubmit(route(matchingItems), scope, syncBatch, {
      ...execution, ports: { legacyIdempotencyStore: { lookup } as never },
    }, now)).resolves.toEqual({ replayedLegacy: true });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('compares legacy batch items by queue ID without depending on request order', async () => {
    const legacy = { ...verifiedClosedRow, status: 'legacy_closed_unverified' };
    for (const items of [
      [syncItem, { ...syncItem, queueItemId: 'queue-2', idempotencyKey: 'key-2' }],
      [{ ...syncItem, queueItemId: 'queue-2', idempotencyKey: 'key-2' }, syncItem],
      [syncItem, { ...syncItem, idempotencyKey: 'key-2' }],
      [syncItem, { ...syncItem, queueItemId: 'queue-2', idempotencyKey: undefined }],
    ]) {
      const { database } = executableDatabase({ existing: legacy, routeOverride: (sql) =>
        sql.includes('select id,entity_type,local_entity_id,idempotency_key,payload_hash')
          ? { rows: [] } : undefined });
      await expect(pgSubmit(database, scope, { ...syncBatch, items }, execution, now))
        .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    }
  });

  it('rejects corrupt closed-batch response evidence instead of inventing a response', async () => {
    const { database } = executableDatabase({ existing: {
      ...verifiedClosedRow, response_status: null, response_body_bytes: null,
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('creates a durable batch and records an unhandled item as received without claiming it applied', async () => {
    const { database, query } = executableDatabase();
    const result = await pgSubmit(database, scope, syncBatch, execution, now);
    expect(result).toMatchObject({ acceptedItems: 1, duplicateItems: 0, receipt: { status: 'closed' },
      items: [{ queueItemId: syncItem.queueItemId, status: 'received' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_item_receipts'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('update offline.sync_batches set status=$4'))).toBe(true);
  });

  it('rejects skipped and reused batch sequences before reserving a batch', async () => {
    for (const [sequence, previous, code] of [
      [1, '1', 'OFFLINE_SYNC_BATCH_CONFLICT'],
      [3, '1', 'OFFLINE_SYNC_BATCH_SEQUENCE'],
    ] as const) {
      const { database, query } = executableDatabase({ sequence: previous });
      await expect(pgSubmit(database, scope, { ...syncBatch, batchSequence: sequence }, execution, now))
        .rejects.toMatchObject({ code });
      expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_batches'))).toBe(false);
    }
  });

  it('accepts the next expected sequence and preserves it in the receipt', async () => {
    const submittedBatch = { ...syncBatch, batchSequence: 2 };
    const { database } = executableDatabase({ sequence: '1', submittedBatch });
    await expect(pgSubmit(database, scope, submittedBatch, execution, now))
      .resolves.toMatchObject({ receipt: { batchSequence: 2 } });
  });

  it('fences an open batch held by another worker when the lease cannot be acquired', async () => {
    const open = { ...verifiedClosedRow, status: 'open', lease_token: null, lease_valid: false };
    const { database } = executableDatabase({ existing: open, routeOverride: (sql) =>
      sql.includes('update offline.sync_batches set lease_token=$4') ? { rows: [] } : undefined });
    await expect(pgSubmit(database, scope, syncBatch, { ...execution, ports: { leaseWaitMs: 0 } }, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC:BATCH:in-progress' });
  });

  it('replays the durable response when another worker closes the batch during the lease wait', async () => {
    const held = { ...verifiedClosedRow, status: 'open', lease_token: 'other-worker', lease_valid: true };
    let reads = 0;
    const { database } = executableDatabase({ existing: held, routeOverride: (sql) => {
      if (sql.includes('select *,lease_expires_at')) {
        reads += 1;
        return { rows: [reads === 1 ? held : verifiedClosedRow] };
      }
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { leaseWaitMs: 200 },
    }, now)).resolves.toEqual({ replayed: true });
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it('uses the default lease wait and default replay status when the completed row has no status', async () => {
    const held = { ...verifiedClosedRow, status: 'open', lease_token: 'other-worker', lease_valid: true };
    let reads = 0;
    const { database } = executableDatabase({ existing: held, routeOverride: (sql) => {
      if (sql.includes('select *,lease_expires_at')) {
        reads += 1;
        return { rows: [reads === 1 ? held : { ...verifiedClosedRow, response_status: null }] };
      }
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now)).resolves.toEqual({ replayed: true });
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it('waits through a transient lease-lock conflict and then returns retryable in-progress', async () => {
    const held = { ...verifiedClosedRow, status: 'open', lease_token: 'other-worker', lease_valid: true };
    const timeout = Object.assign(new Error('lock timeout'), { code: '55P03' });
    const { database, query } = executableDatabase({ existing: held, routeOverride: (sql) => {
      if (sql.includes('update offline.sync_batches set lease_token=$4')) throw timeout;
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { leaseWaitMs: 100 },
    }, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC:BATCH:in-progress' });
    expect(query.mock.calls.some(([sql]) => sql.includes('update offline.sync_batches set lease_token=$4'))).toBe(true);
  });

  it('acquires a newly expired lease during the wait and processes the batch', async () => {
    const held = { ...verifiedClosedRow, status: 'open', lease_token: 'other-worker', lease_valid: true };
    const { database, query } = executableDatabase({ existing: held, routeOverride: (sql) => {
      if (sql.includes('update offline.sync_batches set lease_token=$4'))
        return { rows: [{ ...held, lease_generation: '2', lease_token: 'new-worker' }] };
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { leaseWaitMs: 150 },
    }, now)).resolves.toMatchObject({ items: [{ status: 'received' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('set local lock_timeout'))).toBe(true);
  });

  it('propagates an unexpected lease-wait database error', async () => {
    const held = { ...verifiedClosedRow, status: 'open', lease_token: 'other-worker', lease_valid: true };
    const error = new Error('database lost while waiting');
    const { database } = executableDatabase({ existing: held, routeOverride: (sql) => {
      if (sql.includes('update offline.sync_batches set lease_token=$4')) throw error;
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { leaseWaitMs: 150 },
    }, now)).rejects.toBe(error);
  });

  it('recovers an expired lease and processes its queued batch', async () => {
    const open = { ...verifiedClosedRow, status: 'open', lease_token: null, lease_valid: false };
    const { database, query } = executableDatabase({ existing: open, routeOverride: (sql) =>
      sql.includes('update offline.sync_batches set lease_token=$4')
        ? { rows: [{ ...open, lease_generation: '2', lease_token: 'new-lease' }] } : undefined });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ items: [{ status: 'received' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('lease_generation=lease_generation+1'))).toBe(true);
  });

  it('reports a missing batch after an advisory-lock timeout', async () => {
    const timeout = Object.assign(new Error('lock timeout'), { code: '55P03' });
    const { database } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('select pg_advisory_xact_lock')) throw timeout;
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC:BATCH:in-progress' });
  });

  it('adopts a completed batch after an advisory-lock timeout', async () => {
    const timeout = Object.assign(new Error('lock timeout'), { code: '55P03' });
    const { database } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('select pg_advisory_xact_lock')) throw timeout;
      if (sql.includes('select *,lease_expires_at')) return { rows: [verifiedClosedRow] };
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toEqual({ replayed: true });
  });

  it('imports an E6 batch as unverified and refuses replay without its historical ACK', async () => {
    const legacy = { ...verifiedClosedRow, status: 'legacy_closed_unverified' };
    const { database, query } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('select id,idempotency_key from offline.sync_queue_items'))
        return { rows: [{ id: syncItem.queueItemId, idempotency_key: syncItem.idempotencyKey }] };
      if (sql.includes('insert into offline.sync_batches') && sql.includes('legacy_closed_unverified'))
        return { rows: [legacy] };
      if (sql.includes('select id,entity_type,local_entity_id,idempotency_key,payload_hash'))
        return { rows: [] };
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    expect(query.mock.calls.some(([sql]) => sql.includes('legacy_closed_unverified'))).toBe(true);
  });

  it('detects a fenced lease when finalizing the durable receipt and releases its own lease', async () => {
    const { database, query } = executableDatabase({ finalRowCount: 0 });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    expect(query.mock.calls.some(([sql]) => sql.includes('set lease_token=null,lease_expires_at=null'))).toBe(true);
  });

  it('preserves the original finalization error even when compensating lease release also fails', async () => {
    const original = new Error('finalization unavailable');
    const cleanup = new Error('cleanup unavailable');
    const { database, query } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('update offline.sync_batches set status=$4')) throw original;
      if (sql.includes('set lease_token=null,lease_expires_at=null')) throw cleanup;
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now)).rejects.toBe(original);
    expect(query.mock.calls.some(([sql]) => sql.includes('set lease_token=null,lease_expires_at=null'))).toBe(true);
  });

  it('applies an item and appends its event in the same independent transaction', async () => {
    const { database, query } = executableDatabase();
    const apply = vi.fn(async () => ({ serverEntityId: 'server-1' }));
    const appendInTransaction = vi.fn(async () => undefined);
    const result = await pgSubmit(database, scope, syncBatch, {
      ...execution, ports: { itemApplier: { apply }, eventPort: { appendInTransaction } },
    }, now);
    expect(result).toMatchObject({ receipt: { status: 'closed' }, items: [{ status: 'applied' }] });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(appendInTransaction).toHaveBeenCalledWith(expect.anything(), {
      entity: syncItem.entityType, entityId: 'server-1', idempotencyKey: syncItem.idempotencyKey,
      payload: syncItem.payloadJson,
    });
    expect(query.mock.calls.some(([sql]) => sql.includes("set status='applied'"))).toBe(true);
  });

  it('rejects a business validation failure while keeping the batch receipt durable', async () => {
    const { database, query } = executableDatabase();
    const result = await pgSubmit(database, scope, syncBatch, {
      ...execution, ports: {
        itemApplier: { apply: async () => { throw new BadRequestException('bad item'); } },
        eventPort: { appendInTransaction: async () => undefined },
      },
    }, now);
    expect(result).toMatchObject({ receipt: { status: 'closed' }, items: [{ status: 'rejected' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('update offline.sync_item_receipts set status=$3'))).toBe(true);
  });

  it('keeps unexpected item failures retryable and leaves the batch open', async () => {
    const { database } = executableDatabase();
    const result = await pgSubmit(database, scope, syncBatch, {
      ...execution, ports: {
        itemApplier: { apply: async () => { throw new Error('temporary outage'); } },
        eventPort: { appendInTransaction: async () => undefined },
      },
    }, now);
    expect(result).toMatchObject({ receipt: { status: 'open', responseStatus: null },
      items: [{ status: 'received', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' }] });
  });

  it('records an attempted reuse of the queue item ID without changing the original receipt', async () => {
    const { database, query } = executableDatabase({ routeOverride: (sql) =>
      sql.includes('select id,payload_hash,identity_mode,device_id') ? { rows: [] } : undefined });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_item_attempts'))).toBe(true);
  });

  it('rejects a payload-hash mismatch for an existing item identity', async () => {
    const { database, query } = executableDatabase({ receipt: {
      queue_item_id: syncItem.queueItemId, payload_hash: 'different', status: 'received',
      device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
      error_code: null, context_json: null,
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('OFFLINE_SYNC_ITEM_INTEGRITY'))).toBe(true);
  });

  it('projects an existing receipt bound to another queue item with its provenance', async () => {
    const { database, query } = executableDatabase({ receipt: {
      queue_item_id: 'original-queue', payload_hash: syncItem.payloadHash, status: 'applied',
      device_id: 'other-device', device_batch_id: 'other-batch',
      error_code: null, context_json: { source: 'prior-batch' },
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ duplicateItems: 1, items: [{ status: 'applied',
        context: { source: 'prior-batch', originalQueueItemId: 'original-queue' } }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_item_attempts'))).toBe(true);
  });

  it('keeps a duplicate received item retryable while its original worker owns the receipt', async () => {
    const { database } = executableDatabase({ receipt: {
      queue_item_id: 'original-queue', payload_hash: syncItem.payloadHash, status: 'received',
      device_id: 'other-device', device_batch_id: 'other-batch', error_code: null,
      context_json: null,
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
      },
    }, now)).resolves.toMatchObject({ receipt: { status: 'open' }, duplicateItems: 1,
      items: [{ status: 'received', context: { originalQueueItemId: 'original-queue' } }] });
  });

  it('does not apply an item whose receipt changed between preflight and the independent transaction', async () => {
    let locks = 0;
    const apply = vi.fn(async () => ({ serverEntityId: 'server-1' }));
    const { database } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('select * from offline.sync_item_receipts')) {
        locks += 1;
        if (locks === 2) return { rows: [] };
      }
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: {
        itemApplier: { apply }, eventPort: { appendInTransaction: async () => undefined },
      },
    }, now)).resolves.toMatchObject({ receipt: { status: 'open' }, items: [{ status: 'received' }] });
    expect(apply).not.toHaveBeenCalled();
  });

  it('replays a completed item when another worker applies it after preflight', async () => {
    let locks = 0;
    const apply = vi.fn(async () => ({ serverEntityId: 'server-1' }));
    const { database } = executableDatabase({ routeOverride: (sql) => {
      if (sql.includes('select * from offline.sync_item_receipts')) {
        locks += 1;
        if (locks === 2) return { rows: [{
          queue_item_id: syncItem.queueItemId, payload_hash: syncItem.payloadHash,
          device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
          status: 'applied', error_code: null, context_json: null,
        }] };
      }
      return undefined;
    } });
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, ports: {
        itemApplier: { apply }, eventPort: { appendInTransaction: async () => undefined },
      },
    }, now)).resolves.toMatchObject({ receipt: { status: 'closed' }, items: [{ status: 'applied' }] });
    expect(apply).not.toHaveBeenCalled();
  });

  it('reports an E6 received item as unverified rather than applying it again', async () => {
    const { database, query } = executableDatabase({ item: {
      id: syncItem.queueItemId, payload_hash: syncItem.payloadHash, identity_mode: 'e6',
      device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
      org_unit_id: syncBatch.orgUnitId, agent_id: scope.actorId, status: 'received',
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ duplicateItems: 1,
        items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('identity_mode'))).toBe(true);
  });

  it('does not mistake an already applied E6 item for a still-unverified one', async () => {
    const { database } = executableDatabase({ item: {
      id: syncItem.queueItemId, payload_hash: syncItem.payloadHash, identity_mode: 'e6',
      device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
      org_unit_id: syncBatch.orgUnitId, agent_id: scope.actorId, status: 'applied',
    }, receipt: {
      queue_item_id: syncItem.queueItemId, payload_hash: syncItem.payloadHash, status: 'applied',
      device_id: syncBatch.deviceId, device_batch_id: syncBatch.deviceBatchId,
      error_code: null, context_json: null,
    } });
    await expect(pgSubmit(database, scope, syncBatch, execution, now))
      .resolves.toMatchObject({ items: [{ status: 'applied' }] });
  });

  it('derives a reserved legacy item identity and does not count it as applied', async () => {
    const unkeyed = { ...syncItem, idempotencyKey: undefined };
    const submittedBatch = { ...syncBatch, items: [unkeyed] };
    const { database } = executableDatabase({ submittedBatch });
    await expect(pgSubmit(database, scope, submittedBatch, execution, now))
      .resolves.toMatchObject({ items: [{ status: 'received',
        errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }] });
  });

  it.each([
    ['no covering reservation', [], [], 1, 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE', 'rejected'],
    ['ambiguous covering reservations', [{ id: 'r1', status: 'reserved', valid_until: now }, { id: 'r2', status: 'reserved', valid_until: now }], [], 1, 'OFFLINE_SYNC_NUMBERING_AMBIGUOUS', 'rejected'],
    ['previously applied number', [{ id: 'r1', status: 'reserved', valid_until: now }], [{ status: 'applied' }], 1, 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED', 'rejected'],
    ['expired reservation', [{ id: 'r1', status: 'expired', valid_until: now }], [], 1, 'OFFLINE_SYNC_NUMBERING_EXPIRED', 'conflict'],
    ['invalid consumption state', [{ id: 'r1', status: 'reserved', valid_until: now }], [{ status: 'blocked' }], 1, 'OFFLINE_SYNC_NUMBERING_EXPIRED', 'conflict'],
    ['lost claim race', [{ id: 'r1', status: 'reserved', valid_until: now }], [], 0, 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED', 'rejected'],
  ] as const)('records %s with durable conflict evidence', async (_case, covering, consumed, claimCount, code, status) => {
    const reserved = { ...syncItem, reservedNumber: 100 };
    const submittedBatch = { ...syncBatch, items: [reserved] };
    const { database, query } = executableDatabase({ submittedBatch, routeOverride: (sql) => {
      if (sql.includes('select r.id,r.status,r.valid_until')) return { rows: [...covering] };
      if (sql.includes('select status from offline.numbering_consumption')) return { rows: [...consumed] };
      if (sql.includes('insert into offline.numbering_consumption')) return { rowCount: claimCount };
      return undefined;
    } });
    const result = await pgSubmit(database, scope, submittedBatch, {
      ...execution, ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
      },
    }, now);
    expect(result.items[0]).toMatchObject({ status, errorCode: code,
      context: { number: 100, conflictId: expect.any(String) } });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_conflict_evidence'))).toBe(true);
  });

  it('applies a claimed reservation number and records the server entity', async () => {
    const reserved = { ...syncItem, reservedNumber: 100 };
    const submittedBatch = { ...syncBatch, items: [reserved] };
    const { database, query } = executableDatabase({ submittedBatch, routeOverride: (sql) => {
      if (sql.includes('select r.id,r.status,r.valid_until'))
        return { rows: [{ id: 'reservation-1', status: 'reserved', valid_until: '2026-10-01T00:00:00Z' }] };
      if (sql.includes('select status from offline.numbering_consumption')) return { rows: [] };
      if (sql.includes('insert into offline.numbering_consumption')) return { rowCount: 1 };
      return undefined;
    } });
    await expect(pgSubmit(database, scope, submittedBatch, {
      ...execution, ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
      },
    }, now)).resolves.toMatchObject({ items: [{ status: 'applied' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes("set status='applied'") &&
      sql.includes('offline.numbering_consumption'))).toBe(true);
  });

  it.each([
    ['permitted handoff', true, { firstItemId: syncItem.queueItemId, secondItemId: 'queue-2' }, 'applied'],
    ['current item conflict', false, { firstItemId: syncItem.queueItemId, secondItemId: 'queue-2' }, 'conflict'],
    ['other item conflict', false, { firstItemId: 'queue-2', secondItemId: 'queue-3' }, 'applied'],
  ] as const)('handles a suspected concurrent pair with %s', async (_label, permitted, pair, status) => {
    const { database, query } = executableDatabase();
    const permits = vi.fn(async () => permitted);
    const allowedActions = vi.fn(async () => ['manual-review' as const]);
    const result = await pgSubmit(database, scope, syncBatch, {
      ...execution, policy: { concurrencyWindowMinutes: 15 },
      ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
        concurrencyDetector: { detect: async () => ({ suspected: true, pairs: [pair] }) },
        handoffPort: { permits }, conflictResolver: { allowedActions } as never,
      },
    }, now);
    expect(result.items[0]).toMatchObject({ status });
    expect(permits).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_conflict_evidence')))
      .toBe(!permitted);
    if (!permitted) expect(allowedActions).toHaveBeenCalledTimes(2);
  });

  it('keeps an unsuspected concurrency check free of conflict evidence', async () => {
    const { database, query } = executableDatabase();
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, policy: { concurrencyWindowMinutes: 15 },
      ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
        concurrencyDetector: { detect: async () => ({ suspected: false, pairs: [] }) },
      },
    }, now)).resolves.toMatchObject({ items: [{ status: 'applied' }] });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into offline.sync_conflict_evidence'))).toBe(false);
  });

  it('uses manual review as the safe default when no conflict resolver is configured', async () => {
    const { database, query } = executableDatabase();
    await expect(pgSubmit(database, scope, syncBatch, {
      ...execution, policy: { concurrencyWindowMinutes: 15 },
      ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-1' }) },
        eventPort: { appendInTransaction: async () => undefined },
        concurrencyDetector: { detect: async () => ({ suspected: true,
          pairs: [{ firstItemId: syncItem.queueItemId, secondItemId: 'queue-2' }] }) },
      },
    }, now)).resolves.toMatchObject({ items: [{ status: 'conflict' }] });
    const evidenceCalls = query.mock.calls.filter(([sql]) => sql.includes('insert into offline.sync_conflict_evidence'));
    expect(evidenceCalls).toHaveLength(2);
    expect(evidenceCalls[0]?.[1]?.[4]).toBe('["manual-review"]');
  });
});
