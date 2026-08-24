import {
  WorklistConflictError,
  WorklistForbiddenError,
  WorklistInputError,
  WorklistNotFoundError,
} from './errors';

interface SqlErrorLike {
  code?: string;
  message?: string;
  constraint?: string;
}

export function mapWorklistSqlError(error: unknown): unknown {
  const sqlError = error as SqlErrorLike;
  const message = sqlError.message ?? 'Worklist database operation failed';
  if (sqlError.code === 'WK400' || sqlError.code === '23503' || sqlError.code === '23514') {
    return new WorklistInputError(message, { constraint: sqlError.constraint }, error);
  }
  if (sqlError.code === 'WK403') {
    return new WorklistForbiddenError(message, error);
  }
  if (sqlError.code === 'WK404') {
    return new WorklistNotFoundError(message.includes('queue') ? 'queue' : 'item', 'unknown');
  }
  if (sqlError.code === 'WK409' || sqlError.code === '23505') {
    return new WorklistConflictError(message, { constraint: sqlError.constraint }, error);
  }
  return error;
}
