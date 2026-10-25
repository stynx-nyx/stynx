import {
  WorklistConflictError,
  WorklistForbiddenError,
  WorklistInputError,
  WorklistNotFoundError,
} from './errors.js';

function readSqlErrorProperty(
  value: unknown,
  key: 'message' | 'code' | 'constraint' | 'includes',
): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
  }
  const target: unknown = Object(value);
  if ((typeof target !== 'object' || target === null) && typeof target !== 'function') {
    throw new TypeError('Invalid native property target');
  }
  return Reflect.get(target, key, value);
}

export function mapWorklistSqlError(error: unknown): unknown {
  const message = readSqlErrorProperty(error, 'message') ?? 'Worklist database operation failed';
  if (
    readSqlErrorProperty(error, 'code') === 'WK400' ||
    readSqlErrorProperty(error, 'code') === '23503' ||
    readSqlErrorProperty(error, 'code') === '23514'
  ) {
    const mapped: unknown = Reflect.construct(WorklistInputError, [
      message,
      { constraint: readSqlErrorProperty(error, 'constraint') },
      error,
    ]);
    return mapped;
  }
  if (readSqlErrorProperty(error, 'code') === 'WK403') {
    const mapped: unknown = Reflect.construct(WorklistForbiddenError, [message, error]);
    return mapped;
  }
  if (readSqlErrorProperty(error, 'code') === 'WK404') {
    const includes = readSqlErrorProperty(message, 'includes');
    if (typeof includes !== 'function') throw new TypeError('message.includes is not a function');
    const containsQueue: unknown = Reflect.apply(includes, message, ['queue']);
    return new WorklistNotFoundError(containsQueue ? 'queue' : 'item', 'unknown');
  }
  if (
    readSqlErrorProperty(error, 'code') === 'WK409' ||
    readSqlErrorProperty(error, 'code') === '23505'
  ) {
    const mapped: unknown = Reflect.construct(WorklistConflictError, [
      message,
      { constraint: readSqlErrorProperty(error, 'constraint') },
      error,
    ]);
    return mapped;
  }
  return error;
}
