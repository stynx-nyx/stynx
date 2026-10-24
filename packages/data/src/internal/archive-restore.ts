import { executeTypedQuery, executeLegacyArchive } from '../checked-executor.js';
import { archiveMoveContext, archiveRestoreReason } from '../archive.repository.js';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  ArchiveMirrorMissingError,
  RestoreCascadeParentsArchivedError,
  RestoreConflictError,
} from '../errors.js';
import type { RestoreOptions, RestoreResult } from '../types.js';
import { mirrorQualifiedName, qualifiedName, quoteIdent, type TableMeta } from './table-meta.js';
import type { ArchivedParent, ArchiveLookupRow, RegistryEntry } from './archive-relations.js';

export interface RestoreContext {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
  loadArchivedRow(
    meta: TableMeta,
    id: string,
    archiveId?: bigint,
  ): Promise<ArchiveLookupRow | undefined>;
  findArchivedParents(meta: TableMeta, rowData: Record<string, unknown>): Promise<ArchivedParent[]>;
  findRestoreConflict(
    meta: TableMeta,
    rowData: Record<string, unknown>,
    id: string,
  ): Promise<Record<string, unknown> | undefined>;
  loadRegistryByParent(parentSchema: string, parentTable: string): Promise<RegistryEntry[]>;
  loadColumnNames(schemaName: string, tableName: string): Promise<string[]>;
  sampleArchiveSize(meta: TableMeta): Promise<void>;
  incrementRestore(label: string): void;
  metricLabel(meta: TableMeta): string;
  restoreByReference(
    meta: TableMeta,
    id: string,
    options: RestoreOptions,
    restoredChildren: Array<{ schema: string; table: string; id: string }>,
  ): Promise<RestoreResult>;
}

export async function restoreByReference(
  ctx: RestoreContext,
  meta: TableMeta,
  id: string,
  options: RestoreOptions,
  restoredChildren: Array<{ schema: string; table: string; id: string }>,
): Promise<RestoreResult> {
  const archived = await ctx.loadArchivedRow(meta, id, options.archiveId);
  if (!archived) {
    throw new ArchiveMirrorMissingError({ table: meta.mirrorQualifiedName, id });
  }

  const archivedParents = await ctx.findArchivedParents(meta, archived.row_data);
  if (archivedParents.length > 0 && !options.cascade) {
    throw new RestoreCascadeParentsArchivedError({
      archivedParents,
    });
  }

  if (options.cascade) {
    for (const parent of archivedParents) {
      await ctx.restoreByReference(
        {
          schema: parent.schema,
          table: parent.table,
          qualifiedName: qualifiedName(parent.schema, parent.table),
          mirrorQualifiedName: mirrorQualifiedName(parent.schema, parent.table),
          columnNames: await ctx.loadColumnNames(parent.schema, parent.table),
        },
        parent.id,
        { cascade: true },
        restoredChildren,
      );
    }
  }

  const conflict = await ctx.findRestoreConflict(meta, archived.row_data, id);
  if (conflict) {
    throw new RestoreConflictError(conflict);
  }

  await executeTypedQuery(ctx, archiveMoveContext, []);
  await executeTypedQuery(ctx, archiveRestoreReason, []);

  try {
    await executeLegacyArchive(ctx, 'restore-insert',
      `
        insert into ${meta.qualifiedName} (${meta.columnNames.map(quoteIdent).join(', ')})
        select ${meta.columnNames.map(quoteIdent).join(', ')}
        from ${meta.mirrorQualifiedName}
        where archive_id = $1
      `,
      [archived.archive_id],
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new RestoreConflictError({
        conflictingConstraint: 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : 'unique_violation',
        conflictValues: { id },
        blockingLiveId: id,
      });
    }
    throw error;
  }

  await executeLegacyArchive(ctx, 'restore-delete-archive',`delete from ${meta.mirrorQualifiedName} where archive_id = $1`, [
    archived.archive_id,
  ]);
  ctx.incrementRestore(ctx.metricLabel(meta));
  await ctx.sampleArchiveSize(meta);

  if (options.cascade) {
    for (const entry of await ctx.loadRegistryByParent(meta.schema, meta.table)) {
      if (entry.behavior !== 'cascade') {
        continue;
      }
      const children = await executeLegacyArchive(ctx, 'restore-children',
        `
          select id
          from ${mirrorQualifiedName(entry.childSchema, entry.childTable)}
          where ${quoteIdent(entry.childColumn)} = $1
            and deleted_at = $2::timestamptz
        `,
        [id, archived.deleted_at],
      );

      for (const child of children.rows) {
        const restored = await ctx.restoreByReference(
          {
            schema: entry.childSchema,
            table: entry.childTable,
            qualifiedName: qualifiedName(entry.childSchema, entry.childTable),
            mirrorQualifiedName: mirrorQualifiedName(entry.childSchema, entry.childTable),
            columnNames: await ctx.loadColumnNames(entry.childSchema, entry.childTable),
          },
          child.id,
          { cascade: true },
          restoredChildren,
        );
        restoredChildren.push({
          schema: entry.childSchema,
          table: entry.childTable,
          id: restored.id,
        });
      }
    }
  }

  return {
    id,
    restoredAt: new Date().toISOString(),
    ...(restoredChildren.length > 0 ? { cascadeChildren: restoredChildren } : {}),
  };
}
