import { PgColumn } from 'drizzle-orm/pg-core';
import { getTableColumns, sql, SQL, type SQLWrapper } from 'drizzle-orm';
import { QueryRowValidationError } from './errors.js';
import { executeLegacyArchive } from './checked-executor.js';
import { isRawArchiveTemporal, knownArchiveDriverValue } from './internal/archive-driver-values.js';
import type {
  AnyPgTable,
  PgSelectBuilder,
  PgTable,
  TableConfig,
} from 'drizzle-orm/pg-core';
import type { PoolClient } from 'pg';
import { archiveOf } from './internal/archive-schema.js';
import { getTableMeta, quoteIdent } from './internal/table-meta.js';
import { isSoftDeletable } from './table-markers.js';
import type { SoftDeletableTable } from './types.js';

function makeLiveSelect<TConfig extends TableConfig>(
  builderFactory: () => PgSelectBuilder<undefined>,
  table: PgTable<TConfig>,
) {
  return builderFactory().from(table);
}

export type LiveSelectBuilder<TTable extends AnyPgTable = AnyPgTable> =
  ReturnType<typeof makeLiveSelect<TTable['_']['config']>>;

export type SelectBuilderLike = {
  config: {
    where?: SQL;
    orderBy?: Array<PgColumn | SQL | SQL.Aliased>;
    limit?: number;
    offset?: number;
  };
  dialect: {
    sqlToQuery(query: SQL): {
      sql: string;
      params: unknown[];
    };
  };
};

interface ProjectionColumn {
  propertyKey: string;
  columnName: string;
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

export type ArchiveMode = 'withDeleted' | 'onlyDeleted';

export type ArchiveMetadataNullable = {
  archiveId: bigint | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  lastErasureAt: Date | null;
};

export type ArchiveMetadataRequired = {
  archiveId: bigint;
  archivedAt: Date;
  deletedAt: Date;
  deletedBy: string;
  lastErasureAt: Date | null;
};

export type WithDeletedRow<TTable extends AnyPgTable> = TTable['$inferSelect'] & ArchiveMetadataNullable;
export type OnlyDeletedRow<TTable extends AnyPgTable> = TTable['$inferSelect'] & ArchiveMetadataRequired;
export type ArchiveQueryRow<TTable extends AnyPgTable, TMode extends ArchiveMode> = TMode extends 'withDeleted'
  ? WithDeletedRow<TTable>
  : OnlyDeletedRow<TTable>;

export type SoftDeleteAwareSelect<TTable extends AnyPgTable> = LiveSelectBuilder<TTable> & {
  withDeleted(): ArchiveSelectQuery<TTable, 'withDeleted'>;
  onlyDeleted(): ArchiveSelectQuery<TTable, 'onlyDeleted'>;
};

export interface TransactionSelectRoot {
  from<TTable extends SoftDeletableTable<AnyPgTable>>(table: TTable): SoftDeleteAwareSelect<TTable>;
  from<TTable extends AnyPgTable>(table: TTable): LiveSelectBuilder<TTable>;
}

function shiftPlaceholders(text: string, offset: number): string {
  return text.replace(/\$(\d+)/g, (_, index: string) => `$${Number.parseInt(index, 10) + offset}`);
}

function appendFragment(target: BuiltQuery, fragment: BuiltQuery): string {
  const shifted = shiftPlaceholders(fragment.sql, target.params.length);
  target.params.push(...fragment.params);
  return shifted;
}

function buildColumnProjection<TTable extends AnyPgTable>(table: TTable): ProjectionColumn[] {
  const mirror = archiveOf(table);
  return mirror.liveColumns;
}

function rewriteQualifier(fragment: BuiltQuery, source: string, target: string): BuiltQuery {
  return {
    sql: fragment.sql.split(source).join(target),
    params: [...fragment.params],
  };
}

function compileFragment(builder: SelectBuilderLike, fragment: SQLWrapper): BuiltQuery {
  return builder.dialect.sqlToQuery(fragment.getSQL());
}

function compileOrderBy(
  builder: SelectBuilderLike,
  columns: Array<PgColumn | SQL | SQL.Aliased>,
  sourceQualifier: string,
  targetQualifier: string,
): BuiltQuery | undefined {
  if (columns.length === 0) {
    return undefined;
  }
  const compiled = compileFragment(builder, sql.join(columns, sql.raw(', ')));
  return rewriteQualifier(compiled, sourceQualifier, targetQualifier);
}

function nullProjection(columnName: string, cast: string): string {
  return `null::${cast} as ${quoteIdent(columnName)}`;
}

function combineClauses(primary?: string, guard?: string): string | undefined {
  if (primary && guard) {
    return `${primary} and ${guard}`;
  }
  return primary ?? guard;
}

export class ArchiveSelectQuery<TTable extends AnyPgTable, TMode extends ArchiveMode>
  implements PromiseLike<Array<ArchiveQueryRow<TTable, TMode>>>
{
  private whereClause: SQL | undefined;
  private orderByClause: Array<PgColumn | SQL | SQL.Aliased> | undefined;
  private limitClause: number | undefined;
  private offsetClause: number | undefined;
  private readonly projections: ProjectionColumn[];

  constructor(
    private readonly client: PoolClient,
    private readonly builder: SelectBuilderLike,
    private readonly table: TTable,
    private readonly mode: TMode,
  ) {
    this.whereClause = builder.config.where;
    this.orderByClause = builder.config.orderBy;
    this.limitClause = builder.config.limit;
    this.offsetClause = builder.config.offset;
    this.projections = buildColumnProjection(table);
  }

  where(where: SQL | undefined): this {
    this.whereClause = where;
    return this;
  }

  orderBy(...columns: Array<PgColumn | SQL | SQL.Aliased>): this {
    this.orderByClause = columns;
    return this;
  }

  limit(limit: number): this {
    this.limitClause = limit;
    return this;
  }

  offset(offset: number): this {
    this.offsetClause = offset;
    return this;
  }

  toSQL(): BuiltQuery {
    const meta = getTableMeta(this.table);
    const mirror = archiveOf(this.table);
    const built: BuiltQuery = {
      sql: '',
      params: [],
    };

    const liveProjection = [
      ...this.projections.map(
        (column) =>
          `${meta.qualifiedName}.${quoteIdent(column.columnName)} as ${quoteIdent(column.columnName)}`,
      ),
      nullProjection(mirror.archiveColumns.archiveId, 'bigint'),
      nullProjection(mirror.archiveColumns.archivedAt, 'timestamptz'),
      nullProjection(mirror.archiveColumns.deletedAt, 'timestamptz'),
      nullProjection(mirror.archiveColumns.deletedBy, 'uuid'),
      nullProjection(mirror.archiveColumns.lastErasureAt, 'timestamptz'),
    ].join(', ');

    const archiveProjection = [
      ...this.projections.map(
        (column) =>
          `${mirror.qualifiedName}.${quoteIdent(column.columnName)} as ${quoteIdent(column.columnName)}`,
      ),
      `${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.archiveId)} as ${quoteIdent(mirror.archiveColumns.archiveId)}`,
      `${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.archivedAt)} as ${quoteIdent(mirror.archiveColumns.archivedAt)}`,
      `${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.deletedAt)} as ${quoteIdent(mirror.archiveColumns.deletedAt)}`,
      `${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.deletedBy)} as ${quoteIdent(mirror.archiveColumns.deletedBy)}`,
      `${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.lastErasureAt)} as ${quoteIdent(mirror.archiveColumns.lastErasureAt)}`,
    ].join(', ');

    const tenantGuard = this.projections.some((column) => column.columnName === 'tenant_id')
      ? `${quoteIdent('tenant_id')} = coalesce(current_setting('app.tenant_id', true)::uuid, ${quoteIdent('tenant_id')})`
      : undefined;

    const livePredicate = this.mode === 'withDeleted' && this.whereClause
      ? appendFragment(built, compileFragment(this.builder, this.whereClause))
      : undefined;
    const archivePredicate = this.whereClause
      ? appendFragment(
          built,
          rewriteQualifier(
            compileFragment(this.builder, this.whereClause),
            meta.qualifiedName,
            mirror.qualifiedName,
          ),
        )
      : undefined;
    const liveWhere = combineClauses(livePredicate, tenantGuard);
    const archiveWhere = combineClauses(archivePredicate, tenantGuard);

    const orderBy = this.orderByClause
      ? appendFragment(
          built,
          compileOrderBy(
            this.builder,
            this.orderByClause,
            meta.qualifiedName,
            this.mode === 'withDeleted' ? quoteIdent('stynx_union') : mirror.qualifiedName,
          ) ?? { sql: '', params: [] },
        )
      : undefined;

    if (this.mode === 'withDeleted') {
      built.sql = `
        select *
        from (
          select ${liveProjection}
          from ${meta.qualifiedName}
          ${liveWhere ? `where ${liveWhere}` : ''}
          union all
          select ${archiveProjection}
          from ${mirror.qualifiedName}
          ${archiveWhere ? `where ${archiveWhere}` : ''}
        ) as ${quoteIdent('stynx_union')}
        ${orderBy ? `order by ${orderBy}` : ''}
        ${this.limitClause !== undefined ? `limit ${this.limitClause}` : ''}
        ${this.offsetClause !== undefined ? `offset ${this.offsetClause}` : ''}
      `;
      return {
        sql: built.sql.replace(/\s+/g, ' ').trim(),
        params: built.params,
      };
    }

    built.sql = `
      select ${archiveProjection}
      from ${mirror.qualifiedName}
      ${archiveWhere ? `where ${archiveWhere}` : ''}
      ${
        orderBy
          ? `order by ${orderBy}`
          : `order by ${mirror.qualifiedName}.${quoteIdent(mirror.archiveColumns.deletedAt)} desc`
      }
      ${this.limitClause !== undefined ? `limit ${this.limitClause}` : ''}
      ${this.offsetClause !== undefined ? `offset ${this.offsetClause}` : ''}
    `;

    return {
      sql: built.sql.replace(/\s+/g, ' ').trim(),
      params: built.params,
    };
  }

  async execute(): Promise<Array<ArchiveQueryRow<TTable, TMode>>> {
    const compiled = this.toSQL();
    const result = await executeLegacyArchive(this.client, 'select', compiled.sql, compiled.params, (row, index) => this.validateRow(row, index));
    return result.rows.map((row) => this.mapRow(row));
  }

  then<TResult1 = Array<ArchiveQueryRow<TTable, TMode>>, TResult2 = never>(
    onfulfilled?: ((value: Array<ArchiveQueryRow<TTable, TMode>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<Array<ArchiveQueryRow<TTable, TMode>> | TResult> {
    return this.execute().catch(onrejected ?? undefined);
  }

  finally(onfinally?: (() => void) | null): Promise<Array<ArchiveQueryRow<TTable, TMode>>> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private validateRow(row: Record<string, unknown>, index: number): Record<string, unknown> {
    const invalid = (field: string): never => {
      throw new QueryRowValidationError('legacy.archive.select', index, [{ path: [field], code: 'invalid_type' }]);
    };
    for (const column of Object.values(getTableColumns(this.table))) {
      const value = row[column.name];
      if (value === null || value === undefined) {
        if (column.notNull) invalid(column.name);
        continue;
      }
      const physical = knownArchiveDriverValue(column, value);
      if (physical !== undefined) {
        if (!physical) invalid(column.name);
        continue;
      }
      // Custom mappers and erased $type refinements are the documented legacy
      // limit; do not coerce their values or claim their application shape is proven.
      switch (column.dataType) {
        case 'string': if (typeof value !== 'string') invalid(column.name); break;
        case 'boolean': if (typeof value !== 'boolean') invalid(column.name); break;
        case 'number':
          if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value))) invalid(column.name);
          break;
        case 'bigint':
          if (typeof value !== 'bigint' && !(typeof value === 'string' && /^-?\d+$/u.test(value))) invalid(column.name);
          break;
        case 'date': if (!(value instanceof Date)) invalid(column.name); break;
        case 'array': if (!Array.isArray(value)) invalid(column.name); break;
        case 'buffer': if (!Buffer.isBuffer(value)) invalid(column.name); break;
      }
    }
    const required = this.mode === 'onlyDeleted';
    const archiveId = row.archive_id;
    if (archiveId === null || archiveId === undefined) {
      if (required) invalid('archive_id');
    } else if (!(typeof archiveId === 'bigint' || typeof archiveId === 'number' ||
      typeof archiveId === 'string')) invalid('archive_id');
    for (const name of ['archived_at', 'deleted_at', 'last_erasure_at']) {
      const value = row[name];
      if (value === null || value === undefined) {
        if (required && name !== 'last_erasure_at') invalid(name);
      } else if (!isRawArchiveTemporal(value)) invalid(name);
    }
    if (row.deleted_by === null || row.deleted_by === undefined) {
      if (required) invalid('deleted_by');
    } else if (typeof row.deleted_by !== 'string') invalid('deleted_by');
    return row;
  }

  // This overload preserves the historical Drizzle generic contract. The bridge
  // validates raw representation classes; custom/$type schemas remain erased.
  private mapRow(row: Record<string, unknown>): ArchiveQueryRow<TTable, TMode>;
  private mapRow(row: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    for (const column of this.projections) {
      mapped[column.propertyKey] = row[column.columnName];
    }

    mapped.archiveId = row.archive_id === null || row.archive_id === undefined
      ? null
      : BigInt(String(row.archive_id));
    mapped.archivedAt = row.archived_at ?? null;
    mapped.deletedAt = row.deleted_at ?? null;
    mapped.deletedBy = row.deleted_by ?? null;
    mapped.lastErasureAt = row.last_erasure_at ?? null;

    return mapped;
  }
}

function isSelectBuilderLike(value: unknown): value is SelectBuilderLike {
  if (typeof value !== 'object' || value === null || !('config' in value) || !('dialect' in value)) return false;
  const config = value.config;
  const dialect = value.dialect;
  if (typeof config !== 'object' || config === null || typeof dialect !== 'object' || dialect === null ||
      !('sqlToQuery' in dialect) || typeof dialect.sqlToQuery !== 'function') return false;
  if ('where' in config && config.where !== undefined && !(config.where instanceof SQL)) return false;
  if ('orderBy' in config && config.orderBy !== undefined &&
      (!Array.isArray(config.orderBy) || !config.orderBy.every((item: unknown) => item instanceof SQL || item instanceof SQL.Aliased || item instanceof PgColumn))) return false;
  return (!('limit' in config) || config.limit === undefined || typeof config.limit === 'number') &&
    (!('offset' in config) || config.offset === undefined || typeof config.offset === 'number');
}

export function createTransactionSelectRoot(
  client: PoolClient,
  builderFactory: () => PgSelectBuilder<undefined>,
): TransactionSelectRoot {
  function from<TTable extends SoftDeletableTable<AnyPgTable>>(table: TTable): SoftDeleteAwareSelect<TTable>;
  function from<TTable extends AnyPgTable>(table: TTable): LiveSelectBuilder<TTable>;
  function from<TTable extends AnyPgTable>(table: TTable): LiveSelectBuilder<TTable> {
    const builder = makeLiveSelect<TTable['_']['config']>(builderFactory, table);
    if (!isSoftDeletable(table)) return builder;
    if (!isSelectBuilderLike(builder)) throw new TypeError('Unsupported Drizzle archive select builder');
    const archiveBuilder = builder;
    let proxy: typeof builder;
    proxy = new Proxy(builder, {
      get(target, property, receiver): unknown {
        if (property === 'withDeleted') {
          return () => new ArchiveSelectQuery(client, archiveBuilder, table, 'withDeleted');
        }
        if (property === 'onlyDeleted') {
          return () => new ArchiveSelectQuery(client, archiveBuilder, table, 'onlyDeleted');
        }
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]): unknown => {
          const result: unknown = Reflect.apply(value, target, args);
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  }
  return { from };
}
