// Unit tests for the matcher helpers' control-flow paths (success +
// wrong-error + no-error). Covers the lines previously missed by the
// integration-heavy testing.spec.ts.

import {
  type Database,
  ReadOnlyViolationError,
  RestoreConflictError,
  SoftDeleteBlockedError,
  softDeletable,
} from '@stynx/data';
import { pgSchema, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  auditExpect,
  expectArchiveMirrorExists,
  expectArchiveMirrorInSync,
  expectInArchive,
  expectNotInLive,
  expectROCannotWrite,
  expectRestored,
  expectRLSIsolated,
  expectRestoreConflict,
  expectSoftDeleteBlocked,
} from '../src/matchers';

const unitSchema = pgSchema('unit');
const unitDocuments = softDeletable(unitSchema.table('documents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));
const publicDocuments = softDeletable(pgTable('public_documents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

function databaseWithRows(rows: Array<{ rows: Array<Record<string, unknown>> }>) {
  const queue = [...rows];
  const query = vi.fn(async () => queue.shift() ?? { rows: [] });
  const tx = vi.fn(async (callback: (trx: { query: typeof query }) => Promise<unknown>) =>
    callback({ query }),
  );
  const withSystemContext = vi.fn(async (_label: string, callback: () => Promise<unknown>) =>
    callback(),
  );
  return {
    database: { withSystemContext, tx } as unknown as Database,
    query,
    tx,
    withSystemContext,
  };
}

describe('expectROCannotWrite', () => {
  it('resolves when fn throws ReadOnlyViolationError', async () => {
    await expect(
      expectROCannotWrite(async () => {
        throw new ReadOnlyViolationError({ table: 'demo' });
      }),
    ).resolves.toBe(undefined);
  });

  it('rethrows non-RO errors', async () => {
    await expect(
      expectROCannotWrite(async () => {
        throw new Error('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(
      expectROCannotWrite(async () => undefined),
    ).rejects.toThrow('Expected ReadOnlyViolationError to be thrown');
  });
});

describe('archive-aware matchers', () => {
  it('accepts archive and live row counts for moved and restored rows', async () => {
    const { database, query } = databaseWithRows([
      { rows: [{ value: 1 }] },
      { rows: [{ value: 0 }] },
      { rows: [{ value: 1 }] },
      { rows: [{ value: 0 }] },
    ]);

    await expect(expectInArchive(database, unitDocuments, 'row-1')).resolves.toBe(undefined);
    await expect(expectNotInLive(database, unitDocuments, 'row-1')).resolves.toBe(undefined);
    await expect(expectRestored(database, unitDocuments, 'row-1')).resolves.toBe(undefined);
    expect(query).toHaveBeenCalledWith(
      'select count(*)::int as value from "archive"."unit_documents" where id = $1::uuid',
      ['row-1'],
    );
  });

  it('reports rows missing from archive or still present in live tables', async () => {
    await expect(
      expectInArchive(databaseWithRows([{ rows: [] }]).database, unitDocuments, 'empty'),
    ).rejects.toThrow('Expected "archive"."unit_documents" to contain row empty');

    await expect(
      expectInArchive(databaseWithRows([{ rows: [{ value: 0 }] }]).database, unitDocuments, 'missing'),
    ).rejects.toThrow('Expected "archive"."unit_documents" to contain row missing');

    await expect(
      expectNotInLive(databaseWithRows([{ rows: [{ value: 1 }] }]).database, unitDocuments, 'live'),
    ).rejects.toThrow('Expected "unit"."documents" to not contain row live');

    await expect(
      expectRestored(
        databaseWithRows([{ rows: [{ value: 0 }] }, { rows: [{ value: 1 }] }]).database,
        unitDocuments,
        'archived',
      ),
    ).rejects.toThrow('Expected archived to be restored into "unit"."documents"');
  });

  it('uses public schema metadata for tables without an explicit schema', async () => {
    const { database, query } = databaseWithRows([{ rows: [{ value: 0 }] }]);

    await expect(expectNotInLive(database, publicDocuments, 'public-row')).resolves.toBe(undefined);
    expect(query).toHaveBeenCalledWith(
      'select count(*)::int as value from "public"."public_documents" where id = $1::uuid',
      ['public-row'],
    );
  });

  it('checks archive mirror existence and column parity', async () => {
    await expect(
      expectArchiveMirrorExists(databaseWithRows([{ rows: [{ value: 1 }] }]).database, unitDocuments),
    ).resolves.toBe(undefined);

    await expect(
      expectArchiveMirrorInSync(
        databaseWithRows([
          {
            rows: [
              { column_name: 'archive_id' },
              { column_name: 'id' },
              { column_name: 'tenant_id' },
              { column_name: 'title' },
              { column_name: 'created_at' },
              { column_name: 'updated_at' },
            ],
          },
        ]).database,
        unitDocuments,
      ),
    ).resolves.toBe(undefined);
  });

  it('reports missing archive mirrors and mirror drift', async () => {
    await expect(
      expectArchiveMirrorExists(databaseWithRows([{ rows: [{ value: 0 }] }]).database, unitDocuments),
    ).rejects.toThrow('Expected archive mirror "archive"."unit_documents" to exist');

    await expect(
      expectArchiveMirrorInSync(
        databaseWithRows([
          {
            rows: [
              { column_name: 'id' },
              { column_name: 'tenant_id' },
              { column_name: 'extra_column' },
            ],
          },
        ]).database,
        unitDocuments,
      ),
    ).rejects.toThrow('Archive mirror drift detected');
  });
});

describe('auditExpect', () => {
  it('finds an audit row whose tags match every requested tag', async () => {
    const { database, query } = databaseWithRows([
      {
        rows: [
          { tags: { requestId: 'wrong' } },
          { tags: { requestId: 'req-1', source: 'unit' } },
        ],
      },
    ]);

    await expect(
      auditExpect(database, 'documents', 'insert', {
        schema: 'unit',
        rowId: 'row-1',
        tags: { requestId: 'req-1' },
      }),
    ).resolves.toBe(undefined);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('from audit.log'), [
      'insert',
      'unit',
      'documents',
      'row-1',
    ]);
  });

  it('uses schema, row id, and tags defaults when only entity and operation are provided', async () => {
    const { database, query } = databaseWithRows([{ rows: [{ tags: null }] }]);

    await expect(auditExpect(database, 'documents', 'insert')).resolves.toBe(undefined);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('from audit.log'), [
      'insert',
      null,
      'documents',
      null,
    ]);
  });

  it('reports when no audit row matches the requested tags', async () => {
    await expect(
      auditExpect(
        databaseWithRows([{ rows: [{ tags: null }, { tags: { requestId: 'other' } }] }]).database,
        'documents',
        'delete',
        { tags: { requestId: 'req-1' } },
      ),
    ).rejects.toThrow('Expected audit row was not found for delete:documents');
  });
});

describe('expectRLSIsolated', () => {
  it('allows rows for the queried tenant and ignores tenant_id snake-case shape', async () => {
    await expect(
      expectRLSIsolated(
        async () => [
          { tenantId: 'tenant-a' },
          { tenant_id: 'tenant-a' },
        ],
        { tenantA: 'tenant-a', tenantB: 'tenant-b' },
      ),
    ).resolves.toBe(undefined);
  });

  it('reports leaked rows from another tenant', async () => {
    await expect(
      expectRLSIsolated(
        async () => [{ tenant_id: 'tenant-b' }],
        { tenantA: 'tenant-a', tenantB: 'tenant-b' },
      ),
    ).rejects.toThrow('Expected tenant tenant-b rows to be hidden, but 1 leaked');
  });
});

describe('expectRestoreConflict', () => {
  it('resolves when fn throws RestoreConflictError', async () => {
    await expect(
      expectRestoreConflict(async () => {
        throw new RestoreConflictError({ table: 'demo' });
      }),
    ).resolves.toBe(undefined);
  });

  it('rethrows non-conflict errors', async () => {
    await expect(
      expectRestoreConflict(async () => {
        throw new TypeError('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(expectRestoreConflict(async () => undefined)).rejects.toThrow(
      'Expected RestoreConflictError to be thrown',
    );
  });
});

describe('expectSoftDeleteBlocked', () => {
  it('resolves when fn throws SoftDeleteBlockedError', async () => {
    await expect(
      expectSoftDeleteBlocked(async () => {
        throw new SoftDeleteBlockedError({ table: 'demo' });
      }),
    ).resolves.toBe(undefined);
  });

  it('rethrows non-blocked errors', async () => {
    await expect(
      expectSoftDeleteBlocked(async () => {
        throw new RangeError('other');
      }),
    ).rejects.toThrow('other');
  });

  it('throws when fn resolves without error', async () => {
    await expect(expectSoftDeleteBlocked(async () => undefined)).rejects.toThrow(
      'Expected SoftDeleteBlockedError to be thrown',
    );
  });
});
