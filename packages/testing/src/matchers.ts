import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm/utils';
import type { Database, SoftDeletableTable } from '@stynx-nyx/data';
import {
  ReadOnlyViolationError,
  RestoreConflictError,
  SoftDeleteBlockedError,
} from '@stynx-nyx/data';

function tableMeta(table: AnyPgTable) {
  const config = getTableConfig(table);
  const schema = config.schema ?? 'public';
  const name = config.name;
  const columns = Object.values(getTableColumns(table)).map((column) => (column as { name: string }).name);
  return {
    schema,
    name,
    columns,
    qualified: `"${schema}"."${name}"`,
    archive: `"archive"."${schema}_${name}"`,
  };
}

async function scalar(database: Database, query: string, values: unknown[]): Promise<number> {
  return database.withSystemContext('testing matcher scalar', async () =>
    database.tx(
      async (trx) => {
        const result = await trx.query<{ value: string | number }>(query, values);
        const row = result.rows[0];
        return Number(row?.value ?? 0);
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

export async function expectRLSIsolated<T extends Record<string, unknown>>(
  query: (tenantId: string) => Promise<T[]>,
  options: { tenantA: string; tenantB: string },
): Promise<void> {
  const rows = await query(options.tenantA);
  const leaked = rows.filter((row) => {
    const tenantId = (row.tenantId ?? row.tenant_id) as string | undefined;
    return tenantId === options.tenantB;
  });

  if (leaked.length > 0) {
    throw new Error(`Expected tenant ${options.tenantB} rows to be hidden, but ${leaked.length} leaked`);
  }
}

export async function expectROCannotWrite(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ReadOnlyViolationError) {
      return;
    }
    throw error;
  }
  throw new Error('Expected ReadOnlyViolationError to be thrown');
}

export async function auditExpect(
  database: Database,
  entity: string,
  operation: string,
  options: { tags?: Record<string, unknown>; schema?: string; rowId?: string } = {},
): Promise<void> {
  await database.withSystemContext('testing audit expectation', async () =>
    database.tx(
      async (trx) => {
        const result = await trx.query<{
          tags: Record<string, unknown> | null;
        }>(
          `
            select tags
            from audit.log
            where operation = $1
              and ($2::text is null or table_schema = $2)
              and table_name = $3
              and ($4::text is null or row_id = $4)
            order by occurred_at desc, id desc
          `,
          [operation, options.schema ?? null, entity, options.rowId ?? null],
        );

        const matching = result.rows.filter((row) =>
          Object.entries(options.tags ?? {}).every(([key, value]) => row.tags?.[key] === value),
        );

        if (matching.length === 0) {
          throw new Error(`Expected audit row was not found for ${operation}:${entity}`);
        }
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

export async function expectInArchive<T extends AnyPgTable>(
  database: Database,
  table: SoftDeletableTable<T>,
  id: string,
): Promise<void> {
  const meta = tableMeta(table as AnyPgTable);
  const count = await scalar(
    database,
    `select count(*)::int as value from ${meta.archive} where id = $1::uuid`,
    [id],
  );
  if (count === 0) {
    throw new Error(`Expected ${meta.archive} to contain row ${id}`);
  }
}

export async function expectNotInLive<T extends AnyPgTable>(
  database: Database,
  table: SoftDeletableTable<T>,
  id: string,
): Promise<void> {
  const meta = tableMeta(table as AnyPgTable);
  const count = await scalar(
    database,
    `select count(*)::int as value from ${meta.qualified} where id = $1::uuid`,
    [id],
  );
  if (count !== 0) {
    throw new Error(`Expected ${meta.qualified} to not contain row ${id}`);
  }
}

export async function expectRestored<T extends AnyPgTable>(
  database: Database,
  table: SoftDeletableTable<T>,
  id: string,
): Promise<void> {
  const meta = tableMeta(table as AnyPgTable);
  const liveCount = await scalar(
    database,
    `select count(*)::int as value from ${meta.qualified} where id = $1::uuid`,
    [id],
  );
  const archiveCount = await scalar(
    database,
    `select count(*)::int as value from ${meta.archive} where id = $1::uuid`,
    [id],
  );
  if (liveCount === 0 || archiveCount !== 0) {
    throw new Error(`Expected ${id} to be restored into ${meta.qualified}`);
  }
}

export async function expectArchiveMirrorExists<T extends AnyPgTable>(
  database: Database,
  table: SoftDeletableTable<T>,
): Promise<void> {
  const meta = tableMeta(table as AnyPgTable);
  const count = await scalar(
    database,
    `
      select count(*)::int as value
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'archive'
        and c.relname = $1
    `,
    [`${meta.schema}_${meta.name}`],
  );
  if (count === 0) {
    throw new Error(`Expected archive mirror ${meta.archive} to exist`);
  }
}

export async function expectArchiveMirrorInSync<T extends AnyPgTable>(
  database: Database,
  table: SoftDeletableTable<T>,
): Promise<void> {
  const meta = tableMeta(table as AnyPgTable);
  const liveColumns = new Set(meta.columns);
  const mirroredColumns = await database.withSystemContext('testing archive mirror parity', async () =>
    database.tx(
      async (trx) => {
        const result = await trx.query<{ column_name: string }>(
          `
            select column_name
            from information_schema.columns
            where table_schema = 'archive'
              and table_name = $1
          `,
          [`${meta.schema}_${meta.name}`],
        );
        return result.rows
          .map((row) => row.column_name)
          .filter((column) => !['archive_id', 'archived_at', 'deleted_at', 'deleted_by', 'last_erasure_at'].includes(column));
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );

  const mirrorSet = new Set(mirroredColumns);
  const missing = [...liveColumns].filter((column) => !mirrorSet.has(column));
  const extra = [...mirrorSet].filter((column) => !liveColumns.has(column));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Archive mirror drift detected. Missing: ${missing.join(', ')} Extra: ${extra.join(', ')}`);
  }
}

export async function expectRestoreConflict(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RestoreConflictError) {
      return;
    }
    throw error;
  }
  throw new Error('Expected RestoreConflictError to be thrown');
}

export async function expectSoftDeleteBlocked(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SoftDeleteBlockedError) {
      return;
    }
    throw error;
  }
  throw new Error('Expected SoftDeleteBlockedError to be thrown');
}
