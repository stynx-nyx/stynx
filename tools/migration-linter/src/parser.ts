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
    return (await new PgQuery()) as SqlParser;
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

  const result = parser.parse(sql) as {
    error?: { message?: string | null } | null;
  };

  if (result.error?.message) {
    throw new Error(result.error.message);
  }
}
