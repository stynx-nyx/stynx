import { describe, expect, it } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
import { decodeCursor, encodeCursor } from '../../src/listing.js';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { reconciliationRequest } from '../../src/reconciliation.js';

const scope = { tenantId: 'tenant', actorId: 'actor' };
const methods = [
  'blockNumberingReservation',
  'closeNumberingReservation',
  'reconcileNumberingReservation',
  'settleNumberingReservation',
  'getNumberingConsumption',
  'submitDurableSyncBatch',
  'getSyncBatchReceipt',
  'getSyncItemReceipt',
];
const policyResolver = { resolve: async () => ({ reservationTtlMs: 1000, maxBatchItems: null }) };
const moduleCall = (options: unknown) =>
  Reflect.apply(StynxOfflineSyncModule.forRoot, StynxOfflineSyncModule, [options]);
const reconcile = (input: unknown) =>
  Reflect.apply(reconciliationRequest, undefined, [scope, input]);
const lists = [
  { name: 'listSyncBatchReceipts', fields: ['deviceId'] },
  { name: 'listSyncItemReceipts', fields: ['deviceId', 'deviceBatchId'] },
  { name: 'listSyncQueueItems', fields: ['deviceId', 'entityType'] },
  { name: 'listSyncConflicts', fields: ['deviceId', 'conflictType', 'queueItemId'] },
] as const;
function listHarness(name: (typeof lists)[number]['name']) {
  const stop = new Error('context reached');
  const service = new OfflineSyncService(
    new InMemoryOfflineSyncStore(),
    {
      current() {
        throw stop;
      },
    },
    {},
  );
  return { stop, call: (input: unknown) => Reflect.apply(service[name], service, [input]) };
}

describe('Offline first proof original property and iterator behavior', () => {
  for (const { name, fields } of lists) {
    it(`${name}: gets inherited filters once before status and context`, async () => {
      const { stop, call } = listHarness(name);
      const order: string[] = [];
      const prototype = {};
      const input = Object.create(prototype);
      for (const field of fields)
        Object.defineProperty(prototype, field, {
          get() {
            expect(this).toBe(input);
            order.push(field);
            return ' valid ';
          },
        });
      Object.defineProperty(input, 'status', {
        get() {
          order.push('status');
          return undefined;
        },
      });
      Object.defineProperty(input, 'limit', {
        get() {
          throw new Error('page must follow context');
        },
      });
      await expect(call(input)).rejects.toBe(stop);
      expect(order).toEqual([...fields, 'status']);
    });
    for (const value of ['', ' ', 0, null, false])
      it(`${name}: rejects filter ${String(value)} before context`, async () => {
        const { call } = listHarness(name);
        await expect(call({ [fields[0]]: value })).rejects.toMatchObject({
          code: 'OFFLINE_SYNC_INVALID_INPUT',
          message: `${fields[0]} is required.`,
        });
      });
    it(`${name}: undefined defaults but null retains native property failure`, async () => {
      const { stop, call } = listHarness(name);
      await expect(call(undefined)).rejects.toBe(stop);
      await expect(call(null)).rejects.toThrow(
        "Cannot read properties of null (reading 'deviceId')",
      );
    });
    it(`${name}: primitive inherited Get uses original primitive receiver`, async () => {
      const { call } = listHarness(name);
      const failure = new Error('primitive getter');
      const prior = Object.getOwnPropertyDescriptor(Number.prototype, 'deviceId');
      Object.defineProperty(Number.prototype, 'deviceId', {
        configurable: true,
        get() {
          expect(this).toBe(17);
          throw failure;
        },
      });
      try {
        await expect(call(17)).rejects.toBe(failure);
      } finally {
        if (prior) Object.defineProperty(Number.prototype, 'deviceId', prior);
        else Reflect.deleteProperty(Number.prototype, 'deviceId');
      }
    });
  }

  it('module reads every capability in order with repeated options.store Gets and never calls methods', () => {
    const order: string[] = [];
    const store = {};
    for (const method of methods)
      Object.defineProperty(store, method, {
        get() {
          expect(this).toBe(store);
          order.push(method);
          return () => {
            throw new Error('not invoked');
          };
        },
      });
    const options = {
      policyResolver,
      get store() {
        expect(this).toBe(options);
        order.push('store');
        return store;
      },
    };
    moduleCall(options);
    expect(order).toEqual([
      'store',
      ...methods.flatMap((method) => ['store', method]),
      'store',
      'store',
    ]);
  });
  for (const index of [0, 3, 7])
    it(`module stops at noncallable capability ${index}`, () => {
      const reads: string[] = [];
      const store = {};
      methods.forEach((method, i) =>
        Object.defineProperty(store, method, {
          get() {
            reads.push(method);
            return i === index ? false : () => undefined;
          },
        }),
      );
      expect(() => moduleCall({ policyResolver, store })).toThrow('store');
      expect(reads).toEqual(methods.slice(0, index + 1));
    });
  it('module uses each changing store value and preserves later null native error', () => {
    let reads = 0;
    const one = { [methods[0]!]: () => undefined };
    expect(() =>
      moduleCall({
        policyResolver,
        get store() {
          return ++reads < 3 ? one : null;
        },
      }),
    ).toThrow(`Cannot read properties of null (reading '${methods[1]}')`);
    expect(reads).toBe(3);
  });
  it('module accepts inherited capabilities on a callable store without invoking it', () => {
    const store = () => {
      throw new Error('not called');
    };
    const prototype = Object.create(Function.prototype);
    for (const method of methods)
      Object.defineProperty(prototype, method, {
        get() {
          expect(this).toBe(store);
          return () => undefined;
        },
      });
    Object.setPrototypeOf(store, prototype);
    expect(() => moduleCall({ policyResolver, store })).not.toThrow();
  });
  it('module preserves primitive capability getter receiver and thrown identity', () => {
    const failure = new Error('module primitive');
    const key = methods[0]!;
    const prior = Object.getOwnPropertyDescriptor(Number.prototype, key);
    Object.defineProperty(Number.prototype, key, {
      configurable: true,
      get() {
        expect(this).toBe(17);
        throw failure;
      },
    });
    try {
      expect(() => moduleCall({ policyResolver, store: 17 })).toThrow(failure);
    } finally {
      if (prior) Object.defineProperty(Number.prototype, key, prior);
      else Reflect.deleteProperty(Number.prototype, key);
    }
  });
  it('module does not inspect capability properties when CTG9 is off or store absent', () => {
    const store = new Proxy(
      {},
      {
        get() {
          throw new Error('capability read');
        },
      },
    );
    expect(() => moduleCall({ store })).not.toThrow();
    expect(() => moduleCall({ policyResolver })).not.toThrow();
  });

  it('reconciliation preserves absent, sorted unique and sparse numbers rather than adding a dense guard', () => {
    expect(reconcile({}).claimedNumbers).toEqual([]);
    expect(reconcile({ claimedNumbers: [3, 1, 3] }).claimedNumbers).toEqual([1, 3]);
    expect(() => reconcile({ claimedNumbers: Array(1) })).toThrow(
      'Payload must contain only unambiguous JSON values.',
    );
  });
  it('reconciliation preserves four independent claimedNumbers reads and custom iteration after validation', () => {
    const order: string[] = [];
    const values = [1];
    Object.defineProperty(values, 'every', {
      get() {
        order.push('every-get');
        return function (callback: unknown) {
          expect(this).toBe(values);
          expect(callback).toBe(Number.isSafeInteger);
          order.push('every-call');
          return true;
        };
      },
    });
    Object.defineProperty(values, Symbol.iterator, {
      get() {
        order.push('iterator-get');
        return function* () {
          expect(this).toBe(values);
          order.push('iterator-call');
          yield 7;
          yield 3;
          yield 7;
        };
      },
    });
    const result = reconcile({
      get claimedNumbers() {
        order.push('claimed');
        return values;
      },
    });
    expect(result.claimedNumbers).toEqual([3, 7]);
    expect(order).toEqual([
      'claimed',
      'claimed',
      'claimed',
      'every-get',
      'every-call',
      'claimed',
      'iterator-get',
      'iterator-call',
    ]);
  });
  for (const phase of ['every', 'iterator'])
    it(`reconciliation preserves ${phase} error identity`, () => {
      const failure = new Error(phase);
      const values = [1];
      Object.defineProperty(values, phase === 'every' ? 'every' : Symbol.iterator, {
        get() {
          throw failure;
        },
      });
      expect(() => reconcile({ claimedNumbers: values })).toThrow(failure);
    });
  for (const value of [null, '1', {}, [1.5], [Infinity]])
    it(`reconciliation invalid representation ${JSON.stringify(value)}`, () => {
      expect(() => reconcile({ claimedNumbers: value })).toThrow('claimedNumbers is invalid.');
    });

  const instant = '2026-10-25T00:00:00.123456Z';
  it('cursor retains valid microseconds/tie keys and undefined absence', () => {
    expect(decodeCursor(encodeCursor([instant, 'a']), 2)).toEqual([instant, 'a']);
    expect(decodeCursor(undefined, 2)).toBeNull();
  });
  for (const item of [
    { raw: '!', arity: 2 },
    { raw: Buffer.from('{').toString('base64url'), arity: 2 },
    ...[
      null,
      {},
      2,
      [],
      [instant],
      [instant, 2],
      ['bad', 'a'],
      ['2026-02-30T00:00:00.000000Z', 'a'],
    ].map((value) => ({ raw: Buffer.from(JSON.stringify(value)).toString('base64url'), arity: 2 })),
    { raw: encodeCursor([]), arity: 0 },
  ])
    it(`cursor rejects original malformed ${item.raw}/${item.arity}`, () => {
      expect(() => decodeCursor(item.raw, item.arity)).toThrow('cursor is invalid.');
      try {
        decodeCursor(item.raw, item.arity);
      } catch (error) {
        expect(error).toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', status: 400 });
      }
    });
});
