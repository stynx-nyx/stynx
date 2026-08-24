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
