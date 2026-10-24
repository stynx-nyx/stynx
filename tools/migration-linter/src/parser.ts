interface SqlParser {
  parse(sql: string): unknown;
}

export class ParserUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      `pg-query-emscripten could not be loaded: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'ParserUnavailableError';
  }
}

type ParserModule = typeof import('pg-query-emscripten');

let modulePromise: Promise<ParserModule> | null = null;

async function loadModule(): Promise<ParserModule> {
  try {
    return await import('pg-query-emscripten');
  } catch (error) {
    throw new ParserUnavailableError(error);
  }
}

async function createParser(): Promise<SqlParser> {
  modulePromise ??= loadModule();
  const PgQuery = (await modulePromise).default;
  try {
    // A fresh instance per file: one emscripten instance degrades after many parses.
    return await new PgQuery();
  } catch (error) {
    throw new ParserUnavailableError(error);
  }
}

/** Proves libpg_query loads; rejects with ParserUnavailableError instead of skipping validation. */
export async function ensureParser(): Promise<void> {
  await createParser();
}

export async function validateSqlWithParser(sql: string): Promise<void> {
  const parser = await createParser();

  const result = parser.parse(sql);
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('Invalid SQL parser result');
  }
  if (!('error' in result) || result.error === undefined || result.error === null) return;
  const error = result.error;
  if (typeof error !== 'object' || Array.isArray(error)) {
    throw new Error('Invalid SQL parser result');
  }
  if (!('message' in error) || error.message === undefined || error.message === null) return;
  if (typeof error.message !== 'string') throw new Error('Invalid SQL parser result');
  if (error.message) throw new Error(error.message);
}
