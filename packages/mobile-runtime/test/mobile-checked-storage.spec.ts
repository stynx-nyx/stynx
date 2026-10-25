import assert from 'node:assert/strict';
import { it as test } from 'vitest';
import * as api from '../src/index.js';
import { OfflineFirstMobileRuntime } from '../src/runtime.js';
import type {
  MobileRuntimeCheckedOptions,
  MobileDevicePosture,
  CreateMobileDraftInput,
} from '../src/types.js';
import type { MobileEncryptedStorePort } from '../src/ports.js';
import {
  InMemoryEncryptedMobileStore,
  SimulatedMobilePrinterPort,
  SandboxMobileBackendClient,
  SandboxStynxMobileSessionPort,
  NodeMobileCryptoPort,
  FixedMobileClock,
  SequentialMobileIdPort,
} from '../src/testing.js';

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
}
function record(value: unknown): Record<PropertyKey, unknown> {
  assert.ok(isRecord(value));
  return value;
}
function string(value: unknown): string {
  assert.ok(typeof value === 'string');
  return value;
}

class RawStore implements MobileEncryptedStorePort {
  readonly adapterName = 'Inspector raw identity store';
  readonly encryptionScope = 'device';
  readonly securityLevel = 'software-sealed';
  encrypted = true;
  rows = new Map<string, Map<string, unknown>>();
  trace: [string, ...string[]][] = [];
  lists = new Map<string, unknown[]>();
  async get(c: string, k: string): Promise<unknown> {
    this.trace.push(['get', c, k]);
    return this.rows.get(c)?.get(k);
  }
  async put<T>(c: string, k: string, v: T): Promise<void> {
    this.trace.push(['put', c, k]);
    let m = this.rows.get(c);
    if (!m) this.rows.set(c, (m = new Map()));
    m.set(k, v);
  }
  async list(c: string): Promise<unknown[]> {
    this.trace.push(['list', c]);
    return this.lists.get(c) ?? [...(this.rows.get(c)?.values() ?? [])];
  }
  async remove(c: string, k: string): Promise<void> {
    this.trace.push(['remove', c, k]);
    this.rows.get(c)?.delete(k);
  }
  async clear() {
    this.trace.push(['clear']);
    this.rows.clear();
  }
}
const posture: MobileDevicePosture = {
  homologated: true,
  remoteWipeVersion: 2,
  secureHardwareBacked: true,
  printerStatus: 'paired',
  networkStatus: 'limited',
};
function make(
  store = new RawStore(),
  options: MobileRuntimeCheckedOptions<string> = {
    entityTypes: ['specific'],
    requireEvidenceToFinalize: false,
  },
) {
  const backend = new SandboxMobileBackendClient(),
    clock = new FixedMobileClock(),
    ids = new SequentialMobileIdPort();
  const runtime = new OfflineFirstMobileRuntime(
    store,
    backend,
    new NodeMobileCryptoPort(),
    clock,
    ids,
    undefined,
    options,
  );
  return { store, backend, clock, ids, runtime };
}
function makeRaw(store: RawStore, options: unknown) {
  const backend = new SandboxMobileBackendClient();
  const clock = new FixedMobileClock();
  const ids = new SequentialMobileIdPort();
  const runtime: unknown = Reflect.construct(OfflineFirstMobileRuntime, [
    store,
    backend,
    new NodeMobileCryptoPort(),
    clock,
    ids,
    undefined,
    options,
  ]);
  assert.ok(runtime instanceof OfflineFirstMobileRuntime);
  return { store, backend, clock, ids, runtime };
}
async function fresh() {
  const h = make();
  await h.runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), posture);
  await h.runtime.installPublishedNormativePackage();
  await h.runtime.reserveNumbering({ entityType: 'specific', requestedSize: 2 });
  const input: CreateMobileDraftInput = {
    entityType: 'specific',
    payload: { value: 1 },
    observedAt: h.clock.now(),
    location: {
      latitude: 1,
      longitude: 2,
      accuracyMeters: 3,
      capturedAt: h.clock.now(),
      source: 'gps',
    },
  };
  const draft = await h.runtime.createDraft(input);
  return { ...h, input, draft };
}
const evidence: Omit<import('../src/types.js').MobileEvidenceDraft, 'linkedLocalEntityId'> = {
  localEvidenceId: 'evidence',
  hashAlgorithm: 'sha256',
  hashValue: 'sha256:value',
  mediaType: 'image/jpeg',
  capturedAt: 'not-a-new-date-restriction',
};
const noWrites = (h: { store: RawStore }) =>
  h.store.trace.every((x) => !['put', 'clear', 'remove'].includes(x[0]));
async function rejected(work: () => Promise<unknown>, collection: string) {
  await assert.rejects(
    work,
    (e) => e instanceof TypeError && e.message === 'Invalid stored mobile record: ' + collection,
  );
}
test('constructor keeps encryption priority and captures vocabulary by length/index', async () => {
  const order: string[] = [],
    v: unknown[] = ['specific'];
  Object.defineProperty(v, 0, {
    get() {
      order.push('entity0');
      v.push(7);
      return 'specific';
    },
    configurable: true,
  });
  const options = {
    get requiredRoles() {
      order.push('roles');
      return [];
    },
    get requireEvidenceToFinalize() {
      order.push('evidence');
      return false;
    },
    get draftIdPrefix() {
      order.push('prefix');
      return 'item';
    },
    get entityTypes() {
      order.push('types');
      return v;
    },
  };
  const h = makeRaw(new RawStore(), options);
  assert.deepEqual(order, ['roles', 'evidence', 'prefix', 'types', 'entity0']);
  Object.defineProperty(v, 0, { value: 'other' });
  await h.runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), posture);
  await h.runtime.installPublishedNormativePackage();
  await h.runtime.reserveNumbering({ entityType: 'specific', requestedSize: 1 });
  const d = await h.runtime.createDraft({
    entityType: 'specific',
    payload: {},
    observedAt: h.clock.now(),
    location: { latitude: 0, longitude: 0, accuracyMeters: 0, capturedAt: '', source: 'gps' },
  });
  assert.equal((await h.runtime.finalizeOffline(d.localId)).entityType, 'specific');
  const store = new RawStore();
  store.encrypted = false;
  assert.throws(() => makeRaw(store, options), /encrypted local store/);
  assert.equal(order.length, 5);
  for (const types of [undefined, {}, new Array(1), [3]])
    assert.throws(
      () => makeRaw(new RawStore(), { entityTypes: types }),
      (e) => e instanceof TypeError && e.message === 'Invalid mobile runtime entityTypes',
    );
  make(new RawStore(), { entityTypes: [] });
  make(new RawStore(), { entityTypes: ['specific', 'specific'] });
});
test('all six DTO families reject malformed raw records before effects', async () => {
  for (const c of [
    'session',
    'device',
    'normative-package',
    'numbering-reservation',
    'entity-draft',
    'sync-queue',
  ]) {
    const h = await fresh();
    const session = record(await h.store.get('session', 'active'));
    if (c === 'session') await h.store.put(c, 'active', {});
    if (c === 'device') await h.store.put(c, string(session.deviceId), {});
    if (c === 'normative-package') await h.store.put(c, 'active', {});
    if (c === 'numbering-reservation') h.store.lists.set(c, [{}]);
    if (c === 'entity-draft') await h.store.put(c, h.draft.localId, {});
    if (c === 'sync-queue') h.store.lists.set(c, [{}]);
    h.store.trace = [];
    const work =
      c === 'numbering-reservation'
        ? () => h.runtime.createDraft(h.input)
        : c === 'entity-draft'
          ? () => h.runtime.attachEvidence(h.draft.localId, evidence)
          : c === 'sync-queue'
            ? () => h.runtime.submitPendingQueue()
            : () => h.runtime.snapshot();
    await rejected(work, c);
    assert.ok(noWrites(h), c);
  }
});
test('object snapshots materialize inherited fields once and preserve extra opaque symbols', async () => {
  const h = await fresh(),
    base = record(await h.store.get('session', 'active')),
    extra = {},
    symbol = Symbol('extra');
  let reads = 0;
  const source: Record<PropertyKey, unknown> = { ...base };
  delete source.tenantId;
  Object.setPrototypeOf(source, {
    get tenantId() {
      assert.equal(this, source);
      reads++;
      return base.tenantId;
    },
  });
  source.extra = extra;
  source[symbol] = extra;
  await h.store.put('session', 'active', source);
  const snapshot = record((await h.runtime.snapshot()).activeSession);
  assert.equal(reads, 1);
  assert.notEqual(snapshot, source);
  assert.equal(Object.hasOwn(snapshot, 'tenantId'), true);
  assert.equal(snapshot.extra, extra);
  assert.equal(snapshot[symbol], extra);
  assert.notEqual(snapshot.roles, source.roles);
});
test('optional absent survives while each present undefined representation refuses', async () => {
  for (const shape of ['absent', 'own', 'inherited', 'nonenumerable', 'valid']) {
    const h = await fresh();
    const d: Record<string, unknown> = { ...h.draft };
    let reads = 0;
    if (shape === 'own') d.finalizedAt = undefined;
    if (shape === 'inherited') Object.setPrototypeOf(d, { finalizedAt: undefined });
    if (shape === 'nonenumerable') Object.defineProperty(d, 'finalizedAt', { value: undefined });
    if (shape === 'valid')
      Object.defineProperty(d, 'finalizedAt', {
        get() {
          assert.equal(this, d);
          reads++;
          return 'opaque-date-text';
        },
      });
    await h.store.put('entity-draft', h.draft.localId, d);
    h.store.trace = [];
    if (['own', 'inherited', 'nonenumerable'].includes(shape)) {
      await rejected(() => h.runtime.attachEvidence(h.draft.localId, evidence), 'entity-draft');
      assert.ok(noWrites(h));
    } else {
      const out = await h.runtime.attachEvidence(h.draft.localId, evidence);
      assert.equal(Object.hasOwn(out, 'finalizedAt'), shape === 'valid');
      if (shape === 'valid') {
        assert.equal(out.finalizedAt, 'opaque-date-text');
        assert.equal(reads, 1);
      }
    }
  }
});
test('structural roles ignore shadow methods/extras, capture length, and reject sparse positions', async () => {
  const h = await fresh(),
    s = record(await h.store.get('session', 'active')),
    roles: unknown[] = ['field-agent'];
  let gets = 0;
  for (const key of ['map', 'every', 'filter', Symbol.iterator, Symbol('extra')])
    Object.defineProperty(roles, key, {
      get() {
        throw new Error('array extra must not be read');
      },
      enumerable: true,
    });
  Object.defineProperty(roles, 0, {
    get() {
      gets++;
      roles.push(7);
      return 'field-agent';
    },
    configurable: true,
  });
  await h.store.put('session', 'active', { ...s, roles });
  const out = record((await h.runtime.snapshot()).activeSession).roles;
  assert.deepEqual(out, ['field-agent']);
  assert.equal(gets, 1);
  assert.equal(record(await h.store.get('session', 'active')).roles, roles);
  await h.store.put('session', 'active', { ...s, roles: new Array(1) });
  await rejected(() => h.runtime.snapshot(), 'session');
  const sentinel = new Error('index sentinel'),
    throwing: unknown[] = [];
  Object.defineProperty(throwing, 0, {
    get() {
      throw sentinel;
    },
  });
  await h.store.put('session', 'active', { ...s, roles: throwing });
  await assert.rejects(
    () => h.runtime.snapshot(),
    (e) => e === sentinel,
  );
});
test('draft snapshots copy declared nested structures while opaque payload identity survives', async () => {
  const h = await fresh(),
    payload = { opaque: true },
    extra = {},
    symbol = Symbol('draft-extra');
  const d = { ...h.draft, payload, evidence: [{ ...evidence }], extra, [symbol]: extra };
  await h.store.put('entity-draft', h.draft.localId, d);
  const out = await h.runtime.attachEvidence(d.localId, { ...evidence, localEvidenceId: 'second' });
  assert.equal(out.payload, payload);
  assert.equal(record(out).extra, extra);
  assert.equal(record(out)[symbol], extra);
  assert.notEqual(out.location, d.location);
  assert.notEqual(out.evidence, d.evidence);
  assert.notEqual(out.evidence[0], d.evidence[0]);
  assert.deepEqual(out.evidence[0], d.evidence[0]);
});
test('queue validates every list entry before writes and keeps opaque payloadJson identity', async () => {
  const h = await fresh();
  await h.runtime.finalizeOffline(h.draft.localId);
  const q = await h.runtime.enqueue(h.draft.localId);
  const payload = q.payloadJson;
  h.store.lists.set('sync-queue', [q, { status: 'received' }]);
  h.store.trace = [];
  await rejected(() => h.runtime.submitPendingQueue(), 'sync-queue');
  assert.ok(noWrites(h));
  assert.equal(h.backend.submittedBatches.length, 0);
  h.store.lists.delete('sync-queue');
  await h.runtime.submitPendingQueue();
  assert.equal(h.backend.submittedBatches[0]!.items[0]!.payloadJson, payload);
});
test('checked numbers retain NaN and Infinity without new finiteness rules', async () => {
  const h = await fresh(),
    s = record(await h.store.get('session', 'active'));
  for (const value of [NaN, Infinity, -Infinity]) {
    await h.store.put('device', string(s.deviceId), { ...posture, remoteWipeVersion: value });
    assert.ok(
      Object.is(record((await h.runtime.snapshot()).devicePosture).remoteWipeVersion, value),
    );
  }
});
test('snapshot status-only and count-only collections retain their narrow read behavior', async () => {
  const h = make();
  let reads = 0;
  const draft = {
    get status() {
      reads++;
      return 'draft';
    },
  };
  h.store.lists.set('entity-draft', [draft, 3]);
  h.store.lists.set('sync-queue', [{ status: 'pending' }]);
  const counts: unknown[] = new Array(2);
  Object.defineProperty(counts, 0, {
    get() {
      throw Error('count-only element');
    },
  });
  for (const c of ['evidence', 'print-receipt', 'sync-conflict-resolution', 'wipe-receipt'])
    h.store.lists.set(c, counts);
  const out = await h.runtime.snapshot();
  assert.equal(reads, 1);
  assert.equal(out.draftCount, 1);
  assert.equal(out.queuedCount, 1);
  assert.equal(out.evidenceCount, 2);
  assert.equal(out.printReceiptCount, 2);
  assert.equal(out.conflictResolutionCount, 2);
  assert.equal(out.pendingWipe, true);
  assert.equal(await h.store.list('evidence'), counts);
  h.store.lists.set('entity-draft', [null]);
  await assert.rejects(
    () => h.runtime.snapshot(),
    (e) =>
      e instanceof TypeError && e.message === "Cannot read properties of null (reading 'status')",
  );
});
test('storage/getter failures retain identity and invalid session prevents wipe', async () => {
  const h = await fresh(),
    sentinel = new Error('store sentinel');
  h.store.get = async () => {
    throw sentinel;
  };
  await assert.rejects(
    () => h.runtime.snapshot(),
    (e) => e === sentinel,
  );
  const j = await fresh();
  await j.store.put('session', 'active', {});
  j.store.trace = [];
  await rejected(() => j.runtime.applyRemoteWipe('reason'), 'session');
  assert.ok(noWrites(j));
  const k = await fresh(),
    s = record(await k.store.get('session', 'active'));
  Object.defineProperty(s, 'tenantId', {
    enumerable: true,
    get() {
      throw sentinel;
    },
  });
  await assert.rejects(
    () => k.runtime.snapshot(),
    (e) => e === sentinel,
  );
});
test('stored draft and queue entity vocabularies are checked without coercion', async () => {
  const h = await fresh();
  await h.store.put('entity-draft', h.draft.localId, { ...h.draft, entityType: 'other' });
  await rejected(() => h.runtime.attachEvidence(h.draft.localId, evidence), 'entity-draft');
  await h.store.put('entity-draft', h.draft.localId, h.draft);
  await h.runtime.finalizeOffline(h.draft.localId);
  const q = await h.runtime.enqueue(h.draft.localId);
  await h.store.put('sync-queue', q.queueItemId, { ...q, entityType: 'other' });
  h.store.trace = [];
  await rejected(() => h.runtime.submitPendingQueue(), 'sync-queue');
  assert.ok(noWrites(h));
  assert.equal('checkedSession' in api, false);
  assert.equal('checkedDraft' in api, false);
});

test('raw encrypted-store Date serialization remains unknown JSON, not reconstructed Date', async () => {
  const store = new InMemoryEncryptedMobileStore();
  const date = new Date('2026-10-25T00:00:00.000Z');
  await store.put<Date>('dates', 'one', date);
  const raw: unknown = await store.get('dates', 'one');
  const list: unknown[] = await store.list('dates');
  assert.equal(raw instanceof Date, false);
  assert.equal(raw, date.toISOString());
  assert.deepEqual(list, [date.toISOString()]);
});

test('fresh specific runtime carries serialized scalar payload through evidence, queue, printer and backend', async () => {
  const store = new InMemoryEncryptedMobileStore();
  const backend = new SandboxMobileBackendClient<'specific'>();
  const clock = new FixedMobileClock();
  const ids = new SequentialMobileIdPort();
  const printerPayloads: unknown[] = [];
  class RecordingPrinter extends SimulatedMobilePrinterPort {
    override async printReceipt(input: Parameters<SimulatedMobilePrinterPort['printReceipt']>[0]) {
      printerPayloads.push(input.draft.payload);
      return super.printReceipt(input);
    }
  }
  const printer = new RecordingPrinter(clock, ids);
  const crypto = new NodeMobileCryptoPort();
  const first = new OfflineFirstMobileRuntime<'specific'>(
    store,
    backend,
    crypto,
    clock,
    ids,
    printer,
    { entityTypes: ['specific'] },
  );
  await first.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), posture);
  await first.installPublishedNormativePackage();
  await first.reserveNumbering({ entityType: 'specific', requestedSize: 1 });
  const payload: Record<string, unknown> = {
    value: 'original',
    toJSON() {
      return 'serialized payload';
    },
  };
  const created = await first.createDraft({
    entityType: 'specific',
    payload,
    observedAt: clock.now(),
    location: {
      latitude: 1,
      longitude: 2,
      accuracyMeters: 3,
      capturedAt: clock.now(),
      source: 'gps',
    },
  });
  assert.equal(typeof created.payload, 'object');
  assert.equal(
    record(await store.get('entity-draft', created.localId)).payload,
    'serialized payload',
  );
  const fresh = new OfflineFirstMobileRuntime<'specific'>(
    store,
    backend,
    crypto,
    clock,
    ids,
    printer,
    { entityTypes: ['specific'] },
  );
  const attached = await fresh.attachEvidence(created.localId, evidence);
  assert.equal(attached.payload, 'serialized payload');
  const finalized = await fresh.finalizeOffline(created.localId);
  const subtype: 'specific' = finalized.entityType;
  assert.equal(subtype, 'specific');
  assert.equal(finalized.payload, 'serialized payload');
  const queue = await fresh.enqueue(created.localId);
  assert.equal(queue.entityType, 'specific');
  assert.equal(typeof queue.payloadJson, 'object');
  assert.equal(queue.payloadJson.payload, 'serialized payload');
  await fresh.printReceipt(created.localId);
  assert.deepEqual(printerPayloads, ['serialized payload']);
  assert.equal((await fresh.submitPendingQueue()).acceptedItems, 1);
  assert.equal(backend.submittedBatches[0]!.items[0]!.payloadJson.payload, 'serialized payload');
});
