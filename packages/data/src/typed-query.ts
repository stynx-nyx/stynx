import { z } from 'zod';
export { executeTypedQuery } from './checked-executor.js';

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
  assertQueryPlaceholders(query.text, query.params, query.name);
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


/** PostgreSQL lexical scan: quoted text and nested comments do not bind arguments. */
function assertQueryPlaceholders(text: string, params: z.ZodTuple, name: string): void {
  const positions = new Set<number>();
  for (let offset = 0; offset < text.length;) {
    const remaining = text.slice(offset);
    if (remaining.startsWith('--')) {
      const end = text.indexOf('\n', offset + 2);
      offset = end < 0 ? text.length : end + 1;
    } else if (remaining.startsWith('/*')) {
      let depth = 1;
      offset += 2;
      while (offset < text.length && depth > 0) {
        if (text.startsWith('/*', offset)) { depth += 1; offset += 2; }
        else if (text.startsWith('*/', offset)) { depth -= 1; offset += 2; }
        else offset += 1;
      }
    } else if (text[offset] === "'" || text[offset] === '"') {
      const quote = text[offset++];
      const escaped = quote === "'" && /[eE]/u.test(text[offset - 2] ?? '') &&
        !/[\w$]/u.test(text[offset - 3] ?? '');
      while (offset < text.length) {
        if (escaped && text[offset] === '\\') { offset += 2; continue; }
        if (text[offset++] !== quote) continue;
        if (text[offset] === quote) { offset += 1; continue; }
        break;
      }
    } else if (/[a-zA-Z_\u0080-\uffff]/u.test(text[offset] ?? '')) {
      // PostgreSQL permits dollar signs inside unquoted identifiers. They are
      // neither positional parameters nor dollar-quote delimiters there.
      offset += 1;
      while (/[a-zA-Z0-9_$\u0080-\uffff]/u.test(text[offset] ?? '')) offset += 1;
    } else {
      // Dollar tags use unquoted identifier characters, except for dollar signs.
      const delimiter = /^\$(?:[a-zA-Z_\u0080-\u{10ffff}][a-zA-Z0-9_\u0080-\u{10ffff}]*)?\$/u.exec(remaining)?.[0];
      if (delimiter) {
        const end = text.indexOf(delimiter, offset + delimiter.length);
        offset = end < 0 ? text.length : end + delimiter.length;
        continue;
      }
      const placeholder = /^\$(\d+)/u.exec(remaining);
      if (placeholder) {
        positions.add(Number(placeholder[1]));
        offset += placeholder[0].length;
      } else offset += 1;
    }
  }
  const count = params.def.items.length;
  if (params.def.rest || positions.size !== count ||
      [...positions].some((position) => !Number.isSafeInteger(position) || position < 1 || position > count)) {
    throw new TypeError(`defineQuery(${name}): placeholders must match a finite argument tuple`);
  }
}
