import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@stynx-nyx/data';
import { OfflineSyncError, OfflineSyncUpgradeRequiredError } from '../../src/errors';
import { encodeCursor } from '../../src/listing';
import { pgSubmit } from '../../src/postgres-durable';
import { pgListConflictActions, pgListConflicts, pgListItemReceipts, pgListQueueItems } from '../../src/postgres-listing';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import {
  OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES, boundedConsumerAttributes, mergeStynxSql, recordedAttempts, splitStynxContext, stynxContextOf, withoutResolution,
} from '../../src/stynx-context';
import { batchContextFingerprint, transportFingerprint } from '../../src/transport';
import type { CTG9SubmitSyncBatchInput, DurableBatchExecutionOptions, OfflineSyncConflictResolver, SyncConflict } from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-06/-07/-08 (#317; ADR-MOBILE-OFFLINE-0003 D1, D2, D3): SQL-boundary sensors for the
// PostgreSQL store paths that the real-database suite cannot reach (schema and transport failures, guards).
const scope = { tenantId: '00000000-0000-4000-8000-000000000001', actorId: 'actor-a' };
const now = '2026-09-28T12:00:00.000Z';
const conflictId = '30000000-0000-4000-8000-000000000001';
const hash = `sha256:${'a'.repeat(64)}`;
const conflict: SyncConflict = { conflictId, tenantId: scope.tenantId, queueItemId: 'queue-1', localEntityId: 'local-1', payloadHash: hash, conflictType: 'domain', description: 'host', status: 'resolved', resolution: 'reject', resolvedBy: 'host', resolvedAt: now };
const row = { org_unit_id: 'org-a', device_id: 'device-a', agent_id: 'agent-a', device_batch_id: 'batch-a', queue_item_id: 'queue-1', idempotency_key: 'key-1', item_status: 'conflict', reserved_number: '7', entity_type: 'citation' };

type Statement = { sql: string; values: unknown[] };
function storeWith(route: (sql: string, values: unknown[]) => { rows?: unknown[]; rowCount?: number } | Error | undefined) {
  const statements: Statement[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    const result = route(sql, values);
    if (result instanceof Error) throw result;
    return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? 0 };
  });
  const database = { tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) } as unknown as Database;
  return { store: new PostgresOfflineSyncStore({ get: () => database } as never), statements, database };
}
/** Routes the resolution transaction: conflict lock, evidence, receipt lock, guards, evidence update. */
const resolutionRoute = (overrides: { allowed?: string[]; receipt?: unknown[]; guard?: { applied_number: boolean; other_open: boolean }; evidence?: Record<string, unknown>; item?: Partial<typeof row> } = {}) =>
  (sql: string): { rows?: unknown[]; rowCount?: number } | undefined => {
    if (sql.includes('for update of c')) return { rows: [{ ...row, ...overrides.item }] };
    if (sql.includes('select allowed_actions')) return { rows: [{ allowed_actions: overrides.allowed ?? ['reject', 'retry_after_correction', 'manual_review'] }] };
    if (sql.includes('select status,context_json from offline.sync_item_receipts')) return { rows: overrides.receipt ?? [{ status: 'conflict', context_json: { stynx: { version: 1, attempts: 1 } } }] };
    if (sql.includes('as applied_number')) return { rows: [overrides.guard ?? { applied_number: false, other_open: false }] };
    if (sql.includes('update offline.sync_conflict_evidence')) return { rows: [{ evidence: overrides.evidence ?? { detectedAt: now, stynx: { version: 1, reasonCode: 'X' } } }] };
    return { rowCount: 1 };
  };
const portOf = (status: 'open' | 'resolved' | 'closed', attributes?: unknown): OfflineSyncConflictResolver =>
  ({ resolve: async () => ({ ...conflict, status: status as never, ...(attributes === undefined ? {} : { consumerAttributes: attributes as never }) }) });

describe('stynx context helpers (D3)', () => {
  it('builds the versioned object without absent members, bounds consumer attributes and splits stored context', () => {
    expect(stynxContextOf({ receiptId: 'k', appliedAt: undefined, attempts: 2, consumerAttributes: undefined })).toEqual({ version: 1, receiptId: 'k', attempts: 2 });
    expect(boundedConsumerAttributes(undefined)).toBe(undefined);
    expect(boundedConsumerAttributes({ a: 1 })).toEqual({ a: 1 });
    for (const bad of [null, 'text', 7, ['list'], { blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES) }]) {
      const error = (() => { try { boundedConsumerAttributes(bad); return null; } catch (caught) { return caught as OfflineSyncError; } })();
      expect([error?.code, error?.getStatus(), error?.message]).toEqual(['OFFLINE_SYNC_INVALID_INPUT', 400, `consumerAttributes must be a JSON object of at most ${OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES} bytes.`]);
    }
    expect(boundedConsumerAttributes({ blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES - 11) })).toEqual({ blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES - 11) });
    expect(splitStynxContext(null)).toEqual({});
    expect(splitStynxContext(undefined)).toEqual({});
    expect(splitStynxContext({ host: 1 })).toEqual({ context: { host: 1 } });
    expect(splitStynxContext({ stynx: { version: 1, attempts: 1 } })).toEqual({ stynx: { version: 1, attempts: 1 } });
    expect(splitStynxContext({ host: 1, stynx: { version: 1 } })).toEqual({ context: { host: 1 }, stynx: { version: 1 } });
    // A reserved key that is not an object is neither exposed nor merged into the host context.
    expect(splitStynxContext({ stynx: ['x'] })).toEqual({});
    expect(splitStynxContext({ host: 1, stynx: 'text' })).toEqual({ context: { host: 1 } });
    expect([recordedAttempts(null), recordedAttempts({}), recordedAttempts({ stynx: {} }), recordedAttempts({ stynx: { attempts: 'two' } }), recordedAttempts({ stynx: { attempts: 1.5 } }), recordedAttempts({ stynx: { attempts: 0 } }), recordedAttempts({ stynx: { attempts: 3 } })]).toEqual([0, 0, 0, 0, 0, 0, 3]);
    expect(mergeStynxSql('context_json', '$3', '$4')).toBe(`coalesce(context_json,'{}'::jsonb) || coalesce($3::jsonb,'{}'::jsonb) || jsonb_build_object('stynx',coalesce(context_json->'stynx','{}'::jsonb) || $4::jsonb)`);
    expect(withoutResolution(conflict)).toEqual({ conflictId, tenantId: scope.tenantId, queueItemId: 'queue-1', localEntityId: 'local-1', payloadHash: hash, conflictType: 'domain', description: 'host', status: 'open' });
  });
});

describe('PostgreSQL conflict resolution boundary (D1, D2)', () => {
  it('records an open result as a history row, leaves the conflict row untouched and returns no resolution', async () => {
    const { store, statements } = storeWith(resolutionRoute({ evidence: { stynx: { version: 1, reasonCode: 'X', consumerAttributes: { desk: 3 } } } }));
    await expect(store.resolveWithPort(scope, conflictId, { resolution: 'manual_review', description: 'later', userRef: 'u-1' }, now, portOf('open', { desk: 3 })))
      .resolves.toEqual({ conflictId, tenantId: scope.tenantId, queueItemId: 'queue-1', localEntityId: 'local-1', payloadHash: hash, conflictType: 'domain', description: 'host', status: 'open', stynx: { version: 1, reasonCode: 'X', consumerAttributes: { desk: 3 } } });
    const action = statements.find(statement => statement.sql.includes('insert into offline.sync_conflict_actions'))!;
    expect(action.values).toEqual([scope.tenantId, conflictId, 'manual_review', 'later', 'u-1', 'actor-a', 'open']);
    expect(statements.some(statement => statement.sql.includes("set status='resolved'"))).toBe(false);
    expect(statements.some(statement => statement.sql.includes("status='pending'"))).toBe(false);
    const evidence = statements.find(statement => statement.sql.includes('update offline.sync_conflict_evidence'))!;
    expect(evidence.values).toEqual([scope.tenantId, conflictId, null, JSON.stringify({ consumerAttributes: { desk: 3 } })]);
    // A conflict without an evidence row (legacy E6) returns the open result without a platform object.
    const legacy = storeWith(sql => sql.includes('update offline.sync_conflict_evidence') ? { rows: [] } : resolutionRoute()(sql));
    await expect(legacy.store.resolveWithPort(scope, conflictId, { resolution: 'manual_review' }, now, portOf('open'))).resolves.toEqual(withoutResolution(conflict));
  });

  it('closes a conflict with its history row and resolution, without consumer attributes when none are returned', async () => {
    const { store, statements } = storeWith(resolutionRoute({ evidence: { detectedAt: now } }));
    await expect(store.resolveWithPort(scope, conflictId, { resolution: 'reject' }, now, portOf('resolved')))
      .resolves.toEqual({ ...conflict, resolution: 'reject', resolvedBy: 'actor-a', resolvedAt: now });
    expect(statements.find(statement => statement.sql.includes('insert into offline.sync_conflict_actions'))!.values).toEqual([scope.tenantId, conflictId, 'reject', null, null, 'actor-a', 'resolved']);
    expect(statements.find(statement => statement.sql.includes("set status='resolved'"))!.values).toEqual([scope.tenantId, conflictId, 'reject', null, null, 'actor-a', now]);
    expect(statements.find(statement => statement.sql.includes('update offline.sync_conflict_evidence'))!.values[3]).toBe('{}');
    expect(statements.some(statement => statement.sql.includes("status='pending'"))).toBe(false);
  });

  it('moves the item and its receipt to pending only when every D1 precondition holds', async () => {
    const happy = storeWith(resolutionRoute());
    await expect(happy.store.resolveWithPort(scope, conflictId, { resolution: 'retry_after_correction' }, now, portOf('resolved'))).resolves.toMatchObject({ status: 'resolved', resolution: 'retry_after_correction' });
    const guard = happy.statements.find(statement => statement.sql.includes('as applied_number'))!;
    expect(guard.values).toEqual([scope.tenantId, 'queue-1', '7', 'device-a', 'org-a', 'citation', conflictId]);
    expect(happy.statements.filter(statement => statement.sql.includes("status='pending'")).map(statement => statement.values)).toEqual([[scope.tenantId, 'queue-1', now], [scope.tenantId, 'key-1', now]]);
    expect(happy.statements.find(statement => statement.sql.includes('from offline.sync_item_receipts'))!.sql).toContain('for update');
    const refusals = [
      resolutionRoute({ item: { item_status: 'rejected' } }),
      resolutionRoute({ receipt: [] }),
      resolutionRoute({ receipt: [{ status: 'pending', context_json: null }] }),
      resolutionRoute({ receipt: [{ status: 'conflict', context_json: { stynx: { version: 1, appliedAt: now } } }] }),
      resolutionRoute({ guard: { applied_number: true, other_open: false } }),
      resolutionRoute({ guard: { applied_number: false, other_open: true } }),
    ];
    for (const route of refusals) {
      const { store, statements } = storeWith(route);
      await expect(store.resolveWithPort(scope, conflictId, { resolution: 'retry_after_correction' }, now, portOf('resolved')))
        .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', response: { statusCode: 409 }, message: 'The item cannot return to pending.' });
      expect(statements.some(statement => statement.sql.includes("status='pending'") || statement.sql.includes('sync_conflict_actions'))).toBe(false);
    }
  });

  it('refuses an unknown resolver status, a forbidden action and oversized consumer attributes before writing', async () => {
    const unknown = storeWith(resolutionRoute());
    await expect(unknown.store.resolveWithPort(scope, conflictId, { resolution: 'reject' }, now, portOf('closed'))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', message: 'Conflict resolver did not resolve the conflict.' });
    const forbidden = storeWith(resolutionRoute({ allowed: ['reject'] }));
    await expect(forbidden.store.resolveWithPort(scope, conflictId, { resolution: 'manual_review' }, now, portOf('open'))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', message: 'Resolution action is not allowed.' });
    const oversized = storeWith(resolutionRoute());
    await expect(oversized.store.resolveWithPort(scope, conflictId, { resolution: 'reject' }, now, portOf('resolved', { blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES) }))).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', response: { statusCode: 400 } });
    for (const { statements } of [unknown, forbidden, oversized]) expect(statements.some(statement => /^\s*(insert|update)/u.test(statement.sql))).toBe(false);
  });

  it('names migration 0004 for the pending CHECK and the missing history table, and preserves other failures', async () => {
    const check = Object.assign(new Error('violates check constraint "sync_queue_items_status_check"'), { code: '23514' });
    const missing = Object.assign(new Error('relation "offline.sync_conflict_actions" does not exist'), { code: '42P01' });
    const other = Object.assign(new Error('relation "offline.sync_conflict_evidence" does not exist'), { code: '42P01' });
    const unrelated = new Error('boom');
    const failingAt = (needle: string, error: Error) => (sql: string) => sql.includes(needle) ? error : resolutionRoute()(sql);
    for (const [route, expected] of [
      [failingAt("status='pending'", check), 'Offline-sync migration 0004 is required.'],
      [failingAt('insert into offline.sync_conflict_actions', missing), 'Offline-sync migration 0004 is required.'],
    ] as const) {
      const error = await storeWith(route).store.resolveWithPort(scope, conflictId, { resolution: 'retry_after_correction' }, now, portOf('resolved')).catch((caught: unknown) => caught as OfflineSyncUpgradeRequiredError);
      expect(error).toBeInstanceOf(OfflineSyncUpgradeRequiredError);
      expect([error.getStatus(), error.message]).toEqual([503, expected]);
    }
    await expect(storeWith(failingAt('select allowed_actions', other)).store.resolveWithPort(scope, conflictId, { resolution: 'reject' }, now, portOf('resolved'))).rejects.toBe(other);
    await expect(storeWith(failingAt('insert into offline.sync_conflict_actions', unrelated)).store.resolveWithPort(scope, conflictId, { resolution: 'reject' }, now, portOf('resolved'))).rejects.toBe(unrelated);
  });
});

describe('PostgreSQL listing boundary (D2 history, D3 platform object)', () => {
  it('binds tenant, conflict, keyset cursor and limit+1 for the action history and maps optional columns', async () => {
    const cursor = encodeCursor(['2026-09-28T12:00:00.000000Z', 'a-2']);
    const query = vi.fn(async () => ({ rows: [
      { id: 'a-3', tenant_id: scope.tenantId, conflict_id: conflictId, action: 'reject', reason: 'done', user_ref: 'u-3', actor_id: 'actor-a', resulting_status: 'resolved', created_at: new Date(now), sort_at: '2026-09-28T12:00:00.000000Z' },
      { id: 'a-1', tenant_id: scope.tenantId, conflict_id: conflictId, action: 'manual_review', reason: null, user_ref: null, actor_id: 'actor-a', resulting_status: 'open', created_at: new Date(now), sort_at: '2026-09-28T11:00:00.000000Z' },
    ] }));
    const database = { tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) } as unknown as Database;
    const page = await pgListConflictActions(database, scope, { conflictId, cursor, limit: 1 });
    expect(query.mock.calls[0]![1]).toEqual([scope.tenantId, conflictId, '2026-09-28T12:00:00.000000Z', 'a-2', 2]);
    expect(page).toEqual({ items: [{ actionId: 'a-3', tenantId: scope.tenantId, conflictId, action: 'reject', reason: 'done', userRef: 'u-3', actorId: 'actor-a', resultingStatus: 'resolved', createdAt: now }],
      nextCursor: encodeCursor(['2026-09-28T12:00:00.000000Z', 'a-3']) });
    query.mockImplementationOnce(async () => ({ rows: [{ id: 'a-1', tenant_id: scope.tenantId, conflict_id: conflictId, action: 'manual_review', reason: null, user_ref: null, actor_id: 'actor-a', resulting_status: 'open', created_at: new Date(now), sort_at: '2026-09-28T11:00:00.000000Z' }] }));
    const last = await pgListConflictActions(database, scope, { conflictId });
    expect(last).toEqual({ items: [{ actionId: 'a-1', tenantId: scope.tenantId, conflictId, action: 'manual_review', actorId: 'actor-a', resultingStatus: 'open', createdAt: now }], nextCursor: null });
    expect(query.mock.calls[1]![1]).toEqual([scope.tenantId, conflictId, null, null, 51]);
    query.mockImplementationOnce(async () => { throw Object.assign(new Error('missing'), { code: '42P01' }); });
    await expect(pgListConflictActions(database, scope, { conflictId })).rejects.toBeInstanceOf(OfflineSyncUpgradeRequiredError);
    const store = new PostgresOfflineSyncStore({ get: () => database } as never);
    query.mockImplementationOnce(async () => ({ rows: [] }));
    await expect(store.listSyncConflictActions(scope, { conflictId })).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('exposes the platform object of receipts, queue items and conflicts only when the stored value is an object', async () => {
    const base = { sort_at: '2026-09-28T12:00:00.000000Z', received_at: new Date(now), created_at: new Date(now) };
    const queue = { id: 'q', tenant_id: scope.tenantId, device_batch_id: 'b', org_unit_id: 'o', agent_id: 'a', device_id: 'd', entity_type: 'e', local_entity_id: 'l', idempotency_key: 'k', payload_hash: hash, payload_json: {}, created_locally_at: new Date(now), reserved_number: null, status: 'applied' };
    const conflictRow = { id: conflictId, tenant_id: scope.tenantId, sync_queue_item_id: 'q', local_entity_id: 'l', payload_hash: hash, conflict_type: 'integrity', description: 'd', status: 'open', resolution: null, resolved_by: null, resolved_at: null, device_id: 'd' };
    const receipt = { idempotency_key: 'k', queue_item_id: 'q', device_id: 'd', device_batch_id: 'b', payload_hash: hash, status: 'applied', error_code: null };
    const rows: unknown[][] = [
      [{ ...base, ...queue, stynx: { version: 1, attempts: 1 } }, { ...base, ...queue, id: 'q2', stynx: null }],
      [{ ...base, ...conflictRow, stynx: { version: 1, receivedPayloadHash: 'x' } }, { ...base, ...conflictRow, id: '30000000-0000-4000-8000-000000000002', stynx: null }],
      [{ ...base, ...receipt, context_json: { host: true, stynx: { version: 1, appliedAt: now } } }, { ...base, ...receipt, idempotency_key: 'k2', context_json: null }],
    ];
    const query = vi.fn(async () => ({ rows: rows.shift()! }));
    const database = { tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) } as unknown as Database;
    const queued = await pgListQueueItems(database, scope, {});
    expect(queued.items.map(item => item.stynx ?? null)).toEqual([{ version: 1, attempts: 1 }, null]);
    expect(query.mock.calls[0]![0]).toContain("r.context_json->'stynx' as stynx");
    expect(query.mock.calls[0]![0]).toContain('left join offline.sync_item_receipts r on r.tenant_id=q.tenant_id and r.idempotency_key=q.idempotency_key');
    const conflicts = await pgListConflicts(database, scope, {});
    expect(conflicts.items.map(item => item.stynx ?? null)).toEqual([{ version: 1, receivedPayloadHash: 'x' }, null]);
    expect(query.mock.calls[1]![0]).toContain('left join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id and e.queue_item_id=c.sync_queue_item_id');
    const receipts = await pgListItemReceipts(database, scope, {});
    expect(receipts.items.map(item => [item.context ?? null, item.stynx ?? null])).toEqual([[{ host: true }, { version: 1, appliedAt: now }], [null, null]]);
  });
});

describe('PostgreSQL durable submission boundary (D1, D3)', () => {
  const syncItem = { queueItemId: 'queue-1', entityType: 'citation', localEntityId: 'local-1', idempotencyKey: 'key-1', payloadHash: hash, payloadJson: { value: 1 }, createdLocallyAt: now };
  const syncBatch: CTG9SubmitSyncBatchInput = { orgUnitId: 'org-1', deviceId: 'device-1', deviceBatchId: 'batch-2', items: [syncItem] };
  const transport = { transportIdempotencyKey: 'transport-1', method: 'POST' as const, path: '/offline-sync/sync-batches' };
  const execution: DurableBatchExecutionOptions = { ...transport, agentId: scope.actorId, policy: {}, ports: {}, transport };
  const open = {
    device_id: 'device-1', device_batch_id: 'batch-2', batch_sequence: null, status: 'open', context_hash: batchContextFingerprint(syncBatch, scope.actorId), declared_keys: ['key-1'],
    lease_token: 'lease-1', lease_generation: '1', lease_expires_at: null, lease_valid: false, response_status: null, response_body_bytes: null, response_headers: null, transport_key: null, transport_fingerprint: null,
  };
  function submission(receipt: Record<string, unknown>, extra: (sql: string, calls: number) => { rows?: unknown[]; rowCount?: number } | undefined = () => undefined, input: CTG9SubmitSyncBatchInput = syncBatch) {
    const statements: Statement[] = [];
    let leaseRenewals = 0;
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      const overridden = extra(sql, statements.length);
      if (overridden) return { rows: overridden.rows ?? [], rowCount: overridden.rowCount ?? 0 };
      if (sql.includes('select *,lease_expires_at')) return { rows: [] };
      if (sql.includes('select id,idempotency_key from offline.sync_queue_items')) return { rows: [] };
      if (sql.includes('insert into offline.sync_batches') && sql.includes('returning *')) return { rows: [{ ...open, context_hash: batchContextFingerprint(input, scope.actorId) }], rowCount: 1 };
      if (sql.includes('select device_id,device_batch_id,transport_fingerprint')) return { rows: [{ device_id: 'device-1', device_batch_id: 'batch-2', transport_fingerprint: transportFingerprint(transport, input) }] };
      if (sql.includes('set lease_expires_at=')) { leaseRenewals += 1; return { rowCount: 1 }; }
      if (sql.includes('select id,payload_hash,identity_mode,device_id')) return { rows: [{ id: 'queue-1', payload_hash: hash, identity_mode: 'ctg9', device_id: 'device-1', device_batch_id: 'batch-1', org_unit_id: 'org-1', agent_id: scope.actorId, status: 'pending', local_entity_id: 'local-1' }] };
      if (sql.includes('do nothing returning idempotency_key')) return { rowCount: 0 };
      if (sql.includes('select * from offline.sync_item_receipts')) return { rows: [receipt] };
      return { rows: [], rowCount: 1 };
    });
    const database = {
      hasHeldConnection: () => false,
      tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
      txIndependent: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
    } as unknown as Database;
    return { database, statements, renewals: () => leaseRenewals };
  }
  const pendingReceipt = { idempotency_key: 'key-1', queue_item_id: 'queue-1', payload_hash: hash, status: 'pending', device_id: 'device-1', device_batch_id: 'batch-1', error_code: null, context_json: { conflictId, stynx: { version: 1, attempts: 1 } } };

  it('reports a pending receipt as its committed status when no applier is configured, without an attempt row', async () => {
    const { database, statements } = submission(pendingReceipt);
    const result = await pgSubmit(database, scope, syncBatch, execution, now);
    expect(result.receipt).toMatchObject({ status: 'closed', items: [{ queueItemId: 'queue-1', status: 'pending', context: { conflictId } }] });
    expect(result.duplicateItems).toBe(1);
    // The cross-batch duplicate records its attempt as before; no item transaction starts.
    expect(statements.find(statement => statement.sql.includes('insert into offline.sync_item_attempts'))!.values.slice(6)).toEqual(['pending', null, JSON.stringify({ originalQueueItemId: 'queue-1' })]);
    expect((database as unknown as { txIndependent: ReturnType<typeof vi.fn> }).txIndependent).not.toHaveBeenCalled();
  });

  it('re-applies a pending receipt under another queue id, binds the ports to the original id and records the attempt with the original id', async () => {
    const renamed = { ...syncBatch, items: [{ ...syncItem, queueItemId: 'queue-renamed' }] };
    const { database, statements } = submission(pendingReceipt, () => undefined, renamed);
    const apply = vi.fn(async () => ({ serverEntityId: 'server-1', consumerAttributes: { ok: true } }));
    const append = vi.fn(async () => undefined);
    const result = await pgSubmit(database, scope, renamed, { ...execution, ports: { itemApplier: { apply }, eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined } } }, now);
    expect(apply).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ queueItemId: 'queue-1' }), expect.objectContaining({ receiptId: 'key-1', batchId: 'batch-2' }));
    expect(append).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ idempotencyKey: 'key-1:retry:2', entityId: 'server-1' }));
    expect(result.receipt.items).toEqual([{ queueItemId: 'queue-renamed', status: 'applied', context: { originalQueueItemId: 'queue-1' } }]);
    expect(statements.find(statement => statement.sql.includes("set status='applied'") && statement.sql.includes('sync_queue_items'))!.values).toEqual([scope.tenantId, 'queue-1', now]);
    const platform = statements.find(statement => statement.sql.includes("jsonb_build_object('stynx',$3::jsonb)"))!;
    expect(JSON.parse(platform.values[2] as string)).toEqual({ version: 1, receiptId: 'key-1', appliedAt: now, serverEntityId: 'server-1', attempts: 2, consumerAttributes: { ok: true } });
    const attempt = statements.find(statement => statement.sql.includes('insert into offline.sync_item_attempts'))!;
    expect(attempt.values.slice(0, 8)).toEqual([scope.tenantId, 'device-1', 'batch-2', 'queue-renamed', 'key-1', hash, 'applied', null]);
    expect(JSON.parse(attempt.values[8] as string)).toEqual({ originalQueueItemId: 'queue-1', stynx: { version: 1, receiptId: 'key-1', appliedAt: now, serverEntityId: 'server-1', attempts: 2, consumerAttributes: { ok: true } } });
  });

  it('returns the committed status to a concurrent second re-application and records its attempt without a platform object', async () => {
    let receiptReads = 0;
    const { database, statements } = submission(pendingReceipt, sql => sql.includes('select * from offline.sync_item_receipts') && ++receiptReads === 2
      ? { rows: [{ ...pendingReceipt, status: 'applied', context_json: { stynx: { version: 1, appliedAt: now, attempts: 2 } } }] } : undefined);
    const apply = vi.fn();
    const result = await pgSubmit(database, scope, syncBatch, { ...execution, ports: { itemApplier: { apply }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } } }, now);
    expect(apply).not.toHaveBeenCalled();
    expect(result.receipt).toMatchObject({ status: 'closed', items: [{ queueItemId: 'queue-1', status: 'applied' }] });
    const attempt = statements.find(statement => statement.sql.includes('insert into offline.sync_item_attempts'))!;
    expect(attempt.values.slice(6)).toEqual(['applied', null, '{}']);
  });

  it('keeps a pending receipt when the re-application fails before any attempt and records a non-Error rejection message', async () => {
    const { database, statements } = submission(pendingReceipt);
    const apply = vi.fn(async () => { throw 'string failure'; });
    const result = await pgSubmit(database, scope, syncBatch, { ...execution, ports: { itemApplier: { apply }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } } }, now);
    expect(result.receipt).toMatchObject({ status: 'open', items: [{ queueItemId: 'queue-1', status: 'pending', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' }] });
    const failure = statements.find(statement => statement.sql.includes('set status=$3,error_code=$4'))!;
    expect(failure.values.slice(0, 7)).toEqual([scope.tenantId, 'key-1', 'pending', 'OFFLINE_SYNC_ITEM_FAILED', now, 'device-1', 'pending']);
    expect(JSON.parse(failure.values[8] as string)).toEqual({ version: 1, receiptId: 'key-1', errorCode: 'OFFLINE_SYNC_ITEM_FAILED', errorMessage: 'string failure', attempts: 2, retryable: true });
    // A lease fenced before the receipt lock leaves no attempt count to record and surfaces the fencing error.
    const fenced = submission(pendingReceipt, (sql, calls) => sql.includes('set lease_expires_at=') && calls > 8 ? { rowCount: 0 } : undefined);
    await expect(pgSubmit(fenced.database, scope, syncBatch, { ...execution, ports: { itemApplier: { apply: vi.fn() }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } } }, now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    expect(fenced.statements.some(statement => statement.sql.includes('set status=$3,error_code=$4'))).toBe(false);
  });
});
