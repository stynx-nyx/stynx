import { executeConfiguredQuery } from '@stynx-nyx/data';
import type { StorageCatalogEntry, StorageVerifierTransaction } from '@stynx-nyx/data';
import { inspectOfflineRows } from './storage-invariants.js';
import { OfflineImportError } from './import-contract.js';
import { canonicalImportJson } from './import-validation.js';
import type { OfflineImportRecord } from './import-schema.generated.js';
import type { OfflineImportOverlayParams } from './import-overlay.repository.js';

export interface IntendedImportRow {
  readonly kind: OfflineImportRecord['kind'];
  readonly row: Readonly<Record<string, unknown>>;
}
/** Inspect a typed, read-only overlay of existing and intended rows before business inserts. */
export async function preflightOfflineImport(
  trx: StorageVerifierTransaction,
  intended: readonly IntendedImportRow[],
  ledger: Readonly<Record<string, unknown>>,
  catalog: readonly StorageCatalogEntry[],
): Promise<void> {
  const rows = (kind: OfflineImportRecord['kind']): string =>
    canonicalImportJson(intended.filter((record) => record.kind === kind).map((record) => record.row));
  const values: OfflineImportOverlayParams = [
    rows('ranges'),
    rows('reservations'),
    rows('queueItems'),
    rows('conflicts'),
    rows('batches'),
    rows('transportKeys'),
    rows('receipts'),
    rows('attempts'),
    rows('consumption'),
    rows('conflictEvidence'),
    rows('conflictActions'),
    rows('reconciliations'),
    canonicalImportJson([ledger]),
  ];
  const findings = await inspectOfflineRows(trx, values);
  if (findings.length) throw new OfflineImportError('invariant-violation', 'intended-state');
  for (const entry of catalog) {
    if (entry.kind !== 'constraint' || entry.value.kind !== 'f') continue;
    const table = entry.name.slice(0, entry.name.indexOf('.'));
    const columns = entry.value.columns;
    const referenced = entry.value.referencedColumns;
    const targetSchema = entry.value.referencedSchema;
    const targetTable = entry.value.referencedTable;
    if (!Array.isArray(columns) || !columns.every((column): column is string => typeof column === 'string') ||
        !Array.isArray(referenced) || !referenced.every((column): column is string => typeof column === 'string') ||
        typeof targetSchema !== 'string' || typeof targetTable !== 'string') {
      throw new TypeError('Invalid foreign-key catalog binding');
    }
    const result = await executeConfiguredQuery(trx, 'offline.import-foreign-key-orphans', {
      sourceSchema: 'offline', sourceTable: table, sourceColumns: columns,
      targetSchema, targetTable, targetColumns: referenced,
    }, values);
    if (result.rows[0]?.count !== '0')
      throw new OfflineImportError('invariant-violation', `foreign-key:${entry.name}`);
  }
}
