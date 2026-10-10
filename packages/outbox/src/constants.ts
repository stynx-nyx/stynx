export const STYNX_OUTBOX_OPTIONS = Symbol('STYNX_OUTBOX_OPTIONS');
export const STYNX_OUTBOX_DISPATCHER = Symbol('STYNX_OUTBOX_DISPATCHER');
export const STYNX_OUTBOX_BACKOFF_POLICY = Symbol('STYNX_OUTBOX_BACKOFF_POLICY');
export const STYNX_OUTBOX_METRICS = Symbol('STYNX_OUTBOX_METRICS');
/** Named destination registry (`readonly OutboxDestination[]`); overrides `options.destinations`. */
export const STYNX_OUTBOX_DESTINATIONS = Symbol('STYNX_OUTBOX_DESTINATIONS');

export const DEFAULT_OUTBOX_TABLE = 'outbox.messages';
export const DEFAULT_OUTBOX_ACK_TABLE = 'outbox.acknowledgements';
export const DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE = 25;

/**
 * Relations of the ADR-OUTBOX-0003 D2 closed object list, as data for the D1
 * bootstrap check: the application role must neither own nor be a member of
 * the owner of any of them.
 */
export const OUTBOX_APP_ROLE_CHECKED_RELATIONS: readonly string[] = Object.freeze([
  'legacy_ownership',
  'tenant_clock',
  'events',
  'event_delivery',
  'event_attempts',
  'event_acks',
  'legacy_event_map',
  'ack_quarantine',
  'event_order_seq',
  'messages',
  'acknowledgements',
]);
