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
  | 'transaction_role'
  | 'isolation'
  | 'sql_role'
  | 'app_role'
  | 'tenant'
  | 'actor';

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
      code: 'INDEPENDENT_TRANSACTION_CONNECTION', status: 409,
    });
  }
}

export class AuditChainIsolationError extends StynxDataError {
  constructor() {
    super('Audited writes require READ COMMITTED isolation', {
      code: 'AUDIT_CHAIN_ISOLATION', status: 409,
    });
  }
}

export class AuditChainKeyMismatchError extends StynxDataError {
  constructor() {
    super('Audit transaction cannot change tenant chain', {
      code: 'AUDIT_CHAIN_KEY_MISMATCH', status: 409,
    });
  }
}
