import { configuredOperations, type ConfiguredOperation, type ConfiguredIdentifiers, type ConfiguredParams, type ConfiguredRow } from './configured-query.repository.js';
import type { SQLWrapper } from 'drizzle-orm';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';
import {
  NotFoundError,
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
  type QueryIssue,
} from './errors.js';
import type { ResultOf, TypedQuery } from './typed-query.js';

/** A caller-owned query connection; accepting it never acquires or releases a connection. */
export interface CheckedQueryClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/** A caller-owned lifecycle that supplies a query connection for one operation. */
export type CheckedQueryScope = <T>(consume: (client: CheckedQueryClient) => Promise<T>) => Promise<T>;

/**
 * Retain a caller's transaction/system scope without raw SQL forwarding at the call site.
 * Acquisition, commit/rollback, and cleanup remain the supplied scope's responsibility.
 */
export function createScopedQueryExecutor(runWithin: CheckedQueryScope): CheckedQueryClient {
  return {
    query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }> {
      return runWithin((client) => client.query(text, values));
    },
  };
}

/** A legacy query port whose caller owns an optional opaque transaction context. */
export interface ContextualQueryExecutor {
  query(text: string, values?: readonly unknown[], context?: unknown): Promise<unknown>;
}

/**
 * Preserve the supplied context and legacy driver envelope at the sole raw boundary.
 * This adapter proves only the envelope; a TypedQuery still validates every row.
 */
export function bindQueryContext(client: ContextualQueryExecutor, ...context: [] | [unknown]): CheckedQueryClient {
  return {
    async query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }> {
      const result: unknown = context.length === 0
        ? await client.query(text, values)
        : await client.query(text, values, context[0]);
      if (Array.isArray(result)) {
        const rows: unknown[] = result;
        return { rows };
      }
      if (typeof result !== 'object' || result === null || !('rows' in result) || !Array.isArray(result.rows)) {
        throw new QueryRowValidationError('compatibility.contextual', 0, [{ path: ['rows'], code: 'invalid_type' }]);
      }
      const rows: unknown[] = result.rows;
      return { rows, rowCount: checkedRowCount('compatibility.contextual', 'rowCount' in result ? result.rowCount : undefined) };
    },
  };
}

function toIssues(error: z.ZodError): QueryIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => typeof segment === 'number' ? segment : String(segment)),
    code: issue.code,
  }));
}

/** Execute a static definition with the same checked contract as Transaction.run. */
export function executeTypedQuery<Q extends TypedQuery>(
  client: CheckedQueryClient,
  query: Q,
  params: z.input<Q['params']>,
): Promise<ResultOf<Q>>;
export async function executeTypedQuery(
  client: CheckedQueryClient,
  query: TypedQuery,
  params: unknown,
): Promise<unknown> {
  const { rows } = await executeCheckedQuery(client, query, params);
  return queryValue(query, rows);
}


/**
 * Preserve original rows only after both the static query schema and a complete
 * raw-row guard validate them. The guard proves Row independently of parsed
 * schema outputs, which may contain transformations or defaults.
 */
export async function executeGuardedQueryRows<
  P extends z.ZodTuple,
  S extends z.ZodObject,
  Row,
>(
  client: CheckedQueryClient,
  query: TypedQuery<P, S, 'many'>,
  params: z.input<P>,
  isRow: (value: unknown) => value is Row,
): Promise<readonly Row[]> {
  if (query.expects !== 'many') throw new TypeError('executeGuardedQueryRows requires many cardinality');
  const { rawRows } = await executeCheckedQuery(client, query, params);
  const rows: Row[] = [];
  for (const [rowIndex, row] of rawRows.entries()) {
    if (!isRow(row)) {
      throw new QueryRowValidationError(query.name, rowIndex, [{ path: [], code: 'invalid_type' }]);
    }
    rows.push(row);
  }
  return Object.freeze(rows);
}

/** Keep validated query values and driver metadata separate, without rewriting SQL. */
export function executeTypedQueryResult<Q extends TypedQuery>(
  client: CheckedQueryClient,
  query: Q,
  params: z.input<Q['params']>,
): Promise<{ value: ResultOf<Q>; rowCount: number | null }>;
export async function executeTypedQueryResult(client: CheckedQueryClient, query: TypedQuery, params: unknown) {
  const { rows, readRowCount } = await executeCheckedQuery(client, query, params);
  const rowCount = readRowCount();
  return { value: queryValue(query, rows), rowCount: checkedRowCount(query.name, rowCount) };
}

function queryValue(query: TypedQuery, rows: Record<string, unknown>[]): unknown {
  switch (query.expects) {
    case 'one': return rows[0];
    case 'zero-or-one': return rows[0] ?? null;
    case 'many': return Object.freeze(rows);
    case 'none': return undefined;
  }
}

/** Execute a row-free static command and retain its actual driver metadata. */
export async function executeTypedCommand<Q extends TypedQuery<z.ZodTuple, z.ZodObject, 'none'>>(
  client: CheckedQueryClient,
  query: Q,
  params: z.input<Q['params']>,
): Promise<number | null> {
  if (query.expects !== 'none') throw new TypeError('executeTypedCommand requires none cardinality');
  const { readRowCount } = await executeCheckedQuery(client, query, params);
  const rowCount = readRowCount();
  return checkedRowCount(query.name, rowCount);
}

function checkedRowCount(name: string, rowCount: unknown): number | null {
  if (rowCount === undefined || rowCount === null) return null;
  if (typeof rowCount !== 'number' || !Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new QueryRowValidationError(name, 0, [{ path: ['rowCount'], code: 'invalid_type' }]);
  }
  return rowCount;
}

async function executeCheckedQuery(client: CheckedQueryClient, query: TypedQuery, params: unknown) {
  const parsedParams = query.params.safeParse(params);
  if (!parsedParams.success) throw new QueryArgumentError(query.name, toIssues(parsedParams.error));
  const result = await client.query(query.text, [...parsedParams.data]);
  const count = result.rows.length;
  if (query.expects === 'one' && count === 0) throw new NotFoundError({ query: query.name });
  if ((query.expects === 'none' && count > 0) ||
      ((query.expects === 'one' || query.expects === 'zero-or-one') && count > 1)) {
    throw new QueryCardinalityError(query.name, query.expects, count);
  }
  const rows = result.rows.map((row, rowIndex) => {
    const parsed = query.row.safeParse(row);
    if (!parsed.success) throw new QueryRowValidationError(query.name, rowIndex, toIssues(parsed.error));
    return parsed.data;
  });
  return { rows, rawRows: result.rows, readRowCount: () => result.rowCount };
}

/** @internal Historical Transaction.query result contract, not typed-row evidence. */
export function executeCompatibilityQuery<TRow extends QueryResultRow>(
  client: Pick<PoolClient, 'query'>,
  text: string,
  values?: unknown[],
): Promise<QueryResult<TRow>> {
  return client.query<TRow>(text, values);
}

/** @internal Historical Transaction.execute delegation, not typed-row evidence. */
export function executeCompatibilityStatement(
  db: { execute(query: SQLWrapper): Promise<QueryResult<QueryResultRow>> },
  query: SQLWrapper,
): Promise<QueryResult<QueryResultRow>> {
  return db.execute(query);
}

/** @internal Approved installation and migration scripts return no application rows. */
export async function executeRawScript(
  client: { query(text: string, values?: unknown[]): Promise<unknown> },
  text: string,
  values?: unknown[],
): Promise<void> {
  if (values === undefined) await client.query(text);
  else await client.query(text, values);
}

type TransactionControl =
  | { kind: 'begin' | 'commit' | 'rollback' | 'readonly' }
  | { kind: 'isolation'; isolation: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' }
  | { kind: 'savepoint' | 'release-savepoint' | 'rollback-savepoint'; sequence: number }
  | { kind: 'setting'; name: 'app.role' | 'app.request_id' | 'app.tenant_id' | 'app.actor_id' | 'app.roles' | 'app.session_id' | 'statement_timeout' | 'lock_timeout'; value: string };

/** @internal Closed transaction lifecycle operations; accepts no caller-supplied SQL. */
export async function executeTransactionControl(
  client: CheckedQueryClient,
  operation: TransactionControl,
): Promise<void> {
  switch (operation.kind) {
    case 'begin': await client.query('BEGIN'); return;
    case 'commit': await client.query('COMMIT'); return;
    case 'rollback': await client.query('ROLLBACK'); return;
    case 'readonly': await client.query('SET LOCAL TRANSACTION READ ONLY'); return;
    case 'isolation': {
      const levels = ['read uncommitted', 'read committed', 'repeatable read', 'serializable'];
      if (!levels.includes(operation.isolation)) throw new TypeError('Invalid transaction isolation');
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${operation.isolation.toUpperCase()}`);
      return;
    }
    case 'setting': {
      const names = ['app.role', 'app.request_id', 'app.tenant_id', 'app.actor_id', 'app.roles', 'app.session_id', 'statement_timeout', 'lock_timeout'];
      if (!names.includes(operation.name) || typeof operation.value !== 'string') {
        throw new TypeError('Invalid transaction setting');
      }
      await client.query(`SELECT set_config('${operation.name}', $1, true)`, [operation.value]);
      return;
    }
    case 'savepoint':
    case 'release-savepoint':
    case 'rollback-savepoint': {
      if (!Number.isSafeInteger(operation.sequence) || operation.sequence < 1) {
        throw new TypeError('Invalid savepoint sequence');
      }
      const name = `stynx_sp_${operation.sequence}`;
      const command = operation.kind === 'savepoint' ? 'SAVEPOINT' :
        operation.kind === 'release-savepoint' ? 'RELEASE SAVEPOINT' : 'ROLLBACK TO SAVEPOINT';
      await client.query(`${command} ${name}`);
      return;
    }
    default: throw new TypeError('Unknown transaction control operation');
  }
}

const idRow = z.object({ id: z.string() });
const existsRow = z.object({ exists: z.boolean() });
const emptyRow = z.object({});
const legacyRows = {
  select: z.record(z.string(), z.unknown()),
  'hard-delete-live': emptyRow,
  'hard-delete-archive': emptyRow,
  'list-child-ids': idRow,
  'count-blocking-children': z.object({ count: z.string().regex(/^\d+$/u) }),
  'sample-blocking-children': idRow,
  'load-archived-row': z.object({ archive_id: z.string().regex(/^\d+$/u), deleted_at: z.string(), row_data: z.record(z.string(), z.unknown()) }),
  'live-parent-exists': existsRow,
  'archived-parent-exists': existsRow,
  'restore-conflict': z.object({ blocking_id: z.string() }),
  'restore-insert': emptyRow,
  'restore-delete-archive': emptyRow,
  'restore-children': idRow,
  'soft-delete-insert': z.object({ archive_id: z.string().regex(/^\d+$/u).nullish() }),
  'soft-delete-live': emptyRow,
};

export type LegacyArchiveOperation = keyof typeof legacyRows;
export interface LegacyArchiveResult<TRow> { rows: TRow[]; rowCount: number | null }

/**
 * @internal ADR-0028's closed legacy operations. The select mapper validates known columns
 * and archive metadata; erased custom-column schemas remain a disclosed compatibility limit.
 */
export function executeLegacyArchive<T extends LegacyArchiveOperation>(
  client: CheckedQueryClient,
  operation: T,
  text: string,
  values?: unknown[],
  validateSelectRow?: (row: Record<string, unknown>, index: number) => Record<string, unknown>,
): Promise<LegacyArchiveResult<z.output<(typeof legacyRows)[T]>>>;
export async function executeLegacyArchive(
  client: CheckedQueryClient,
  operation: LegacyArchiveOperation,
  text: string,
  values?: unknown[],
  validateSelectRow?: (row: Record<string, unknown>, index: number) => Record<string, unknown>,
): Promise<LegacyArchiveResult<unknown>> {
  if (!Object.hasOwn(legacyRows, operation)) throw new TypeError('Unknown legacy archive operation');
  const schema = legacyRows[operation];
  if (operation === 'select' && !validateSelectRow) throw new TypeError('Archive select requires its column validator');
  const result = await client.query(text, values);
  const rows = result.rows.map((row, index) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new QueryRowValidationError(`legacy.archive.${operation}`, index, toIssues(parsed.error));
    if (operation === 'select' && validateSelectRow) {
      const selected = legacyRows.select.safeParse(row);
      if (!selected.success) throw new QueryRowValidationError(`legacy.archive.${operation}`, index, toIssues(selected.error));
      return validateSelectRow(selected.data, index);
    }
    return parsed.data;
  });
  return { rows, rowCount: checkedRowCount(`legacy.archive.${operation}`, result.rowCount) };
}

/** Existing configurable adapters may return a driver object or their historical row-array port. */
export interface ConfiguredSqlExecutor {
  query(text: string, values?: unknown[]): Promise<unknown>;
}
export interface ConfiguredQueryResult<TRow> { rows: TRow[]; rowCount: number | null }

/** ADR0029 closed operations; no caller-supplied SQL or runtime registry mutation. */
export function executeConfiguredQuery<O extends ConfiguredOperation>(
  client: ConfiguredSqlExecutor,
  operation: O,
  identifiers: ConfiguredIdentifiers<O>,
  params: ConfiguredParams<O>,
): Promise<ConfiguredQueryResult<ConfiguredRow<O>>>;
export async function executeConfiguredQuery(
  client: ConfiguredSqlExecutor,
  operation: ConfiguredOperation,
  identifiers: unknown,
  params: unknown,
): Promise<ConfiguredQueryResult<unknown>> {
  if (!Object.hasOwn(configuredOperations, operation)) throw new TypeError('Unknown configured SQL operation');
  const definition = configuredOperations[operation];
  const name = `configured.${operation}`;
  const parsedIdentifiers = definition.identifiers.safeParse(identifiers);
  if (!parsedIdentifiers.success) throw new QueryArgumentError(name, toIssues(parsedIdentifiers.error));
  const parsedParams = definition.params.safeParse(params);
  if (!parsedParams.success) throw new QueryArgumentError(name, toIssues(parsedParams.error));
  if ('parameterCount' in definition && definition.parameterCount(parsedIdentifiers.data) !== parsedParams.data.length) {
    throw new QueryArgumentError(name, [{ path: [], code: 'invalid_length' }]);
  }
  const text = definition.render(parsedIdentifiers.data);
  const result: unknown = await client.query(text, [...parsedParams.data]);
  const invalid = (path: string): never => {
    throw new QueryRowValidationError(name, 0, [{ path: [path], code: 'invalid_type' }]);
  };
  // The legacy mutation port interprets an array as affected-row metadata. It
  // exposes no row payload and is separate from typed command count semantics.
  if (definition.expects === 'none') {
    if (operation === 'idempotency.complete' && Array.isArray(result)) {
      return { rows: [], rowCount: result.length };
    }
    if (Array.isArray(result)) {
      if (result.length > 0) throw new QueryCardinalityError(name, 'none', result.length);
      return { rows: [], rowCount: null };
    }
    if (typeof result !== 'object' || result === null) return invalid('result');
    if (operation !== 'idempotency.complete' && 'rows' in result) {
      if (!Array.isArray(result.rows)) return invalid('rows');
      if (result.rows.length > 0) throw new QueryCardinalityError(name, 'none', result.rows.length);
    }
    return { rows: [], rowCount: checkedRowCount(name, 'rowCount' in result ? result.rowCount : undefined) };
  }
  // This fallback historically read only object.rows; a bare-array port meant absent.
  if (operation === 'outbox.legacy-acked-row' && Array.isArray(result)) return { rows: [], rowCount: null };
  // Only closed audit-reader definitions retain their historical empty-wrapper
  // fallback and ordinary property Get. Other configured ports stay unchanged.
  const legacyAuditRead = 'legacyAuditReadResult' in definition && definition.legacyAuditReadResult === true;
  let driverRows: unknown;
  if (Array.isArray(result)) {
    driverRows = result;
  } else if (legacyAuditRead) {
    if (result !== null && result !== undefined) {
      const boxed: unknown = Object(result);
      if ((typeof boxed === 'object' && boxed !== null) || typeof boxed === 'function') {
        driverRows = Reflect.get(boxed, 'rows', result);
      }
    }
  } else {
    driverRows = typeof result === 'object' && result !== null && 'rows' in result ? result.rows : undefined;
  }
  if (!Array.isArray(driverRows)) {
    if (legacyAuditRead) return { rows: [], rowCount: null };
    return invalid('rows');
  }
  // This single historical empty-row shape belongs only to idempotency lookup.
  const rows: unknown[] = operation === 'idempotency.lookup' && driverRows.length === 1 && driverRows[0] === undefined ? [] : driverRows;
  if (definition.expects !== 'many' && rows.length > 1) throw new QueryCardinalityError(name, definition.expects, rows.length);
  const parsedRows: unknown[] = [];
  const rowsLength = rows.length;
  for (let index = 0; index < rowsLength; index += 1) {
    const parsed = definition.row.safeParse(rows[index]);
    if (!parsed.success) throw new QueryRowValidationError(name, index, toIssues(parsed.error));
    parsedRows.push(parsed.data);
  }
  const rowCount = legacyAuditRead ? null : Array.isArray(result) ? result.length :
    typeof result === 'object' && result !== null && 'rowCount' in result ? checkedRowCount(name, result.rowCount) : null;
  return { rows: parsedRows, rowCount };
}
