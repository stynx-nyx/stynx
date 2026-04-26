export interface Queryable {
  query<T extends { id?: string | number; tags?: Record<string, unknown> | null }>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface AuditExpectation {
  tableSchema?: string;
  tableName?: string;
  rowId?: string;
  operation: string;
  tags?: Record<string, unknown>;
}

function containsSubset(subject: Record<string, unknown>, subset: Record<string, unknown>): boolean {
  return Object.entries(subset).every(([key, value]) => subject[key] === value);
}

export async function findAuditRows(queryable: Queryable, expectation: AuditExpectation) {
  const rows = await queryable.query<{
    id: string | number;
    table_schema: string;
    table_name: string;
    row_id: string | null;
    operation: string;
    tags: Record<string, unknown> | null;
  }>(
    `
      select id, table_schema, table_name, row_id, operation, tags
      from audit.log
      where operation = $1
        and ($2::text is null or table_schema = $2)
        and ($3::text is null or table_name = $3)
        and ($4::text is null or row_id = $4)
      order by occurred_at desc, id desc
    `,
    [
      expectation.operation,
      expectation.tableSchema ?? null,
      expectation.tableName ?? null,
      expectation.rowId ?? null,
    ],
  );

  if (!expectation.tags) {
    return rows.rows;
  }

  return rows.rows.filter((row) => containsSubset(row.tags ?? {}, expectation.tags!));
}

export async function expectAuditRow(queryable: Queryable, expectation: AuditExpectation): Promise<void> {
  const rows = await findAuditRows(queryable, expectation);
  if (rows.length === 0) {
    throw new Error(`Expected audit row was not found for ${expectation.operation}`);
  }
}
