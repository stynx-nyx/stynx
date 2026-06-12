import type { QueryResult, QueryResultRow } from 'pg';
import { ArchiveMirrorMissingError } from '../errors';
import { mirrorQualifiedName, qualifiedName, quoteIdent, type TableMeta } from './table-meta';

export interface RegistryEntry {
  parentSchema: string;
  parentTable: string;
  childSchema: string;
  childTable: string;
  fkConstraint: string;
  behavior: 'hide' | 'cascade' | 'block';
  childColumn: string;
}

export interface ArchivedParent {
  schema: string;
  table: string;
  id: string;
}

export interface ArchiveLookupRow extends QueryResultRow {
  archive_id: string;
  deleted_at: string;
  row_data: Record<string, unknown>;
}

interface UniqueConstraintRow extends QueryResultRow {
  constraint_name: string;
  columns: string[] | string;
}

export interface ArchiveRelationContext {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
  loadRegistryByParent(parentSchema: string, parentTable: string): Promise<RegistryEntry[]>;
  loadRegistryByChild(childSchema: string, childTable: string): Promise<RegistryEntry[]>;
}

export async function loadRegistryByParent(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  parentSchema: string,
  parentTable: string,
): Promise<RegistryEntry[]> {
  const result = await ctx.query<RegistryEntry>(
    `
      select
        registry.parent_schema as "parentSchema",
        registry.parent_table as "parentTable",
        registry.child_schema as "childSchema",
        registry.child_table as "childTable",
        registry.fk_constraint as "fkConstraint",
        registry.behavior as behavior,
        child_attribute.attname as "childColumn"
      from core.softdelete_fk_registry registry
      join pg_namespace child_namespace
        on child_namespace.nspname = registry.child_schema
      join pg_class child_class
        on child_class.relname = registry.child_table
       and child_class.relnamespace = child_namespace.oid
      join pg_constraint constraint_item
        on constraint_item.conname = registry.fk_constraint
       and constraint_item.conrelid = child_class.oid
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_class.oid
       and child_attribute.attnum = constraint_item.conkey[1]
      where registry.parent_schema = $1
        and registry.parent_table = $2
    `,
    [parentSchema, parentTable],
  );
  return result.rows;
}

export async function loadRegistryByChild(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  childSchema: string,
  childTable: string,
): Promise<RegistryEntry[]> {
  const result = await ctx.query<RegistryEntry>(
    `
      select
        registry.parent_schema as "parentSchema",
        registry.parent_table as "parentTable",
        registry.child_schema as "childSchema",
        registry.child_table as "childTable",
        registry.fk_constraint as "fkConstraint",
        registry.behavior as behavior,
        child_attribute.attname as "childColumn"
      from core.softdelete_fk_registry registry
      join pg_namespace child_namespace
        on child_namespace.nspname = registry.child_schema
      join pg_class child_class
        on child_class.relname = registry.child_table
       and child_class.relnamespace = child_namespace.oid
      join pg_constraint constraint_item
        on constraint_item.conname = registry.fk_constraint
       and constraint_item.conrelid = child_class.oid
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_class.oid
       and child_attribute.attnum = constraint_item.conkey[1]
      where registry.child_schema = $1
        and registry.child_table = $2
    `,
    [childSchema, childTable],
  );
  return result.rows;
}

export async function listChildIds(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  entry: RegistryEntry,
  parentId: string,
): Promise<string[]> {
  const result = await ctx.query<{ id: string }>(
    `
      select id
      from ${qualifiedName(entry.childSchema, entry.childTable)}
      where ${quoteIdent(entry.childColumn)} = $1
    `,
    [parentId],
  );
  return result.rows.map((row) => row.id);
}

export async function describeBlockingChildren(
  ctx: Pick<ArchiveRelationContext, 'query' | 'loadRegistryByParent'>,
  meta: TableMeta,
  id: string,
): Promise<Array<Record<string, unknown>>> {
  const registry = await ctx.loadRegistryByParent(meta.schema, meta.table);
  const blocking: Array<Record<string, unknown>> = [];

  for (const entry of registry.filter((item) => item.behavior === 'block')) {
    const countResult = await ctx.query<{ count: string }>(
      `
        select count(*)::text as count
        from ${qualifiedName(entry.childSchema, entry.childTable)}
        where ${quoteIdent(entry.childColumn)} = $1
      `,
      [id],
    );
    const count = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);
    if (count === 0) {
      continue;
    }

    const sampleResult = await ctx.query<{ id: string }>(
      `
        select id
        from ${qualifiedName(entry.childSchema, entry.childTable)}
        where ${quoteIdent(entry.childColumn)} = $1
        limit 10
      `,
      [id],
    );

    blocking.push({
      schema: entry.childSchema,
      table: entry.childTable,
      count,
      sampleIds: sampleResult.rows.map((row) => row.id),
    });
  }

  return blocking;
}

export async function loadArchivedRow(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  meta: TableMeta,
  id: string,
  archiveId?: bigint,
): Promise<ArchiveLookupRow | undefined> {
  const result = await ctx.query<ArchiveLookupRow>(
    `
      select
        archive_id,
        deleted_at::text as deleted_at,
        to_jsonb(source.*) as row_data
      from ${meta.mirrorQualifiedName} source
      where id = $1
        and ($2::bigint is null or archive_id = $2::bigint)
      order by deleted_at desc
      limit 1
    `,
    [id, archiveId?.toString() ?? null],
  );
  return result.rows[0];
}

export async function findArchivedParents(
  ctx: Pick<ArchiveRelationContext, 'query' | 'loadRegistryByChild'>,
  meta: TableMeta,
  rowData: Record<string, unknown>,
): Promise<ArchivedParent[]> {
  const registry = await ctx.loadRegistryByChild(meta.schema, meta.table);
  const archivedParents: ArchivedParent[] = [];

  for (const entry of registry.filter(
    (item) => item.behavior === 'block' || item.behavior === 'cascade',
  )) {
    const fkValue = rowData[entry.childColumn];
    if (typeof fkValue !== 'string' || fkValue.length === 0) {
      continue;
    }

    const liveParent = await ctx.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from ${qualifiedName(entry.parentSchema, entry.parentTable)}
          where id = $1
        ) as exists
      `,
      [fkValue],
    );

    if (liveParent.rows[0]?.exists) {
      continue;
    }

    const archiveParent = await ctx.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from ${mirrorQualifiedName(entry.parentSchema, entry.parentTable)}
          where id = $1
        ) as exists
      `,
      [fkValue],
    );

    if (archiveParent.rows[0]?.exists) {
      archivedParents.push({
        schema: entry.parentSchema,
        table: entry.parentTable,
        id: fkValue,
      });
    }
  }

  return archivedParents;
}

export async function findRestoreConflict(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  meta: TableMeta,
  rowData: Record<string, unknown>,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const constraints = await ctx.query<UniqueConstraintRow>(
    `
      select
        constraint_item.conname as constraint_name,
        array_agg(attribute.attname order by attribute.attnum) as columns
      from pg_constraint constraint_item
      join pg_class table_class on table_class.oid = constraint_item.conrelid
      join pg_namespace namespace_item on namespace_item.oid = table_class.relnamespace
      join unnest(constraint_item.conkey) as key_items(attnum) on true
      join pg_attribute attribute
        on attribute.attrelid = table_class.oid
       and attribute.attnum = key_items.attnum
      where namespace_item.nspname = $1
        and table_class.relname = $2
        and constraint_item.contype in ('u', 'p')
      group by constraint_item.conname
    `,
    [meta.schema, meta.table],
  );

  for (const constraint of constraints.rows) {
    const columns = Array.isArray(constraint.columns)
      ? constraint.columns
      : String(constraint.columns)
          .replace(/^\{/, '')
          .replace(/\}$/, '')
          .split(',')
          .filter((column) => column.length > 0);
    const values = columns.map((column) => rowData[column]);
    if (values.some((value) => value === null || value === undefined)) {
      continue;
    }

    const whereClause = columns
      .map((column, index) => `${quoteIdent(column)} is not distinct from $${index + 1}`)
      .join(' and ');
    const conflict = await ctx.query<{ blocking_id: string }>(
      `
        select id::text as blocking_id
        from ${meta.qualifiedName}
        where ${whereClause}
          and id <> $${columns.length + 1}
        limit 1
      `,
      [...values, id],
    );

    if ((conflict.rowCount ?? 0) > 0) {
      return {
        conflictingConstraint: constraint.constraint_name,
        conflictValues: Object.fromEntries(columns.map((column) => [column, rowData[column]])),
        blockingLiveId: conflict.rows[0]?.blocking_id,
      };
    }
  }

  return undefined;
}

export async function loadColumnNames(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  schemaName: string,
  tableName: string,
): Promise<string[]> {
  const result = await ctx.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and coalesce(is_generated, 'NEVER') <> 'ALWAYS'
      order by ordinal_position
    `,
    [schemaName, tableName],
  );
  return result.rows.map((row) => row.column_name);
}

export async function ensureMirrorExists(
  ctx: Pick<ArchiveRelationContext, 'query'>,
  meta: TableMeta,
): Promise<void> {
  const result = await ctx.query<{ exists: boolean }>(
    `select to_regclass($1) is not null as exists`,
    [`archive.${meta.schema}_${meta.table}`],
  );
  if (!result.rows[0]?.exists) {
    throw new ArchiveMirrorMissingError({
      table: meta.qualifiedName,
      archiveTable: meta.mirrorQualifiedName,
    });
  }
}
