import { sql } from 'drizzle-orm';
import type { PoolClient, QueryResult } from 'pg';
import {
  ArchiveMirrorMissingError,
  CascadeTooDeepError,
  CascadeTooLargeError,
  RestoreCascadeParentsArchivedError,
  RestoreConflictError,
  SoftDeleteBlockedError,
  TransactionRequiredError,
} from '../../src/errors';
import { documentVersions, documents } from '../../src/schema/storage';
import { Transaction, type StynxDrizzleDatabase } from '../../src/transaction';
import type { StynxDataMetricsSink } from '../../src/tokens';
import type { TableMeta } from '../../src/internal/table-meta';
import type { Mock } from 'vitest';

describe('Transaction', () => {
  const parentMeta: TableMeta = {
    schema: 'demo',
    table: 'customer',
    qualifiedName: '"demo"."customer"',
    mirrorQualifiedName: '"archive"."demo_customer"',
    columnNames: ['id', 'tenant_id', 'email'],
  };

  const childRegistryEntry = {
    parentSchema: 'demo',
    parentTable: 'customer',
    childSchema: 'demo',
    childTable: 'invoice',
    fkConstraint: 'invoice_customer_id_fkey',
    behavior: 'cascade' as const,
    childColumn: 'customer_id',
  };

  const createTx = (
    role: 'owner' | 'app' | 'reader' = 'app',
    metrics?: StynxDataMetricsSink,
  ) => {
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as PoolClient & { query: Mock };
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ live: true })) })),
      insert: vi.fn(() => ({ insert: true })),
      update: vi.fn(() => ({ update: true })),
      delete: vi.fn(() => ({ delete: true })),
      execute: vi.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 })),
    } as unknown as StynxDrizzleDatabase & Record<string, Mock>;

    return {
      tx: new Transaction(client, db, role, metrics),
      client,
      db,
    };
  };

  it('delegates active read/write primitives and rejects all primitives after close', async () => {
    const { tx, client, db } = createTx();

    expect(tx.select().from(documentVersions)).toEqual({ live: true });
    expect(tx.insert(documentVersions as never)).toEqual({ insert: true });
    expect(tx.update(documentVersions as never)).toEqual({ update: true });
    expect(tx.delete(documentVersions as never)).toEqual({ delete: true });
    await expect(tx.execute(sql`select 1`)).resolves.toEqual({ rows: [{ ok: 1 }], rowCount: 1 });
    await expect(tx.query('select 2', [2])).resolves.toEqual({ rows: [], rowCount: 0 });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith('select 2', [2]);

    tx.close();
    expect(() => tx.select()).toThrow(TransactionRequiredError);
    expect(() => tx.insert(documentVersions as never)).toThrow(TransactionRequiredError);
    expect(() => tx.update(documentVersions as never)).toThrow(TransactionRequiredError);
    expect(() => tx.delete(documentVersions as never)).toThrow(TransactionRequiredError);
    await expect(tx.execute(sql`select 3`)).rejects.toBeInstanceOf(TransactionRequiredError);
    await expect(tx.query('select 4')).rejects.toBeInstanceOf(TransactionRequiredError);
  });

  it('guards write operations for reader transactions', async () => {
    const { tx } = createTx('reader');

    await expect(tx.softDelete(documents, 'doc-1')).rejects.toMatchObject({
      context: { role: 'reader' },
    });
    await expect(tx.restoreFromArchive(documents, 'doc-1')).rejects.toMatchObject({
      context: { role: 'reader' },
    });
    await expect(
      tx.hardDelete(documents, 'doc-1', { confirm: 'I understand this is irrecoverable' }),
    ).rejects.toMatchObject({ context: { role: 'reader' } });
    await expect(
      tx.hardDeleteFromArchive(1n, {
        archiveTable: 'archive.storage_documents',
        confirm: 'I understand this is irrecoverable',
      }),
    ).rejects.toMatchObject({ context: { role: 'reader' } });
  });

  it('rejects non-soft-deletable archive operations before querying mirrors', async () => {
    const { tx } = createTx();

    await expect(tx.softDelete(documentVersions as never, 'version-1')).rejects.toMatchObject({
      context: expect.objectContaining({ table: '"storage"."document_versions"' }),
    });
    await expect(tx.restoreFromArchive(documentVersions as never, 'version-1')).rejects.toMatchObject({
      context: expect.objectContaining({ table: '"storage"."document_versions"' }),
    });
  });

  it('forces cascade restore options through restoreWithCascade defaults', async () => {
    const { tx } = createTx();
    const restoreFromArchive = vi.spyOn(tx, 'restoreFromArchive').mockResolvedValue({
      id: 'doc-1',
      restoredAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(tx.restoreWithCascade(documents, 'doc-1')).resolves.toMatchObject({ id: 'doc-1' });

    expect(restoreFromArchive).toHaveBeenCalledWith(documents, 'doc-1', { cascade: true });
    restoreFromArchive.mockRestore();
  });

  it('softDelete returns dry-run plans and filters the root archive entry from committed cascades', async () => {
    const { tx } = createTx();
    const plan = {
      parent: { schema: 'storage', table: 'documents', id: 'doc-1' },
      steps: [],
      totalRows: 1,
      maxDepth: 0,
      withinLimits: true,
    };
    const api = tx as unknown as {
      ensureMirrorExists: Mock;
      buildCascadePlan: Mock;
      softDeleteByReference: Mock;
    };
    api.ensureMirrorExists = vi.fn(async () => undefined);
    api.buildCascadePlan = vi.fn(async () => plan);
    api.softDeleteByReference = vi.fn(async (...args: unknown[]) => {
      const cascaded = args[6] as Array<{ schema: string; table: string; archiveId: bigint; id: string }>;
      cascaded.push(
        { schema: 'storage', table: 'document_versions', archiveId: 8n, id: 'doc-version-1' },
        { schema: 'storage', table: 'documents', archiveId: 9n, id: 'doc-2' },
        { schema: 'archive', table: 'documents', archiveId: 10n, id: 'doc-1' },
        { schema: 'storage', table: 'documents', archiveId: 7n, id: 'doc-1' },
      );
    });

    await expect(tx.softDelete(documents, 'doc-1', { dryRun: true })).resolves.toBe(plan);
    expect(api.softDeleteByReference).not.toHaveBeenCalled();

    await expect(tx.softDelete(documents, 'doc-1')).resolves.toMatchObject({
      archiveId: 7n,
      cascaded: [
        { schema: 'storage', table: 'document_versions', archiveId: 8n, id: 'doc-version-1' },
        { schema: 'storage', table: 'documents', archiveId: 9n, id: 'doc-2' },
        { schema: 'archive', table: 'documents', archiveId: 10n, id: 'doc-1' },
      ],
    });
  });

  it('uses archive table parsing, confirmation, metrics, and archive-size labels for hard deletes', async () => {
    const metricsEvents: {
      hardDelete: string[];
      archiveSize: Array<{ table: string; bytes: number }>;
    } = { hardDelete: [], archiveSize: [] };
    const metrics: StynxDataMetricsSink = {
      incrementSoftDelete: vi.fn(),
      incrementRestore: vi.fn(),
      incrementHardDelete: (table) => metricsEvents.hardDelete.push(table),
      setArchiveSizeBytes: (table, bytes) => metricsEvents.archiveSize.push({ table, bytes }),
    };
    const { tx, client } = createTx('app', metrics);
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ bytes: '2048' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ bytes: 'not-a-number' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(
      tx.hardDelete(documents, 'doc-1', { confirm: 'not confirmed' as never }),
    ).rejects.toMatchObject({ context: { reason: 'hard-delete-confirmation-mismatch' } });
    await tx.hardDeleteFromArchive(12n, {
      archiveTable: 'archive.storage_documents',
      confirm: 'I understand this is irrecoverable',
    });
    await tx.hardDeleteFromArchive(13n, {
      archiveTable: 'custom_archive_table',
      confirm: 'I understand this is irrecoverable',
    });
    await tx.hardDeleteFromArchive(14n, {
      archiveTable: 'archive.',
      confirm: 'I understand this is irrecoverable',
    });
    await tx.hardDelete(documents, 'doc-2', { confirm: 'I understand this is irrecoverable' });

    expect(client.query).toHaveBeenCalledWith(
      'delete from "archive"."storage_documents" where archive_id = $1',
      ['12'],
    );
    expect(client.query).toHaveBeenCalledWith(
      'delete from "archive"."custom_archive_table" where archive_id = $1',
      ['13'],
    );
    expect(client.query).toHaveBeenCalledWith(
      'delete from "archive"."archive." where archive_id = $1',
      ['14'],
    );
    expect(client.query).toHaveBeenCalledWith('delete from "storage"."documents" where id = $1', ['doc-2']);
    expect(metricsEvents.hardDelete).toEqual([
      'archive.storage_documents',
      'custom_archive_table',
      'archive.',
      'storage.documents',
    ]);
    expect(metricsEvents.archiveSize).toEqual([
      { table: 'storage.documents', bytes: 2048 },
      { table: 'archive.', bytes: 0 },
    ]);
  });

  it('builds recursive cascade plans with exact row counts and depth limits', async () => {
    const { tx } = createTx();
    const api = tx as unknown as {
      buildCascadePlan: (meta: TableMeta, id: string, maxDepth: number, maxRows: number, depth?: number) => Promise<unknown>;
      loadRegistryByParent: Mock;
      listChildIds: Mock;
      loadColumnNames: Mock;
    };
    api.loadRegistryByParent = vi.fn(async (_schema: string, table: string) =>
      table === 'customer'
        ? [
          childRegistryEntry,
          { ...childRegistryEntry, childTable: 'note', behavior: 'hide' },
        ]
        : [],
    );
    api.listChildIds = vi.fn(async (_entry, id: string) => (id === 'customer-1' ? ['invoice-1', 'invoice-2'] : []));
    api.loadColumnNames = vi.fn(async () => ['id', 'customer_id']);

    await expect(api.buildCascadePlan(parentMeta, 'customer-1', 4, 3)).resolves.toEqual({
      parent: { schema: 'demo', table: 'customer', id: 'customer-1' },
      steps: [{ schema: 'demo', table: 'invoice', rowCount: 2, fkBehavior: 'cascade' }],
      totalRows: 3,
      maxDepth: 1,
      withinLimits: true,
    });
    await expect(api.buildCascadePlan(parentMeta, 'leaf', 1, 3, 1)).resolves.toMatchObject({
      maxDepth: 1,
      totalRows: 1,
    });
    await expect(api.buildCascadePlan(parentMeta, 'customer-1', 4, 2)).rejects.toMatchObject({
      name: CascadeTooLargeError.name,
      context: expect.objectContaining({
        maxRows: 2,
        plan: expect.objectContaining({
          parent: { schema: 'demo', table: 'customer', id: 'customer-1' },
          totalRows: 3,
          maxDepth: 1,
          withinLimits: false,
        }),
      }),
    });
    await expect(api.buildCascadePlan(parentMeta, 'customer-1', 1, 10, 2)).rejects.toMatchObject({
      name: CascadeTooDeepError.name,
      context: {
        attempted: 2,
        maxDepth: 1,
        parent: { schema: 'demo', table: 'customer', id: 'customer-1' },
      },
    });
  });

  it('soft-deletes one reference and maps missing rows and FK delete failures', async () => {
    const metrics = {
      incrementSoftDelete: vi.fn(),
      incrementRestore: vi.fn(),
      incrementHardDelete: vi.fn(),
      setArchiveSizeBytes: vi.fn(),
    };
    const { tx } = createTx('app', metrics);
    const api = tx as unknown as {
      softDeleteByReference: (
        meta: TableMeta,
        id: string,
        deletedAt: string,
        maxDepth: number,
        maxRows: number,
        depth: number,
        cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>,
      ) => Promise<void>;
      ensureMirrorExists: Mock;
      loadRegistryByParent: Mock;
      describeBlockingChildren: Mock;
      sampleArchiveSize: Mock;
      query: Mock;
    };
    api.ensureMirrorExists = vi.fn(async () => undefined);
    api.loadRegistryByParent = vi.fn(async () => []);
    api.describeBlockingChildren = vi.fn(async () => []);
    api.sampleArchiveSize = vi.fn(async () => undefined);
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        return { rows: [{ archive_id: '44' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }> = [];

    await api.softDeleteByReference(parentMeta, 'customer-1', '2026-01-01T00:00:00.000Z', 2, 5, 0, cascaded);
    expect(cascaded).toEqual([{ schema: 'demo', table: 'customer', archiveId: 44n, id: 'customer-1' }]);
    expect(api.query).toHaveBeenCalledWith(`select set_config('app.archive_move', 'in_progress', true)`);
    expect(api.query).toHaveBeenCalledWith(`select set_config('app.archive_reason', 'soft_delete', true)`);
    expect(metrics.incrementSoftDelete).toHaveBeenCalledWith('demo.customer');

    api.query = vi.fn(async (text: string) => (
      text.includes('insert into') ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 1 }
    ));
    const missingArchiveId: Array<{ schema: string; table: string; archiveId: bigint; id: string }> = [];
    await api.softDeleteByReference(
      parentMeta,
      'missing-archive-id',
      '2026-01-01T00:00:00.000Z',
      2,
      5,
      0,
      missingArchiveId,
    );
    expect(missingArchiveId).toEqual([
      { schema: 'demo', table: 'customer', archiveId: 0n, id: 'missing-archive-id' },
    ]);

    api.query = vi.fn(async (text: string) => (
      text.includes('insert into') ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 1 }
    ));
    await expect(
      api.softDeleteByReference(parentMeta, 'missing', '2026-01-01T00:00:00.000Z', 2, 5, 0, []),
    ).rejects.toMatchObject({
      name: ArchiveMirrorMissingError.name,
      context: { table: '"demo"."customer"', id: 'missing' },
    });

    const fkError = new Error('fk') as Error & { code: string };
    fkError.code = '23503';
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        return { rows: [{ archive_id: '45' }], rowCount: 1 };
      }
      if (text.includes('delete from')) {
        throw fkError;
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(
      api.softDeleteByReference(parentMeta, 'blocked', '2026-01-01T00:00:00.000Z', 2, 5, 0, []),
    ).rejects.toMatchObject({
      name: SoftDeleteBlockedError.name,
      context: {
        parent: { schema: 'demo', table: 'customer', id: 'blocked' },
        blockingChildren: [],
      },
    });

    const restrictError = new Error('restrict') as Error & { code: string };
    restrictError.code = '23001';
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        return { rows: [{ archive_id: '46' }], rowCount: 1 };
      }
      if (text.includes('delete from')) {
        throw restrictError;
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(
      api.softDeleteByReference(parentMeta, 'restricted', '2026-01-01T00:00:00.000Z', 2, 5, 0, []),
    ).rejects.toBeInstanceOf(SoftDeleteBlockedError);

    const unknownDeleteError = new Error('other failure');
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        return { rows: [{ archive_id: '47' }], rowCount: 1 };
      }
      if (text.includes('delete from')) {
        throw unknownDeleteError;
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(
      api.softDeleteByReference(parentMeta, 'other-failure', '2026-01-01T00:00:00.000Z', 2, 5, 0, []),
    ).rejects.toBe(unknownDeleteError);
  });

  it('blocks soft-delete references when cascade depth, row count, or blocking children fail', async () => {
    const { tx } = createTx();
    const api = tx as unknown as {
      softDeleteByReference: (
        meta: TableMeta,
        id: string,
        deletedAt: string,
        maxDepth: number,
        maxRows: number,
        depth: number,
        cascaded: unknown[],
      ) => Promise<void>;
      ensureMirrorExists: Mock;
      loadRegistryByParent: Mock;
      listChildIds: Mock;
      describeBlockingChildren: Mock;
    };
    await expect(
      api.softDeleteByReference(parentMeta, 'too-deep', '2026-01-01T00:00:00.000Z', 1, 10, 2, []),
    ).rejects.toMatchObject({
      context: {
        attempted: 2,
        maxDepth: 1,
        parent: { schema: 'demo', table: 'customer', id: 'too-deep' },
      },
    });

    api.ensureMirrorExists = vi.fn(async () => undefined);
    api.loadRegistryByParent = vi.fn(async () => [childRegistryEntry]);
    api.listChildIds = vi.fn(async () => ['child-1', 'child-2']);
    await expect(
      api.softDeleteByReference(parentMeta, 'too-large', '2026-01-01T00:00:00.000Z', 4, 2, 0, []),
    ).rejects.toMatchObject({
      context: {
        maxRows: 2,
        parent: { schema: 'demo', table: 'customer', id: 'too-large' },
        childTable: 'demo.invoice',
      },
    });

    api.loadRegistryByParent = vi.fn(async (_schema: string, table: string) =>
      table === 'customer' ? [childRegistryEntry] : [],
    );
    api.listChildIds = vi.fn(async () => ['child-1']);
    api.describeBlockingChildren = vi.fn(async () => []);
    (api as unknown as { query: Mock; sampleArchiveSize: Mock }).query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        return { rows: [{ archive_id: '48' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    (api as unknown as { sampleArchiveSize: Mock }).sampleArchiveSize = vi.fn(async () => undefined);
    await expect(
      api.softDeleteByReference(parentMeta, 'at-limit', '2026-01-01T00:00:00.000Z', 4, 2, 0, []),
    ).resolves.toBeUndefined();

    api.loadRegistryByParent = vi.fn(async () => []);
    api.describeBlockingChildren = vi.fn(async () => [{ schema: 'demo', table: 'payment', count: 1 }]);
    await expect(
      api.softDeleteByReference(parentMeta, 'blocked', '2026-01-01T00:00:00.000Z', 4, 10, 0, []),
    ).rejects.toMatchObject({
      context: {
        parent: { schema: 'demo', table: 'customer', id: 'blocked' },
        blockingChildren: [{ schema: 'demo', table: 'payment', count: 1 }],
      },
    });
  });

  it('restores archived references, maps restore conflicts, and cascades child restores', async () => {
    const metrics = {
      incrementSoftDelete: vi.fn(),
      incrementRestore: vi.fn(),
      incrementHardDelete: vi.fn(),
      setArchiveSizeBytes: vi.fn(),
    };
    const { tx } = createTx('app', metrics);
    const api = tx as unknown as {
      restoreByReference: (
        meta: TableMeta,
        id: string,
        options: Record<string, unknown>,
        restored: Array<{ schema: string; table: string; id: string }>,
      ) => Promise<unknown>;
      loadArchivedRow: Mock;
      findArchivedParents: Mock;
      findRestoreConflict: Mock;
      loadRegistryByParent: Mock;
      loadColumnNames: Mock;
      sampleArchiveSize: Mock;
      query: Mock;
    };
    api.loadArchivedRow = vi.fn(async (_meta, id: string) => ({
      archive_id: id === 'customer-1' ? '501' : '601',
      deleted_at: '2026-01-01T00:00:00.000Z',
      row_data: { id },
    }));
    api.findArchivedParents = vi.fn(async () => []);
    api.findRestoreConflict = vi.fn(async () => undefined);
    api.loadRegistryByParent = vi.fn(async (_schema: string, table: string) =>
      table === 'customer'
        ? [
          childRegistryEntry,
          { ...childRegistryEntry, childTable: 'hidden_note', behavior: 'hide' },
        ]
        : [],
    );
    api.loadColumnNames = vi.fn(async () => ['id', 'customer_id']);
    api.sampleArchiveSize = vi.fn(async () => undefined);
    api.query = vi.fn(async (text: string) => {
      if (text.includes('select id') && text.includes('"archive"."demo_invoice"')) {
        return { rows: [{ id: 'invoice-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const restored = await api.restoreByReference(parentMeta, 'customer-1', { cascade: true }, []);
    expect(restored).toMatchObject({
      id: 'customer-1',
      cascadeChildren: [{ schema: 'demo', table: 'invoice', id: 'invoice-1' }],
    });
    expect(api.query).toHaveBeenCalledWith(`select set_config('app.archive_move', 'in_progress', true)`);
    expect(api.query).toHaveBeenCalledWith(`select set_config('app.archive_reason', 'restore', true)`);
    expect(metrics.incrementRestore).toHaveBeenCalledWith('demo.customer');

    api.loadArchivedRow = vi.fn(async () => ({
      archive_id: '777',
      deleted_at: '2026-01-01T00:00:00.000Z',
      row_data: {},
    }));
    api.findArchivedParents = vi.fn(async () => []);
    api.findRestoreConflict = vi.fn(async () => undefined);
    api.loadRegistryByParent = vi.fn(async () => {
      throw new Error('cascade registry should not be loaded');
    });
    api.query = vi.fn(async (text: string) => {
      expect(text).not.toBe('');
      return { rows: [], rowCount: 1 };
    });
    await expect(api.restoreByReference(parentMeta, 'no-cascade', {}, [])).resolves.toEqual({
      id: 'no-cascade',
      restoredAt: expect.any(String),
    });

    api.loadArchivedRow = vi.fn(async () => undefined);
    await expect(api.restoreByReference(parentMeta, 'missing', {}, [])).rejects.toBeInstanceOf(
      ArchiveMirrorMissingError,
    );
    await expect(api.restoreByReference(parentMeta, 'missing', {}, [])).rejects.toMatchObject({
      context: { table: '"archive"."demo_customer"', id: 'missing' },
    });

    api.loadArchivedRow = vi.fn(async () => ({ archive_id: '1', deleted_at: 'now', row_data: {} }));
    api.findArchivedParents = vi.fn(async () => [{ schema: 'demo', table: 'parent', id: 'parent-1' }]);
    await expect(api.restoreByReference(parentMeta, 'child', {}, [])).rejects.toBeInstanceOf(
      RestoreCascadeParentsArchivedError,
    );
    await expect(api.restoreByReference(parentMeta, 'child', {}, [])).rejects.toMatchObject({
      context: { archivedParents: [{ schema: 'demo', table: 'parent', id: 'parent-1' }] },
    });

    api.findArchivedParents = vi.fn(async () => []);
    api.findRestoreConflict = vi.fn(async () => ({ conflictingConstraint: 'uq_demo', blockingLiveId: 'live-1' }));
    await expect(api.restoreByReference(parentMeta, 'conflict', {}, [])).rejects.toBeInstanceOf(
      RestoreConflictError,
    );

    api.findRestoreConflict = vi.fn(async () => undefined);
    const unique = new Error('unique') as Error & { code: string; constraint?: string };
    unique.code = '23505';
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        throw unique;
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(api.restoreByReference(parentMeta, 'unique', {}, [])).rejects.toMatchObject({
      context: expect.objectContaining({ conflictingConstraint: 'unique_violation', blockingLiveId: 'unique' }),
    });

    const insertError = new Error('insert failed') as Error & { code: string };
    insertError.code = '22000';
    api.query = vi.fn(async (text: string) => {
      if (text.includes('insert into')) {
        throw insertError;
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(api.restoreByReference(parentMeta, 'insert-error', {}, [])).rejects.toBe(insertError);
  });

  it('describes blocking children with counts and samples only for non-empty block rows', async () => {
    const { tx } = createTx();
    const api = tx as unknown as {
      describeBlockingChildren: (meta: TableMeta, id: string) => Promise<Array<Record<string, unknown>>>;
      loadRegistryByParent: Mock;
      query: Mock;
    };
    api.loadRegistryByParent = vi.fn(async () => [
      { ...childRegistryEntry, childTable: 'hidden_note', behavior: 'hide' },
      { ...childRegistryEntry, childTable: 'empty_payment', behavior: 'block' },
      { ...childRegistryEntry, childTable: 'payment', behavior: 'block' },
    ]);
    api.query = vi.fn(async (_text: string, values: unknown[]) => {
      if (values[0] !== 'customer-1') {
        throw new Error('unexpected parent id');
      }
      const call = api.query.mock.calls.length;
      if (call === 1) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (call === 2) {
        return { rows: [{ count: '2' }], rowCount: 1 };
      }
      return { rows: [{ id: 'payment-1' }, { id: 'payment-2' }], rowCount: 2 };
    });

    await expect(api.describeBlockingChildren(parentMeta, 'customer-1')).resolves.toEqual([
      { schema: 'demo', table: 'payment', count: 2, sampleIds: ['payment-1', 'payment-2'] },
    ]);

    api.loadRegistryByParent = vi.fn(async () => [{ ...childRegistryEntry, behavior: 'block' }]);
    api.query = vi.fn(async () => ({ rows: [] }));
    await expect(api.describeBlockingChildren(parentMeta, 'empty-default')).resolves.toEqual([]);
  });

  it('finds archived parents only when the parent is absent from live rows and present in archive', async () => {
    const { tx } = createTx();
    const api = tx as unknown as {
      findArchivedParents: (meta: TableMeta, rowData: Record<string, unknown>) => Promise<unknown>;
      loadRegistryByChild: Mock;
      query: Mock;
    };
    api.loadRegistryByChild = vi.fn(async () => [
      { ...childRegistryEntry, behavior: 'hide', childColumn: 'hidden_parent_id' },
      { ...childRegistryEntry, behavior: 'block', childColumn: 'empty_parent_id' },
      { ...childRegistryEntry, behavior: 'block', childColumn: 'live_parent_id' },
      { ...childRegistryEntry, behavior: 'cascade', childColumn: 'archived_parent_id' },
      { ...childRegistryEntry, behavior: 'cascade', childColumn: 'missing_parent_id' },
    ]);
    api.query = vi.fn(async (_text: string, values: unknown[]) => {
      const id = values[0];
      if (id === 'live-parent') {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (id === 'hidden-parent') {
        throw new Error('hide registry rows must not be checked');
      }
      if (id === 'archived-parent') {
        return api.query.mock.calls.filter((call) => call[1]?.[0] === 'archived-parent').length === 1
          ? { rows: [{ exists: false }], rowCount: 1 }
          : { rows: [{ exists: true }], rowCount: 1 };
      }
      return { rows: [{ exists: false }], rowCount: 1 };
    });

    await expect(api.findArchivedParents(parentMeta, {
      hidden_parent_id: 'hidden-parent',
      empty_parent_id: '',
      live_parent_id: 'live-parent',
      archived_parent_id: 'archived-parent',
      missing_parent_id: 'missing-parent',
    })).resolves.toEqual([{ schema: 'demo', table: 'customer', id: 'archived-parent' }]);
  });

  it('detects restore conflicts from array and text constraint column metadata', async () => {
    const { tx } = createTx();
    const api = tx as unknown as {
      findRestoreConflict: (
        meta: TableMeta,
        rowData: Record<string, unknown>,
        id: string,
      ) => Promise<Record<string, unknown> | undefined>;
      query: Mock;
    };
    api.query = vi.fn(async (_text: string, values?: unknown[]) => {
      if (!values || values[0] === 'demo') {
        return {
          rows: [
            { constraint_name: 'uq_skip_null', columns: ['nullable_email'] },
            { constraint_name: 'uq_email', columns: '{tenant_id,email,}' },
          ],
          rowCount: 2,
        };
      }
      expect(values).toEqual(['tenant-1', 'a@example.com', 'archived-1']);
      return { rows: [{ blocking_id: 'live-1' }], rowCount: 1 };
    });

    await expect(api.findRestoreConflict(parentMeta, {
      tenant_id: 'tenant-1',
      email: 'a@example.com',
      nullable_email: null,
    }, 'archived-1')).resolves.toEqual({
      conflictingConstraint: 'uq_email',
      conflictValues: { tenant_id: 'tenant-1', email: 'a@example.com' },
      blockingLiveId: 'live-1',
    });

    api.query = vi.fn(async (_text: string, values?: unknown[]) => (
      !values || values[0] === 'demo'
        ? { rows: [{ constraint_name: 'uq_email', columns: ['email'] }], rowCount: 1 }
        : { rows: [{ blocking_id: 'live-without-row-count' }] }
    ));
    await expect(api.findRestoreConflict(parentMeta, { email: 'row-count@example.com' }, 'archived-row-count'))
      .resolves.toBeUndefined();

    api.query = vi.fn(async (_text: string, values?: unknown[]) => (
      !values || values[0] === 'demo'
        ? { rows: [{ constraint_name: 'uq_email', columns: ['email'] }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    ));
    await expect(api.findRestoreConflict(parentMeta, { email: 'clear@example.com' }, 'archived-2')).resolves
      .toBeUndefined();
  });

  it('loads column names, checks mirrors, normalizes labels, and samples archive sizes defensively', async () => {
    const metrics = {
      incrementSoftDelete: vi.fn(),
      incrementRestore: vi.fn(),
      incrementHardDelete: vi.fn(),
      setArchiveSizeBytes: vi.fn(),
    };
    const { tx } = createTx('app', metrics);
    const api = tx as unknown as {
      loadColumnNames: (schema: string, table: string) => Promise<string[]>;
      ensureMirrorExists: (meta: TableMeta) => Promise<void>;
      sampleArchiveSizeByName: (qualified: string, label?: string) => Promise<void>;
      normalizeArchiveMetricLabel: (table: string) => string;
      query: Mock;
    };
    api.query = vi.fn(async (text: string, values?: unknown[]): Promise<Partial<QueryResult>> => {
      if (text.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'id' }, { column_name: 'tenant_id' }] };
      }
      if (text.includes('to_regclass')) {
        return { rows: [{ exists: values?.[0] === 'archive.demo_customer' }] };
      }
      if (text.includes('pg_total_relation_size')) {
        return { rows: [{ bytes: '4096' }] };
      }
      return { rows: [] };
    });

    await expect(api.loadColumnNames('demo', 'customer')).resolves.toEqual(['id', 'tenant_id']);
    await expect(api.ensureMirrorExists(parentMeta)).resolves.toBeUndefined();
    await expect(api.ensureMirrorExists({ ...parentMeta, table: 'missing' })).rejects.toBeInstanceOf(
      ArchiveMirrorMissingError,
    );
    await expect(api.ensureMirrorExists({ ...parentMeta, table: 'missing' })).rejects.toMatchObject({
      context: {
        table: '"demo"."customer"',
        archiveTable: '"archive"."demo_customer"',
      },
    });
    expect(api.normalizeArchiveMetricLabel('"archive"."demo_customer"')).toBe('demo.customer');
    expect(api.normalizeArchiveMetricLabel('archive._broken')).toBe('archive._broken');
    expect(api.normalizeArchiveMetricLabel('archive.broken_')).toBe('archive.broken_');
    expect(api.normalizeArchiveMetricLabel('custom.table')).toBe('custom.table');

    await api.sampleArchiveSizeByName('"archive"."demo_customer"');
    expect(metrics.setArchiveSizeBytes).toHaveBeenCalledWith('"archive"."demo_customer"', 4096);
    api.query = vi.fn(async () => ({ rows: [] }));
    await api.sampleArchiveSizeByName('"archive"."demo_customer"', 'demo.customer');
    expect(metrics.setArchiveSizeBytes).toHaveBeenCalledWith('demo.customer', 0);
  });
});
