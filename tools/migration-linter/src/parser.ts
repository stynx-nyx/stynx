async function loadParser(): Promise<{ parse(sql: string): unknown } | null> {
  try {
    const module = await import('pg-query-emscripten');
    const PgQuery = module.default;
    return (await new PgQuery()) as { parse(sql: string): unknown };
  } catch {
    return null;
  }
}

export async function validateSqlWithParser(sql: string): Promise<void> {
  const parser = await loadParser();
  if (!parser) {
    return;
  }

  const result = parser.parse(sql) as {
    error?: { message?: string | null } | null;
  };

  if (result.error?.message) {
    throw new Error(result.error.message);
  }
}
