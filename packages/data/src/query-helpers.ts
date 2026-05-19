import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type {
  AnyPgTable,
  PgColumn,
  PgSelectBuilder,
} from 'drizzle-orm/pg-core';
import type { PoolClient, QueryResultRow } from 'pg';
import { archiveOf } from './internal/archive-schema';
import { getTableMeta, quoteIdent } from './internal/table-meta';
import { isSoftDeletable } from './table-markers';
import type { SoftDeletableTable } from './types';

export type LiveSelectBuilder = ReturnType<PgSelectBuilder<undefined>['from']>;

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

export type SoftDeleteAwareSelect<TTable extends AnyPgTable> = LiveSelectBuilder & {
  withDeleted(): ArchiveSelectQuery<TTable, 'withDeleted'>;
  onlyDeleted(): ArchiveSelectQuery<TTable, 'onlyDeleted'>;
};

export interface TransactionSelectRoot {
  from<TTable extends SoftDeletableTable<AnyPgTable>>(table: TTable): SoftDeleteAwareSelect<TTable>;
  from<TTable extends AnyPgTable>(table: TTable): LiveSelectBuilder;
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
    const result = await this.client.query<QueryResultRow>(compiled.sql, compiled.params);
    return result.rows.map((row) => this.mapRow(row)) as Array<ArchiveQueryRow<TTable, TMode>>;
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

  private mapRow(row: QueryResultRow): ArchiveQueryRow<TTable, TMode> {
    const mapped: Record<string, unknown> = {};

    for (const column of this.projections) {
      mapped[column.propertyKey] = row[column.columnName];
    }

    mapped.archiveId = row.archive_id === null || row.archive_id === undefined
      ? null
      : BigInt(String(row.archive_id));
    mapped.archivedAt = (row.archived_at ?? null) as Date | null;
    mapped.deletedAt = (row.deleted_at ?? null) as Date | null;
    mapped.deletedBy = (row.deleted_by ?? null) as string | null;
    mapped.lastErasureAt = (row.last_erasure_at ?? null) as Date | null;

    return mapped as ArchiveQueryRow<TTable, TMode>;
  }
}

export function createTransactionSelectRoot(
  client: PoolClient,
  builderFactory: () => PgSelectBuilder<undefined>,
): TransactionSelectRoot {
  const from = (<TTable extends AnyPgTable>(table: TTable): LiveSelectBuilder => {
    const builder = builderFactory().from(table as never);
    if (!isSoftDeletable(table)) {
      return builder;
    }

      let proxy: SoftDeleteAwareSelect<TTable>;
    proxy = new Proxy(builder as unknown as SoftDeleteAwareSelect<TTable>, {
      get(target, property, receiver) {
        if (property === 'withDeleted') {
          return () => new ArchiveSelectQuery(client, target as unknown as SelectBuilderLike, table, 'withDeleted');
        }
        if (property === 'onlyDeleted') {
          return () => new ArchiveSelectQuery(client, target as unknown as SelectBuilderLike, table, 'onlyDeleted');
        }

        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  }) as TransactionSelectRoot['from'];

  return {
    from,
  };
}
