import { describe, expect, it, afterEach, vi } from 'vitest';
import { WorklistInputError } from '../../src/errors.js';
import { requireObject } from '../../src/row-utils.js';
import { BUILTIN_WORKLIST_STRATEGY_KEYS, WorklistStrategyRegistry } from '../../src/strategies.js';
import { TenantBusinessCalendar } from '../../src/tenant-business-calendar.js';
import type { WorklistDistributionStrategy } from '../../src/types.js';

afterEach(() => vi.restoreAllMocks());

describe('Worklist internal object proof preserves the existing shallow boundary', () => {
  it('retains ordinary, null-prototype, class, Date and proxy identity without visiting values', () => {
    const unread = vi.fn(() => { throw new Error('nested property must remain unread'); });
    class Opaque {
      get value() { return unread(); }
    }
    const own = Object.defineProperty({}, 'value', { enumerable: true, get: unread });
    const nullPrototype = Object.assign(Object.create(null), { opaque: 1n });
    const proxy = new Proxy({ nested: own }, { get: unread, ownKeys: unread });
    for (const input of [own, nullPrototype, new Opaque(), new Date(0), proxy]) {
      expect(requireObject(input)).toBe(input);
    }
    expect(unread).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], () => ({}), '', 0, false, 1n, Symbol('input')].map((input) => ({ input })))(
    'rejects invalid object input %# with the same exact typed error', ({ input }) => {
      expect(() => requireObject(input)).toThrow(WorklistInputError);
      expect(() => requireObject(input)).toThrow('Input must be an object');
    },
  );

  it('retains the native revoked-proxy error without attempting property access', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => requireObject(proxy)).toThrow(TypeError);
  });
});

describe('Worklist registry keeps original key and native tuple observation', () => {
  it('reads key once, retains trim receiver/order, and tests the same exported tuple', () => {
    const calls: string[] = [];
    const keyValue = {
      get trim() {
        calls.push('get trim');
        return function (this: unknown) {
          expect(this).toBe(keyValue);
          calls.push('call trim');
          return 'custom';
        };
      },
    };
    const strategy = {
      get key() { calls.push('get key'); return keyValue; },
      get select() { throw new Error('registration must not read select'); },
    };
    const includes = vi.spyOn(BUILTIN_WORKLIST_STRATEGY_KEYS, 'includes').mockImplementation(function (this: unknown, value) {
      expect(this).toBe(BUILTIN_WORKLIST_STRATEGY_KEYS);
      calls.push('includes');
      return Array.prototype.includes.call(this, value);
    });
    const registry = new WorklistStrategyRegistry();
    registry.register(strategy as unknown as WorklistDistributionStrategy);
    expect(calls).toEqual(['get key', 'get trim', 'call trim', 'includes']);
    expect(includes).toHaveBeenCalledExactlyOnceWith('custom');
    expect(registry.get('custom')).toBe(strategy);
    expect(BUILTIN_WORKLIST_STRATEGY_KEYS).toEqual(['pull', 'round_robin', 'load_balanced']);
  });

  it.each(['key', 'trim-get', 'trim-call'])('preserves %s failure identity before reserved/duplicate lookup', (stage) => {
    const marker = new Error(stage);
    const calls: string[] = [];
    const strategy = {
      get key() {
        calls.push('key');
        if (stage === 'key') throw marker;
        return {
          get trim() {
            calls.push('trim-get');
            if (stage === 'trim-get') throw marker;
            return () => { calls.push('trim-call'); throw marker; };
          },
        };
      },
      select: async () => null,
    };
    const includes = vi.spyOn(BUILTIN_WORKLIST_STRATEGY_KEYS, 'includes');
    const registry = new WorklistStrategyRegistry();
    try {
      registry.register(strategy as unknown as WorklistDistributionStrategy);
      throw new Error('expected registration failure');
    } catch (error) { expect(error).toBe(marker); }
    const order = ['key', 'trim-get', 'trim-call'];
    expect(calls).toEqual(order.slice(0, order.indexOf(stage) + 1));
    expect(includes).not.toHaveBeenCalled();
    expect(registry.get('custom')).toBeUndefined();
  });
});

function calendarWith(supplied: unknown) {
  // Intentionally exercise runtime source-boundary values beyond its declared Set interface.
  const holidaysFor = vi.fn(() => supplied as ReadonlySet<string>);
  const calendar = new TenantBusinessCalendar({ timezoneForTenant: () => 'UTC', holidaysFor });
  return {
    holidaysFor,
    run: (days = 1) => calendar.addBusinessDays({
      tenantId: 'tenant', calendarKey: 'office', startAt: new Date('2024-05-06T12:00:00Z'), businessDays: days,
    }),
  };
}

describe('tenant calendar observes only its existing set capabilities', () => {
  it('preserves inherited getters, exact receivers, repeated lazy has reads and original-set yearly reuse', async () => {
    const calls: string[] = [];
    const dates = new Set(['2024-05-07']);
    const forbidden = vi.fn(() => { throw new Error('unrelated set capability must not be read'); });
    class Holidays {
      get has() {
        expect(this).toBe(supplied);
        calls.push('get has');
        return function (this: unknown, key: string) {
          expect(this).toBe(supplied);
          calls.push(`has ${key}`);
          return dates.has(key);
        };
      }
      get [Symbol.iterator]() {
        expect(this).toBe(supplied);
        calls.push('get iterator');
        return function* (this: unknown) {
          expect(this).toBe(supplied);
          calls.push('iterate');
          yield* dates;
        };
      }
      get size() { return forbidden(); }
      get forEach() { return forbidden(); }
      get entries() { return forbidden(); }
    }
    const supplied = new Holidays();
    const h = calendarWith(supplied);
    await expect(h.run(2)).resolves.toEqual(new Date('2024-05-10T00:00:00Z'));
    expect(calls).toEqual([
      'get has', 'get iterator', 'get iterator', 'iterate',
      'get has', 'has 2024-05-07', 'get has', 'has 2024-05-08', 'get has', 'has 2024-05-09',
    ]);
    expect(h.holidaysFor).toHaveBeenCalledExactlyOnceWith({ tenantId: 'tenant', calendarKey: 'office', year: 2024 });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('keeps capability-bearing arrays accepted without requiring a complete Set interface', async () => {
    const supplied = Object.assign(['2024-05-07'], { has(key: string) { expect(this).toBe(supplied); return this.includes(key); } });
    await expect(calendarWith(supplied).run()).resolves.toEqual(new Date('2024-05-09T00:00:00Z'));
  });

  it.each([undefined, null, true, 0, 'dates', () => undefined].map((value) => ({ value })))(
    'rejects non-object source %# before reading capabilities', async ({ value }) => {
      const h = calendarWith(value);
      await expect(h.run()).rejects.toMatchObject({ code: 'WORKLIST_INPUT_INVALID', message: 'Tenant holidays must be a set of civil dates' });
    },
  );

  it('rejects a callable object without reading its otherwise valid capability getters', async () => {
    const get = vi.fn(() => { throw new Error('function capabilities must remain unread'); });
    const supplied = Object.defineProperties(() => undefined, { has: { get }, [Symbol.iterator]: { get } });
    await expect(calendarWith(supplied).run()).rejects.toThrow('Tenant holidays must be a set of civil dates');
    expect(get).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, true].map((has) => ({ has })))(
    'noncallable has %# short-circuits before iterator access', async ({ has }) => {
      const iterator = vi.fn(() => { throw new Error('iterator must remain unread'); });
      const supplied = { has, get [Symbol.iterator]() { return iterator(); } };
      await expect(calendarWith(supplied).run()).rejects.toThrow('Tenant holidays must be a set of civil dates');
      expect(iterator).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, 0, true].map((iterator) => ({ iterator })))(
    'noncallable iterator %# is rejected after exactly one has read', async ({ iterator }) => {
      const calls: string[] = [];
      const supplied = { get has() { calls.push('has'); return () => false; }, get [Symbol.iterator]() { calls.push('iterator'); return iterator; } };
      await expect(calendarWith(supplied).run()).rejects.toThrow('Tenant holidays must be a set of civil dates');
      expect(calls).toEqual(['has', 'iterator']);
    },
  );

  it.each(['has-get', 'iterator-get', 'iterator-call', 'next', 'has-call'])('preserves %s exception identity and original access ordering', async (stage) => {
    const marker = new Error(stage);
    const calls: string[] = [];
    const supplied = {
      get has() {
        calls.push('has-get');
        if (stage === 'has-get') throw marker;
        return function (this: unknown) {
          expect(this).toBe(supplied);
          calls.push('has-call');
          throw marker;
        };
      },
      get [Symbol.iterator]() {
        calls.push('iterator-get');
        if (stage === 'iterator-get') throw marker;
        return function (this: unknown) {
          expect(this).toBe(supplied);
          calls.push('iterator-call');
          if (stage === 'iterator-call') throw marker;
          return { next() { calls.push('next'); if (stage === 'next') throw marker; return { done: true, value: undefined }; } };
        };
      },
    };
    await expect(calendarWith(supplied).run()).rejects.toBe(marker);
    const expected = stage === 'has-get' ? ['has-get']
      : stage === 'iterator-get' ? ['has-get', 'iterator-get']
        : stage === 'iterator-call' ? ['has-get', 'iterator-get', 'iterator-get', 'iterator-call']
          : stage === 'next' ? ['has-get', 'iterator-get', 'iterator-get', 'iterator-call', 'next']
            : ['has-get', 'iterator-get', 'iterator-get', 'iterator-call', 'next', 'has-get', 'has-call'];
    expect(calls).toEqual(expected);
  });

  it('invalid yielded dates close the supplied iterator before any has lookup', async () => {
    const close = vi.fn(() => ({ done: true, value: undefined }));
    const has = vi.fn(() => false);
    const supplied = {
      has,
      [Symbol.iterator]() { return { next: () => ({ done: false, value: '2024-02-30' }), return: close }; },
    };
    await expect(calendarWith(supplied).run()).rejects.toThrow('Tenant holiday must be a valid YYYY-MM-DD date');
    expect(close).toHaveBeenCalledOnce();
    expect(has).not.toHaveBeenCalled();
  });
});
