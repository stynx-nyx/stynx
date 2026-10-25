import { describe, expect, it } from 'vitest';
import { mapWorklistSqlError } from '../../src/sql-errors.js';
import { WorklistInputError, WorklistForbiddenError, WorklistConflictError, WorklistNotFoundError } from '../../src/errors.js';

describe('SQL-error fixed constructor and native includes controls', () => {
  it.each([
    { sql: 'WK400', ctor: WorklistInputError, code: 'WORKLIST_INPUT_INVALID', status: 400 },
    { sql: 'WK403', ctor: WorklistForbiddenError, code: 'WORKLIST_FORBIDDEN', status: 403 },
    { sql: 'WK409', ctor: WorklistConflictError, code: 'WORKLIST_CONFLICT', status: 409 },
  ])('$sql retains the exact fixed constructor and prototype', ({ sql, ctor, code, status }) => {
    const constraint = { opaque: new Date(0) };
    const input = { code: sql, message: 'native message', constraint };
    const result = mapWorklistSqlError(input);
    expect(Object.getPrototypeOf(result)).toBe(ctor.prototype);
    expect(Reflect.get(Object(result), 'constructor')).toBe(ctor);
    expect(result).toBeInstanceOf(Error);
    if (!(result instanceof Error)) throw new Error('expected error');
    expect(result.name).toBe(ctor.name);
    expect(result.message).toBe('native message');
    expect(result.cause).toBe(input);
    expect(result).toMatchObject({ code, status, messageKey: code });
    if (sql === 'WK403') expect(Reflect.get(result, 'context')).toBeUndefined();
    else expect(Reflect.get(result, 'context').constraint).toBe(constraint);
  });

  it('calls an inherited callable proxy with the original message receiver and exact argument', () => {
    const calls: unknown[] = [];
    const target = function () { throw new Error('proxy target must not execute'); };
    const includes = new Proxy(target, {
      apply(actualTarget, receiver, argumentsList) {
        expect(actualTarget).toBe(target);
        expect(receiver).toBe(message);
        expect(argumentsList).toEqual(['queue']);
        calls.push('apply');
        return { opaque: true };
      },
    });
    const prototype = { get includes() { expect(this).toBe(message); calls.push('get'); return includes; } };
    const message = Object.create(prototype);
    const result = mapWorklistSqlError({ code: 'WK404', message });
    expect(Object.getPrototypeOf(result)).toBe(WorklistNotFoundError.prototype);
    expect(result).toMatchObject({ context: { entity: 'queue', id: 'unknown' } });
    expect(calls).toEqual(['get', 'apply']);
  });

  it('retains the native class-constructor includes call failure', () => {
    class IncludesClass {}
    const message = { includes: IncludesClass };
    expect(() => mapWorklistSqlError({ code: 'WK404', message })).toThrow(TypeError);
    expect(() => mapWorklistSqlError({ code: 'WK404', message })).toThrow("Class constructor IncludesClass cannot be invoked without 'new'");
  });

  it('retains the original noncallable includes error class and message', () => {
    expect(() => mapWorklistSqlError({ code: 'WK404', message: { includes: true } })).toThrow(TypeError);
    expect(() => mapWorklistSqlError({ code: 'WK404', message: { includes: true } })).toThrow('message.includes is not a function');
  });
});
