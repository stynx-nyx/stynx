import { executeGuardedQueryRows } from './checked-executor.js';
import { QueryRowValidationError } from './errors.js';
import { storageCatalogQueries } from './storage-catalog.repository.js';
import type { StorageVerifierTransaction } from './storage-contract.js';

/** Stable catalog identities, without OIDs, rows, secret settings or sequence values. */
export interface StorageCatalogEntry {
  kind: string;
  name: string;
  value: Record<string, unknown>;
}


type CatalogRow = { name: string; value: Record<string, unknown> };

function isCatalogRow(value: unknown): value is CatalogRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const name: unknown = Reflect.get(value, 'name');
  const catalogValue: unknown = Reflect.get(value, 'value');
  return typeof name === 'string' && typeof catalogValue === 'object' &&
    catalogValue !== null && !Array.isArray(catalogValue);
}

function isCatalogEntry(value: unknown): value is StorageCatalogEntry {
  return isCatalogRow(value) && typeof Reflect.get(value, 'kind') === 'string';
}

/** Queries only; used by explicit generation tooling and live read-only verification. */
export async function collectStorageCatalog(
  trx: StorageVerifierTransaction,
  schema: string,
): Promise<StorageCatalogEntry[]> {
  const entries: StorageCatalogEntry[] = [];
  for (const { kind, query } of storageCatalogQueries) {
    const rows = await executeGuardedQueryRows<
      (typeof query)['params'], (typeof query)['row'], CatalogRow
    >(trx, query, [schema], isCatalogRow);
    entries.push(...rows.map((row, rowIndex) => {
      const entry = { kind, ...row };
      if (!isCatalogEntry(entry)) {
        throw new QueryRowValidationError(query.name, rowIndex, [{ path: [], code: 'invalid_type' }]);
      }
      return entry;
    }));
  }
  return entries.sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`, 'en'),
  );
}
