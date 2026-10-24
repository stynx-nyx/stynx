import { executeTypedQuery } from './checked-executor.js';
import { storageCatalogQueries } from './storage-catalog.repository.js';
import type { StorageVerifierTransaction } from './storage-contract.js';

/** Stable catalog identities, without OIDs, rows, secret settings or sequence values. */
export interface StorageCatalogEntry {
  kind: string;
  name: string;
  value: Record<string, unknown>;
}


/** Queries only; used by explicit generation tooling and live read-only verification. */
export async function collectStorageCatalog(
  trx: StorageVerifierTransaction,
  schema: string,
): Promise<StorageCatalogEntry[]> {
  const entries: StorageCatalogEntry[] = [];
  for (const { kind, query } of storageCatalogQueries) {
    const rows = await executeTypedQuery(trx, query, [schema]);
    entries.push(...rows.map((row) => ({ kind, ...row })));
  }
  return entries.sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`, 'en'),
  );
}
