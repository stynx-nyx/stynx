import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { LiveOnlyTable, SoftDeletableTable } from './types';

const SOFT_DELETABLE = Symbol.for('stynx.data.soft-deletable');
const LIVE_ONLY = Symbol.for('stynx.data.live-only');

type BrandedTable = AnyPgTable & {
  [SOFT_DELETABLE]?: true;
  [LIVE_ONLY]?: true;
};

export function softDeletable<T extends AnyPgTable>(table: T): SoftDeletableTable<T> {
  Object.defineProperty(table, SOFT_DELETABLE, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return table as SoftDeletableTable<T>;
}

export function makeLiveOnly<T extends AnyPgTable>(table: T): LiveOnlyTable<T> {
  Object.defineProperty(table, LIVE_ONLY, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return table as LiveOnlyTable<T>;
}

export function isSoftDeletable(table: unknown): table is SoftDeletableTable<AnyPgTable> {
  return Boolean((table as BrandedTable | undefined)?.[SOFT_DELETABLE]);
}
