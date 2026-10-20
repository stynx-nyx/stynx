import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  NotFoundError,
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
  type QueryIssue,
} from './errors.js';

/** Row count a typed query promises (02 §3, D-030). */
export type Expects = 'one' | 'zero-or-one' | 'many' | 'none';

const EXPECTS: readonly Expects[] = ['one', 'zero-or-one', 'many', 'none'];

/**
 * A raw SQL statement whose `$n` arguments are a zod tuple and whose result rows are a zod
 * object (S-21, S-27, D-010). Build one with {@link defineQuery}; execute it with
 * `Transaction.run`.
 */
export interface TypedQuery<
  P extends z.ZodTuple = z.ZodTuple,
  R extends z.ZodObject = z.ZodObject,
  E extends Expects = Expects,
> {
  /** Workspace-unique query name, carried in errors and metrics; never the SQL text. */
  readonly name: string;
  /** SQL text with `$1…$n` placeholders, written with the {@link sql} tag. */
  readonly text: string;
  /** Argument schema; its limits must not exceed the bound columns' constraints (S-27). */
  readonly params: P;
  /** Schema every returned row is validated against before it is exposed. */
  readonly row: R;
  /** Row-count contract checked after execution. */
  readonly expects: E;
}

/** The value `Transaction.run` resolves to for a query `Q`. */
export type ResultOf<Q> =
  Q extends TypedQuery<z.ZodTuple, infer R, infer E>
    ? E extends 'one'
      ? z.output<R>
      : E extends 'zero-or-one'
        ? z.output<R> | null
        : E extends 'many'
          ? readonly z.output<R>[]
          : void
    : never;

/**
 * Declares a typed query. The definition is frozen; its schemas are checked to be a zod
 * tuple and a zod object, and `expects` one of the four row-count contracts.
 */
export function defineQuery<P extends z.ZodTuple, R extends z.ZodObject, E extends Expects>(
  query: TypedQuery<P, R, E>,
): TypedQuery<P, R, E> {
  if (typeof query.name !== 'string' || query.name.trim().length === 0) {
    throw new TypeError('defineQuery: name must be a non-empty string');
  }
  if (typeof query.text !== 'string' || query.text.trim().length === 0) {
    throw new TypeError(`defineQuery(${query.name}): text must be a non-empty sql\`…\` string`);
  }
  if (!(query.params instanceof z.ZodTuple)) {
    throw new TypeError(`defineQuery(${query.name}): params must be a z.tuple([...])`);
  }
  if (!(query.row instanceof z.ZodObject)) {
    throw new TypeError(`defineQuery(${query.name}): row must be a z.object({...})`);
  }
  if (!EXPECTS.includes(query.expects)) {
    throw new TypeError(`defineQuery(${query.name}): expects must be one of ${EXPECTS.join(', ')}`);
  }
  return Object.freeze({
    name: query.name,
    text: query.text,
    params: query.params,
    row: query.row,
    expects: query.expects,
  });
}

/**
 * Tag for typed-query SQL text. It accepts no interpolation: every hole is typed `never`, so
 * ``sql`… ${value}` `` fails `tsc`, and a hole that reaches runtime anyway throws. Values go
 * through `$n` parameters and the `params` tuple instead.
 */
export function sql(strings: TemplateStringsArray, ...holes: never[]): string {
  if (holes.length > 0 || strings.length !== 1) {
    throw new TypeError('sql`…` accepts no interpolation; bind values as $n parameters');
  }
  const text = strings[0];
  if (text === undefined) {
    throw new TypeError('sql`…` text contains an invalid escape sequence');
  }
  return text;
}

function toIssues(error: z.ZodError): QueryIssue[] {
  // Path and code only: zod messages and inputs may carry argument or row contents.
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    code: issue.code,
  }));
}

/**
 * The single checked executor behind `Transaction.run`: parses the arguments before any SQL
 * is sent, binds them as `$n`, checks the row count, and validates every row.
 *
 * @internal
 */
export async function executeTypedQuery<Q extends TypedQuery>(
  client: Pick<PoolClient, 'query'>,
  query: Q,
  params: z.input<Q['params']>,
): Promise<ResultOf<Q>> {
  const parsedParams = query.params.safeParse(params);
  if (!parsedParams.success) {
    throw new QueryArgumentError(query.name, toIssues(parsedParams.error));
  }

  const result = await client.query<Record<string, unknown>>(query.text, [...parsedParams.data]);
  const rows = result.rows;

  const count = rows.length;
  const expects: Expects = query.expects;
  if (expects === 'one' && count === 0) {
    throw new NotFoundError({ query: query.name });
  }
  if (
    (expects === 'none' && count > 0) ||
    ((expects === 'one' || expects === 'zero-or-one') && count > 1)
  ) {
    throw new QueryCardinalityError(query.name, expects, count);
  }

  const parsedRows = rows.map((row, rowIndex) => {
    const parsed = query.row.safeParse(row);
    if (!parsed.success) {
      throw new QueryRowValidationError(query.name, rowIndex, toIssues(parsed.error));
    }
    return parsed.data;
  });

  let value: unknown;
  switch (expects) {
    case 'one':
      value = parsedRows[0];
      break;
    case 'zero-or-one':
      value = parsedRows[0] ?? null;
      break;
    case 'many':
      value = Object.freeze(parsedRows);
      break;
    case 'none':
      value = undefined;
      break;
  }
  return value as ResultOf<Q>;
}
