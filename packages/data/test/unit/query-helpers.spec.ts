import { sql } from 'drizzle-orm';
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import type { PoolClient } from 'pg';
import { documentVersions, documents } from '../../src/schema/storage';
import { ArchiveSelectQuery, createTransactionSelectRoot } from '../../src/query-helpers';
import type { Mock } from 'vitest';

describe('query helpers', () => {
  const localSchema = pgSchema('local');
  const auditEvent = localSchema.table('audit_event', {
    id: uuid('id').primaryKey(),
    message: text('message').notNull(),
  });

  const createBuilder = (
    compiled: Array<{ sql: string; params: unknown[] }>,
    config: Record<string, unknown> = {},
  ) => ({
    config,
    dialect: {
      sqlToQuery: vi.fn(() => {
        const next = compiled.shift();
        if (!next) {
          throw new Error('unexpected SQL compilation');
        }
        return next;
      }),
    },
  });

  it('builds withDeleted SQL with shifted placeholders, tenant guard, ordering, limit, and offset', () => {
    const builder = createBuilder([
      {
        sql: `"storage"."documents"."filename" = $10 and "storage"."documents"."collection" = $2`,
        params: ['invoice.pdf', 'invoices'],
      },
      {
        sql: `"storage"."documents"."filename" = $10 and "storage"."documents"."collection" = $2`,
        params: ['invoice.pdf', 'invoices'],
      },
      {
        sql: `"storage"."documents"."filename" asc, "storage"."documents"."created_at" desc`,
        params: [],
      },
    ], {
      where: sql`where-clause`,
      orderBy: [sql.raw('filename asc')],
      limit: 10,
      offset: 5,
    });

    const compiled = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      documents,
      'withDeleted',
    ).toSQL();

    expect(compiled.params).toEqual(['invoice.pdf', 'invoices', 'invoice.pdf', 'invoices']);
    expect(compiled.sql.startsWith('select *')).toBe(true);
    expect(compiled.sql.endsWith('offset 5')).toBe(true);
    expect(compiled.sql).toContain('from "storage"."documents" where "storage"."documents"."filename" = $10');
    expect(compiled.sql).toContain('from "archive"."storage_documents" where "archive"."storage_documents"."filename" = $12');
    expect(compiled.sql).toContain('"archive"."storage_documents"."collection" = $4');
    expect(compiled.sql).toContain(
      `"tenant_id" = coalesce(current_setting('app.tenant_id', true)::uuid, "tenant_id")`,
    );
    expect(compiled.sql).toContain('order by "stynx_union"."filename" asc, "stynx_union"."created_at" desc');
    expect(compiled.sql).toContain('limit 10 offset 5');
  });

  it('builds onlyDeleted SQL with default archive ordering and no tenant guard for non-tenant tables', () => {
    const builder = createBuilder([], {});

    const compiled = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      auditEvent,
      'onlyDeleted',
    ).toSQL();

    expect(compiled.params).toEqual([]);
    expect(compiled.sql.startsWith('select "archive"."local_audit_event"')).toBe(true);
    expect(compiled.sql).toContain('select "archive"."local_audit_event"."id" as "id"');
    expect(compiled.sql).toContain('from "archive"."local_audit_event"');
    expect(compiled.sql).toContain('order by "archive"."local_audit_event"."deleted_at" desc');
    expect(compiled.sql).not.toContain('app.tenant_id');
  });

  it('builds onlyDeleted SQL with explicit predicates, archive ordering, limit, and offset', () => {
    const builder = createBuilder([
      {
        sql: `"storage"."documents"."filename" = $1`,
        params: ['archive.pdf'],
      },
      {
        sql: `"storage"."documents"."filename" asc`,
        params: [],
      },
    ], {
      where: sql`where-clause`,
      orderBy: [sql.raw('filename asc')],
    });

    const compiled = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      documents,
      'onlyDeleted',
    )
      .limit(2)
      .offset(1)
      .toSQL();

    expect(compiled.params).toEqual(['archive.pdf']);
    expect(compiled.sql.startsWith('select "archive"."storage_documents"')).toBe(true);
    expect(compiled.sql.endsWith('offset 1')).toBe(true);
    expect(compiled.sql).toContain('from "archive"."storage_documents" where "archive"."storage_documents"."filename" = $1');
    expect(compiled.sql).toContain('order by "archive"."storage_documents"."filename" asc');
    expect(compiled.sql).toContain('limit 2 offset 1');
    expect(compiled.sql).not.toContain('Stryker was here');
  });

  it('builds onlyDeleted predicates for non-tenant tables without a tenant guard', () => {
    const builder = createBuilder([
      {
        sql: `"local"."audit_event"."message" = $1`,
        params: ['deleted'],
      },
    ], {
      where: sql`where-clause`,
    });

    const compiled = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      auditEvent,
      'onlyDeleted',
    ).toSQL();

    expect(compiled.params).toEqual(['deleted']);
    expect(compiled.sql).toContain('where "archive"."local_audit_event"."message" = $1');
    expect(compiled.sql).not.toContain('app.tenant_id');
  });

  it('builds withDeleted SQL without predicates, ordering, limits, or tenant guard', () => {
    const builder = createBuilder([], {});

    const compiled = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      auditEvent,
      'withDeleted',
    ).toSQL();

    expect(compiled.params).toEqual([]);
    expect(compiled.sql).not.toContain('where');
    expect(compiled.sql).not.toContain('order by');
    expect(compiled.sql).not.toContain('limit');
    expect(compiled.sql).not.toContain('offset');
  });

  it('accepts undefined where clauses and empty ordering lists', () => {
    const builder = createBuilder([], { orderBy: [] });

    const query = new ArchiveSelectQuery(
      { query: vi.fn() } as unknown as PoolClient,
      builder as never,
      auditEvent,
      'onlyDeleted',
    );
    expect(query.where(undefined)).toBe(query);

    const compiled = query.toSQL();
    expect(compiled.params).toEqual([]);
    expect(compiled.sql).toContain('order by "archive"."local_audit_event"."deleted_at" desc');
  });

  it('maps archived rows and keeps promise helpers delegated to execute', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: 'doc-1',
            tenant_id: 'tenant-1',
            collection: 'contracts',
            archive_id: '42',
            archived_at: new Date('2026-01-01T00:00:00Z'),
            deleted_at: new Date('2026-01-02T00:00:00Z'),
            deleted_by: 'actor-1',
            last_erasure_at: null,
          },
          {
            id: 'doc-2',
            tenant_id: 'tenant-1',
            collection: 'contracts',
            archive_id: null,
            archived_at: null,
            deleted_at: null,
            deleted_by: null,
            last_erasure_at: null,
          },
          {
            id: 'doc-3',
            tenant_id: 'tenant-1',
            collection: 'contracts',
            archived_at: null,
            deleted_at: null,
            deleted_by: null,
            last_erasure_at: null,
          },
        ],
      })),
    } as unknown as PoolClient & { query: Mock };
    const builder = createBuilder([], {});
    const query = new ArchiveSelectQuery(client, builder as never, documents, 'withDeleted');
    const finallyCallback = vi.fn();

    await expect(query.then((rows) => rows.map((row) => row.archiveId))).resolves.toEqual([42n, null, null]);
    await expect(query.catch(() => [])).resolves.toHaveLength(3);
    await expect(query.catch(null)).resolves.toHaveLength(3);
    await expect(query.finally(finallyCallback)).resolves.toHaveLength(3);
    await expect(query.finally(null)).resolves.toHaveLength(3);
    expect(finallyCallback).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('select * from'), []);
  });

  it('delegates rejected executions through then and catch callbacks', async () => {
    const failure = new Error('archive query failed');
    const client = {
      query: vi.fn(async () => {
        throw failure;
      }),
    } as unknown as PoolClient;
    const query = new ArchiveSelectQuery(client, createBuilder([], {}) as never, documents, 'onlyDeleted');

    await expect(query.then(null, (error) => (error as Error).message)).resolves.toBe('archive query failed');
    await expect(query.catch((error) => (error as Error).message)).resolves.toBe('archive query failed');
  });

  it('proxies soft-deletable select builders and leaves live-only builders unchanged', () => {
    const returningTarget = vi.fn();
    const returningOther = vi.fn(() => 'other');
    const softBuilder = {
      config: {},
      dialect: {
        sqlToQuery: vi.fn(() => ({ sql: '', params: [] })),
      },
      from: vi.fn(function from() {
        return this;
      }),
      where: vi.fn(function where() {
        return this;
      }),
      returningTarget,
      returningOther,
      marker: 'builder-marker',
    };
    returningTarget.mockImplementation(() => softBuilder);
    const liveBuilder = {
      from: vi.fn(() => ({ marker: 'live-builder' })),
    };
    const root = createTransactionSelectRoot(
      { query: vi.fn() } as unknown as PoolClient,
      vi.fn()
        .mockReturnValueOnce(softBuilder)
        .mockReturnValueOnce(liveBuilder) as never,
    );

    const softSelect = root.from(documents);
    expect(softSelect.marker).toBe('builder-marker');
    expect(softSelect.where(sql`true`)).toBe(softSelect);
    expect((softSelect as unknown as { returningTarget: () => unknown }).returningTarget()).toBe(softSelect);
    expect((softSelect as unknown as { returningOther: () => unknown }).returningOther()).toBe('other');
    expect(softSelect.withDeleted()).toBeInstanceOf(ArchiveSelectQuery);
    expect(softSelect.onlyDeleted()).toBeInstanceOf(ArchiveSelectQuery);

    expect(root.from(documentVersions)).toEqual({ marker: 'live-builder' });
  });
});
