/**
 * Public types for the transactional outbox: envelope, row shape, dispatcher
 * port, backoff policy, and the minimal SQL executor duck-type that lets
 * `enqueue()` accept either a `@stynx-nyx/data` `Transaction` or any other
 * object exposing a compatible `query()` method.
 */

/** Lifecycle states for one outbox row. */
export type OutboxStatus = 'PENDING' | 'SENT' | 'ACKED' | 'ERROR';

/**
 * Entity-agnostic envelope for one outbox message. `entity` + `entityId`
 * identify the aggregate the message represents (e.g. `'renach.encounter'`,
 * `12`); `payload` is the wire body handed to the dispatcher. A second
 * `enqueue()` call for the same `(tenantId, entity, entityId)` upserts in
 * place (matching pec's `renach_outbox` semantics) rather than appending a
 * new row, so at most one outstanding message exists per aggregate.
 */
export interface OutboxEnvelope {
  /** Aggregate/domain type this message represents. Free-form, dot-namespaced by convention. */
  entity: string;
  /** Aggregate identifier, scoped to `entity` (and, implicitly, tenant). */
  entityId: string;
  /** Wire payload delivered to the dispatcher. Serialized as `jsonb`. */
  payload: Record<string, unknown>;
  /**
   * Overrides the default idempotency key (`${entity}:${entityId}`). Set this
   * when the same `(entity, entityId)` pair may legitimately need more than
   * one in-flight message (rare — most callers should rely on the default).
   */
  idempotencyKey?: string;
  /**
   * Free-form linkage back to the originating domain record (replaces pec's
   * hardcoded `encounterId` FK). Stored as `jsonb`; not interpreted by this
   * package.
   */
  metadata?: Record<string, unknown>;
}

export interface OutboxAppendEvent {
  entity: string;
  entityId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OutboxEventRow extends OutboxAppendEvent {
  id: string;
  tenantId: string;
  createdAt: Date;
}

export interface OutboxEventAckInput {
  tenantId: string;
  eventId?: string;
  idempotencyKey?: string;
  rawBody: Buffer;
  status: 'ACKED' | 'ERROR';
  hmacVerified?: boolean;
}

/** Persisted shape of one outbox row, as returned by every service method. */
export interface OutboxRow {
  id: string;
  tenantId: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  ackTime: string | null;
  nextAttemptAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Input to `OutboxService.ack()` — normally sourced from an inbound webhook body. */
export interface OutboxAckInput {
  entity: string;
  entityId: string;
  status: 'ACKED' | 'ERROR';
  detail?: string;
  /**
   * Disambiguates `(entity, entityId)` across tenants. Required when the
   * external system does not guarantee `entityId` is globally unique;
   * omitting it while more than one tenant holds a matching row raises
   * `OutboxAmbiguousAckError`.
   */
  tenantId?: string;
}

/** Result of one `dispatchDue()` claim-and-send attempt. */
export interface OutboxDispatchOutcome {
  row: OutboxRow;
  /** `true` when a dispatcher port was invoked and returned without throwing. */
  dispatched: boolean;
  error?: string;
  /** Transport completed, but the durable attempt/projection could not be confirmed. */
  reconciliationRequired?: boolean;
}

/**
 * Pluggable transport for claimed outbox rows. `send()` should throw (or
 * reject) to signal delivery failure; `dispatchDue()` catches the rejection,
 * reverts the row to `ERROR`, and schedules the next attempt via the
 * configured `OutboxBackoffPolicy`. Ship an HTTP implementation today
 * (`HttpOutboxDispatcher`); an EventBridge implementation is deferred —
 * this port is the seam a later package hangs it on.
 */
export interface OutboxDispatcherPort {
  send(row: OutboxRow): Promise<void>;
  /**
   * Optional event-mode evidence captured from the bytes handed to the transport.
   * In event mode `row` is the log event: `id` is the event id, `tenantId`, `entity`,
   * `entityId`, `idempotencyKey`, `payload`, `metadata` and `createdAt` are the event's own,
   * `attempts` is the ordinal of this attempt and `status` is `SENT`.
   */
  sendEvent?(row: OutboxRow): Promise<OutboxTransportEvidence>;
}

/**
 * Selects events by `entity`: an exact name listed in `entities`, or a name that starts
 * with a literal, case-sensitive prefix listed in `entityPrefixes` (no `LIKE` pattern).
 */
export interface OutboxEntitySelector {
  entities?: readonly string[];
  entityPrefixes?: readonly string[];
}

export interface OutboxTransportEvidence {
  provider?: string;
  protocol?: string;
  requestBytes?: Buffer;
  responseBytes?: Buffer;
  /** Final header names and redacted/digested values, never raw secrets. */
  requestHeaders?: Record<string, string>;
  responseStatus?: number;
  /** Request construction is known; transmission is confirmed only by a response. */
  requestTransmission?: 'constructed-not-confirmed' | 'response-received';
}

/**
 * Computes when a failed (or manually retried) row becomes eligible again.
 * pec hardcoded `now() + 15 minutes`; this package makes that a policy so
 * consumers can choose fixed-interval (pec-compatible default) or
 * exponential-with-jitter backoff.
 */
export interface OutboxBackoffPolicy {
  nextAttemptAt(attempt: number, now?: Date): Date;
}

/** Minimal SQL surface `OutboxService` needs from a transaction/executor. */
export interface OutboxSqlExecutor {
  query<T extends object = object>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

/** Optional metrics hook; no-op by default. */
export interface OutboxMetricsSink {
  incrementEnqueued(entity: string): void;
  incrementDispatched(entity: string, outcome: 'sent' | 'error'): void;
  incrementAcked(entity: string, outcome: 'acked' | 'error'): void;
}

export interface OutboxModuleOptions {
  /** Qualified table name for messages. Defaults to `outbox.messages`. */
  table?: string;
  /** Qualified table name for acknowledgements. Defaults to `outbox.acknowledgements`. */
  ackTable?: string;
  dispatcher?: OutboxDispatcherPort;
  backoffPolicy?: OutboxBackoffPolicy;
  metrics?: OutboxMetricsSink;
  /** Default `limit` for `dispatchDue()` when the caller doesn't pass one. */
  dispatchBatchSize?: number;
  /** Lease for an event send and for its subsequent ACK wait. */
  eventLeaseMs?: number;
  /** Upper bound on a cutover/append database lock wait. */
  lockTimeoutMs?: number;
  /** Persistence retry deadline after a legacy send failure. */
  failurePersistenceDeadlineMs?: number;
  /**
   * Event-mode destinations. When set, `appendInTransaction`/`appendManyInTransaction`
   * create a delivery row only for an event whose `entity` the selector matches; any other
   * event is written to the log alone and is never claimed, sent or counted in queue health.
   * An empty selector makes the service a pure event log. When omitted, every appended event
   * is dispatchable, as in 1.5.0.
   */
  dispatchableEntities?: OutboxEntitySelector;
}

/** Event-mode delivery projection states (`outbox.event_delivery.status`). */
export type OutboxEventDeliveryStatus = 'PENDING' | 'SENT' | 'SENT_UNRESOLVED' | 'ERROR' | 'ACKED';

/** Delivery projection of one event; `nextAttemptAt` is the next eligibility. */
export interface OutboxEventDeliveryState {
  status: OutboxEventDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  leaseUntil: Date | null;
  updatedAt: Date;
}

/** Immutable event-log identity returned by the tenant read ports (payload omitted). */
export interface OutboxEventSummary {
  id: string;
  tenantId: string;
  entity: string;
  entityId: string;
  idempotencyKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** One `listEvents()` row; `delivery` is `null` for an event without a delivery row. */
export interface OutboxEventListItem extends OutboxEventSummary {
  delivery: OutboxEventDeliveryState | null;
}

/** An event together with its existing delivery row. */
export interface OutboxEventDelivery extends OutboxEventSummary {
  delivery: OutboxEventDeliveryState;
}

/** Keyset position `(createdAt, id)` of the last row of a `listEvents()` page. */
export interface OutboxEventListCursor {
  createdAt: Date;
  id: string;
}

export interface OutboxEventListQuery {
  /** Only events whose delivery has one of these states; events without delivery never match. */
  deliveryStatus?: OutboxEventDeliveryStatus | readonly OutboxEventDeliveryStatus[];
  /** Exact `entity` match. */
  entity?: string;
  /** Case-sensitive literal `entity` prefix (no pattern characters). */
  entityPrefix?: string;
  /** Page size, 1–500; default 50. */
  limit?: number;
  /** Continue after the `nextCursor` of a previous page. */
  cursor?: OutboxEventListCursor | null;
}

export interface OutboxEventListPage {
  items: OutboxEventListItem[];
  /** `null` when no later page exists. */
  nextCursor: OutboxEventListCursor | null;
}

export type OutboxDeliveryStatusCounts = Record<OutboxEventDeliveryStatus, number>;

/** Delivery state of one `(entity, entityId)` aggregate in the context tenant. */
export interface OutboxAggregateDelivery {
  entity: string;
  entityId: string;
  /** Oldest non-`ACKED` delivery: the one that blocks later events of the aggregate; `null` when all are `ACKED`. */
  head: OutboxEventDelivery | null;
  /** Counts over every delivery of the aggregate. */
  counts: OutboxDeliveryStatusCounts;
  /** Deliveries ordered `createdAt, id` ascending, at most `limit`. */
  events: OutboxEventDelivery[];
}

export type OutboxEventAttemptResult = 'CLAIMED' | 'SENT' | 'ERROR' | 'LEGACY_HISTORY_UNAVAILABLE';

/** One `outbox.event_attempts` ledger row. Raw bytes are present only with `includeBytes`. */
export interface OutboxEventAttempt {
  id: string;
  eventId: string;
  attemptOrdinal: number;
  provider: string | null;
  protocol: string | null;
  requestSha256: string | null;
  responseSha256: string | null;
  responseStatus: number | null;
  /** Final header names with redacted or digested values, as captured by the dispatcher. */
  requestHeaders: Record<string, string> | null;
  evidenceState: Record<string, unknown>;
  result: OutboxEventAttemptResult;
  error: string | null;
  leasedAt: Date | null;
  completedAt: Date | null;
  legacyMessageId: string | null;
  requestBytes?: Buffer | null;
  responseBytes?: Buffer | null;
}

/** Per-tenant queue health over delivery rows (events without delivery are not counted). */
export interface OutboxQueueHealth {
  tenantId: string;
  total: number;
  byStatus: OutboxDeliveryStatusCounts;
  /** `createdAt` of the oldest non-`ACKED` delivery, or `null`. */
  oldestUnackedCreatedAt: Date | null;
}

export interface OutboxQueueHealthQuery {
  entity?: string;
  entityPrefix?: string;
}
