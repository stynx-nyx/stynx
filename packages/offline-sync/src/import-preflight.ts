import { quoteStorageIdentifier } from '@stynx-nyx/data';
import type { StorageCatalogEntry, StorageVerifierTransaction } from '@stynx-nyx/data';
import { inspectOfflineRows } from './storage-invariants';
import { OfflineImportError } from './import-contract';
import { IMPORT_RELATIONS, IMPORT_KEYS, canonicalImportJson } from './import-validation';
import type { OfflineImportRecord } from './import-schema.generated';

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
  const values: unknown[] = [],
    ctes: string[] = [];
  const alias = (table: string): string => quoteStorageIdentifier(`stynx_import_view_${table}`);
  for (const [kind, table] of Object.entries(IMPORT_RELATIONS)) {
    const rows = intended.filter((record) => record.kind === kind).map((record) => record.row);
    values.push(canonicalImportJson(rows));
    const keys = IMPORT_KEYS[kind as OfflineImportRecord['kind']];
    const same = keys
      .map(
        (key) => `existing.${quoteStorageIdentifier(key)}=incoming.${quoteStorageIdentifier(key)}`,
      )
      .join(' and ');
    ctes.push(`${alias(table)} as (select * from offline.${quoteStorageIdentifier(table)} union all
      select incoming.* from jsonb_populate_recordset(null::offline.${quoteStorageIdentifier(table)},$${values.length}::jsonb) incoming
      where not exists(select 1 from offline.${quoteStorageIdentifier(table)} existing where ${same}))`);
  }
  const scopes = 'numbering_reservation_scopes';
  ctes.push(`${alias(scopes)} as (select * from offline.${quoteStorageIdentifier(scopes)} union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from ${alias('numbering_reservations')}) incoming where not exists(
        select 1 from offline.${quoteStorageIdentifier(scopes)} existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope))`);
  values.push(canonicalImportJson([ledger]));
  ctes.push(`${alias('sync_import_receipts')} as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$${values.length}::jsonb) incoming)`);
  const tables = [...Object.values(IMPORT_RELATIONS), scopes, 'sync_import_receipts'];
  const overlay: StorageVerifierTransaction = {
    async query<T extends Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
      // Both reviewed callers emit parameter-free invariant/FK queries. Bind
      // only the overlay values; do not implement an unused SQL rewrite dialect.
      let body = sql;
      for (const table of tables)
        body = body.replace(
          new RegExp(`(?:"offline"|\\boffline)\\.(?:"${table}"|${table}\\b)`, 'gu'),
          alias(table),
        );
      const combined = /^\s*with\s+/iu.test(body)
        ? `with ${ctes.join(',')}, ${body.replace(/^\s*with\s+/iu, '')}`
        : `with ${ctes.join(',')} ${body}`;
      return trx.query<T>(combined, values);
    },
  };
  const findings = await inspectOfflineRows(overlay);
  if (findings.length) throw new OfflineImportError('invariant-violation', 'intended-state');
  for (const entry of catalog) {
    if (entry.kind !== 'constraint' || entry.value.kind !== 'f') continue;
    const table = entry.name.slice(0, entry.name.indexOf('.'));
    const columns = entry.value.columns as string[],
      referenced = entry.value.referencedColumns as string[];
    const present = columns
      .map((column) => `child.${quoteStorageIdentifier(column)} is not null`)
      .join(' and ');
    const same = columns
      .map(
        (column, index) =>
          `child.${quoteStorageIdentifier(column)}=parent.${quoteStorageIdentifier(referenced[index]!)}`,
      )
      .join(' and ');
    const result = await overlay.query<{
      count: string;
    }>(`select count(*)::text as count from offline.${quoteStorageIdentifier(table)} child
      where ${present} and not exists(select 1 from ${quoteStorageIdentifier(entry.value.referencedSchema as string)}.${quoteStorageIdentifier(entry.value.referencedTable as string)} parent where ${same})`);
    if (result.rows[0]?.count !== '0')
      throw new OfflineImportError('invariant-violation', `foreign-key:${entry.name}`);
  }
}
