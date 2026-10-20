import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { z } from 'zod';
import { StynxDataModule } from '../../src/data.module.js';
import { Database } from '../../src/database.js';
import {
  NotFoundError,
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
} from '../../src/errors.js';
import type { Transaction } from '../../src/transaction.js';
import { defineQuery, sql } from '../../src/typed-query.js';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres.js';

// SM-08 (02 §3, D-030, S-21, S-27): Transaction.run parses arguments before any SQL is
// sent, executes with $n binding through the real driver (parse/describe/bind/execute),
// checks the row count against `expects` and validates every row on real PostgreSQL.
const TENANT = 'd1111111-1111-4111-8111-111111111111';
const ACTOR = 'd2222222-2222-4222-8222-222222222222';
const NOTE = '0190a8a4-0000-7000-8000-0000000000a1';
const MISSING = '0190a8a4-0000-7000-8000-0000000000ff';

const insertNote = defineQuery({
  name: 'typed_demo.note.insert',
  text: sql`insert into typed_demo.note (id, body, sequence) values ($1, $2, $3)
            returning id::text as id, body, sequence`,
  params: z.tuple([
    z.string().uuid(),
    z.string().max(8).nullable(), // = the column's varchar(8) (S-27)
    z.number().int().min(1).max(99),
  ]),
  row: z.object({ id: z.string().uuid(), body: z.string().nullable(), sequence: z.number().int() }),
  expects: 'one',
});

const getNote = defineQuery({
  name: 'typed_demo.note.get',
  text: sql`select id::text as id, body, sequence from typed_demo.note where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({ id: z.string().uuid(), body: z.string().nullable(), sequence: z.number().int() }),
  expects: 'one',
});

const findNote = defineQuery({
  name: 'typed_demo.note.find',
  text: sql`select id::text as id from typed_demo.note where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({ id: z.string().uuid() }),
  expects: 'zero-or-one',
});

const listNotes = defineQuery({
  name: 'typed_demo.note.list',
  text: sql`select id::text as id from typed_demo.note where sequence <= $1 order by sequence`,
  params: z.tuple([z.number().int().max(99)]),
  row: z.object({ id: z.string().uuid() }),
  expects: 'many',
});

const touchNote = defineQuery({
  name: 'typed_demo.note.touch',
  text: sql`update typed_demo.note set sequence = sequence where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({}),
  expects: 'none',
});

// int8 arrives from pg as a string; a row schema declaring a number must refuse it.
const countNotes = defineQuery({
  name: 'typed_demo.note.count',
  text: sql`select count(*) as total from typed_demo.note`,
  params: z.tuple([]),
  row: z.object({ total: z.number().int() }),
  expects: 'one',
});

describe('Transaction.run typed queries (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let admin: Client;
  let moduleRef: TestingModule;
  let database: Database;

  const inTx = <T>(work: (trx: Transaction) => Promise<T>): Promise<T> =>
    database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(work, { requireActor: true, retry: false }),
    );

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_data_typed_query');
    admin = await postgres.connectAsAdmin();
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('typed-query-owner') },
            app: { connectionString: postgres.appConnectionString('typed-query-app'), max: 2 },
            reader: { connectionString: postgres.connectionString('typed-query-reader') },
          },
          retry: false,
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    await admin.query(
      `insert into tenancy.tenants (id, slug, name) values ($1::uuid, 'typed-query', 'Typed query')
       on conflict do nothing`,
      [TENANT],
    );
    await admin.query(`create schema typed_demo`);
    await admin.query(`create table typed_demo.note (
      id uuid primary key,
      body varchar(8),
      sequence integer not null
    )`);
    await admin.query(`grant usage on schema typed_demo to stynx_app`);
    await admin.query(`grant select, insert, update on typed_demo.note to stynx_app`);
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close().catch(() => undefined);
    await admin?.end();
    await postgres?.dispose();
  }, 60_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts and reads back through $n binding with validated rows', async () => {
    const inserted = await inTx(async (trx) => trx.run(insertNote, [NOTE, 'hello', 2]));
    expect(inserted).toEqual({ id: NOTE, body: 'hello', sequence: 2 });

    const results = await inTx(async (trx) => ({
      got: await trx.run(getNote, [NOTE]),
      found: await trx.run(findNote, [NOTE]),
      absent: await trx.run(findNote, [MISSING]),
      listed: await trx.run(listNotes, [99]),
      none: await trx.run(listNotes, [1]),
      touched: await trx.run(touchNote, [NOTE]),
    }));
    expect(results).toEqual({
      got: { id: NOTE, body: 'hello', sequence: 2 },
      found: { id: NOTE },
      absent: null,
      listed: [{ id: NOTE }],
      none: [],
      touched: undefined,
    });
  });

  it('rejects an over-limit argument with QueryArgumentError and sends no SQL', async () => {
    const spy = vi.spyOn(Client.prototype, 'query');
    const outcome = await inTx(async (trx) => {
      const before = spy.mock.calls.length;
      const error = await trx.run(insertNote, [MISSING, 'nine-char', 2]).catch((e: unknown) => e);
      return { error, sent: spy.mock.calls.length - before };
    });
    expect(outcome.error).toBeInstanceOf(QueryArgumentError);
    expect(outcome.error).toMatchObject({ status: 400, issues: [{ path: [1], code: 'too_big' }] });
    expect(outcome.sent).toBe(0);
    expect(spy.mock.calls.length).toBeGreaterThan(0); // the spy does observe the pool's client
    const stored = await admin.query(
      `select count(*)::int as n from typed_demo.note where id = $1`,
      [MISSING],
    );
    expect(stored.rows).toEqual([{ n: 0 }]);
  });

  it('throws NotFoundError when expects one finds no row', async () => {
    await expect(inTx(async (trx) => trx.run(getNote, [MISSING]))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws QueryCardinalityError when expects none returns rows', async () => {
    const returning = defineQuery({
      ...touchNote,
      name: 'typed_demo.note.touch_returning',
      text: sql`update typed_demo.note set sequence = sequence where id = $1 returning id`,
    });
    await expect(inTx(async (trx) => trx.run(returning, [NOTE]))).rejects.toBeInstanceOf(
      QueryCardinalityError,
    );
  });

  it('rejects a row the driver returns in a shape the row schema refuses', async () => {
    const error = await inTx(async (trx) => trx.run(countNotes, [])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({
      code: 'QUERY_ROW_INVALID',
      rowIndex: 0,
      issues: [{ path: ['total'], code: 'invalid_type' }],
    });
  });
});
