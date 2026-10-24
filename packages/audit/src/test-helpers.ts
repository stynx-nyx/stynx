import { bindQueryContext, executeTypedQuery } from '@stynx-nyx/data';
import { findAuditRowsQuery } from './audit.repository.js';
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

export async function findAuditRows(queryable: Queryable, expectation: AuditExpectation): Promise<Array<{
  id: string | number;
  table_schema: string;
  table_name: string;
  row_id: string | null;
  operation: string;
  tags: Record<string, unknown> | null;
}>> {
  const rows = await executeTypedQuery(bindQueryContext(queryable), findAuditRowsQuery,
    [
      expectation.operation,
      expectation.tableSchema ?? null,
      expectation.tableName ?? null,
      expectation.rowId ?? null,
    ],
  );

  if (!expectation.tags) {
    return [...rows];
  }

  return rows.filter((row) => containsSubset(row.tags ?? {}, expectation.tags!));
}

export async function expectAuditRow(queryable: Queryable, expectation: AuditExpectation): Promise<void> {
  const rows = await findAuditRows(queryable, expectation);
  if (rows.length === 0) {
    throw new Error(`Expected audit row was not found for ${expectation.operation}`);
  }
}
