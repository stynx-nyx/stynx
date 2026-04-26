import { StynxError } from '@stynx/core';

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
