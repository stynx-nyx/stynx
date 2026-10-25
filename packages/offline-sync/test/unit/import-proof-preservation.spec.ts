import { describe, expect, it } from 'vitest';
import { OfflineImportError } from '../../src/import-contract.js';
import {
  canonicalImportJson,
  parseImportJson,
  validReconciliationEvidence,
  validateOfflineImportManifest,
} from '../../src/import-validation.js';
import { archivedFixture } from '../support/offline-archive-fixture.js';
import { IMPORT_TENANT, rehashManifest } from '../support/offline-import-fixtures.js';
import { reconciliationImportManifest } from '../support/offline-reconciliation-import-fixture.js';

function row() {
  const value = reconciliationImportManifest().records.at(-1)?.row;
  if (!value || !('result_json' in value)) throw new Error('Reconciliation fixture missing');
  return structuredClone(value);
}
function inheritedMethods(array: unknown[], names: string[], trace: string[], bypassEvery = false) {
  const prototype = Object.create(Array.prototype);
  for (const name of names)
    Object.defineProperty(prototype, name, {
      get() {
        expect(this).toBe(array);
        trace.push(`${name}:get`);
        return function (this: unknown, ...args: unknown[]) {
          expect(this).toBe(array);
          trace.push(`${name}:call`);
          if (name === 'every' && bypassEvery) return true;
          return Reflect.apply(Reflect.get(Array.prototype, name), array, args);
        };
      },
    });
  Object.setPrototypeOf(array, prototype);
}
const refuse = (value: unknown) =>
  expect(() => validateOfflineImportManifest(value)).toThrow(OfflineImportError);

describe('Import complete snapshot and original reconciliation boundaries', () => {
  const fixture = reconciliationImportManifest();
  for (const field of [
    'formatVersion',
    'source',
    'manifestSha256',
    'mappings',
    'records',
    'archives',
  ])
    it(`refuses missing required root ${field}`, () => {
      const value = reconciliationImportManifest();
      Reflect.deleteProperty(value, field);
      refuse(value);
    });
  for (const field of ['system', 'snapshotId', 'sha256'])
    it(`refuses missing source ${field}`, () => {
      const value = reconciliationImportManifest();
      Reflect.deleteProperty(value.source, field);
      refuse(rehashManifest(value));
    });
  for (const [index, record] of fixture.records.entries()) {
    it(`${record.kind}: rejects every missing physical row field`, () => {
      for (const field of Object.keys(record.row)) {
        const value = reconciliationImportManifest();
        Reflect.deleteProperty(value.records[index]!.row, field);
        refuse(rehashManifest(value));
      }
    });
    it(`${record.kind}: rejects mismatched row/key kind and closed row extras`, () => {
      const value = reconciliationImportManifest();
      Reflect.set(
        value.records[index]!,
        'row',
        value.records[(index + 1) % value.records.length]!.row,
      );
      refuse(rehashManifest(value));
      const extra = reconciliationImportManifest();
      Reflect.set(extra.records[index]!.row, 'privateExtra', 'secret');
      refuse(rehashManifest(extra));
      const key = reconciliationImportManifest();
      const ownKeys = Object.keys(key.mappings[index]!.targetKey).sort().join(',');
      const incompatible = key.mappings.find(
        (mapping) => Object.keys(mapping.targetKey).sort().join(',') !== ownKeys,
      );
      expect(incompatible).toBeDefined();
      Reflect.set(key.mappings[index]!, 'targetKey', incompatible!.targetKey);
      refuse(rehashManifest(key));
    });
  }
  it('refuses every archive required field without changing captured digest authority', () => {
    const captured = archivedFixture(IMPORT_TENANT).manifest;
    expect(captured.archives.length).toBeGreaterThan(0);
    for (const field of Object.keys(captured.archives[0]!)) {
      const value = archivedFixture(IMPORT_TENANT).manifest;
      Reflect.deleteProperty(value.archives[0]!, field);
      refuse(rehashManifest(value));
    }
  });
  it('preserves detached mutable snapshot and null-prototype source values', () => {
    const value = reconciliationImportManifest();
    Object.setPrototypeOf(value.source, null);
    const parsed = validateOfflineImportManifest(value);
    expect(parsed).toEqual(value);
    expect(parsed).not.toBe(value);
    expect(parsed.records[0]!.row).not.toBe(value.records[0]!.row);
    expect(Object.isFrozen(parsed)).toBe(false);
    expect(Object.isFrozen(parsed.records)).toBe(false);
    Reflect.set(parsed.source, 'system', 'changed');
    expect(value.source.system).toBe('consumer-system');
  });
  it('preserves canonical key order and own __proto__ without prototype mutation', () => {
    const parsed = parseImportJson('{"__proto__":{"safe":true},"z":2,"a":1}');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
    expect(canonicalImportJson(parsed)).toBe('{"__proto__":{"safe":true},"a":1,"z":2}');
  });
  for (const mode of ['sparse', 'extra', 'symbol', 'nonenumerable', 'accessor'])
    it(`rejects ${mode} before invoking source coercion`, () => {
      const value = reconciliationImportManifest();
      let calls = 0;
      if (mode === 'sparse') Reflect.deleteProperty(value.records, '0');
      if (mode === 'extra') Reflect.set(value.records, 'extra', 1);
      if (mode === 'symbol') Reflect.set(value.source, Symbol('secret'), 1);
      if (mode === 'nonenumerable')
        Object.defineProperty(value.source, 'system', { enumerable: false });
      if (mode === 'accessor')
        Object.defineProperty(value.source, 'system', {
          get() {
            calls++;
            return 'consumer-system';
          },
        });
      refuse(value);
      expect(calls).toBe(0);
    });
  it('reconciliation validates every required row/result/consumption field on ordinary data', () => {
    const valid = row();
    expect(validReconciliationEvidence(valid)).toBe(true);
    for (const field of Object.keys(valid)) {
      const v = row();
      Reflect.deleteProperty(v, field);
      expect(validReconciliationEvidence(v)).toBe(false);
    }
    for (const field of Object.keys(valid.result_json)) {
      const v = row();
      Reflect.deleteProperty(v.result_json, field);
      expect(validReconciliationEvidence(v)).toBe(false);
    }
    for (const field of Object.keys(valid.result_json.consumption[0]!)) {
      const v = row();
      Reflect.deleteProperty(v.result_json.consumption[0]!, field);
      expect(validReconciliationEvidence(v)).toBe(false);
    }
  });
  it('reconciliation accepts ordinary null-prototype objects', () => {
    const value = row();
    Object.setPrototypeOf(value, null);
    Object.setPrototypeOf(value.result_json, null);
    for (const entry of value.result_json.consumption) Object.setPrototypeOf(entry, null);
    expect(validReconciliationEvidence(value)).toBe(true);
  });
  it('valid inherited collection methods keep original receivers and operation sequence', () => {
    const value = row();
    const claims: string[] = [];
    const consumption: string[] = [];
    inheritedMethods(value.claimed_numbers, ['every', 'map'], claims);
    inheritedMethods(
      value.result_json.consumption,
      ['every', 'some', 'map', 'filter'],
      consumption,
    );
    expect(validReconciliationEvidence(value)).toBe(true);
    expect(claims).toEqual(['every:get', 'every:call', 'map:get', 'map:call']);
    expect(consumption).toEqual([
      'every:get',
      'every:call',
      'some:get',
      'some:call',
      'map:get',
      'map:call',
      'filter:get',
      'filter:call',
      'filter:get',
      'filter:call',
    ]);
  });
  for (const method of ['every', 'map'])
    it(`reconciliation catches original inherited ${method} failure without later operations`, () => {
      const value = row();
      const failure = new Error('collection failure');
      const trace: string[] = [];
      const prototype = Object.create(Array.prototype);
      Object.defineProperty(prototype, method, {
        get() {
          expect(this).toBe(value.claimed_numbers);
          trace.push(method);
          throw failure;
        },
      });
      Object.setPrototypeOf(value.claimed_numbers, prototype);
      expect(validReconciliationEvidence(value)).toBe(false);
      expect(trace).toEqual([method]);
    });
  for (const mode of [
    'numeric-claim',
    'missing-consumption-field',
    'invalid-consumption-status',
    'unsafe-consumption-number',
  ])
    it(`refuses formerly accepted overridden-every bypass: ${mode}`, () => {
      const value = row();
      const trace: string[] = [];
      if (mode === 'numeric-claim') {
        Reflect.set(value, 'claimed_numbers', [1]);
        value.result_json.unexpectedOnServer = [];
        inheritedMethods(value.claimed_numbers, ['every'], trace, true);
      } else {
        if (mode === 'missing-consumption-field')
          Reflect.deleteProperty(value.result_json.consumption[1]!, 'serverEntityId');
        if (mode === 'invalid-consumption-status')
          Reflect.set(value.result_json.consumption[1]!, 'status', 'invented');
        if (mode === 'unsafe-consumption-number') {
          value.result_json.consumption = [
            {
              number: Number.MAX_SAFE_INTEGER + 1,
              status: 'expired',
              serverEntityId: null,
              finalizedAt: null,
            },
          ];
          value.result_json.unexpectedOnServer = [];
        }
        inheritedMethods(value.result_json.consumption, ['every'], trace, true);
      }
      expect(validReconciliationEvidence(value)).toBe(false);
      expect(trace).toEqual(['every:get', 'every:call']);
    });
  for (const mode of ['invalid-claim-text', 'null-entry', 'sparse-entry', 'wrong-missing-number'])
    it(`other malformed bypass still refuses ${mode}`, () => {
      const value = row();
      const trace: string[] = [];
      if (mode === 'invalid-claim-text') {
        value.claimed_numbers = ['invalid'];
        inheritedMethods(value.claimed_numbers, ['every'], trace, true);
      }
      if (mode === 'null-entry') {
        Reflect.set(value.result_json.consumption, '0', null);
        inheritedMethods(value.result_json.consumption, ['every'], trace, true);
      }
      if (mode === 'sparse-entry') Reflect.deleteProperty(value.result_json.consumption, '0');
      if (mode === 'wrong-missing-number') {
        Reflect.set(value.result_json, 'missingOnServer', ['1']);
        inheritedMethods(value.result_json.missingOnServer, ['every'], trace, true);
      }
      expect(validReconciliationEvidence(value)).toBe(false);
    });
  for (const status of ['reserved', 'consumed', 'expired', 'cancelled', 'blocked'])
    it(`preserves declared result status ${status}`, () => {
      const value = row();
      Reflect.set(value.result_json, 'status', status);
      expect(validReconciliationEvidence(value)).toBe(true);
    });
  for (const status of ['available', 'claimed-locally', 'applied', 'blocked', 'expired'])
    it(`preserves declared consumption status ${status}`, () => {
      const value = row();
      Reflect.set(value.result_json.consumption[1]!, 'status', status);
      if (status === 'applied') value.result_json.unexpectedOnServer = [1, 2];
      expect(validReconciliationEvidence(value)).toBe(true);
    });
  for (const field of ['serverEntityId', 'finalizedAt'])
    it(`refuses formerly accepted overridden-every bypass: numeric ${field}`, () => {
      const value = row();
      Reflect.set(value.result_json.consumption[1]!, field, 5);
      const trace: string[] = [];
      inheritedMethods(value.result_json.consumption, ['every'], trace, true);
      expect(validReconciliationEvidence(value)).toBe(false);
      expect(trace).toEqual(['every:get', 'every:call']);
    });
  it('reconciliation refuses nonenumerable/accessor/symbol fields before calling accessors', () => {
    for (const mode of ['nonenumerable', 'accessor', 'symbol']) {
      const value = row();
      let calls = 0;
      if (mode === 'nonenumerable') Object.defineProperty(value, 'actor_id', { enumerable: false });
      if (mode === 'accessor')
        Object.defineProperty(value, 'actor_id', {
          get() {
            calls++;
            return 'actor';
          },
        });
      if (mode === 'symbol') Reflect.set(value, Symbol('extra'), 1);
      expect(validReconciliationEvidence(value)).toBe(false);
      expect(calls).toBe(0);
    }
  });
  it('reconciliation catches a changing Proxy field after descriptor-only canonical validation', () => {
    const value = row();
    const trace: string[] = [];
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        if (key === 'actor_id') {
          trace.push('actor');
          return 5;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    expect(validReconciliationEvidence(proxy)).toBe(false);
    expect(trace).toEqual(['actor']);
  });
});
