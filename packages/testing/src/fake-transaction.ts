import { createDrizzle, Transaction, type StynxDataRole } from '@stynx-nyx/data';

interface FakeQueryConfig {
  text: string;
  values?: unknown[];
  rowMode?: 'array';
}

interface FakeQueryResult {
  rows: Array<Record<string, unknown> | unknown[]>;
  rowCount: number | null;
}

/** A result or error consumed by the next query made through the fake transaction. */
export type FakeTransactionStep =
  | FakeQueryResult
  | Error;

/** SQL sent to the fake client, including Drizzle's optional array row mode. */
export interface FakeTransactionQuery {
  text: string;
  values: unknown[];
  rowMode?: 'array';
}

/** An actual data Transaction with deterministic query responses. */
export interface FakeTransaction {
  transaction: Transaction;
  queries: FakeTransactionQuery[];
  enqueue(step: FakeTransactionStep): void;
}

/**
 * Creates a Transaction for unit tests that exercise SQL dispatch and role/close
 * guards. Builder queries and transaction/RLS behavior require a real database.
 */
export function createFakeTransaction(
  script: readonly FakeTransactionStep[],
  options: { role: StynxDataRole },
): FakeTransaction {
  const pending = [...script];
  const queries: FakeTransactionQuery[] = [];

  const query = async (
    input: string | FakeQueryConfig,
    params?: unknown[],
  ): Promise<Awaited<ReturnType<Transaction['query']>>> => {
    const config: FakeQueryConfig = typeof input === 'string' ? { text: input } : input;
    queries.push({
      text: config.text,
      values: [...(params ?? config.values ?? [])],
      ...(config.rowMode === 'array' ? { rowMode: 'array' as const } : {}),
    });

    const next = pending.shift();
    if (next === undefined) {
      throw new Error(`No fake transaction response queued for: ${config.text}`);
    }
    if (next instanceof Error) {
      throw next;
    }

    const rows = config.rowMode === 'array'
      ? next.rows.map((row) => Array.isArray(row) ? row : Object.values(row))
      : next.rows;
    return {
      command: 'SELECT',
      rowCount: next.rowCount,
      oid: 0,
      fields: [],
      rows,
    } as Awaited<ReturnType<Transaction['query']>>;
  };

  // pg exposes callback, stream, and Promise overloads; Transaction and Drizzle
  // use only the Promise query overload, so the cast remains inside this helper.
  const client = { query } as unknown as Parameters<typeof createDrizzle>[0];
  return {
    transaction: new Transaction(client, createDrizzle(client), options.role),
    queries,
    enqueue(step) {
      pending.push(step);
    },
  };
}
