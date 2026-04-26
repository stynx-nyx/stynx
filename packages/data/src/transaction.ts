import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type SQL, type SQLWrapper } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  ArchiveMirrorMissingError,
  CascadeTooDeepError,
  CascadeTooLargeError,
  ReadOnlyViolationError,
  RestoreCascadeParentsArchivedError,
  RestoreConflictError,
  SoftDeleteBlockedError,
  TransactionRequiredError,
} from './errors';
import { getTableMeta, mirrorQualifiedName, qualifiedName, quoteIdent, type TableMeta } from './internal/table-meta';
import { createTransactionSelectRoot, type TransactionSelectRoot } from './query-helpers';
import * as schema from './schema';
import { isSoftDeletable } from './table-markers';
import type { StynxDataMetricsSink, StynxDataRole } from './tokens';
import type {
  CascadePlan,
  HardDeleteFromArchiveOptions,
  HardDeleteOptions,
  LiveOnlyTable,
  RestoreOptions,
  RestoreResult,
  SoftDeleteOptions,
  SoftDeleteResult,
  SoftDeletableTable,
} from './types';

export type StynxDrizzleDatabase = NodePgDatabase<typeof schema>;

interface RegistryEntry {
  parentSchema: string;
  parentTable: string;
  childSchema: string;
  childTable: string;
  fkConstraint: string;
  behavior: 'hide' | 'cascade' | 'block';
  childColumn: string;
}

interface ArchivedParent {
  schema: string;
  table: string;
  id: string;
}

interface ArchiveLookupRow extends QueryResultRow {
  archive_id: string;
  deleted_at: string;
  row_data: Record<string, unknown>;
}

interface UniqueConstraintRow extends QueryResultRow {
  constraint_name: string;
  columns: string[] | string;
}

export function createDrizzle(client: PoolClient): StynxDrizzleDatabase {
  return drizzle(client, { schema });
}

function ensureWritableRole(role: StynxDataRole): void {
  if (role === 'reader') {
    throw new ReadOnlyViolationError({ role });
  }
}

function parseArchiveTableName(archiveTable: string): string {
  if (archiveTable.includes('.')) {
    const [schemaName, tableName] = archiveTable.split('.');
    if (schemaName && tableName) {
      return qualifiedName(schemaName, tableName);
    }
  }
  return qualifiedName('archive', archiveTable);
}

export class Transaction {
  private active = true;

  constructor(
    private readonly client: PoolClient,
    private readonly db: StynxDrizzleDatabase,
    readonly role: StynxDataRole,
    private readonly metrics?: StynxDataMetricsSink,
  ) {}

  close(): void {
    this.active = false;
  }

  select(): TransactionSelectRoot {
    this.ensureActive();
    return createTransactionSelectRoot(this.client, () => this.db.select());
  }

  insert = <TTable extends Parameters<StynxDrizzleDatabase['insert']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.insert(table);
  };

  update = <TTable extends Parameters<StynxDrizzleDatabase['update']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.update(table);
  };

  delete = <TTable extends Parameters<StynxDrizzleDatabase['delete']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.delete(table);
  };

  async execute(query: SQLWrapper): Promise<QueryResult<QueryResultRow>> {
    this.ensureActive();
    return this.db.execute(query as SQL<unknown>);
  }

  async query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>> {
    this.ensureActive();
    return this.client.query<TRow>(text, values);
  }

  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: SoftDeleteOptions & { dryRun: true },
  ): Promise<CascadePlan>;
  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options?: SoftDeleteOptions,
  ): Promise<SoftDeleteResult>;
  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: SoftDeleteOptions = {},
  ): Promise<CascadePlan | SoftDeleteResult> {
    this.ensureActive();
    ensureWritableRole(this.role);
    if (!isSoftDeletable(table)) {
      throw new ArchiveMirrorMissingError({ table: getTableMeta(table).qualifiedName });
    }

    const meta = getTableMeta(table);
    await this.ensureMirrorExists(meta);

    const maxCascadeDepth = options.maxCascadeDepth ?? 4;
    const maxCascadeRows = options.maxCascadeRows ?? 100;
    const plan = await this.buildCascadePlan(meta, id, maxCascadeDepth, maxCascadeRows);

    if (options.dryRun) {
      return plan;
    }

    const deletedAt = new Date().toISOString();
    const cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }> = [];
    await this.softDeleteByReference(meta, id, deletedAt, maxCascadeDepth, maxCascadeRows, 0, cascaded);

    const root = cascaded.find((entry) => entry.schema === meta.schema && entry.table === meta.table && entry.id === id);
    return {
      archiveId: root?.archiveId ?? 0n,
      cascaded: cascaded.filter((entry) => !(entry.schema === meta.schema && entry.table === meta.table && entry.id === id)),
      deletedAt,
    };
  }

  async restoreFromArchive<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: RestoreOptions = {},
  ): Promise<RestoreResult> {
    this.ensureActive();
    ensureWritableRole(this.role);
    if (!isSoftDeletable(table)) {
      throw new ArchiveMirrorMissingError({ table: getTableMeta(table).qualifiedName });
    }

    const meta = getTableMeta(table);
    await this.ensureMirrorExists(meta);
    return this.restoreByReference(meta, id, options, []);
  }

  async restoreWithCascade<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: Omit<RestoreOptions, 'cascade'> = {},
  ): Promise<RestoreResult> {
    return this.restoreFromArchive(table, id, {
      ...options,
      cascade: true,
    });
  }

  async hardDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T> | LiveOnlyTable<T>,
    id: string,
    options: HardDeleteOptions,
  ): Promise<void> {
    this.ensureActive();
    ensureWritableRole(this.role);
    this.assertHardDeleteConfirmation(options);

    const meta = getTableMeta(table as AnyPgTable);
    await this.query(`delete from ${meta.qualifiedName} where id = $1`, [id]);
    this.metrics?.incrementHardDelete(this.metricLabel(meta));
  }

  async hardDeleteFromArchive(
    archiveId: bigint,
    options: HardDeleteFromArchiveOptions,
  ): Promise<void> {
    this.ensureActive();
    ensureWritableRole(this.role);
    this.assertHardDeleteConfirmation(options);

    await this.query(`delete from ${parseArchiveTableName(options.archiveTable)} where archive_id = $1`, [
      archiveId.toString(),
    ]);
    this.metrics?.incrementHardDelete(options.archiveTable);
    await this.sampleArchiveSizeByName(options.archiveTable, this.normalizeArchiveMetricLabel(options.archiveTable));
  }

  private async buildCascadePlan(
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

    const registry = await this.loadRegistryByParent(meta.schema, meta.table);
    const steps: CascadePlan['steps'] = [];
    let totalRows = 1;
    let observedMaxDepth = depth;

    for (const entry of registry.filter((item) => item.behavior === 'cascade')) {
      const childIds = await this.listChildIds(entry, id);
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
          columnNames: await this.loadColumnNames(entry.childSchema, entry.childTable),
        };
        const childPlan = await this.buildCascadePlan(
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

  private async softDeleteByReference(
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

    await this.ensureMirrorExists(meta);
    const registry = await this.loadRegistryByParent(meta.schema, meta.table);
    let totalRows = 1;

    for (const entry of registry.filter((item) => item.behavior === 'cascade')) {
      const childIds = await this.listChildIds(entry, id);
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
          columnNames: await this.loadColumnNames(entry.childSchema, entry.childTable),
        };
        await this.softDeleteByReference(
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

    const blockingChildren = await this.describeBlockingChildren(meta, id);
    if (blockingChildren.length > 0) {
      throw new SoftDeleteBlockedError({
        parent: { schema: meta.schema, table: meta.table, id },
        blockingChildren,
      });
    }

    await this.query(`select set_config('app.archive_move', 'in_progress', true)`);
    await this.query(`select set_config('app.archive_reason', 'soft_delete', true)`);

    const insert = await this.query<{ archive_id: string }>(
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
      await this.query(`delete from ${meta.qualifiedName} where id = $1`, [id]);
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
    this.metrics?.incrementSoftDelete(this.metricLabel(meta));
    await this.sampleArchiveSize(meta);
  }

  private async restoreByReference(
    meta: TableMeta,
    id: string,
    options: RestoreOptions,
    restoredChildren: Array<{ schema: string; table: string; id: string }>,
  ): Promise<RestoreResult> {
    const archived = await this.loadArchivedRow(meta, id, options.archiveId);
    if (!archived) {
      throw new ArchiveMirrorMissingError({ table: meta.mirrorQualifiedName, id });
    }

    const archivedParents = await this.findArchivedParents(meta, archived.row_data);
    if (archivedParents.length > 0 && !options.cascade) {
      throw new RestoreCascadeParentsArchivedError({
        archivedParents,
      });
    }

    if (options.cascade) {
      for (const parent of archivedParents) {
        await this.restoreByReference(
          {
            schema: parent.schema,
            table: parent.table,
            qualifiedName: qualifiedName(parent.schema, parent.table),
            mirrorQualifiedName: mirrorQualifiedName(parent.schema, parent.table),
            columnNames: await this.loadColumnNames(parent.schema, parent.table),
          },
          parent.id,
          { cascade: true },
          restoredChildren,
        );
      }
    }

    const conflict = await this.findRestoreConflict(meta, archived.row_data, id);
    if (conflict) {
      throw new RestoreConflictError(conflict);
    }

    await this.query(`select set_config('app.archive_move', 'in_progress', true)`);
    await this.query(`select set_config('app.archive_reason', 'restore', true)`);

    try {
      await this.query(
        `
          insert into ${meta.qualifiedName} (${meta.columnNames.map(quoteIdent).join(', ')})
          select ${meta.columnNames.map(quoteIdent).join(', ')}
          from ${meta.mirrorQualifiedName}
          where archive_id = $1
        `,
        [archived.archive_id],
      );
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === '23505') {
        throw new RestoreConflictError({
          conflictingConstraint: pgError.constraint ?? 'unique_violation',
          conflictValues: { id },
          blockingLiveId: id,
        });
      }
      throw error;
    }

    await this.query(`delete from ${meta.mirrorQualifiedName} where archive_id = $1`, [archived.archive_id]);
    this.metrics?.incrementRestore(this.metricLabel(meta));
    await this.sampleArchiveSize(meta);

    if (options.cascade) {
      for (const entry of await this.loadRegistryByParent(meta.schema, meta.table)) {
        if (entry.behavior !== 'cascade') {
          continue;
        }
        const children = await this.query<{ id: string }>(
          `
            select id
            from ${mirrorQualifiedName(entry.childSchema, entry.childTable)}
            where ${quoteIdent(entry.childColumn)} = $1
              and deleted_at = $2::timestamptz
          `,
          [id, archived.deleted_at],
        );

        for (const child of children.rows) {
          const restored = await this.restoreByReference(
            {
              schema: entry.childSchema,
              table: entry.childTable,
              qualifiedName: qualifiedName(entry.childSchema, entry.childTable),
              mirrorQualifiedName: mirrorQualifiedName(entry.childSchema, entry.childTable),
              columnNames: await this.loadColumnNames(entry.childSchema, entry.childTable),
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

  private async loadRegistryByParent(parentSchema: string, parentTable: string): Promise<RegistryEntry[]> {
    const result = await this.query<RegistryEntry>(
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

  private async loadRegistryByChild(childSchema: string, childTable: string): Promise<RegistryEntry[]> {
    const result = await this.query<RegistryEntry>(
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

  private async listChildIds(entry: RegistryEntry, parentId: string): Promise<string[]> {
    const result = await this.query<{ id: string }>(
      `
        select id
        from ${qualifiedName(entry.childSchema, entry.childTable)}
        where ${quoteIdent(entry.childColumn)} = $1
      `,
      [parentId],
    );
    return result.rows.map((row) => row.id);
  }

  private async describeBlockingChildren(meta: TableMeta, id: string): Promise<Array<Record<string, unknown>>> {
    const registry = await this.loadRegistryByParent(meta.schema, meta.table);
    const blocking: Array<Record<string, unknown>> = [];

    for (const entry of registry.filter((item) => item.behavior === 'block')) {
      const countResult = await this.query<{ count: string }>(
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

      const sampleResult = await this.query<{ id: string }>(
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

  private async loadArchivedRow(
    meta: TableMeta,
    id: string,
    archiveId?: bigint,
  ): Promise<ArchiveLookupRow | undefined> {
    const result = await this.query<ArchiveLookupRow>(
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

  private async findArchivedParents(meta: TableMeta, rowData: Record<string, unknown>): Promise<ArchivedParent[]> {
    const registry = await this.loadRegistryByChild(meta.schema, meta.table);
    const archivedParents: ArchivedParent[] = [];

    for (const entry of registry.filter((item) => item.behavior === 'block' || item.behavior === 'cascade')) {
      const fkValue = rowData[entry.childColumn];
      if (typeof fkValue !== 'string' || fkValue.length === 0) {
        continue;
      }

      const liveParent = await this.query<{ exists: boolean }>(
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

      const archiveParent = await this.query<{ exists: boolean }>(
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

  private async findRestoreConflict(
    meta: TableMeta,
    rowData: Record<string, unknown>,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const constraints = await this.query<UniqueConstraintRow>(
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
      const conflict = await this.query<{ blocking_id: string }>(
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

  private async loadColumnNames(schemaName: string, tableName: string): Promise<string[]> {
    const result = await this.query<{ column_name: string }>(
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

  private async ensureMirrorExists(meta: TableMeta): Promise<void> {
    const result = await this.query<{ exists: boolean }>(
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

  private metricLabel(meta: TableMeta): string {
    return `${meta.schema}.${meta.table}`;
  }

  private async sampleArchiveSize(meta: TableMeta): Promise<void> {
    await this.sampleArchiveSizeByName(meta.mirrorQualifiedName, this.metricLabel(meta));
  }

  private async sampleArchiveSizeByName(qualifiedRelationName: string, label = qualifiedRelationName): Promise<void> {
    if (!this.metrics) {
      return;
    }

    const size = await this.query<{ bytes: string }>(
      `select pg_total_relation_size($1::regclass)::text as bytes`,
      [qualifiedRelationName.replaceAll('"', '')],
    );
    const bytes = Number.parseInt(size.rows[0]?.bytes ?? '0', 10);
    if (Number.isFinite(bytes)) {
      this.metrics.setArchiveSizeBytes(label, bytes);
    }
  }

  private normalizeArchiveMetricLabel(archiveTable: string): string {
    const qualified = archiveTable.replaceAll('"', '');
    const [schemaName, tableName] = qualified.split('.');
    if (schemaName !== 'archive' || !tableName) {
      return qualified;
    }

    const separator = tableName.indexOf('_');
    if (separator <= 0 || separator === tableName.length - 1) {
      return qualified;
    }

    return `${tableName.slice(0, separator)}.${tableName.slice(separator + 1)}`;
  }

  private assertHardDeleteConfirmation(options: HardDeleteOptions | HardDeleteFromArchiveOptions): void {
    if (options.confirm !== 'I understand this is irrecoverable') {
      throw new ReadOnlyViolationError({ reason: 'hard-delete-confirmation-mismatch' });
    }
  }

  private ensureActive(): void {
    if (!this.active) {
      throw new TransactionRequiredError();
    }
  }
}
