import { getTableColumns } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { getTableMeta, quoteIdent } from './table-meta';

export interface ArchiveMirrorColumn {
  propertyKey: string;
  columnName: string;
}

export interface ArchiveMirrorSchema<TTable extends AnyPgTable = AnyPgTable> {
  liveTable: TTable;
  schema: 'archive';
  table: string;
  qualifiedName: string;
  liveColumns: ArchiveMirrorColumn[];
  archiveColumns: {
    archiveId: 'archive_id';
    archivedAt: 'archived_at';
    deletedAt: 'deleted_at';
    deletedBy: 'deleted_by';
    lastErasureAt: 'last_erasure_at';
  };
}

export function archiveOf<TTable extends AnyPgTable>(liveTable: TTable): ArchiveMirrorSchema<TTable> {
  const meta = getTableMeta(liveTable);
  const liveColumns = Object.entries(getTableColumns(liveTable)).map(([propertyKey, column]) => ({
    propertyKey,
    columnName: (column as { name: string }).name,
  }));
  const archiveTable = `${meta.schema}_${meta.table}`;

  return {
    liveTable,
    schema: 'archive',
    table: archiveTable,
    qualifiedName: `${quoteIdent('archive')}.${quoteIdent(archiveTable)}`,
    liveColumns,
    archiveColumns: {
      archiveId: 'archive_id',
      archivedAt: 'archived_at',
      deletedAt: 'deleted_at',
      deletedBy: 'deleted_by',
      lastErasureAt: 'last_erasure_at',
    },
  };
}
