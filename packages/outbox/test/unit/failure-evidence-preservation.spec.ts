import { createHash, Hash } from 'node:crypto';
import { z } from 'zod';
import { executeTypedQuery, QueryArgumentError } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service.js';
import { persistFailedAttempt, persistOwnerFailedAttempt } from '../../src/outbox-commands.repository.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const claim = { tenant_id: tenant, event_id: eventId, attempts: 1, status: 'SENT',
  entity: 'record.changed', entity_id: 'record-1', idempotency_key: 'record-1:v1',
  payload: { version: 1 }, metadata: {}, created_at: new Date(10) };
const next = new Date(10000);
const errorWith = (evidence: unknown) => Object.assign(new Error('transport failed'), { evidence });

function harness(mode: 'tenant' | 'owner', error: unknown, trace: string[] = [], delivery = true) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const query = async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('with due as')) return { rows: [claim] };
    if (sql.includes("set status='ERROR'")) {
      trace.push('delivery');
      return { rows: delivery ? [{ event_id: eventId }] : [] };
    }
    if (sql.includes("result='ERROR'")) trace.push('attempt');
    return { rows: [] };
  };
  const database = {
    appRoleName: 'stynx_app', currentTenantId: () => tenant,
    withSystemContext: async (_reason: string, fn: () => Promise<unknown>) => fn(),
    tx: async (fn: (trx: unknown) => Promise<unknown>) => fn({ role: mode === 'tenant' ? 'app' : 'owner', query }),
  };
  const service = new OutboxService(database as never, {}, {
    sendEvent: async () => { trace.push('send'); throw error; },
  }, { nextAttemptAt: () => { trace.push('backoff'); return next; } });
  return { calls, trace, run: () => mode === 'tenant' ? service.dispatchTenantEventsDue(1) : service.dispatchEventsDue(1),
    attempt: () => calls.find((call) => call.sql.includes("result='ERROR'")) };
}

for (const mode of ['tenant', 'owner'] as const) {
  describe(`${mode} native failed evidence`, () => {
    it('preserves lazy inherited reads, receiver, hashes, complete binds and delivery before attempt', async () => {
      const trace: string[] = [];
      const request = Buffer.from('request');
      const response = Buffer.from('response');
      const values = { provider: 'provider', protocol: 'HTTP', requestBytes: request, responseBytes: response,
        requestHeaders: { authorization: '[redacted]' }, responseStatus: 503, requestTransmission: 'response-received' };
      const prototype = Object.fromEntries(Object.keys(values).map((key) => [key, undefined]));
      const evidence = Object.create(prototype);
      for (const key of Object.keys(values)) Object.defineProperty(prototype, key, { get() {
        expect(this).toBe(evidence); trace.push(key); return Reflect.get(values, key);
      } });
      const error = new Error();
      Object.defineProperties(error, {
        message: { get() { trace.push('message'); return 'transport failed'; } },
        evidence: { get() { trace.push('evidence'); return evidence; } },
      });
      const h = harness(mode, error, trace);
      expect(await h.run()).toMatchObject([{ dispatched: false, error: 'transport failed', row: { status: 'ERROR' } }]);
      expect(trace).toEqual(['send', 'message', 'evidence', 'requestBytes', 'requestBytes', 'responseBytes', 'responseBytes',
        'backoff', 'delivery', 'provider', 'protocol', 'requestBytes', 'responseBytes', 'requestHeaders', 'requestHeaders',
        'responseStatus', 'requestBytes', 'responseBytes', 'requestHeaders', 'responseStatus', 'requestTransmission', 'attempt']);
      expect(h.calls).toHaveLength(4);
      expect(h.attempt()?.sql).toBe(mode === 'tenant'
        ? `update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                   provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                   response_bytes=$9,response_sha256=$10,request_headers=$11::jsonb,
                   response_status=$12,evidence_state=$13::jsonb
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`
        : `update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                  provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                  response_bytes=$9,response_sha256=$10,
                  request_headers=$11::jsonb,response_status=$12,evidence_state=$13::jsonb
                where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`);
      expect(h.attempt()?.params).toEqual([tenant, eventId, 1, 'transport failed', 'provider', 'HTTP', request,
        createHash('sha256').update(request).digest('hex'), response, createHash('sha256').update(response).digest('hex'),
        '{"authorization":"[redacted]"}', 503,
        '{"requestBytes":"captured","responseBytes":"captured","requestHeaders":"redacted-or-digested","responseStatus":"captured","requestTransmission":"response-received"}']);
      expect(h.attempt()?.params[6]).toBe(request);
      expect(h.attempt()?.params[8]).toBe(response);
    });

    it.each([undefined, null, false, 0, '', 1, 'opaque', Symbol('evidence'), () => undefined].map((value) => ({ value })))('keeps nullish and boxed evidence defaults: $value', async ({ value }) => {
      const h = harness(mode, errorWith(value));
      expect(await h.run()).toMatchObject([{ row: { status: 'ERROR' }, error: 'transport failed' }]);
      expect(h.attempt()?.params.slice(4, 12)).toEqual(Array(8).fill(null));
      expect(h.trace).toEqual(['send', 'backoff', 'delivery', 'attempt']);
    });

    it('captures native update before the second bytes read and invokes its actual receiver', async () => {
      const trace: string[] = [];
      const descriptor = Object.getOwnPropertyDescriptor(Hash.prototype, 'update')!;
      const nativeUpdate = descriptor.value;
      const buffer = Buffer.from('second');
      let reads = 0;
      const evidence = { get requestBytes() { trace.push(`bytes${++reads}`); return reads === 1 ? true : buffer; } };
      Object.defineProperty(Hash.prototype, 'update', { configurable: true, get() {
        const capture = { receiver: this }; trace.push('update-get');
        return function (this: unknown, input: unknown) {
          expect(this).toBe(capture.receiver); expect(input).toBe(buffer); trace.push('update-call');
          return Reflect.apply(nativeUpdate, this, [input]);
        };
      } });
      try {
        const h = harness(mode, errorWith(evidence), trace);
        await h.run();
        expect(trace).toEqual(['send', 'bytes1', 'update-get', 'bytes2', 'update-call', 'backoff', 'delivery', 'bytes3', 'bytes4', 'attempt']);
      } finally { Object.defineProperty(Hash.prototype, 'update', descriptor); }
    });

    it('refuses unsupported replaced-native foreign return without executing its digest', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(Hash.prototype, 'update')!;
      const foreignDigest = vi.fn(() => 'foreign hash');
      Object.defineProperty(Hash.prototype, 'update', { ...descriptor, value() { return { digest: foreignDigest }; } });
      try {
        const h = harness(mode, errorWith({ requestBytes: Buffer.from('request') }));
        await expect(h.run()).rejects.toThrow('Native hash update returned a different instance');
        expect(foreignDigest).not.toHaveBeenCalled(); expect(h.trace).toEqual(['send']);
      } finally { Object.defineProperty(Hash.prototype, 'update', descriptor); }
    });

    it.each([
      { label: 'string', value: 'native-string' }, { label: 'Uint8Array', value: new Uint8Array([1, 2]) },
      { label: 'Int16Array', value: new Int16Array([257]) }, { label: 'DataView', value: new DataView(new Uint8Array([3, 4]).buffer) },
    ])('native hash admits $label before Buffer-only checked persistence refuses', async ({ value }) => {
      expect(() => createHash('sha256').update(value as never).digest('hex')).not.toThrow();
      const h = harness(mode, errorWith({ requestBytes: value }));
      expect(await h.run()).toMatchObject([{ reconciliationRequired: true, error: expect.stringContaining('attempt persistence unresolved') }]);
      expect(h.trace).toEqual(['send', 'backoff', 'delivery']);
      expect(h.attempt()).toBeUndefined();
    });

    it.each([123, {}, Promise.resolve('bytes'), new ArrayBuffer(2)].map((value) => ({ value })))('retains native invalid hash failure before backoff: $value', async ({ value }) => {
      let native: unknown;
      try { createHash('sha256').update(value as never); } catch (error) { native = error; }
      const h = harness(mode, errorWith({ requestBytes: value }));
      await expect(h.run()).rejects.toMatchObject({ name: Reflect.get(native as object, 'name'), message: Reflect.get(native as object, 'message'), code: 'ERR_INVALID_ARG_TYPE' });
      expect(h.trace).toEqual(['send']); expect(h.calls).toHaveLength(2);
    });

    it.each(['evidence', 'requestBytes', 'responseBytes'] as const)('propagates original $field getter failure identity', async (field) => {
      const sentinel = new Error('getter sentinel');
      const evidence = Object.defineProperty({}, field, { get() { throw sentinel; } });
      const error = field === 'evidence' ? Object.defineProperty(new Error('transport failed'), field, { get() { throw sentinel; } }) : errorWith(evidence);
      const h = harness(mode, error);
      await expect(h.run()).rejects.toBe(sentinel); expect(h.trace).toEqual(['send']);
    });

    it.each(['requestBytes', 'responseBytes'] as const)('retains second %s getter failure before backoff', async (field) => {
      let reads = 0;
      const sentinel = new Error('second getter failure');
      const evidence = Object.defineProperty({}, field, { get() { if (++reads === 2) throw sentinel; return true; } });
      const h = harness(mode, errorWith(evidence));
      await expect(h.run()).rejects.toBe(sentinel);
      expect(reads).toBe(2); expect(h.trace).toEqual(['send']);
    });

    it.each([null, undefined, false, 0, ''].map((value) => ({ value })))('falsy first bytes avoids hashing, retaining later Gets: $value', async ({ value }) => {
      let reads = 0;
      const bytes = Buffer.from('later persistence');
      const evidence = { get requestBytes() { return ++reads === 1 ? value : bytes; } };
      const h = harness(mode, errorWith(evidence));
      await h.run();
      expect(reads).toBe(3); expect(h.attempt()?.params[6]).toBe(bytes); expect(h.attempt()?.params[7]).toBeNull();
    });

    it('keeps ignored evidence getters untouched and original primitive receiver', async () => {
      const key = 'provider';
      const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, key);
      let reads = 0;
      Object.defineProperty(Number.prototype, key, { configurable: true, get() { expect(this).toBe(7); reads++; return 'native-number'; } });
      try {
        const h = harness(mode, errorWith(7)); await h.run();
        expect(h.attempt()?.params[4]).toBe('native-number'); expect(reads).toBe(1);
      } finally {
        if (descriptor) Object.defineProperty(Number.prototype, key, descriptor); else Reflect.deleteProperty(Number.prototype, key);
      }
      const h = harness(mode, errorWith(Object.defineProperty({}, 'ignored', { get() { throw new Error('not observed'); } })));
      expect(await h.run()).toMatchObject([{ row: { status: 'ERROR' } }]);
    });

    it('finishes lazy state reads before checked invalid provider refusal with redaction', async () => {
      const trace: string[] = [];
      const evidence = new Proxy({ provider: Promise.resolve('secret-provider'), responseStatus: 'secret-status' }, {
        get(target, key, receiver) { trace.push(String(key)); return Reflect.get(target, key, receiver); },
      });
      const h = harness(mode, errorWith(evidence), trace);
      const result = await h.run();
      expect(result).toMatchObject([{ reconciliationRequired: true }]);
      expect(result[0]?.error).not.toContain('secret-provider'); expect(result[0]?.error).not.toContain('secret-status');
      expect(trace).toEqual(['send', 'requestBytes', 'responseBytes', 'backoff', 'delivery', 'provider', 'protocol', 'requestBytes',
        'responseBytes', 'requestHeaders', 'responseStatus', 'requestBytes', 'responseBytes', 'requestHeaders', 'responseStatus', 'requestTransmission']);
      expect(h.attempt()).toBeUndefined();
    });

    it.each(['cycle', 'bigint', 'throwing-toJSON', 'undefined', 'symbol', 'function'] as const)('retains header serialization failure position: %s', async (kind) => {
      const trace: string[] = [];
      const sentinel = new Error('toJSON sentinel');
      const cycle: Record<string, unknown> = {}; cycle.self = cycle;
      const header = kind === 'cycle' ? cycle : { toJSON() {
        trace.push('toJSON'); expect(this).toBe(header);
        if (kind === 'throwing-toJSON') throw sentinel;
        return kind === 'bigint' ? 1n : kind === 'symbol' ? Symbol('header') : kind === 'function' ? () => undefined : undefined;
      } };
      const h = harness(mode, errorWith({ requestHeaders: header }), trace);
      const result = await h.run();
      expect(result).toMatchObject([{ reconciliationRequired: true, row: { status: 'SENT' } }]);
      expect(trace.slice(0, 3)).toEqual(['send', 'backoff', 'delivery']);
      expect(h.attempt()).toBeUndefined();
      if (kind === 'throwing-toJSON') expect(result[0]?.error).toContain(sentinel.message);
    });

    it('keeps changed header second value and stale delivery projection', async () => {
      let reads = 0;
      const evidence = { get requestHeaders() { return ++reads === 1 ? true : { kept: 'second' }; } };
      const h = harness(mode, errorWith(evidence), [], false);
      expect(await h.run()).toMatchObject([{ row: { status: 'SENT' }, error: 'transport failed' }]);
      expect(reads).toBe(3); expect(h.attempt()?.params[10]).toBe('{"kept":"second"}');
    });
  });
}

for (const definition of [persistFailedAttempt, persistOwnerFailedAttempt]) {
  describe(`${definition.name} exact unknown pipe input parity`, () => {
    // Frozen pre-conversion tuple: the production definition is compared against this
    // original validator even after its private input typing changes.
    const original = z.tuple([z.string().uuid(), z.string().uuid(), z.number(), z.string(),
      z.string().nullable(), z.string().nullable(), z.instanceof(Buffer).nullable(), z.string().nullable(),
      z.instanceof(Buffer).nullable(), z.string().nullable(), z.string().nullable(), z.number().nullable(), z.string()]);
    const slots = new Set([4, 5, 6, 8, 11]);
    const candidate = z.tuple(original.def.items.map((schema, index) => slots.has(index) ? z.unknown().pipe(schema) : schema));
    const valid = () => [tenant, eventId, 1, 'error', 'provider', 'HTTP', Buffer.from('r'), 'hash', Buffer.from('s'), 'hash', '{}', 503, '{}'];
    for (const slot of slots) {
      it(`retains valid output identity and every malformed issue at slot ${slot}`, () => {
        const rejected = Promise.reject(new Error('handled')); void rejected.catch(() => undefined);
        const values = [undefined, null, '', 'text', 0, 503, NaN, Infinity, Buffer.from('bytes'), new Uint8Array([1]), {}, Promise.resolve('value'), rejected];
        for (const value of values) {
          const input = valid(); input[slot] = value as never;
          const before = original.safeParse(input); const after = candidate.safeParse(input);
          expect(after.success).toBe(before.success);
          const actual = definition.params.safeParse(input);
          expect(actual.success).toBe(before.success);
          if (!actual.success && !before.success) expect(actual.error.issues).toEqual(before.error.issues);
          if (before.success && after.success) { expect(after.data).toEqual(before.data); expect(after.data[slot]).toBe(before.data[slot]); }
          else if (!before.success && !after.success) expect(after.error.issues).toEqual(before.error.issues);
        }
      });
    }
    it('retains checked QueryArgumentError paths/redaction and zero driver calls for Promise fields', async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const input = valid(); for (const slot of slots) input[slot] = Promise.resolve('private-secret') as never;
      let failure: unknown;
      try { await executeTypedQuery({ query }, definition, input as never); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(QueryArgumentError);
      expect(failure).toMatchObject({ query: definition.name, issues: [
        { path: [4], code: 'invalid_type' }, { path: [5], code: 'invalid_type' },
        { path: [6], code: 'invalid_type' }, { path: [8], code: 'invalid_type' }, { path: [11], code: 'invalid_type' },
      ] });
      expect(JSON.stringify(failure)).not.toContain('private-secret'); expect(query).not.toHaveBeenCalled();
    });

    it('never reads then or assimilates values; retains combined issue ordering', () => {
      let reads = 0;
      const thenable = { get then() { reads++; throw new Error('must not assimilate'); } };
      const input = valid(); for (const slot of slots) input[slot] = thenable as never;
      const before = original.safeParse(input); const after = candidate.safeParse(input);
      expect(reads).toBe(0); expect(before.success).toBe(false); expect(after.success).toBe(false);
      if (!before.success && !after.success) {
        expect(after.error.issues).toEqual(before.error.issues);
        expect(after.error.issues.map((issue) => issue.path)).toEqual([[4], [5], [6], [8], [11]]);
      }
    });
  });
}
