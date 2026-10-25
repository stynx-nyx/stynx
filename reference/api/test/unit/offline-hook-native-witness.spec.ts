import { describe, expect, it } from 'vitest';
import { Transaction } from '@stynx-nyx/data';
import type { CTG9SyncBatchItemInput, OfflineSyncEvent, OfflineSyncItemContext } from '@stynx-nyx/offline-sync';
import { createOfflineBookmarkApplicationPorts } from '../../src/performance/offline-bookmark.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const context: OfflineSyncItemContext = { tenantId, actorId, agentId: actorId, orgUnitId: 'org', deviceId: 'device', batchId: 'batch', receiptId: 'receipt', now: '2026-10-24T12:00:00.000Z' };
const payload = { operation: 'create', url: 'https://example.invalid/' };
const item: CTG9SyncBatchItemInput = { queueItemId: 'item', entityType: 'demo.bookmark', localEntityId: 'local', idempotencyKey: 'key', payloadJson: payload, payloadHash: 'hash', createdLocallyAt: context.now };
function setup() {
  const calls: string[] = [];
  const bindings: unknown[][] = [];
  const state: { identity: string; beforeIdentity?: () => Promise<void> } = { identity: '101' };
  const client = { async query(text: string, params: unknown[]) {
    calls.push(text); bindings.push(params);
    if (text.includes('pg_current_xact_id')) {
      await state.beforeIdentity?.();
      return { rows: [{ sql_role: 'stynx_app', role: 'app', tenant: tenantId, actor: actorId, isolation: 'read committed', readonly: 'off', transaction_id: state.identity }] };
    }
    if (text.startsWith('insert into demo.')) return { rows: [{ id: params[0] }] };
    if (text.includes('context_json')) return { rows: [{ attempts: 1 }] };
    throw new Error(`unexpected query: ${text}`);
  } };
  const created: unknown = Reflect.construct(Transaction, [client, {}, 'app', undefined, true]);
  if (!(created instanceof Transaction)) throw new Error('native Transaction construction failed');
  return { tx: created, calls, bindings, state, ports: createOfflineBookmarkApplicationPorts() };
}
async function applied() {
  const result = setup(); const row = await result.ports.itemApplier.apply(result.tx, item, context);
  const event: OfflineSyncEvent = { entity: 'demo.bookmark', entityId: row.serverEntityId, idempotencyKey: 'receipt', payload };
  result.calls.length = 0;
  return { ...result, event };
}
describe('Offline native reference witness ordering', () => {
  it('validates payload before rejecting a non-native context and performs no SQL', async () => {
    const { ports, calls } = setup();
    await expect(ports.itemApplier.apply({}, { ...item, payloadJson: { operation: 'bad' } }, context)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_BOOKMARK_PAYLOAD_UNSUPPORTED' });
    await expect(ports.itemApplier.apply({ token: 'opaque' }, item, context)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_BOOKMARK_CONTEXT_REQUIRED' });
    expect(calls).toEqual([]);
  });
  it('uses the real native transaction and exact insert parameter identity', async () => {
    const { tx, ports, calls, bindings } = setup();
    expect(tx).toBeInstanceOf(Transaction);
    const result = await ports.itemApplier.apply(tx, item, context);
    expect(result.serverEntityId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(calls).toHaveLength(2); expect(calls[0]).toContain('pg_current_xact_id'); expect(calls[1]).toContain('returning id::text');
    expect(bindings).toEqual([[], [result.serverEntityId, tenantId, actorId, payload.url, null, null, context.now]]);
  });
  it('refuses another carrier before any identity query', async () => {
    const { ports, event, calls } = await applied();
    await expect(ports.eventPort.appendInTransaction({ token: 'other' }, event)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_BOOKMARK_EVENT_MISMATCH' });
    expect(calls).toEqual([]);
  });
  it('preserves prefix getters before awaited identity, and does not re-read prefix after mutation', async () => {
    const { tx, ports, event, calls, state } = await applied(); const order: string[] = [];
    let currentPayload: unknown = payload;
    Object.defineProperty(event, 'payload', { get() { expect(this).toBe(event); order.push('payload'); return currentPayload; } });
    state.beforeIdentity = async () => { order.push('identity'); await Promise.resolve(); currentPayload = { changed: true }; state.identity = 'different'; order.push('resume'); };
    await expect(ports.eventPort.appendInTransaction(tx, event)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_BOOKMARK_EVENT_MISMATCH' });
    expect(order).toEqual(['payload', 'identity', 'resume']); expect(calls).toHaveLength(1); expect(calls[0]).toContain('pg_current_xact_id');
  });
  it('preserves prefix getter failure identity before SQL', async () => {
    const { tx, ports, event, calls } = await applied(); const error = new Error('payload-getter');
    Object.defineProperty(event, 'payload', { get() { expect(this).toBe(event); throw error; } });
    await expect(ports.eventPort.appendInTransaction(tx, event)).rejects.toBe(error); expect(calls).toEqual([]);
  });
  it('preserves awaited native identity failure before receipt reads', async () => {
    const { tx, ports, event, calls, state } = await applied(); const error = new Error('identity-query');
    state.beforeIdentity = async () => { await Promise.resolve(); throw error; };
    await expect(ports.eventPort.appendInTransaction(tx, event)).rejects.toBe(error); expect(calls).toHaveLength(1); expect(calls[0]).toContain('pg_current_xact_id');
  });
});
