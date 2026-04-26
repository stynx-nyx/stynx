import type { SystemExecutionContext } from '@stynx/core';
import { Database } from './database';

export function withSystemContext<T>(
  database: Pick<Database, 'withSystemContext'>,
  reason: string,
  fn: (context: SystemExecutionContext) => Promise<T>,
): Promise<T> {
  return database.withSystemContext(reason, fn);
}
