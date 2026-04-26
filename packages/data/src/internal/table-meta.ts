import { getTableConfig, type AnyPgTable } from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm/utils';

export interface TableMeta {
  schema: string;
  table: string;
  qualifiedName: string;
  mirrorQualifiedName: string;
  columnNames: string[];
}

export function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function qualifiedName(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

export function mirrorQualifiedName(schema: string, table: string): string {
  return qualifiedName('archive', `${schema}_${table}`);
}

export function getTableMeta(table: AnyPgTable): TableMeta {
  const config = getTableConfig(table);
  const columns = Object.values(getTableColumns(table)).filter(
    (column) => (column as { generated?: unknown }).generated === undefined,
  );
  return {
    schema: config.schema ?? 'public',
    table: config.name,
    qualifiedName: qualifiedName(config.schema ?? 'public', config.name),
    mirrorQualifiedName: mirrorQualifiedName(config.schema ?? 'public', config.name),
    columnNames: columns.map((column) => column.name),
  };
}
