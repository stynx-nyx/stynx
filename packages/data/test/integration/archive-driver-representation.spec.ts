import { drizzle } from 'drizzle-orm/node-postgres';
import { bigint, date, interval, line, numeric, pgSchema, point, timestamp, uuid, type PgColumnBuilderBase } from 'drizzle-orm/pg-core';
import { Pool, types, type PoolClient } from 'pg';
import { createTransactionSelectRoot } from '../../src/query-helpers.js';
import { softDeletable } from '../../src/table-markers.js';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres.js';

// Real driver observations for the existing raw archive path. These do not
// promise Drizzle application-mode mapping or change public result types.
const schema = pgSchema('archive_repr');
const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
function projection(column: PgColumnBuilderBase) {
  return softDeletable(schema.table('entry', {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    value: column,
  }));
}
const timestampDate = projection(timestamp('timestamp_value', { withTimezone: true, mode: 'date' }));
const timestampString = projection(timestamp('timestamp_value', { withTimezone: true, mode: 'string' }));
const dateDate = projection(date('date_value', { mode: 'date' }));
const dateString = projection(date('date_value', { mode: 'string' }));
const numericNumber = projection(numeric('numeric_value', { mode: 'number' }));
const numericString = projection(numeric('numeric_value'));
const numericBigint = projection(numeric('numeric_value', { mode: 'bigint' }));
const bigintValue = projection(bigint('bigint_value', { mode: 'bigint' }));
const intervalValue = projection(interval('interval_value'));
const pointValue = projection(point('point_value', { mode: 'tuple' }));
const lineValue = projection(line('line_value', { mode: 'tuple' }));

type ParserMode = 'stock' | 'timestamp-text' | 'numeric-number' | 'int8-number';
let parserMode: ParserMode = 'stock';
const parsed: Array<{ oid: number; value: unknown }> = [];
let database: PostgresTestDatabase | undefined;
let pool: Pool | undefined;
let client: PoolClient | undefined;
function connected(): PoolClient {
  if (!client) throw new Error('Archive representation fixture is not connected');
  return client;
}

beforeAll(async () => {
  database = await createPostgresTestDatabase('stynx_archive_repr', { useTemplate: false });
  pool = new Pool({
    connectionString: database.connectionString('stynx_archive_repr'),
    max: 1,
    types: {
      getTypeParser(oid, format) {
        const original: unknown = types.getTypeParser(oid, format);
        if (typeof original !== 'function') throw new Error('PostgreSQL parser is not callable');
        return (wire: unknown): unknown => {
          let value: unknown;
          if (format !== 'binary' && parserMode === 'timestamp-text' && [1082, 1114, 1184].includes(oid)) {
            if (typeof wire !== 'string') throw new Error('Expected timestamp text protocol');
            value = wire;
          } else if (format !== 'binary' && ((parserMode === 'numeric-number' && oid === 1700) || (parserMode === 'int8-number' && oid === 20))) {
            if (typeof wire !== 'string') throw new Error('Expected numeric text protocol');
            value = Number(wire);
          } else {
            value = Reflect.apply(original, undefined, [wire]);
          }
          parsed.push({ oid, value });
          return value;
        };
      },
    },
  });
  client = await pool.connect();
  await client.query(`
    create schema archive_repr;
    create schema archive;
    create table archive_repr.entry (
      id uuid primary key, tenant_id uuid not null,
      timestamp_value timestamptz not null default '2026-01-01T00:00:00.789Z',
      date_value date not null default '2026-01-01',
      numeric_value numeric not null default 1.25,
      bigint_value bigint not null default 9007199254740993,
      interval_value interval not null default '1 day 02:03:04',
      point_value point not null default '(1.25,2.5)',
      line_value line not null default '{1,2,3}'
    );
    create table archive.archive_repr_entry (like archive_repr.entry including defaults);
    alter table archive.archive_repr_entry add column archive_id bigserial primary key;
    alter table archive.archive_repr_entry add column archived_at timestamptz not null default '2026-01-02T00:00:00.789Z';
    alter table archive.archive_repr_entry add column deleted_at timestamptz not null default '2026-01-03T00:00:00.789Z';
    alter table archive.archive_repr_entry add column deleted_by uuid not null;
    alter table archive.archive_repr_entry add column last_erasure_at timestamptz;
  `);
  await client.query("select set_config('app.tenant_id', $1, false)", [TENANT]);
});

beforeEach(async () => {
  parserMode = 'stock';
  const connection = connected();
  await connection.query('truncate archive.archive_repr_entry restart identity');
  await connection.query('insert into archive.archive_repr_entry (id,tenant_id,deleted_by) values($1,$2,$3)', [ID, TENANT, ACTOR]);
  parsed.length = 0;
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try {
    client?.release();
    client = undefined;
    await pool?.end();
  } finally {
    await database?.dispose();
  }
});

const cases = [
  { name: 'date-mode timestamp milliseconds', table: timestampDate, column: 'timestamp_value', input: '2026-01-01T00:00:00.789Z', mode: 'stock', kind: 'Date' },
  { name: 'date-mode positive timestamp infinity', table: timestampDate, column: 'timestamp_value', input: 'infinity', mode: 'stock', kind: 'number' },
  { name: 'date-mode negative timestamp infinity', table: timestampDate, column: 'timestamp_value', input: '-infinity', mode: 'stock', kind: 'number' },
  { name: 'date-mode PostgreSQL finite date outside JS range', table: timestampDate, column: 'timestamp_value', input: '294276-12-31T00:00:00Z', mode: 'stock', kind: 'InvalidDate' },
  { name: 'string-mode timestamp with stock Date parser', table: timestampString, column: 'timestamp_value', input: '2026-01-01T00:00:00.789Z', mode: 'stock', kind: 'Date' },
  { name: 'date-mode configured text parser', table: timestampDate, column: 'timestamp_value', input: '2026-01-01T00:00:00.789Z', mode: 'timestamp-text', kind: 'string' },
  { name: 'date column date mode', table: dateDate, column: 'date_value', input: '2026-01-01', mode: 'stock', kind: 'Date' },
  { name: 'date column string mode with stock Date parser', table: dateString, column: 'date_value', input: '2026-01-01', mode: 'stock', kind: 'Date' },
  { name: 'numeric number mode raw decimal', table: numericNumber, column: 'numeric_value', input: '1.25', mode: 'stock', kind: 'string' },
  { name: 'numeric number mode raw NaN', table: numericNumber, column: 'numeric_value', input: 'NaN', mode: 'stock', kind: 'string' },
  { name: 'numeric number mode raw infinity', table: numericNumber, column: 'numeric_value', input: 'Infinity', mode: 'stock', kind: 'string' },
  { name: 'numeric number mode raw negative infinity', table: numericNumber, column: 'numeric_value', input: '-Infinity', mode: 'stock', kind: 'string' },
  { name: 'numeric bigint mode raw fraction without Drizzle conversion', table: numericBigint, column: 'numeric_value', input: '1.25', mode: 'stock', kind: 'string' },
  { name: 'numeric string mode configured number parser', table: numericString, column: 'numeric_value', input: '1.25', mode: 'numeric-number', kind: 'number' },
  { name: 'int8 stock decimal string precision', table: bigintValue, column: 'bigint_value', input: '9007199254740993', mode: 'stock', kind: 'string' },
  { name: 'int8 configured already-rounded number', table: bigintValue, column: 'bigint_value', input: '9007199254740993', mode: 'int8-number', kind: 'number' },
  { name: 'interval stock object', table: intervalValue, column: 'interval_value', input: '1 day 02:03:04', mode: 'stock', kind: 'object' },
  { name: 'point tuple declaration with stock object', table: pointValue, column: 'point_value', input: '(1.25,2.5)', mode: 'stock', kind: 'object' },
  { name: 'line tuple declaration with stock text', table: lineValue, column: 'line_value', input: '{1,2,3}', mode: 'stock', kind: 'string' },
] satisfies Array<{ name: string; table: ReturnType<typeof projection>; column: string; input: string; mode: ParserMode; kind: string }>;

it.each(cases)('preserves actual archive driver representation: $name', async ({ table, column, input, mode, kind }) => {
  const connection = connected();
  await connection.query(`update archive.archive_repr_entry set ${connection.escapeIdentifier(column)} = $1`, [input]);
  parserMode = mode;
  const raw = await connection.query(`select ${connection.escapeIdentifier(column)} as value from archive.archive_repr_entry`);
  const expected: unknown = raw.rows[0]?.value;
  if (kind === 'Date' || kind === 'InvalidDate') {
    expect(expected).toBeInstanceOf(Date);
    if (!(expected instanceof Date)) throw new Error('Expected native date representation');
    expect(Number.isNaN(expected.getTime())).toBe(kind === 'InvalidDate');
  } else {
    expect(typeof expected).toBe(kind);
  }
  const archive = createTransactionSelectRoot(connection, () => drizzle(connection).select()).from(table).onlyDeleted();
  const compiled = archive.toSQL();
  const query = vi.spyOn(connection, 'query');
  parsed.length = 0;
  const rows = await archive.execute();
  expect(rows).toHaveLength(1);
  const actual: unknown = rows[0]?.value;
  expect(actual).toEqual(expected);
  expect(parsed.some((entry) => Object.is(entry.value, actual))).toBe(true);
  expect(rows[0]?.tenantId).toBe(TENANT);
  expect(rows[0]?.deletedBy).toBe(ACTOR);
  expect(query).toHaveBeenCalledExactlyOnceWith(compiled.sql, compiled.params);
});

it.each(['2026-01-01T00:00:00.789Z', '294276-12-31T00:00:00Z', 'infinity', '-infinity'])(
  'preserves actual raw archive timestamp metadata %s', async (input) => {
    const connection = connected();
    await connection.query('update archive.archive_repr_entry set archived_at=$1::timestamptz, deleted_at=$1::timestamptz, last_erasure_at=$1::timestamptz', [input]);
    const archive = createTransactionSelectRoot(connection, () => drizzle(connection).select()).from(timestampDate).onlyDeleted();
    const raw = await connection.query('select archived_at,deleted_at,last_erasure_at from archive.archive_repr_entry');
    const query = vi.spyOn(connection, 'query');
    parsed.length = 0;
    const rows = await archive.execute();
    expect(rows).toHaveLength(1);
    for (const [property, physical] of [['archivedAt', 'archived_at'], ['deletedAt', 'deleted_at'], ['lastErasureAt', 'last_erasure_at']] as const) {
      const value: unknown = rows[0]?.[property];
      expect(value).toEqual(raw.rows[0]?.[physical]);
      expect(parsed.some((entry) => Object.is(entry.value, value))).toBe(true);
    }
    expect(query).toHaveBeenCalledTimes(1);
  },
);

it('retains BigInt(String(raw)) for an already-rounded configured archive ID', async () => {
  const connection = connected();
  await connection.query('update archive.archive_repr_entry set archive_id=$1::bigint', ['9007199254740993']);
  parserMode = 'int8-number';
  const raw = await connection.query('select archive_id from archive.archive_repr_entry');
  const expected: unknown = raw.rows[0]?.archive_id;
  expect(expected).toBe(9007199254740992);
  const archive = createTransactionSelectRoot(connection, () => drizzle(connection).select()).from(timestampDate).onlyDeleted();
  const rows = await archive.execute();
  expect(rows[0]?.archiveId).toBe(BigInt(String(expected)));
  // This preserves an existing conversion, not the lost database precision.
  expect(rows[0]?.archiveId).not.toBe(9007199254740993n);
});
