import { StynxError } from '@stynx-nyx/core';

export class StynxDataError extends StynxError {}

export class TenantContextMissingError extends StynxDataError {
  constructor() {
    super('Tenant context is required for this transaction', {
      code: 'TENANT_CONTEXT_MISSING',
      status: 500,
    });
  }
}

export class ActorContextMissingError extends StynxDataError {
  constructor() {
    super('Actor context is required for this transaction', {
      code: 'ACTOR_CONTEXT_MISSING',
      status: 500,
    });
  }
}

/**
 * Which trusted-identity check refused the transaction (ADR-OUTBOX-0003 D1
 * item 5): `sql_role` is `current_user` differing from the configured
 * application role; the other members keep their 1.5.3 meaning.
 */
export type TransactionIdentityMismatchReason =
  'transaction_role' | 'isolation' | 'sql_role' | 'app_role' | 'tenant' | 'actor';

export class TransactionIdentityMismatchError extends StynxDataError {
  /** Typed reason; `undefined` when raised without one. Also carried as `context.mismatch`. */
  readonly mismatch: TransactionIdentityMismatchReason | undefined;

  constructor(context?: Record<string, unknown>, mismatch?: TransactionIdentityMismatchReason) {
    const merged = { ...context, ...(mismatch ? { mismatch } : {}) };
    super('Transaction identity does not match the trusted request context', {
      code: 'TRANSACTION_IDENTITY_MISMATCH',
      status: 500,
      ...(Object.keys(merged).length > 0 ? { context: merged } : {}),
    });
    this.mismatch = mismatch;
  }
}

/** Property of the application SQL role that failed the ADR-OUTBOX-0003 D1 check. */
export type AppRoleProperty =
  | 'appRoleName'
  | 'current_user'
  | 'rolsuper'
  | 'rolbypassrls'
  | 'session_user.rolsuper'
  | 'session_user.rolbypassrls';

/** Startup is prevented; the context names the property and the role, never a connection secret. */
export class AppRoleConfigurationError extends StynxDataError {
  readonly property: AppRoleProperty;

  constructor(property: AppRoleProperty, context?: Record<string, unknown>) {
    super(`Application SQL role check failed: ${property}`, {
      code: 'APP_ROLE_CONFIGURATION',
      status: 500,
      context: { property, ...context },
    });
    this.property = property;
  }
}

export class TransactionRequiredError extends StynxDataError {
  constructor() {
    super('Transaction is no longer active', {
      code: 'TRANSACTION_REQUIRED',
      status: 500,
    });
  }
}

export class ReadOnlyViolationError extends StynxDataError {
  constructor(context?: Record<string, unknown>) {
    super('Read-only transaction cannot execute a write statement', {
      code: 'READONLY_VIOLATION',
      status: 500,
      ...(context ? { context } : {}),
    });
  }
}

export class CascadeTooDeepError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Cascade depth exceeds the configured limit', {
      code: 'CASCADE_TOO_DEEP',
      status: 409,
      context,
    });
  }
}

export class CascadeTooLargeError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Cascade row count exceeds the configured limit', {
      code: 'CASCADE_TOO_LARGE',
      status: 409,
      context,
    });
  }
}

export class SoftDeleteBlockedError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Soft delete is blocked by active children', {
      code: 'SOFT_DELETE_BLOCKED_BY_CHILDREN',
      status: 409,
      context,
    });
  }
}

export class RestoreConflictError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Archive restore conflicts with a live row', {
      code: 'RESTORE_CONFLICT',
      status: 409,
      context,
    });
  }
}

export class RestoreCascadeParentsArchivedError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Restore requires archived cascade parents to be restored first', {
      code: 'RESTORE_HAS_ARCHIVED_CASCADE_PARENTS',
      status: 409,
      context,
    });
  }
}

export class ArchiveMirrorMissingError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Archive mirror table is missing', {
      code: 'ARCHIVE_MIRROR_MISSING',
      status: 500,
      context,
    });
  }
}

export class ArchiveMirrorDriftError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('Archive mirror table has drifted from the live schema', {
      code: 'ARCHIVE_MIRROR_DRIFT',
      status: 500,
      context,
    });
  }
}

export class StatementTimeoutError extends StynxDataError {
  constructor(context?: Record<string, unknown>) {
    super('Transaction exceeded the configured statement timeout', {
      code: 'STATEMENT_TIMEOUT',
      status: 504,
      ...(context ? { context } : {}),
    });
  }
}

export class SerializationFailureError extends StynxDataError {
  constructor(context?: Record<string, unknown>) {
    super('Transaction failed after retrying serialization errors', {
      code: 'SERIALIZATION_FAILURE',
      status: 503,
      ...(context ? { context } : {}),
    });
  }
}

export class IndependentTransactionConnectionError extends StynxDataError {
  constructor() {
    super('Independent transaction cannot acquire a second held connection', {
      code: 'INDEPENDENT_TRANSACTION_CONNECTION',
      status: 409,
    });
  }
}

export class AuditChainIsolationError extends StynxDataError {
  constructor() {
    super('Audited writes require READ COMMITTED isolation', {
      code: 'AUDIT_CHAIN_ISOLATION',
      status: 409,
    });
  }
}

export class AuditChainKeyMismatchError extends StynxDataError {
  constructor() {
    super('Audit transaction cannot change tenant chain', {
      code: 'AUDIT_CHAIN_KEY_MISMATCH',
      status: 409,
    });
  }
}

/** One failed check of a typed query's arguments or rows: where and which rule, never a value. */
export interface QueryIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly code: string;
}

/**
 * A typed query's arguments failed its `params` tuple (S-27). Raised before any SQL is sent;
 * maps to 400. The context names the query and the failing paths, never the argument values.
 */
export class QueryArgumentError extends StynxDataError {
  readonly query: string;
  readonly issues: readonly QueryIssue[];

  constructor(query: string, issues: readonly QueryIssue[]) {
    super(`Arguments for query ${query} failed validation`, {
      code: 'QUERY_ARGUMENT_INVALID',
      status: 400,
      context: { query, issues },
    });
    this.query = query;
    this.issues = issues;
  }
}

/** A typed query declared `expects: 'one'` returned no row; maps to 404. */
export class NotFoundError extends StynxDataError {
  constructor(context: Record<string, unknown>) {
    super('The requested row was not found', {
      code: 'NOT_FOUND',
      status: 404,
      context,
    });
  }
}

/** A typed query returned more rows than its `expects` allows (an infrastructure defect). */
export class QueryCardinalityError extends StynxDataError {
  readonly query: string;
  readonly expects: string;
  readonly rowCount: number;

  constructor(query: string, expects: string, rowCount: number) {
    super(`Query ${query} returned ${rowCount} rows; expects ${expects}`, {
      code: 'QUERY_CARDINALITY',
      status: 500,
      context: { query, expects, rowCount },
    });
    this.query = query;
    this.expects = expects;
    this.rowCount = rowCount;
  }
}

/**
 * A row returned by a typed query failed its `row` schema; no row is exposed. The context
 * names the query, the row index and the failing paths, never the row contents.
 */
export class QueryRowValidationError extends StynxDataError {
  readonly query: string;
  readonly rowIndex: number;
  readonly issues: readonly QueryIssue[];

  constructor(query: string, rowIndex: number, issues: readonly QueryIssue[]) {
    super(`Row ${rowIndex} returned by query ${query} failed validation`, {
      code: 'QUERY_ROW_INVALID',
      status: 500,
      context: { query, rowIndex, issues },
    });
    this.query = query;
    this.rowIndex = rowIndex;
    this.issues = issues;
  }
}
