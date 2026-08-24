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
}
