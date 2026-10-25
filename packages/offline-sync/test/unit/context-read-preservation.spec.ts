import { HttpException } from '@nestjs/common';
import { boundedConsumerAttributes, recordedAttempts } from '../../src/stynx-context.js';
import { domainErrorContext } from '../../src/domain-error-context.js';
import { validRangeCreationEvidence, importDigest, importInstantMicroseconds } from '../../src/import-validation.js';

const at = '2026-10-25T00:00:00.000Z';
function receiptFixture() {
  const request = { tenantId: 'tenant', orgUnitId: 'org', entityType: 'citation', series: 'A', startNumber: 1, endNumber: 2 };
  const receipt = { id: 'range', ...request, nextNumber: 1, status: 'active', createdAt: at, createdBy: 'actor' };
  const row = { id: 'range', tenant_id: 'tenant', org_unit_id: 'org', entity_type: 'citation', series: 'A', start_number: 1,
    end_number: 2, consumer_attributes: null, created_by: 'actor', creation_key: 'key', creation_fingerprint: importDigest(request), creation_receipt: receipt };
  return { row, receipt };
}

describe('consumer attribute original serialization boundary', () => {
  it.each([null, [], 'text', 1, true, 1n, Symbol('value'), () => undefined].map((value) => ({ value })))('rejects the same outer domain: $value', ({ value }) => {
    expect(() => boundedConsumerAttributes(value)).toThrow(expect.objectContaining({ code: 'OFFLINE_SYNC_INVALID_INPUT' }));
  });
  it('preserves undefined and same shallow object/nested identity at exact byte limit', () => {
    expect(boundedConsumerAttributes(undefined)).toBeUndefined();
    const nested = {}; const value = { nested }; expect(boundedConsumerAttributes(value)).toBe(value); expect(value.nested).toBe(nested);
    const exact = { x: 'a'.repeat(4088) }; expect(Buffer.byteLength(JSON.stringify(exact))).toBe(4096);
    expect(boundedConsumerAttributes(exact)).toBe(exact);
    expect(() => boundedConsumerAttributes({ x: 'a'.repeat(4089) })).toThrow(expect.objectContaining({ code: 'OFFLINE_SYNC_INVALID_INPUT' }));
  });
  it.each([null, false, 1, 'text', [], {}].map((output) => ({ output })))('preserves original toJSON receiver and admits serialized $output', ({ output }) => {
    const calls: unknown[] = [];
    const value = { toJSON() { calls.push(this); return output; } };
    expect(boundedConsumerAttributes(value)).toBe(value); expect(calls).toEqual([value]);
  });
  it.each([undefined, Symbol('value'), () => undefined, 1n].map((output) => ({ output })))('retains native serialization/byte-length refusal: $output', ({ output }) => {
    const value = { toJSON: () => output }; let native: unknown;
    try { Buffer.byteLength(JSON.stringify(value)); } catch (error) { native = error; }
    expect(() => boundedConsumerAttributes(value)).toThrow(expect.objectContaining({ name: Reflect.get(native as object, 'name'), message: Reflect.get(native as object, 'message') }));
  });
  it('propagates getter errors and performs the one existing stringify traversal', () => {
    const sentinel = new Error('getter'); const value = { get x() { throw sentinel; } };
    expect(() => boundedConsumerAttributes(value)).toThrow(sentinel);
    const trace: string[] = []; const nested = { get inner() { trace.push('inner'); return 1; } };
    const normal = { get outer() { trace.push('outer'); return nested; } };
    expect(boundedConsumerAttributes(normal)).toBe(normal); expect(trace).toEqual(['outer', 'inner']);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => boundedConsumerAttributes(cycle)).toThrow(TypeError);
  });
});

describe('recorded attempts native optional reads', () => {
  it.each([undefined, null, false, 0, -1, 1.1, NaN, Infinity, '2', 2, Number.MAX_SAFE_INTEGER].map((value) => ({ value })))('retains numeric domain $value', ({ value }) => {
    const expected = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
    expect(recordedAttempts({ stynx: { attempts: value } })).toBe(expected);
  });
  it('reads inherited stynx and attempts once with their original receivers', () => {
    const trace: string[] = [];
    const platform = Object.create({ get attempts() { expect(this).toBe(platform); trace.push('attempts'); return 3; } });
    const stored = Object.create({ get stynx() { expect(this).toBe(stored); trace.push('stynx'); return platform; } });
    expect(recordedAttempts(stored)).toBe(3); expect(trace).toEqual(['stynx', 'attempts']);
  });
  it.each([undefined, null, false, 1, 'text', [], () => undefined].map((platform) => ({ platform })))('keeps boxed/nullish platform fallback $platform', ({ platform }) => {
    expect(recordedAttempts({ stynx: platform })).toBe(0);
  });
  it('uses primitive receiver and propagates thrown getter identity', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, 'attempts'); let reads = 0;
    Object.defineProperty(Number.prototype, 'attempts', { configurable: true, get() { expect(this).toBe(7); reads++; return 4; } });
    try { expect(recordedAttempts({ stynx: 7 })).toBe(4); expect(reads).toBe(1); }
    finally { if (descriptor) Object.defineProperty(Number.prototype, 'attempts', descriptor); else Reflect.deleteProperty(Number.prototype, 'attempts'); }
    const sentinel = new Error('attempt getter'); expect(() => recordedAttempts({ stynx: { get attempts() { throw sentinel; } } })).toThrow(sentinel);
  });
});

describe('domain context original shallow proof and serialization', () => {
  it('retains response priority, same descriptor rules and detached valid clone', () => {
    const value = { nested: { x: 1 } }; const result = domainErrorContext({ context: value });
    expect(result).toEqual({ valid: true, context: value }); expect(result.context).not.toBe(value);
    const error = Object.assign(new HttpException({ context: { response: 1 } }, 409), { context: { fallback: 2 } });
    expect(domainErrorContext(error)).toEqual({ valid: true, context: { response: 1 } });
    expect(domainErrorContext(Object.create({ context: value }))).toEqual({ valid: false });
    const getter = vi.fn(() => value); expect(domainErrorContext(Object.defineProperty({}, 'context', { get: getter }))).toEqual({ valid: false }); expect(getter).not.toHaveBeenCalled();
    expect(domainErrorContext(Object.defineProperty({}, 'context', { value }))).toEqual({ valid: true, context: value });
  });
  it.each([null, [], 'text', Object.create(null), { stynx: {} }, { x: 1n }].map((context) => ({ context })))('retains invalid context refusal $context', ({ context }) => {
    expect(domainErrorContext({ context })).toEqual({ valid: false });
  });
  it.each([null, 7, 'text', [], { changed: true }].map((output) => ({ output })))('records original Proxy toJSON divergence without strengthening output: $output', ({ output }) => {
    const trace: string[] = [];
    const value = new Proxy({ x: 1 }, {
      get(target, key, receiver) { trace.push(`get:${String(key)}`); if (key === 'toJSON') return function () { expect(this).toBe(value); trace.push('toJSON'); return output; }; return Reflect.get(target, key, receiver); },
      getOwnPropertyDescriptor(target, key) { trace.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
      ownKeys(target) { trace.push('keys'); return Reflect.ownKeys(target); },
    });
    expect(domainErrorContext({ context: value })).toEqual({ valid: true, context: output });
    expect(trace.indexOf('descriptor:x')).toBeLessThan(trace.indexOf('get:toJSON'));
    expect(trace.filter((entry) => entry === 'toJSON')).toHaveLength(1);
  });
});

describe('range receipt repeated original reads', () => {
  it('preserves ordinary receipt digest/timestamp and initial guard short circuits', () => {
    const { row } = receiptFixture(); expect(validRangeCreationEvidence(row, importInstantMicroseconds(at))).toBe(true);
    let reads = 0; const absent = { ...row, created_by: null, get creation_receipt() { reads++; return {}; } };
    expect(validRangeCreationEvidence(absent as never, 0n)).toBe(false); expect(reads).toBe(0);
  });
  it.each([null, undefined, 3, 'primitive', false, [], () => undefined].map((fourth) => ({ fourth })))('preserves changing fourth captured receipt $fourth', ({ fourth }) => {
    const { row, receipt } = receiptFixture(); let reads = 0;
    const value = { ...row, get creation_receipt() { return ++reads === 4 ? fourth : receipt; } };
    expect(validRangeCreationEvidence(value as never, importInstantMicroseconds(at))).toBe(false); expect(reads).toBe(4);
  });
  it.each(['ordinary', 'second-nonstring', 'second-throw', 'third-different'] as const)('retains all createdAt getter positions: %s', (kind) => {
    const { row, receipt } = receiptFixture(); const trace: string[] = []; let reads = 0;
    Object.defineProperty(receipt, 'createdAt', { enumerable: true, get() { expect(this).toBe(receipt); trace.push(`at${++reads}`); if (kind === 'second-throw' && reads === 2) throw new Error('second'); if (kind === 'second-nonstring' && reads === 2) return 7; return kind === 'third-different' && reads === 3 ? 'different' : at; } });
    expect(validRangeCreationEvidence(row, importInstantMicroseconds(at))).toBe(false);
    expect(trace).toEqual(kind.startsWith('second') ? ['at1', 'at2'] : ['at1', 'at2', 'at3']);
  });
});

import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';

async function conflictFixture() {
  const store = new InMemoryOfflineSyncStore(); const scope = { tenantId: 'tenant', actorId: 'actor' };
  await store.submitSyncBatch(scope, { orgUnitId: 'org', deviceId: 'device', deviceBatchId: 'batch', items: [{
    queueItemId: 'queue', entityType: 'citation', localEntityId: 'local', idempotencyKey: 'item', payloadHash: 'hash', payloadJson: {}, createdLocallyAt: at,
  }] }, at);
  const conflict = await store.openConflict(scope, 'queue', { conflictType: 'domain', description: 'original' }, at);
  return { store, scope, conflict };
}

describe('actual memory resolution includes operation', () => {
  it.each([true, {}, 1, 'yes', false, 0, '', null, undefined].map((returned) => ({ returned })))('retains custom includes truthiness $returned and original receiver', async ({ returned }) => {
    const { store, scope, conflict } = await conflictFixture(); const trace: string[] = [];
    const allowed = Object.create({ get includes() { expect(this).toBe(allowed); trace.push('includes-get'); return function (this: unknown, action: unknown) { expect(this).toBe(allowed); expect(action).toBe('manual-review'); trace.push('includes-call'); return returned; }; } });
    const input = { get resolution() { trace.push('resolution'); return 'manual-review'; } };
    let callbackContext: unknown; let callbackTrx: unknown;
    const port = {
      allowedActions: async (trx: unknown, _id: string, context: unknown) => { callbackContext = context; callbackTrx = trx; trace.push('allowed'); return allowed; },
      resolve: vi.fn(async (trx: unknown, _id: string, action: unknown, context: unknown) => { expect(trx).toBe(callbackTrx); expect(context).toBe(callbackContext); expect(action).toBe('manual-review'); trace.push('resolve'); return { ...conflict, status: 'open' as const }; }),
    };
    const result = store.resolveWithPort(scope, conflict.conflictId, input as never, at, port);
    if (returned) { await expect(result).resolves.toMatchObject({ status: 'open' }); expect(trace.slice(0, 6)).toEqual(['allowed', 'includes-get', 'resolution', 'includes-call', 'resolution', 'resolve']); }
    else { await expect(result).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' }); expect(trace).toEqual(['allowed', 'includes-get', 'resolution', 'includes-call']); expect(port.resolve).not.toHaveBeenCalled(); }
  });
  it.each([{}, 7, false, { includes: null }, { includes: true }].map((allowed) => ({ allowed })))('evaluates argument before native noncallable failure: $allowed', async ({ allowed }) => {
    const { store, scope, conflict } = await conflictFixture(); const trace: string[] = [];
    const port = { allowedActions: async () => allowed as never, resolve: vi.fn() };
    await expect(store.resolveWithPort(scope, conflict.conflictId, { get resolution() { trace.push('resolution'); return 'manual-review'; } } as never, at, port))
      .rejects.toThrow('allowed.includes is not a function');
    expect(trace).toEqual(['resolution']); expect(port.resolve).not.toHaveBeenCalled();
  });
  it.each(['allowed', 'includes-get', 'includes-call', 'resolution'] as const)('propagates original %s error identity at exact position', async (position) => {
    const { store, scope, conflict } = await conflictFixture(); const trace: string[] = []; const sentinel = new Error(position);
    const allowed = { get includes() { trace.push('includes-get'); if (position === 'includes-get') throw sentinel; return () => { trace.push('includes-call'); throw sentinel; }; } };
    const port = { allowedActions: async () => { trace.push('allowed'); if (position === 'allowed') throw sentinel; return allowed as never; }, resolve: vi.fn() };
    const input = { get resolution() { trace.push('resolution'); if (position === 'resolution') throw sentinel; return 'manual-review'; } };
    await expect(store.resolveWithPort(scope, conflict.conflictId, input as never, at, port)).rejects.toBe(sentinel);
    const order = ['allowed', 'includes-get', 'resolution', 'includes-call']; expect(trace).toEqual(order.slice(0, order.indexOf(position) + 1)); expect(port.resolve).not.toHaveBeenCalled();
  });
  it.each([undefined, null, 'manual-review', ['manual-review']].map((allowed) => ({ allowed })))('retains defaults and native selected receiver $allowed', async ({ allowed }) => {
    const { store, scope, conflict } = await conflictFixture(); const resolve = vi.fn(async () => ({ ...conflict, status: 'open' as const }));
    await expect(store.resolveWithPort(scope, conflict.conflictId, { resolution: 'manual-review' }, at, { allowedActions: async () => allowed as never, resolve }))
      .resolves.toMatchObject({ status: 'open' }); expect(resolve).toHaveBeenCalledTimes(1);
  });
});

import { validateOfflineImportManifest } from '../../src/import-validation.js';
import { importManifest, rehashManifest } from '../support/offline-import-fixtures.js';

describe('original terminal context and ownership order', () => {
  for (const kind of ['receipts', 'attempts'] as const) {
    it.each([
      { name: 'absent', platform: {}, status: 'received', accepted: true },
      { name: 'null', platform: null, status: 'received', accepted: true },
      { name: 'primitive', platform: 7, status: 'received', accepted: true },
      { name: 'array', platform: [], status: 'received', accepted: true },
      { name: 'valid', platform: { terminalReceived: true, version: 1, retryable: false }, status: 'received', accepted: true },
      { name: 'false', platform: { terminalReceived: false, version: 1, retryable: false }, status: 'received', accepted: false },
      { name: 'version', platform: { terminalReceived: true, version: 2, retryable: false }, status: 'received', accepted: false },
      { name: 'retryable', platform: { terminalReceived: true, version: 1, retryable: true }, status: 'received', accepted: false },
      { name: 'status', platform: { terminalReceived: true, version: 1, retryable: false }, status: 'rejected', accepted: false },
    ])(`${kind} terminal $name preserves original admission`, ({ platform, status, accepted }) => {
      const manifest = importManifest(); const record = manifest.records.find((entry) => entry.kind === kind)!;
      Object.assign(record.row, { context_json: { stynx: platform }, status });
      const hashed = rehashManifest(manifest);
      if (accepted) expect(validateOfflineImportManifest(hashed)).toEqual(hashed);
      else expect(() => validateOfflineImportManifest(hashed)).toThrow(expect.objectContaining({ reason: 'invalid-manifest' }));
    });
  }
  it('checks mutation owner after allowedActions await before includes and argument', async () => {
    const { store, scope, conflict } = await conflictFixture(); const trace: string[] = [];
    const allowed = { get includes() { trace.push('includes'); return () => true; } };
    const port = { allowedActions: async () => { trace.push('allowed'); scope.tenantId = 'different'; return allowed as never; }, resolve: vi.fn() };
    await expect(store.resolveWithPort(scope, conflict.conflictId, { get resolution() { trace.push('resolution'); return 'manual-review'; } }, at, port))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE', message: 'Memory transaction ownership is no longer valid for this tenant.' });
    expect(trace).toEqual(['allowed']); expect(port.resolve).not.toHaveBeenCalled();
  });
  it('preserves primitive fourth receipt receiver and three later createdAt reads', () => {
    const { row, receipt } = receiptFixture(); let receiptReads = 0; let dateReads = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, 'createdAt');
    Object.defineProperty(Number.prototype, 'createdAt', { configurable: true, get() { expect(this).toBe(7); dateReads++; return at; } });
    try {
      const value = { ...row, get creation_receipt() { return ++receiptReads === 4 ? 7 : receipt; } };
      expect(validRangeCreationEvidence(value as never, importInstantMicroseconds(at))).toBe(false);
      expect(receiptReads).toBe(4); expect(dateReads).toBe(3);
    } finally { if (descriptor) Object.defineProperty(Number.prototype, 'createdAt', descriptor); else Reflect.deleteProperty(Number.prototype, 'createdAt'); }
  });
});
