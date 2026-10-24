import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { LIVE_ONLY, SOFT_DELETABLE, type LiveOnlyTable, type SoftDeletableTable } from './types.js';

export function softDeletable<T extends AnyPgTable>(table: T): SoftDeletableTable<T> {
  Object.defineProperty(table, SOFT_DELETABLE, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  if (isSoftDeletable(table)) return table;
  throw new TypeError('The soft-deletable marker was not installed');
}

export function makeLiveOnly<T extends AnyPgTable>(table: T): LiveOnlyTable<T> {
  Object.defineProperty(table, LIVE_ONLY, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  if (isLiveOnly(table)) return table;
  throw new TypeError('The live-only marker was not installed');
}

export function isSoftDeletable(table: unknown): table is { readonly [SOFT_DELETABLE]: true } {
  return ((typeof table === 'object' && table !== null) || typeof table === 'function') &&
    SOFT_DELETABLE in table && table[SOFT_DELETABLE] === true;
}

function isLiveOnly(table: unknown): table is { readonly [LIVE_ONLY]: true } {
  return ((typeof table === 'object' && table !== null) || typeof table === 'function') &&
    LIVE_ONLY in table && table[LIVE_ONLY] === true;
}
