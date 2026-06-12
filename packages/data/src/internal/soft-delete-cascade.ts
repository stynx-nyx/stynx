import type { QueryResult, QueryResultRow } from 'pg';
import {
  ArchiveMirrorMissingError,
  CascadeTooDeepError,
  CascadeTooLargeError,
  SoftDeleteBlockedError,
} from '../errors';
import type { CascadePlan } from '../types';
import { mirrorQualifiedName, qualifiedName, quoteIdent, type TableMeta } from './table-meta';
import type { RegistryEntry } from './archive-relations';

export interface SoftDeleteContext {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
  ensureMirrorExists(meta: TableMeta): Promise<void>;
  loadRegistryByParent(parentSchema: string, parentTable: string): Promise<RegistryEntry[]>;
  listChildIds(entry: RegistryEntry, parentId: string): Promise<string[]>;
  loadColumnNames(schemaName: string, tableName: string): Promise<string[]>;
  describeBlockingChildren(meta: TableMeta, id: string): Promise<Array<Record<string, unknown>>>;
  sampleArchiveSize(meta: TableMeta): Promise<void>;
  metricLabel(meta: TableMeta): string;
  incrementSoftDelete(label: string): void;
  softDeleteByReference(
    meta: TableMeta,
    id: string,
    deletedAt: string,
    maxCascadeDepth: number,
    maxCascadeRows: number,
    depth: number,
    cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>,
  ): Promise<void>;
  buildCascadePlan(
    meta: TableMeta,
    id: string,
    maxCascadeDepth: number,
    maxCascadeRows: number,
    depth?: number,
  ): Promise<CascadePlan>;
}

export async function buildCascadePlan(
  ctx: Pick<
    SoftDeleteContext,
    'loadRegistryByParent' | 'listChildIds' | 'loadColumnNames' | 'buildCascadePlan'
  >,
  meta: TableMeta,
  id: string,
  maxCascadeDepth: number,
  maxCascadeRows: number,
  depth = 0,
): Promise<CascadePlan> {
  if (depth > maxCascadeDepth) {
    throw new CascadeTooDeepError({
      attempted: depth,
      maxDepth: maxCascadeDepth,
      parent: { schema: meta.schema, table: meta.table, id },
    });
  }

  const registry = await ctx.loadRegistryByParent(meta.schema, meta.table);
  const steps: CascadePlan['steps'] = [];
  let totalRows = 1;
  let observedMaxDepth = depth;

  for (const entry of registry.filter((item) => item.behavior === 'cascade')) {
    const childIds = await ctx.listChildIds(entry, id);
    if (childIds.length === 0) {
      continue;
    }

    steps.push({
      schema: entry.childSchema,
      table: entry.childTable,
      rowCount: childIds.length,
      fkBehavior: 'cascade',
    });
    totalRows += childIds.length;

    for (const childId of childIds) {
      const childMeta: TableMeta = {
        schema: entry.childSchema,
        table: entry.childTable,
        qualifiedName: qualifiedName(entry.childSchema, entry.childTable),
        mirrorQualifiedName: mirrorQualifiedName(entry.childSchema, entry.childTable),
        columnNames: await ctx.loadColumnNames(entry.childSchema, entry.childTable),
      };
      const childPlan = await ctx.buildCascadePlan(
        childMeta,
        childId,
        maxCascadeDepth,
        maxCascadeRows,
        depth + 1,
      );
      steps.push(...childPlan.steps);
      totalRows += childPlan.totalRows - 1;
      observedMaxDepth = Math.max(observedMaxDepth, childPlan.maxDepth);
    }
  }

  if (totalRows > maxCascadeRows) {
    throw new CascadeTooLargeError({
      maxRows: maxCascadeRows,
      plan: {
        parent: { schema: meta.schema, table: meta.table, id },
        steps,
        totalRows,
        maxDepth: observedMaxDepth,
        withinLimits: false,
      },
    });
  }

  return {
    parent: { schema: meta.schema, table: meta.table, id },
    steps,
    totalRows,
    maxDepth: observedMaxDepth,
    withinLimits: true,
  };
}

export async function softDeleteByReference(
  ctx: SoftDeleteContext,
  meta: TableMeta,
  id: string,
  deletedAt: string,
  maxCascadeDepth: number,
  maxCascadeRows: number,
  depth: number,
  cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>,
): Promise<void> {
  if (depth > maxCascadeDepth) {
    throw new CascadeTooDeepError({
      attempted: depth,
      maxDepth: maxCascadeDepth,
      parent: { schema: meta.schema, table: meta.table, id },
    });
  }

  await ctx.ensureMirrorExists(meta);
  const registry = await ctx.loadRegistryByParent(meta.schema, meta.table);
  let totalRows = 1;

  for (const entry of registry.filter((item) => item.behavior === 'cascade')) {
    const childIds = await ctx.listChildIds(entry, id);
    totalRows += childIds.length;
    if (totalRows > maxCascadeRows) {
      throw new CascadeTooLargeError({
        maxRows: maxCascadeRows,
        parent: { schema: meta.schema, table: meta.table, id },
        childTable: `${entry.childSchema}.${entry.childTable}`,
      });
    }

    for (const childId of childIds) {
      const childMeta: TableMeta = {
        schema: entry.childSchema,
        table: entry.childTable,
        qualifiedName: qualifiedName(entry.childSchema, entry.childTable),
        mirrorQualifiedName: mirrorQualifiedName(entry.childSchema, entry.childTable),
        columnNames: await ctx.loadColumnNames(entry.childSchema, entry.childTable),
      };
      await ctx.softDeleteByReference(
        childMeta,
        childId,
        deletedAt,
        maxCascadeDepth,
        maxCascadeRows,
        depth + 1,
        cascaded,
      );
    }
  }

  const blockingChildren = await ctx.describeBlockingChildren(meta, id);
  if (blockingChildren.length > 0) {
    throw new SoftDeleteBlockedError({
      parent: { schema: meta.schema, table: meta.table, id },
      blockingChildren,
    });
  }

  await ctx.query(`select set_config('app.archive_move', 'in_progress', true)`);
  await ctx.query(`select set_config('app.archive_reason', 'soft_delete', true)`);

  const insert = await ctx.query<{ archive_id: string }>(
    `
      insert into ${meta.mirrorQualifiedName} (${meta.columnNames.map(quoteIdent).join(', ')}, deleted_at, deleted_by)
      select ${meta.columnNames.map(quoteIdent).join(', ')}, $2::timestamptz, current_setting('app.actor_id', true)::uuid
      from ${meta.qualifiedName}
      where id = $1
      returning archive_id
    `,
    [id, deletedAt],
  );

  if (insert.rowCount === 0) {
    throw new ArchiveMirrorMissingError({ table: meta.qualifiedName, id });
  }

  try {
    await ctx.query(`delete from ${meta.qualifiedName} where id = $1`, [id]);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '23503' || code === '23001') {
      throw new SoftDeleteBlockedError({
        parent: { schema: meta.schema, table: meta.table, id },
        blockingChildren,
      });
    }
    throw error;
  }

  cascaded.push({
    schema: meta.schema,
    table: meta.table,
    archiveId: BigInt(insert.rows[0]?.archive_id ?? '0'),
    id,
  });
  ctx.incrementSoftDelete(ctx.metricLabel(meta));
  await ctx.sampleArchiveSize(meta);
}
