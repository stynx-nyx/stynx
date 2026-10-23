import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import ts from 'typescript';
import type { Mock } from 'vitest';
import { z } from 'zod';
import * as dataModule from '../../src/index.js';
import {
  NotFoundError,
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
  TransactionRequiredError,
} from '../../src/errors.js';
import { Transaction, type StynxDrizzleDatabase } from '../../src/transaction.js';
import { defineQuery, sql } from '../../src/typed-query.js';

const ID = '0190a8a4-0000-7000-8000-000000000001';
const OTHER_ID = '0190a8a4-0000-7000-8000-000000000002';

const insertNote = defineQuery({
  name: 'unit.note.insert',
  text: sql`insert into demo.note (id, body, sequence) values ($1, $2, $3) returning id`,
  params: z.tuple([
    z.string().uuid(),
    z.string().max(8).nullable(),
    z.number().int().min(1).max(99),
  ]),
  row: z.object({ id: z.string().uuid() }),
  expects: 'one',
});

const findNote = defineQuery({
  name: 'unit.note.find',
  text: sql`select id from demo.note where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({ id: z.string().uuid() }),
  expects: 'zero-or-one',
});

const listNotes = defineQuery({
  name: 'unit.note.list',
  text: sql`select id from demo.note where sequence <= $1`,
  params: z.tuple([z.number().int().max(99)]),
  row: z.object({ id: z.string().uuid() }),
  expects: 'many',
});

const deleteNote = defineQuery({
  name: 'unit.note.delete',
  text: sql`delete from demo.note where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({}),
  expects: 'none',
});

function createTx(rows: Array<Record<string, unknown>> = []) {
  const client = {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as unknown as PoolClient & { query: Mock };
  const db = {} as StynxDrizzleDatabase;
  return { tx: new Transaction(client, db, 'app'), client };
}

describe('typed-query helper', () => {
  it('exports defineQuery and sql as functions from the package barrel', () => {
    expect([typeof dataModule.defineQuery, typeof dataModule.sql]).toEqual([
      'function',
      'function',
    ]);
  });

  it('sql returns the literal text and rejects a hole that reaches runtime', () => {
    expect(sql`select 1 where $1::int = 1`).toBe('select 1 where $1::int = 1');
    const bypass = sql as unknown as (s: TemplateStringsArray, ...h: unknown[]) => string;
    expect(() => bypass`select ${'x'}`).toThrow(TypeError);
    const invalidEscape = Object.assign([undefined], { raw: ['\\u'] });
    expect(() => bypass(invalidEscape as unknown as TemplateStringsArray)).toThrow(/escape/u);
  });

  it('rejects sql`${x}` at compile time (tsc --noEmit on the negative fixture)', () => {
    const configPath = resolve(__dirname, '../fixtures/typed-query/tsconfig.json');
    const config = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
      },
    );
    if (!config) throw new Error('fixture tsconfig did not parse');
    const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const holeErrors = diagnostics.filter(
      (diagnostic) =>
        diagnostic.file?.fileName.endsWith('sql-hole.fixture.ts') && diagnostic.code === 2345,
    );
    expect(holeErrors).toHaveLength(1);
    expect(ts.flattenDiagnosticMessageText(holeErrors[0]!.messageText, '\n')).toContain("'never'");
  }, 60_000);

  it('defineQuery freezes a valid definition and rejects malformed ones', () => {
    expect(Object.isFrozen(insertNote)).toBe(true);
    expect(insertNote.expects).toBe('one');
    const base = {
      name: 'unit.bad',
      text: sql`select 1`,
      params: z.tuple([]),
      row: z.object({}),
      expects: 'many' as const,
    };
    expect(() => defineQuery({ ...base, name: ' ' })).toThrow(TypeError);
    expect(() => defineQuery({ ...base, text: '' })).toThrow(TypeError);
    expect(() =>
      defineQuery({ ...base, params: z.array(z.string()) as unknown as z.ZodTuple }),
    ).toThrow(TypeError);
    expect(() => defineQuery({ ...base, row: z.string() as unknown as z.ZodObject })).toThrow(
      TypeError,
    );
    expect(() => defineQuery({ ...base, expects: 'some' as unknown as 'many' })).toThrow(TypeError);
  });

  it('requires contiguous placeholders matching the finite argument tuple', () => {
    const base = {
      name: 'unit.placeholder',
      row: z.object({ value: z.number() }),
      expects: 'one' as const,
    };
    for (const [text, params] of [
      [sql`select $2 as value`, z.tuple([z.number()])],
      [sql`select $1 + $3 as value`, z.tuple([z.number(), z.number(), z.number()])],
      [sql`select $1 as value`, z.tuple([])],
      [sql`select $1 as value`, z.tuple([z.number(), z.number()])],
      [sql`select $0 as value`, z.tuple([z.number()])],
    ] as const)
      expect(() => defineQuery({ ...base, text, params })).toThrow(TypeError);
    expect(
      defineQuery({ ...base, text: sql`select $1 + $1 as value`, params: z.tuple([z.number()]) })
        .text,
    ).toBe('select $1 + $1 as value');
  });

  it('does not count placeholder-shaped text in SQL strings, identifiers or comments', () => {
    const text = sql`select '$9', "$8", $$ $7 $$, $label$ $6 $label$ -- $5
      /* $4 /* nested $3 */ $2 */ where $1::int = 1`;
    expect(
      defineQuery({
        name: 'unit.placeholder.lexical',
        text,
        params: z.tuple([z.number()]),
        row: z.object({}),
        expects: 'many',
      }).text,
    ).toBe(text);
  });

  it('recognizes PostgreSQL identifier boundaries around dollar text', () => {
    for (const [text, params] of [
      [sql`select foo$1 from source`, z.tuple([])],
      [sql`select café$2 from source`, z.tuple([])],
      [sql`select foo$tag$, $1 from source`, z.tuple([z.number()])],
      [sql`select foo$$, $1 from source`, z.tuple([z.number()])],
      [sql`select E'can\\'t $9', 'it''s $8', "$7""suffix", $1`, z.tuple([z.number()])],
    ] as const) {
      expect(
        defineQuery({
          name: 'unit.placeholder.identifier-boundary',
          text,
          params,
          row: z.object({}),
          expects: 'many',
        }).text,
      ).toBe(text);
    }
  });

  it('binds parsed arguments as $n and returns the validated row for expects one', async () => {
    const { tx, client } = createTx([{ id: ID }]);
    await expect(tx.run(insertNote, [ID, 'short', 3])).resolves.toEqual({ id: ID });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(insertNote.text, [ID, 'short', 3]);
  });

  it('rejects an over-limit argument with QueryArgumentError before any SQL is sent', async () => {
    const { tx, client } = createTx([{ id: ID }]);
    const secret = 'far-too-long-body';
    const error = await tx.run(insertNote, [ID, secret, 3]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryArgumentError);
    expect(error).toMatchObject({
      code: 'QUERY_ARGUMENT_INVALID',
      status: 400,
      query: 'unit.note.insert',
      issues: [{ path: [1], code: 'too_big' }],
    });
    expect(JSON.stringify((error as QueryArgumentError).context)).not.toContain(secret);
    expect(client.query).not.toHaveBeenCalled();

    await expect(tx.run(insertNote, [ID, null, 100])).rejects.toBeInstanceOf(QueryArgumentError);
    await expect(
      tx.run(insertNote, [ID, null] as unknown as [string, string | null, number]),
    ).rejects.toBeInstanceOf(QueryArgumentError);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when expects one returns no row', async () => {
    const { tx } = createTx([]);
    await expect(tx.run(insertNote, [ID, null, 1])).rejects.toMatchObject({
      name: 'NotFoundError',
      code: 'NOT_FOUND',
      status: 404,
      context: { query: 'unit.note.insert' },
    });
    await expect(tx.run(insertNote, [ID, null, 1])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('enforces the cardinality of one, zero-or-one and none', async () => {
    const two = [{ id: ID }, { id: OTHER_ID }];
    await expect(createTx(two).tx.run(insertNote, [ID, null, 1])).rejects.toMatchObject({
      name: 'QueryCardinalityError',
      expects: 'one',
      rowCount: 2,
    });
    await expect(createTx(two).tx.run(findNote, [ID])).rejects.toBeInstanceOf(
      QueryCardinalityError,
    );
    await expect(createTx([{ id: ID }]).tx.run(deleteNote, [ID])).rejects.toBeInstanceOf(
      QueryCardinalityError,
    );
  });

  it('returns null, a frozen array or undefined per expects', async () => {
    await expect(createTx([]).tx.run(findNote, [ID])).resolves.toBe(null);
    await expect(createTx([{ id: ID }]).tx.run(findNote, [ID])).resolves.toEqual({ id: ID });
    const many = await createTx([{ id: ID }, { id: OTHER_ID }]).tx.run(listNotes, [5]);
    expect(many).toEqual([{ id: ID }, { id: OTHER_ID }]);
    expect(Object.isFrozen(many)).toBe(true);
    await expect(createTx([]).tx.run(listNotes, [5])).resolves.toEqual([]);
    await expect(createTx([]).tx.run(deleteNote, [ID])).resolves.toBe(undefined);
  });

  it('rejects a row failing the row schema with QueryRowValidationError and no contents', async () => {
    const leaked = 'not-a-uuid-secret';
    const { tx } = createTx([{ id: ID }, { id: leaked }]);
    const error = await tx.run(listNotes, [5]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({
      code: 'QUERY_ROW_INVALID',
      status: 500,
      query: 'unit.note.list',
      rowIndex: 1,
      issues: [{ path: ['id'], code: 'invalid_format' }],
    });
    expect(JSON.stringify((error as QueryRowValidationError).context)).not.toContain(leaked);
    expect((error as Error).message).not.toContain(leaked);
  });

  it('strips columns the row schema does not declare', async () => {
    const { tx } = createTx([{ id: ID, extra: 'x' }]);
    await expect(tx.run(findNote, [ID])).resolves.toEqual({ id: ID });
  });

  it('refuses to run after the transaction closes', async () => {
    const { tx, client } = createTx([{ id: ID }]);
    tx.close();
    await expect(tx.run(findNote, [ID])).rejects.toBeInstanceOf(TransactionRequiredError);
    expect(client.query).not.toHaveBeenCalled();
  });
});
