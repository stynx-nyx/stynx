import { StynxError } from '@stynx-nyx/core';

export class StynxOutboxError extends StynxError {}

export class OutboxNotFoundError extends StynxOutboxError {
  constructor(context: Record<string, unknown>) {
    super('Outbox message not found', {
      code: 'OUTBOX_NOT_FOUND',
      status: 404,
      context,
    });
  }
}

export class OutboxAlreadyEnqueuedError extends StynxOutboxError {
  constructor(context: Record<string, unknown>) {
    super('Outbox message already enqueued for this entity', {
      code: 'OUTBOX_ALREADY_ENQUEUED',
      status: 409,
      context,
    });
  }
}

/**
 * Raised by `ack()` when `(entity, entityId)` matches more than one tenant's
 * row and the caller did not supply `tenantId` to disambiguate. See the
 * ACK-resolution note in the contract doc — most integrations should have
 * the external system echo back a globally unique correlation id to avoid
 * this entirely.
 */
export class OutboxAmbiguousAckError extends StynxOutboxError {
  constructor(context: Record<string, unknown>) {
    super('Ambiguous ack: entity/entityId matches rows in more than one tenant', {
      code: 'OUTBOX_AMBIGUOUS_ACK',
      status: 409,
      context,
    });
  }
}

export class OutboxEventConflictError extends StynxOutboxError {
  constructor() { super('Outbox idempotency key has different content', { code: 'OUTBOX_EVENT_CONFLICT', status: 409 }); }
}
/**
 * Which request-path guard refused the transaction (ADR-OUTBOX-0003 D1 item 5):
 * `sql_role` is `current_user` differing from the configured application role.
 */
export type OutboxEventTransactionReason =
  | 'transaction_role'
  | 'tenant'
  | 'app_role'
  | 'sql_role'
  | 'isolation'
  | 'read_only'
  | 'recovery';
export class OutboxEventTransactionError extends StynxOutboxError {
  /** Typed reason; `undefined` when raised without one. Also carried as `context.reason`. */
  readonly reason: OutboxEventTransactionReason | undefined;
  constructor(reason?: OutboxEventTransactionReason) {
    super('Append requires a writable READ COMMITTED app transaction on primary',
      { code: 'OUTBOX_EVENT_TRANSACTION', status: 409, ...(reason ? { context: { reason } } : {}) });
    this.reason = reason;
  }
}
/** What the bootstrap ownership check found about the application role (ADR-OUTBOX-0003 D1 item 7). */
export type OutboxAppRoleOwnershipProperty = 'exists' | 'owns' | 'member';
/** Startup is prevented: the application role owns, or is a member of the owner of, an outbox relation. */
export class OutboxAppRoleOwnershipError extends StynxOutboxError {
  constructor(context: { property: OutboxAppRoleOwnershipProperty; role: string; relation: string; owner: string }) {
    super('Outbox application role must not own or belong to the owner of an outbox relation',
      { code: 'OUTBOX_APP_ROLE_OWNERSHIP', status: 500, context });
  }
}
export class OutboxOwnershipContentionError extends StynxOutboxError {
  constructor() { super('Outbox ownership marker is locked by cutover', { code: 'OUTBOX_OWNERSHIP_CONTENTION', status: 503 }); }
}
export class OutboxLegacyCutoverError extends StynxOutboxError {
  constructor() { super('Legacy outbox is no longer writable after cutover', { code: 'OUTBOX_LEGACY_CUTOVER', status: 409 }); }
}
export class OutboxCustomTableCutoverUnsupportedError extends StynxOutboxError {
  constructor() { super('Cutover supports only default outbox tables', { code: 'OUTBOX_CUSTOM_TABLE_CUTOVER_UNSUPPORTED', status: 409 }); }
}
export class OutboxCutoverAuditedTableError extends StynxOutboxError {
  constructor() { super('Cutover table has an audit row trigger', { code: 'OUTBOX_CUTOVER_AUDITED_TABLE', status: 409 }); }
}
export class OutboxClockAmbientTransactionError extends StynxOutboxError {
  constructor() { super('SSE clock cannot run in a held transaction', { code: 'OUTBOX_CLOCK_AMBIENT_TRANSACTION', status: 409 }); }
}
export class OutboxClockAdmissionTimeoutError extends StynxOutboxError {
  constructor() { super('SSE clock admission timed out', { code: 'SSE_SOURCE_UNAVAILABLE', status: 503 }); }
}
export class OutboxAckQuarantineUnavailableError extends StynxOutboxError {
  constructor() { super('Unbound ACK could not be quarantined while a transaction holds the connection',
    { code: 'OUTBOX_ACK_QUARANTINE_UNAVAILABLE', status: 503 }); }
}
/** Raised by `retryEvent()` when the tenant's delivery is not in `ERROR`; nothing is changed. */
export class OutboxEventNotFailedError extends StynxOutboxError {
  constructor(context: Record<string, unknown>) {
    super('Outbox event delivery is not in ERROR', { code: 'OUTBOX_EVENT_NOT_FAILED', status: 409, context });
  }
}
