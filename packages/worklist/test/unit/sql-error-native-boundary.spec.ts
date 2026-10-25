import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapWorklistSqlError } from '../../src/sql-errors.js';
import {
  WorklistConflictError, WorklistForbiddenError, WorklistInputError, WorklistNotFoundError,
} from '../../src/errors.js';

afterEach(() => vi.restoreAllMocks());

const branches = [
  { sql: 'WK400', reads: 1, ctor: WorklistInputError, code: 'WORKLIST_INPUT_INVALID', status: 400, constraint: true },
  { sql: '23503', reads: 2, ctor: WorklistInputError, code: 'WORKLIST_INPUT_INVALID', status: 400, constraint: true },
  { sql: '23514', reads: 3, ctor: WorklistInputError, code: 'WORKLIST_INPUT_INVALID', status: 400, constraint: true },
  { sql: 'WK403', reads: 4, ctor: WorklistForbiddenError, code: 'WORKLIST_FORBIDDEN', status: 403, constraint: false },
  { sql: 'WK404', reads: 5, ctor: WorklistNotFoundError, code: 'WORKLIST_NOT_FOUND', status: 404, constraint: false },
  { sql: 'WK409', reads: 6, ctor: WorklistConflictError, code: 'WORKLIST_CONFLICT', status: 409, constraint: true },
  { sql: '23505', reads: 7, ctor: WorklistConflictError, code: 'WORKLIST_CONFLICT', status: 409, constraint: true },
];

describe('SQL-error mapping retains native property reads and branch effects', () => {
  it.each(branches)('$sql preserves inherited getter receiver and exact message/code/constraint order', ({ sql, reads, ctor, code, status, constraint }) => {
    const calls: string[] = [];
    const opaqueConstraint = { nested: new Date(0), absent: undefined };
    const prototype = {
      get message() { expect(this).toBe(input); calls.push('message'); return 'queue missing'; },
      get code() { expect(this).toBe(input); calls.push('code'); return sql; },
      get constraint() { expect(this).toBe(input); calls.push('constraint'); return opaqueConstraint; },
    };
    const input = Object.create(prototype);
    const result = mapWorklistSqlError(input);
    expect(result).toBeInstanceOf(ctor);
    expect(result).toMatchObject({ code, status });
    expect(calls).toEqual(['message', ...Array.from({ length: reads }, () => 'code'), ...(constraint ? ['constraint'] : [])]);
    if (!(result instanceof Error)) throw new Error('expected native error result');
    if (sql === 'WK404') {
      expect(result.message).toBe('Worklist queue not found: unknown');
      expect(result).toMatchObject({ context: { entity: 'queue', id: 'unknown' } });
      expect(Object.hasOwn(result, 'cause')).toBe(false);
    } else {
      expect(result.message).toBe('queue missing');
      expect(result.cause).toBe(input);
      if (constraint) expect(Reflect.get(result, 'context').constraint).toBe(opaqueConstraint);
    }
  });

  it('preserves changing code getter values instead of snapshotting its first read', () => {
    const codes = ['not-WK400', '23503'];
    const reads: string[] = [];
    const input = {
      get message() { reads.push('message'); return 'changed code'; },
      get code() { reads.push('code'); return codes.shift(); },
      get constraint() { reads.push('constraint'); return 'fk'; },
    };
    const result = mapWorklistSqlError(input);
    expect(result).toMatchObject({ code: 'WORKLIST_INPUT_INVALID', message: 'changed code', context: { constraint: 'fk' } });
    expect(result).toBeInstanceOf(Error);
    if (!(result instanceof Error)) throw new Error('expected native error result');
    expect(result.cause).toBe(input);
    expect(reads).toEqual(['message', 'code', 'code', 'constraint']);
  });

  it('returns unknown-code opaque input unchanged after message then seven code reads', () => {
    const calls: string[] = [];
    const opaque = Symbol('message');
    const input = {
      get message() { calls.push('message'); return opaque; },
      get code() { calls.push('code'); return 'UNKNOWN'; },
      get constraint() { throw new Error('constraint must not be read'); },
    };
    expect(mapWorklistSqlError(input)).toBe(input);
    expect(calls).toEqual(['message', ...Array.from({ length: 7 }, () => 'code')]);
  });

  it.each([undefined, null].map((input) => ({ input })))('nullish input %# retains native nonoptional message Get failure', ({ input }) => {
    expect(() => mapWorklistSqlError(input)).toThrow(TypeError);
    expect(() => mapWorklistSqlError(input)).toThrow(`Cannot read properties of ${String(input)} (reading 'message')`);
  });

  it.each(['text', 17, false, 1n, Symbol('error'), [], () => undefined].map((input) => ({ input })))(
    'non-null primitive/array/callable input %# remains the original unrecognized value', ({ input }) => {
      expect(mapWorklistSqlError(input)).toBe(input);
    },
  );

  it('boxes primitive property lookup while retaining the original primitive getter receiver', () => {
    const oldMessage = Object.getOwnPropertyDescriptor(Number.prototype, 'message');
    const oldCode = Object.getOwnPropertyDescriptor(Number.prototype, 'code');
    const calls: string[] = [];
    Object.defineProperty(Number.prototype, 'message', { configurable: true, get() { expect(this).toBe(17); calls.push('message'); return 'primitive'; } });
    Object.defineProperty(Number.prototype, 'code', { configurable: true, get() { expect(this).toBe(17); calls.push('code'); return 'UNKNOWN'; } });
    try {
      expect(mapWorklistSqlError(17)).toBe(17);
      expect(calls).toEqual(['message', ...Array.from({ length: 7 }, () => 'code')]);
    } finally {
      if (oldMessage) Object.defineProperty(Number.prototype, 'message', oldMessage); else Reflect.deleteProperty(Number.prototype, 'message');
      if (oldCode) Object.defineProperty(Number.prototype, 'code', oldCode); else Reflect.deleteProperty(Number.prototype, 'code');
    }
  });

  it.each(['message', 'code', 'constraint'])('retains %s getter exception identity and stops later observations', (stage) => {
    const marker = new Error(stage);
    const calls: string[] = [];
    const input = {
      get message() { calls.push('message'); if (stage === 'message') throw marker; return 'text'; },
      get code() { calls.push('code'); if (stage === 'code') throw marker; return 'WK400'; },
      get constraint() { calls.push('constraint'); throw marker; },
    };
    try { mapWorklistSqlError(input); throw new Error('expected getter failure'); } catch (error) { expect(error).toBe(marker); }
    expect(calls).toEqual(['message', 'code', 'constraint'].slice(0, ['message', 'code', 'constraint'].indexOf(stage) + 1));
  });
});

describe('recognized native error constructors retain their original coercion', () => {
  for (const sql of ['WK400', 'WK403', 'WK409']) {
    it.each([
      { value: undefined, expected: 'Worklist database operation failed' },
      { value: null, expected: 'Worklist database operation failed' },
      { value: '', expected: '' }, { value: false, expected: 'false' },
      { value: 0, expected: '0' }, { value: 23, expected: '23' }, { value: 1n, expected: '1' },
    ])(`${sql} preserves message coercion %# and nullish-only default`, ({ value, expected }) => {
      const input = { code: sql, message: value };
      const result = mapWorklistSqlError(input);
      expect(result).toBeInstanceOf(Error);
      if (!(result instanceof Error)) throw new Error('expected native error result');
      expect(result.message).toBe(expected);
      expect(result.cause).toBe(input);
    });

    it(`${sql} preserves native Symbol message refusal`, () => {
      expect(() => mapWorklistSqlError({ code: sql, message: Symbol('text') })).toThrow(TypeError);
    });

    it(`${sql} performs opaque message string coercion after branch-specific constraint access`, () => {
      const calls: string[] = [];
      const message = {
        [Symbol.toPrimitive](hint: string) {
          expect(this).toBe(message);
          calls.push(`coerce:${hint}`);
          return 'opaque message';
        },
      };
      const input = { code: sql, message, get constraint() { calls.push('constraint'); return { opaque: true }; } };
      const result = mapWorklistSqlError(input);
      expect(result).toMatchObject({ message: 'opaque message' });
      expect(result).toBeInstanceOf(Error);
      if (!(result instanceof Error)) throw new Error('expected native error result');
      expect(result.cause).toBe(input);
      expect(calls).toEqual(sql === 'WK403' ? ['coerce:string'] : ['constraint', 'coerce:string']);
    });
  }

  it('preserves native message coercion exception identity after constraint evaluation', () => {
    const marker = new Error('coercion');
    const calls: string[] = [];
    const input = {
      code: 'WK400',
      message: { [Symbol.toPrimitive]() { calls.push('coerce'); throw marker; } },
      get constraint() { calls.push('constraint'); return 'c'; },
    };
    try { mapWorklistSqlError(input); throw new Error('expected coercion failure'); } catch (error) { expect(error).toBe(marker); }
    expect(calls).toEqual(['constraint', 'coerce']);
  });
});

describe('WK404 retains native includes lookup, receiver and truthiness', () => {
  it.each([true, {}, [], 'yes', 1, false, null, undefined, '', 0].map((returned) => ({ returned })))(
    'custom includes result %# chooses queue/item using original truthiness', ({ returned }) => {
      const calls: string[] = [];
      const message = {
        get includes() {
          calls.push('get includes');
          return function (this: unknown, needle: string) {
            expect(this).toBe(message);
            expect(needle).toBe('queue');
            calls.push('call includes');
            return returned;
          };
        },
      };
      const result = mapWorklistSqlError({ code: 'WK404', message });
      expect(result).toBeInstanceOf(WorklistNotFoundError);
      expect(result).toMatchObject({ context: { entity: returned ? 'queue' : 'item', id: 'unknown' } });
      expect(calls).toEqual(['get includes', 'call includes']);
    },
  );

  it.each(['get', 'call'])('preserves includes %s exception identity', (stage) => {
    const marker = new Error(stage);
    const message = { get includes() { if (stage === 'get') throw marker; return () => { throw marker; }; } };
    try { mapWorklistSqlError({ code: 'WK404', message }); throw new Error('expected includes failure'); } catch (error) { expect(error).toBe(marker); }
  });

  it.each([0, false, 1n, Symbol('message'), {}, { includes: true }].map((message) => ({ message })))(
    'noncallable includes %# keeps native TypeError instead of normalizing a message', ({ message }) => {
      expect(() => mapWorklistSqlError({ code: 'WK404', message })).toThrow(TypeError);
    },
  );
});
