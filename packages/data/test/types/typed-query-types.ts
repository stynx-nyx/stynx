import { z } from 'zod';
import type { Transaction } from '../../src/transaction.js';
import { defineQuery, sql, type ResultOf } from '../../src/typed-query.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(_proof: T): void {}

const row = z.object({ id: z.string().uuid(), sequence: z.number().int() });

const one = defineQuery({
  name: 'typecheck.one',
  text: sql`select id, sequence from demo.t where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row,
  expects: 'one',
});
const maybe = defineQuery({
  name: 'typecheck.zero_or_one',
  text: sql`select id, sequence from demo.t where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row,
  expects: 'zero-or-one',
});
const many = defineQuery({
  name: 'typecheck.many',
  text: sql`select id, sequence from demo.t where sequence <= $1 and note = $2`,
  params: z.tuple([z.number().int().max(99), z.string().max(512).nullable()]),
  row,
  expects: 'many',
});
const none = defineQuery({
  name: 'typecheck.none',
  text: sql`delete from demo.t where id = $1`,
  params: z.tuple([z.string().uuid()]),
  row: z.object({}),
  expects: 'none',
});

type Row = { id: string; sequence: number };
assertType<Equal<ResultOf<typeof one>, Row>>(true);
assertType<Equal<ResultOf<typeof maybe>, Row | null>>(true);
assertType<Equal<ResultOf<typeof many>, readonly Row[]>>(true);
assertType<Equal<ResultOf<typeof none>, void>>(true);
assertType<Equal<ResultOf<string>, never>>(true);

declare const trx: Transaction;

async function usage(): Promise<void> {
  const found: Row = await trx.run(one, ['0190a8a4-0000-7000-8000-000000000000']);
  const rows: readonly Row[] = await trx.run(many, [1, null]);
  const optional: Row | null = await trx.run(maybe, ['0190a8a4-0000-7000-8000-000000000000']);
  const nothing: void = await trx.run(none, ['0190a8a4-0000-7000-8000-000000000000']);
  void found;
  void rows;
  void optional;
  void nothing;

  // @ts-expect-error -- the argument tuple is typed by `params`
  await trx.run(one, [42]);
  // @ts-expect-error -- the tuple length is fixed
  await trx.run(many, [1]);
}
void usage;

const hole = 'demo.t';
// @ts-expect-error -- `sql` accepts no interpolation
void sql`select * from ${hole}`;
