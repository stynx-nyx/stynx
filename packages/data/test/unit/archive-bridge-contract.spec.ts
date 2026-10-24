import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { customType, pgSchema, text, timestamp, uuid, type AnyPgTable } from 'drizzle-orm/pg-core';
import type { PoolClient } from 'pg';
import { ArchiveSelectQuery, type SelectBuilderLike } from '../../src/query-helpers.js';

const schema = pgSchema('consumer"schema');
const custom = customType<{ data: { nominal: string }; driverData: string }>({
  dataType: () => 'text',
  fromDriver: (value) => ({ nominal: value }),
});
const table = schema.table('note;--', {
  id: uuid('id').notNull(),
  title: text('title"quoted').notNull(),
  custom: custom('custom').notNull(),
});
const ID = '0190a8a4-0000-7000-8000-000000000001';
const ACTOR = '0190a8a4-0000-7000-8000-000000000002';
const archivedAt = new Date('2026-01-01T00:00:00Z');
const deletedAt = new Date('2026-01-02T00:00:00Z');
const row = () => ({
  id: ID,
  'title"quoted': 'preserved',
  custom: 'custom driver value without a runtime schema',
  archive_id: '42',
  archived_at: archivedAt,
  deleted_at: deletedAt,
  deleted_by: ACTOR,
  last_erasure_at: null,
});

function fixture(rows: Array<Record<string, unknown>>, sourceTable: AnyPgTable = table) {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  const client = { query } as unknown as PoolClient;
  const builder = drizzle(client).select().from(sourceTable);
  return {
    query,
    archive: new ArchiveSelectQuery(
      client,
      builder as unknown as SelectBuilderLike,
      sourceTable,
      'onlyDeleted',
    ),
  };
}

describe('bounded legacy archive bridge contract', () => {
  it('quotes consumer identifiers and binds hostile values instead of making SQL text', async () => {
    const hostile = "x'); drop table important; --";
    const { archive, query } = fixture([row()]);
    const compiled = archive.where(eq(table.title, hostile)).toSQL();
    expect(compiled.params).toEqual([hostile]);
    expect(compiled.sql).not.toContain(hostile);
    expect(compiled.sql).toContain('"archive"."consumer""schema_note;--"');
    expect(compiled.sql).toContain('"title""quoted"');
    await archive.execute();
    expect(query).toHaveBeenCalledWith(compiled.sql, [hostile]);
  });

  it('preserves PromiseLike values and custom-column compatibility without claiming erased schema validation', async () => {
    const { archive } = fixture([row()]);
    const expected = [
      {
        id: ID,
        title: 'preserved',
        custom: row().custom,
        archiveId: 42n,
        archivedAt,
        deletedAt,
        deletedBy: ACTOR,
        lastErasureAt: null,
      },
    ];
    await expect(archive.execute()).resolves.toEqual(expected);
    await expect(Promise.resolve(archive)).resolves.toEqual(expected);
    await expect(archive.then((rows) => rows)).resolves.toEqual(expected);
    await expect(archive.catch(() => [])).resolves.toEqual(expected);
    const completed = vi.fn();
    await expect(archive.finally(completed)).resolves.toEqual(expected);
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'finite timestamp with milliseconds', value: new Date('2026-01-01T00:00:00.789Z'), invalid: false },
    { label: 'out-of-JavaScript-range Date instance', value: new Date(8_640_000_000_000_001), invalid: true },
  ])('preserves raw Date identity for $label without imposing a new finite restriction', async ({ value, invalid }) => {
    const dateTable = schema.table('date_mode', {
      id: uuid('id').notNull(),
      recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).notNull(),
    });
    const physicalRow = {
      ...row(),
      recorded_at: value,
      archived_at: value,
      deleted_at: value,
      last_erasure_at: value,
    };
    const { archive, query } = fixture([physicalRow], dateTable);
    const compiled = archive.toSQL();
    const result = await archive.execute();
    expect(result).toHaveLength(1);
    for (const field of ['recordedAt', 'archivedAt', 'deletedAt', 'lastErasureAt']) {
      expect(result[0]?.[field]).toBe(value);
    }
    expect(Number.isNaN(value.getTime())).toBe(invalid);
    expect(physicalRow.recorded_at).toBe(value);
    expect(result[0]?.archiveId).toBe(42n);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(compiled.sql, compiled.params);
  });

  it.each([
    { bad: { timestamp: 'sensitive-invalid-time' } },
    { bad: false },
  ])('rejects a malformed built-in timestamp projection without leaking its value', async ({ bad }) => {
    const dateTable = schema.table('date_mode_invalid', {
      id: uuid('id').notNull(),
      recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).notNull(),
    });
    const { archive, query } = fixture([{ ...row(), recorded_at: bad }], dateTable);
    const error: unknown = await archive.execute().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify(error)).not.toContain('sensitive-invalid-time');
    expect(query).toHaveBeenCalledTimes(1);
  });

  for (const [field, value] of [
    ['archived_at', 'sensitive-invalid-time'],
    // An out-of-range Date is a possible raw PG representation, not malformed.
    // Keep this negative sensor on a genuinely invalid timestamp object instead.
    ['deleted_at', { invalid: 'sensitive-invalid-time' }],
    ['deleted_at', false],
    ['last_erasure_at', { invalid: 'sensitive-invalid-time' }],
    ['archived_at', true],
    ['deleted_by', 42],
    ['archive_id', null],
    ['id', 42],
    ['title"quoted', null],
  ] as const) {
    it(`rejects malformed fixed or known-column projection ${field} without leaking row values`, async () => {
      const invalid = { ...row(), [field]: value, custom: 'sensitive-private-row' };
      const { archive } = fixture([invalid]);
      const error: unknown = await archive.execute().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain('sensitive-invalid-time');
      expect(JSON.stringify(error)).not.toContain('sensitive-private-row');
    });
  }
});
