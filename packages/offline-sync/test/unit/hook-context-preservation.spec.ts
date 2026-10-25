import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity.js';
import type { StynxOfflineSyncModuleOptions, SubmitSyncBatchInput, SyncConflict } from '../../src/types.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const now = '2026-10-24T12:00:00.000Z';
const scope = { tenantId, actorId: 'actor' };
function batch(id: string, count = 1, payloadJson: Record<string, unknown> = { value: 1 }): SubmitSyncBatchInput {
  return { orgUnitId: 'org', deviceId: 'device', deviceBatchId: id, items: Array.from({ length: count }, (_, index) => ({ queueItemId: `${id}-${index}`, entityType: 'citation', localEntityId: `${id}-local-${index}`, idempotencyKey: `${id}-key-${index}`, payloadJson, payloadHash: canonicalOfflineSyncPayloadHash(payloadJson), createdLocallyAt: now })) };
}
function service(store: InMemoryOfflineSyncStore, options: Partial<StynxOfflineSyncModuleOptions> = {}) {
  return new OfflineSyncService(store, { current: () => scope }, { now: () => now, policyResolver: { resolve: async () => ({ maxBatchItems: 100 }) }, ...options });
}
function token(value: unknown) {
  expect(typeof value).toBe('object'); expect(value).not.toBeNull(); expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Reflect.ownKeys(Object(value))).toEqual(['token']); expect(Reflect.get(Object(value), 'token')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  for (const key of ['query', 'run', 'runGuarded', 'commit', 'rollback']) expect(Reflect.get(Object(value), key)).toBeUndefined();
}
async function seeded() {
  const store = new InMemoryOfflineSyncStore(); const subject = service(store); await subject.submitSyncBatch(batch('seed'));
  const conflict = await subject.openConflict('seed-0', { conflictType: 'version', description: 'stale' });
  return { store, conflict };
}

describe('actual Offline hook carriers before public context correction', () => {
  it('legacy resolver fallback gets a fresh empty object, original receiver, context and exact return identity', async () => {
    const { store, conflict } = await seeded(); Object.defineProperty(store, 'resolveWithPort', { value: undefined }); const carriers: unknown[] = [];
    const returned: SyncConflict = { ...conflict, status: 'resolved' };
    const resolver = { async resolve(trx: unknown, id: string, action: string, context: unknown) {
      expect(this).toBe(resolver); expect(id).toBe(conflict.conflictId); expect(action).toBe('server-wins');
      expect(context).toEqual({ ...scope, agentId: scope.actorId, orgUnitId: '', deviceId: '', batchId: '', now });
      expect(Object.getPrototypeOf(trx)).toBe(Object.prototype); expect(Reflect.ownKeys(Object(trx))).toEqual([]); carriers.push(trx); return returned;
    } };
    const subject = service(store, { conflictResolver: resolver });
    expect(await subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).toBe(returned);
    expect(await subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).toBe(returned);
    expect(carriers).toHaveLength(2); expect(carriers[0]).not.toBe(carriers[1]);
  });
  it('legacy fallback retains resolver error identity and has no invented SQL method', async () => {
    const { store, conflict } = await seeded(); Object.defineProperty(store, 'resolveWithPort', { value: undefined }); const error = new Error('resolver');
    const subject = service(store, { conflictResolver: { async resolve(trx: unknown) { expect(Reflect.get(Object(trx), 'query')).toBeUndefined(); throw error; } } });
    await expect(subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).rejects.toBe(error);
  });
  it('store specialization wins before fallback, but event requirement refuses when specialization is absent', async () => {
    const { store, conflict } = await seeded(); const resolver = { resolve: vi.fn(async () => conflict) }; const events = { appendInTransaction: vi.fn(async () => undefined), appendManyInTransaction: vi.fn(async () => undefined) };
    const specialized = vi.fn(async function (this: unknown, ...args: unknown[]) { expect(this).toBe(store); expect(args[0]).toBe(scope); expect(args[4]).toBe(resolver); expect(args[5]).toBe(events); return conflict; });
    Object.defineProperty(store, 'resolveWithPort', { value: specialized, configurable: true }); const subject = service(store, { conflictResolver: resolver, resolutionEventPort: events });
    expect(await subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).toBe(conflict); expect(resolver.resolve).not.toHaveBeenCalled();
    Object.defineProperty(store, 'resolveWithPort', { value: undefined });
    await expect(subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect(resolver.resolve).not.toHaveBeenCalled(); expect(events.appendInTransaction).not.toHaveBeenCalled();
  });
  it('memory conflict resolver and final event share one UUID carrier and original receivers in order', async () => {
    const { store, conflict } = await seeded(); const carriers: unknown[] = []; const order: string[] = [];
    const resolver = { async allowedActions(trx: unknown) { expect(this).toBe(resolver); token(trx); carriers.push(trx); order.push('allowed'); return ['server-wins']; }, async resolve(trx: unknown) { expect(this).toBe(resolver); expect(trx).toBe(carriers[0]); order.push('resolve'); return { ...conflict, status: 'resolved' as const }; } };
    const events = { async appendInTransaction(trx: unknown) { expect(this).toBe(events); expect(trx).toBe(carriers[0]); order.push('event'); }, appendManyInTransaction: vi.fn(async () => undefined) };
    const result = await service(store, { conflictResolver: resolver, resolutionEventPort: events }).resolveConflict(conflict.conflictId, { resolution: 'server-wins' });
    expect(result).toMatchObject({ status: 'resolved', conflictId: conflict.conflictId, resolvedBy: scope.actorId }); expect(order).toEqual(['allowed', 'resolve', 'event']); expect(events.appendManyInTransaction).not.toHaveBeenCalled();
  });
  for (const phase of ['allowed', 'resolve', 'event'] as const) it(`memory ${phase} error preserves identity and rolls back conflict mutation`, async () => {
    const { store, conflict } = await seeded(); const error = new Error(phase); const order: string[] = [];
    const resolver = { async allowedActions(trx: unknown) { token(trx); order.push('allowed'); if (phase === 'allowed') throw error; return ['server-wins']; }, async resolve() { order.push('resolve'); if (phase === 'resolve') throw error; return { ...conflict, status: 'resolved' as const }; } };
    const events = { async appendInTransaction() { order.push('event'); throw error; }, appendManyInTransaction: vi.fn(async () => undefined) };
    const subject = service(store, { conflictResolver: resolver, resolutionEventPort: events });
    await expect(subject.resolveConflict(conflict.conflictId, { resolution: 'server-wins' })).rejects.toBe(error);
    expect((await subject.listSyncConflicts({})).items[0]).toMatchObject({ conflictId: conflict.conflictId, status: 'open' });
    expect(order).toEqual(phase === 'allowed' ? ['allowed'] : phase === 'resolve' ? ['allowed', 'resolve'] : ['allowed', 'resolve', 'event']);
  });
  it('actual item pre-apply, handoff, applier, concurrency and event share a carrier per item, distinct across items', async () => {
    const store = new InMemoryOfflineSyncStore(); const carriers = new Map<string, unknown>(); const order: string[] = [];
    const detector = { async detect(trx: unknown, item: { queueItemId: string }) { expect(this).toBe(detector); token(trx); carriers.set(item.queueItemId, trx); order.push(`pre:${item.queueItemId}`); return item.queueItemId === 'items-1' ? { suspected: true, pairs: [{ firstItemId: 'items-1', secondItemId: 'items-0' }] } : { suspected: false, pairs: [] }; } };
    const handoff = { async permits(trx: unknown, pair: { firstItemId: string }) { expect(this).toBe(handoff); expect(trx).toBe(carriers.get(pair.firstItemId)); order.push('handoff'); return true; } };
    const applier = { async apply(trx: unknown, item: { queueItemId: string }) { expect(this).toBe(applier); expect(trx).toBe(carriers.get(item.queueItemId)); order.push(`apply:${item.queueItemId}`); return { serverEntityId: `server-${item.queueItemId}` }; } };
    const concurrency = { async detect(trx: unknown, item: { queueItemId: string }) { expect(this).toBe(concurrency); expect(trx).toBe(carriers.get(item.queueItemId)); order.push(`concurrency:${item.queueItemId}`); return { suspected: false, pairs: [] }; } };
    const events = { async appendInTransaction(trx: unknown) { expect(this).toBe(events); expect([...carriers.values()]).toContain(trx); order.push('event'); }, appendManyInTransaction: vi.fn(async () => undefined) };
    const result = await service(store, { policyResolver: { resolve: async () => ({ maxBatchItems: 100, concurrencyWindowMinutes: 5 }) }, preApplyDetector: detector, handoffPort: handoff, itemApplier: applier, concurrencyDetector: concurrency, eventPort: events }).submitSyncBatch(batch('items', 2));
    expect(result.items.map(item => item.status)).toEqual(['applied', 'applied']); expect(carriers.size).toBe(2); expect(carriers.get('items-0')).not.toBe(carriers.get('items-1'));
    expect(order).toEqual(['pre:items-0','apply:items-0','concurrency:items-0','event','pre:items-1','handoff','apply:items-1','concurrency:items-1','event']); expect(events.appendManyInTransaction).not.toHaveBeenCalled();
  });
  it('integrity rejection uses a separate token before storing conflict evidence and retains callback receiver', async () => {
    const store = new InMemoryOfflineSyncStore(); const itemCarriers: unknown[] = []; const integrityCarriers: unknown[] = [];
    const resolver = { async allowedActions(trx: unknown) { expect(this).toBe(resolver); token(trx); integrityCarriers.push(trx); expect(await store.listSyncConflicts(scope, {})).toMatchObject({ items: [] }); return ['reject']; }, async resolve(): Promise<SyncConflict> { throw new Error('not used'); } };
    const subject = service(store, { itemApplier: { async apply(trx: unknown) { token(trx); itemCarriers.push(trx); return { serverEntityId: 'server' }; } }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined }, conflictResolver: resolver });
    const first = batch('original'); expect((await subject.submitSyncBatch(first)).items[0]).toMatchObject({ status: 'applied' });
    const changed = batch('changed',1,{ value: 2 }); changed.items[0]!.idempotencyKey = first.items[0]!.idempotencyKey;
    expect((await subject.submitSyncBatch(changed)).items[0]).toMatchObject({ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' });
    expect(integrityCarriers).toHaveLength(1); expect(integrityCarriers[0]).not.toBe(itemCarriers[0]); expect((await subject.listSyncConflicts({})).items[0]).toMatchObject({ conflictType: 'integrity', status: 'open' });
  });
});
