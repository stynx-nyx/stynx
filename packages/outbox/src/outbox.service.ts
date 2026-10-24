import { appendEventRow, findAppendedEventRow, findRetirementReceipt, insertRetirementReceipt, getRetirementReceipt, isAppendedEventRow, isRetirementResult, claimTenantEvents, claimTenantEventsFiltered, claimOwnerEvents, claimOwnerEventsFiltered, listEventRows, aggregateEventRows, eventAttemptRows, eventAttemptRowsWithBytes, queueHealthRows, queueHealthRowsFiltered, eventDeliveryRows } from './outbox-results.repository.js';
import { lookupAckEvent, lockAckDelivery, lockRetryDelivery, retryDelivery, lockRetirementDelivery, checkRetirementLease, readLegacyEventLink, enqueueEventDelivery, recordClaimedAttempt, markDeliveryFailed, persistFailedAttempt, markEventRetired, recordOwnerClaimedAttempt, extendOwnerLease, persistOwnerSent, markOwnerDeliveryFailed, persistOwnerFailedAttempt, recordLegacyFailedAttempt, markLegacyDeliveryFailed, recordLegacyAssertedAck, applyLegacyAck, readLegacyCutoverRows, advanceCutoverClock, createCutoverEvent, readLegacyAck, importLegacyDelivery, linkLegacyEvent, importLegacyAttempt, importLegacyAck, markLegacyMigrated, finishLegacyOwnership, quarantineUnboundAck, applyTenantAck, recordTenantAck, extendTenantLease, persistTenantSent } from './outbox-commands.repository.js';
import { cutoverLockQueries, cutoverAuditedRelations, checkApplicationOwnership, readAppendContext, readLockTimeout, readAuditChainKey, advanceAppendClock, auditContractAvailable, lockOwnershipMarker, countLegacyEventMap, setLockTimeout, setAuditChainKey, lockAuditChain, enterItemReadOnly, readOwnershipWaiting, readOwnershipNowait } from './outbox-context.repository.js';
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import {
  AuditChainKeyMismatchError,
  Database,
  executeTypedQuery,
  executeConfiguredQuery,
  IndependentTransactionConnectionError,
} from '@stynx-nyx/data';
import { createHash } from 'node:crypto';
import type { Transaction } from '@stynx-nyx/data';
import { FixedIntervalBackoffPolicy } from './backoff.js';
import {
  DEFAULT_OUTBOX_ACK_TABLE,
  DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE,
  OUTBOX_APP_ROLE_CHECKED_RELATIONS,
  DEFAULT_OUTBOX_TABLE,
  STYNX_OUTBOX_BACKOFF_POLICY,
  STYNX_OUTBOX_DESTINATIONS,
  STYNX_OUTBOX_DISPATCHER,
  STYNX_OUTBOX_METRICS,
  STYNX_OUTBOX_OPTIONS,
} from './constants.js';
import {
  OutboxAckQuarantineUnavailableError,
  OutboxAlreadyEnqueuedError,
  OutboxAmbiguousAckError,
  OutboxAppRoleOwnershipError,
  OutboxNotFoundError,
  OutboxEventConflictError,
  OutboxEventTransactionError,
  OutboxOwnershipContentionError,
  OutboxLegacyCutoverError,
  OutboxCustomTableCutoverUnsupportedError,
  OutboxCutoverAuditedTableError,
  OutboxEventNotFailedError,
  OutboxRetirementInputError,
  OutboxRetirementConflictError,
  OutboxConsumerStorageCutoverUnsupportedError,
} from './errors.js';
import {
  assertQualifiedIdentifier,
  errorMessage,
  isUniqueViolation,
  toRows,
} from './row-mapper.js';
import type {
  OutboxTimestampResult,
  OutboxAckInput,
  OutboxBackoffPolicy,
  OutboxDispatchOutcome,
  OutboxDispatcherPort,
  OutboxEnvelope,
  OutboxMetricsSink,
  OutboxModuleOptions,
  OutboxRow,
  OutboxSqlExecutor,
  OutboxAppendEvent,
  OutboxEventRow,
  OutboxEventAckInput,
  OutboxTransportEvidence,
  OutboxAggregateDelivery,
  OutboxDeliveryStatusCounts,
  OutboxEventAttempt,
  OutboxEventDelivery,
  OutboxEventDeliveryState,
  OutboxEventDeliveryStatus,
  OutboxEventListPage,
  OutboxEventListQuery,
  OutboxEventSummary,
  OutboxQueueHealth,
  OutboxQueueHealthQuery,
  OutboxEntitySelector,
  OutboxDestination,
  OutboxDestinationFilter,
  OutboxDispatchFilter,
  OutboxEventRetirement,
  OutboxEventRetirementResult,
  OutboxEventRetirementInput,
} from './types.js';

const EVENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DELIVERY_STATUSES: readonly OutboxEventDeliveryStatus[] = [
  'PENDING',
  'SENT',
  'SENT_UNRESOLVED',
  'ERROR',
  'ACKED',
  'RETIRED',
];
type EventDeliverySqlRow = OutboxEventSummary & {
  status: OutboxEventDeliveryStatus | null;
  attempts: number | null;
  lastError: string | null;
  nextAttemptAt: OutboxTimestampResult | null;
  leaseUntil: OutboxTimestampResult | null;
  updatedAt: OutboxTimestampResult | null;
  retirement?: Omit<OutboxEventRetirement, 'retiredAt'> & { retiredAt: Date | string | number } | null | undefined;
};

function resultTimestampIso(value: OutboxTimestampResult, expression: string): string {
  if (!(value instanceof Date)) throw new TypeError(`${expression}.toISOString is not a function`);
  return value.toISOString();
}

function resultTimestampTime(value: OutboxTimestampResult, expression: string): number {
  if (!(value instanceof Date)) throw new TypeError(`${expression}.getTime is not a function`);
  return value.getTime();
}

function eventSummary(row: EventDeliverySqlRow): OutboxEventSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    entity: row.entity,
    entityId: row.entityId,
    idempotencyKey: row.idempotencyKey,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

function deliveryState(row: EventDeliverySqlRow): OutboxEventDeliveryState | null {
  return row.status === null
    ? null
    : {
        status: row.status,
        attempts: row.attempts!,
        lastError: row.lastError,
        nextAttemptAt: row.nextAttemptAt,
        leaseUntil: row.leaseUntil,
        updatedAt: row.updatedAt!,
        ...(row.retirement
          ? { retirement: { ...row.retirement, retiredAt: new Date(row.retirement.retiredAt) } }
          : {}),
      };
}

function statusCounts(
  rows: readonly { status: OutboxEventDeliveryStatus; count: number }[],
): OutboxDeliveryStatusCounts {
  const counts = Object.fromEntries(
    DELIVERY_STATUSES.map((status) => [status, 0]),
  ) as OutboxDeliveryStatusCounts;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

function filterText(value: string | undefined, name: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0)
    throw new RangeError(`${name} must be a non-empty string`);
  return value;
}

interface EntityMatcher {
  entities: string[];
  prefixes: string[];
}

/** Validates an `entity` selector; `null` when none was given. */
function entityMatcher(
  value: OutboxEntitySelector | undefined,
  name: string,
  allowEmpty: boolean,
): EntityMatcher | null {
  if (value === undefined) return null;
  const list = (items: unknown, field: string): string[] => {
    if (items === undefined) return [];
    if (
      !Array.isArray(items) ||
      items.some((item) => typeof item !== 'string' || item.length === 0)
    ) {
      throw new RangeError(`${name}.${field} must be a list of non-empty strings`);
    }
    return [...(items as string[])];
  };
  if (value === null || typeof value !== 'object')
    throw new RangeError(`${name} must be an entity selector`);
  const matcher = {
    entities: list(value.entities, 'entities'),
    prefixes: list(value.entityPrefixes, 'entityPrefixes'),
  };
  if (!allowEmpty && matcher.entities.length + matcher.prefixes.length === 0) {
    throw new RangeError(`${name} must list at least one entity or entity prefix`);
  }
  return matcher;
}

function matchesEntity(matcher: EntityMatcher, entity: string): boolean {
  return (
    matcher.entities.includes(entity) ||
    matcher.prefixes.some((prefix) => entity.startsWith(prefix))
  );
}

/** One registered destination (ADR-OUTBOX-0003 D4): a name, its entity set and an optional port. */
interface Destination {
  name: string;
  matcher: EntityMatcher;
  dispatcher?: OutboxDispatcherPort;
}

/** An entity both selectors would match, or `null` when they are disjoint. */
function sharedEntity(left: EntityMatcher, right: EntityMatcher): string | null {
  const exact =
    left.entities.find((entity) => matchesEntity(right, entity)) ??
    right.entities.find((entity) => matchesEntity(left, entity));
  if (exact !== undefined) return exact;
  // Two prefixes meet when one extends the other: the longer one is an entity both match.
  for (const prefix of left.prefixes) {
    const other = right.prefixes.find(
      (candidate) => candidate.startsWith(prefix) || prefix.startsWith(candidate),
    );
    if (other !== undefined) return other.length >= prefix.length ? other : prefix;
  }
  return null;
}

/** A destination may only name entities that `dispatchableEntities` gives a delivery row. */
function assertCovered(destination: Destination, dispatchable: EntityMatcher): void {
  for (const entity of destination.matcher.entities) {
    if (!matchesEntity(dispatchable, entity)) {
      throw new RangeError(
        `destinations "${destination.name}" names entity "${entity}", which dispatchableEntities does not cover`,
      );
    }
  }
  for (const prefix of destination.matcher.prefixes) {
    // Only a dispatchable prefix that this prefix extends covers every entity it can match.
    if (!dispatchable.prefixes.some((covering) => prefix.startsWith(covering))) {
      throw new RangeError(
        `destinations "${destination.name}" names entity prefix "${prefix}", which dispatchableEntities does not cover`,
      );
    }
  }
}

/** Validates the named-destination registry; unique names, disjoint selectors, covered by `dispatchable`. */
function destinationRegistry(
  value: readonly OutboxDestination[] | undefined,
  dispatchable: EntityMatcher | null,
): Map<string, Destination> {
  const registry = new Map<string, Destination>();
  if (value === undefined) return registry;
  if (!Array.isArray(value)) throw new RangeError('destinations must be a list of destinations');
  value.forEach((entry: OutboxDestination | null, index) => {
    const name = `destinations[${index}]`;
    if (entry === null || typeof entry !== 'object')
      throw new RangeError(`${name} must be a destination`);
    if (typeof entry.name !== 'string' || entry.name.length === 0)
      throw new RangeError(`${name}.name must be a non-empty string`);
    if (registry.has(entry.name))
      throw new RangeError(`${name}.name "${entry.name}" is already registered`);
    const matcher = entityMatcher(entry.selector, `${name}.selector`, false);
    if (!matcher) throw new RangeError(`${name}.selector must be an entity selector`);
    const port: unknown = entry.dispatcher;
    if (
      port !== undefined &&
      (port === null ||
        typeof port !== 'object' ||
        typeof (port as OutboxDispatcherPort).send !== 'function')
    ) {
      throw new RangeError(`${name}.dispatcher must implement OutboxDispatcherPort`);
    }
    const destination: Destination = {
      name: entry.name,
      matcher,
      ...(entry.dispatcher ? { dispatcher: entry.dispatcher } : {}),
    };
    for (const other of registry.values()) {
      const entity = sharedEntity(other.matcher, matcher);
      if (entity !== null)
        throw new RangeError(
          `destinations "${other.name}" and "${entry.name}" both match entity "${entity}"`,
        );
    }
    if (dispatchable) assertCovered(destination, dispatchable);
    registry.set(entry.name, destination);
  });
  return registry;
}

function isDestinationFilter(value: unknown): value is OutboxDestinationFilter {
  return value !== null && typeof value === 'object' && 'destination' in value;
}

/** Claim predicate for a dispatch filter; `first` is the index of its first SQL parameter. */
function transportEvidenceState(evidence?: OutboxTransportEvidence): string {
  return JSON.stringify({
    requestBytes: evidence?.requestBytes ? 'captured' : 'unavailable',
    responseBytes: evidence?.responseBytes ? 'captured' : 'unavailable',
    requestHeaders: evidence?.requestHeaders ? 'redacted-or-digested' : 'unavailable',
    responseStatus: evidence?.responseStatus !== undefined ? 'captured' : 'unavailable',
    requestTransmission: evidence?.requestTransmission ?? 'unavailable',
  });
}

function positiveMilliseconds(value: number | undefined, name: string): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
  ) {
    throw new RangeError(`${name} must be a positive integer of milliseconds`);
  }
}

function retryableSqlCode(error: unknown): '40P01' | '55P03' | undefined {
  const value = error as { code?: string; context?: { code?: string; originalCode?: string } };
  const code = value?.context?.code ?? value?.context?.originalCode ?? value?.code;
  return code === '40P01' || code === '55P03' ? code : undefined;
}

/**
 * Transactional outbox service.
 *
 * `enqueue()` is a pure function of a caller-supplied SQL executor (a
 * `@stynx-nyx/data` `Transaction`, or any object with a compatible
 * `query()`), so a caller composes it inside its own `database.tx(...)`
 * call and gets one atomic commit across the domain write and the outbox
 * row — the generalization pec's `TransmissionsService.enqueue` did not
 * offer (pec always opened its own transaction).
 *
 * Every other method (`dispatchDue`, `ack`, `retry`, `getOne`) owns its own
 * transaction via the injected `Database`, matching pec's shape 1:1.
 */
@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly table: string;
  private readonly ackTable: string;
  private readonly dispatchBatchSize: number;
  private readonly backoffPolicy: OutboxBackoffPolicy;
  /** Declared event-mode destinations; `null` keeps every appended event dispatchable. */
  private readonly dispatchable: EntityMatcher | null;
  /** Named destinations by name; empty without a registry. */
  private readonly destinations: Map<string, Destination>;
  private get platformLegacyTable(): boolean {
    return this.table === DEFAULT_OUTBOX_TABLE && this.ackTable === DEFAULT_OUTBOX_ACK_TABLE;
  }
  private mapOwnershipError(error: unknown): unknown {
    return retryableSqlCode(error) === '55P03' ? new OutboxOwnershipContentionError() : error;
  }

  private async ownerRetry<T>(reason: string, fn: (trx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.database.withSystemContext(reason, () =>
          this.database.tx(fn, {
            role: 'owner',
            retry: false,
            lockTimeoutMs: Math.min(this.options.lockTimeoutMs ?? 250, 250),
          }),
        );
      } catch (error) {
        if (!retryableSqlCode(error)) throw error;
        if (attempt === 3) throw this.mapOwnershipError(error);
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
      }
    }
    throw new OutboxOwnershipContentionError();
  }

  private async ownership(trx: OutboxSqlExecutor, nowait = false): Promise<'LEGACY' | 'NEW'> {
    try {
      const marker = await executeTypedQuery(trx, nowait ? readOwnershipNowait : readOwnershipWaiting, []);
      if (!marker[0]) throw new OutboxOwnershipContentionError();
      return marker[0].state;
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') throw new OutboxOwnershipContentionError();
      throw error;
    }
  }

  /** Whether an appended event of this `entity` gets a delivery row. */
  private hasDestination(entity: string): boolean {
    const declared = this.dispatchable;
    return !declared || matchesEntity(declared, entity);
  }

  /** The registered destination called `name`; `RangeError` for a malformed or unknown name. */
  private destination(name: unknown, field: string): Destination {
    if (typeof name !== 'string' || name.length === 0)
      throw new RangeError(`${field} must be a non-empty string`);
    const found = this.destinations.get(name);
    if (!found) throw new RangeError(`${field} "${name}" is not a registered destination`);
    return found;
  }

  /** Expands a dispatch filter: a destination name stands for its selector. */
  private dispatchMatcher(filter: OutboxDispatchFilter | undefined): EntityMatcher | null {
    return isDestinationFilter(filter)
      ? this.destination(filter.destination, 'filter.destination').matcher
      : entityMatcher(filter, 'filter', false);
  }

  /** Port for a claimed event: its destination's own port, else the module dispatcher. */
  private portFor(entity: string): OutboxDispatcherPort | undefined {
    for (const destination of this.destinations.values()) {
      if (matchesEntity(destination.matcher, entity))
        return destination.dispatcher ?? this.dispatcher;
    }
    return this.dispatcher;
  }

  /**
   * ADR-OUTBOX-0003 D1 item 7: the application role must neither own nor be a
   * member of the owner of any relation in the D2 closed list. Runs on the
   * owner connection at bootstrap; any failure prevents startup.
   */
  async onModuleInit(): Promise<void> {
    const role = this.database.appRoleName;
    const rows = await this.database.withSystemContext('outbox application role check', () =>
      this.database.tx(
        async (trx) => {
          const result = await executeTypedQuery(trx, checkApplicationOwnership,
            [role, [...OUTBOX_APP_ROLE_CHECKED_RELATIONS]],
          );
          return result;
        },
        { role: 'owner', readonly: true, retry: false },
      ),
    );
    for (const row of rows) {
      const property =
        row.owns === null || row.member === null
          ? 'exists'
          : row.owns
            ? 'owns'
            : row.member
              ? 'member'
              : undefined;
      if (property) {
        throw new OutboxAppRoleOwnershipError({
          property,
          role,
          relation: `outbox.${row.relation}`,
          owner: row.owner,
        });
      }
    }
  }

  async appendInTransaction(trx: Transaction, event: OutboxAppendEvent): Promise<OutboxEventRow> {
    const rows = await this.appendManyInTransaction(trx, [event]);
    return rows[0]!;
  }

  async appendManyInTransaction(
    trx: Transaction,
    events: readonly OutboxAppendEvent[],
  ): Promise<OutboxEventRow[]> {
    if (events.length === 0) return [];
    const state = await executeTypedQuery(trx, readAppendContext, []);
    const live = state[0];
    if (trx.role !== 'app') throw new OutboxEventTransactionError('transaction_role');
    if (!live?.tenant_id) throw new OutboxEventTransactionError('tenant');
    const reason =
      live.role !== 'app'
        ? 'app_role'
        : live.sql_role !== this.database.appRoleName
          ? 'sql_role'
          : live.isolation !== 'read committed'
            ? 'isolation'
            : live.read_only !== 'off'
              ? 'read_only'
              : live.recovery
                ? 'recovery'
                : undefined;
    if (reason) throw new OutboxEventTransactionError(reason);
    if (this.database.currentTenantId()?.toLowerCase() !== live.tenant_id) {
      throw new AuditChainKeyMismatchError();
    }
    const previousLockTimeout = await executeTypedQuery(trx, readLockTimeout, []);
    await executeTypedQuery(trx, setLockTimeout, [
      String(this.options.lockTimeoutMs ?? 5_000),
    ]);
    const tenantId = live.tenant_id;
    let ms!: string;
    let restoreError: unknown;
    try {
      const priorKey = await executeTypedQuery(trx, readAuditChainKey, []);
      await this.ownership(trx, Boolean(priorKey[0]?.key));
      if (priorKey[0]?.key && priorKey[0]?.key !== tenantId) {
        throw new AuditChainKeyMismatchError();
      }
      await executeTypedQuery(trx, setAuditChainKey, [tenantId]);
      await executeTypedQuery(trx, lockAuditChain, [tenantId]);
      const clock = await executeTypedQuery(trx, advanceAppendClock,
        [tenantId],
      );
      ms = clock[0]!.last_ms;
    } finally {
      // A JS validation error leaves the caller's transaction usable. If SQL
      // aborted it, preserve that original error instead of masking it with
      // the expected 25P02 from restoration.
      try {
        await executeTypedQuery(trx, setLockTimeout, [
          previousLockTimeout[0]!.value,
        ]);
      } catch (error) {
        restoreError = error;
      }
    }
    if (restoreError) throw restoreError;
    const result: OutboxEventRow[] = [];
    for (const event of events) {
      if (!event.entity || !event.entityId || !event.idempotencyKey)
        throw new OutboxEventTransactionError();
      const inserted = await trx.runGuarded(appendEventRow,
        [
          ms,
          tenantId,
          event.entity,
          event.entityId,
          event.idempotencyKey,
          JSON.stringify(event.payload),
          event.metadata ? JSON.stringify(event.metadata) : null,
        ], isAppendedEventRow);
      let row = inserted[0];
      if (!row) {
        const previous = await trx.runGuarded(findAppendedEventRow,
          [
            tenantId,
            event.idempotencyKey,
            event.entity,
            event.entityId,
            JSON.stringify(event.payload),
            event.metadata ? JSON.stringify(event.metadata) : null,
          ], isAppendedEventRow);
        row = previous[0];
        if (!row) {
          throw new OutboxEventConflictError();
        }
      } else if (this.hasDestination(row.entity)) {
        // Only an event with a declared destination enters the delivery queue.
        await executeTypedQuery(trx, enqueueEventDelivery,
          [tenantId, row.id],
        );
      }
      result.push(row);
    }
    if (trx.strictItemMode) await executeTypedQuery(trx, enterItemReadOnly, []);
    return result;
  }

  /** Explicit, idempotent owner cutover for the two platform legacy tables. */
  async cutoverLegacyMessages(): Promise<{ migrated: number; generation: number }> {
    if (this.options.storageMode === 'consumer-owned') {
      throw new OutboxConsumerStorageCutoverUnsupportedError('consumer-owned-storage');
    }
    if (this.table !== DEFAULT_OUTBOX_TABLE || this.ackTable !== DEFAULT_OUTBOX_ACK_TABLE) {
      throw new OutboxCustomTableCutoverUnsupportedError();
    }
    return this.database.withSystemContext('outbox legacy cutover', () =>
      this.database.tx(
        async (trx) => {
          const auditContract = await executeTypedQuery(trx, auditContractAvailable, []);
          if (auditContract[0]?.available !== true) {
            throw new OutboxConsumerStorageCutoverUnsupportedError('audit-chain-unavailable');
          }
          await executeTypedQuery(trx, setLockTimeout, [
            String(this.options.lockTimeoutMs ?? 5_000),
          ]);
          const marker = await executeTypedQuery(trx, lockOwnershipMarker, []);
          const current = marker[0]!;
          if (current.state === 'NEW') {
            const count = await executeTypedQuery(trx, countLegacyEventMap, []);
            return {
              migrated: Number(count[0]!.count),
              generation: Number(current.generation),
            };
          }
          const targets = [
            'messages',
            'events',
            'event_delivery',
            'legacy_event_map',
            'event_attempts',
            'event_acks',
            'tenant_clock',
            'legacy_ownership',
          ];
          for (const query of cutoverLockQueries) {
            await executeTypedQuery(trx, query, []);
          }
          const audited = await executeTypedQuery(trx, cutoverAuditedRelations,
            [targets],
          );
          if (audited.length) throw new OutboxCutoverAuditedTableError();
          const legacy = await executeTypedQuery(trx, readLegacyCutoverRows, []);
          const generation = Number(current.generation) + 1;
          for (const row of legacy) {
            const clock = await executeTypedQuery(trx, advanceCutoverClock,
              [row.tenant_id],
            );
            const event = await executeTypedQuery(trx, createCutoverEvent,
              [
                clock[0]!.last_ms,
                row.tenant_id,
                row.entity,
                row.entity_id,
                row.idempotency_key,
                JSON.stringify(row.payload),
                row.metadata ? JSON.stringify(row.metadata) : null,
              ],
            );
            const eventId = event[0]!.id;
            await executeTypedQuery(trx, importLegacyDelivery,
              [
                row.tenant_id,
                eventId,
                row.id,
                row.status === 'SENT' ? 'SENT_UNRESOLVED' : row.status,
                row.attempts,
                row.next_attempt_at,
                row.last_error,
              ],
            );
            await executeTypedQuery(trx, linkLegacyEvent,
              [row.id, row.tenant_id, eventId, generation],
            );
            if (row.attempts > 0) {
              await executeTypedQuery(trx, importLegacyAttempt,
                [
                  row.tenant_id,
                  eventId,
                  row.id,
                  row.last_error,
                  JSON.stringify({
                    attempts: row.attempts,
                    status: row.status,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    nextAttemptAt: row.next_attempt_at,
                  }),
                ],
              );
            }
            const legacyAck = await executeTypedQuery(trx, readLegacyAck,
              [row.id],
            );
            if (legacyAck[0]) {
              await executeTypedQuery(trx, importLegacyAck,
                [
                  row.tenant_id,
                  eventId,
                  legacyAck[0].ack_status,
                  legacyAck[0].id,
                  legacyAck[0].ack_message,
                  legacyAck[0].ack_time,
                ],
              );
            }
            await executeTypedQuery(trx, markLegacyMigrated,
              [row.id, eventId, generation],
            );
          }
          await executeTypedQuery(trx, finishLegacyOwnership,
            [generation],
          );
          return { migrated: legacy.length, generation };
        },
        { role: 'owner', isolation: 'read committed', retry: false },
      ),
    );
  }

  async recordUnboundAck(rawBody: Buffer, reason: string): Promise<void> {
    const hash = createHash('sha256').update(rawBody).digest('hex');
    await this.database
      .withSystemContext('outbox unbound ack', () =>
        this.database.txIndependent(
          async (trx) => {
            await executeTypedQuery(trx, quarantineUnboundAck,
              [rawBody, hash, reason],
            );
          },
          { role: 'owner', isolation: 'read committed', retry: false },
        ),
      )
      .catch((error: unknown) => {
        if (error instanceof IndependentTransactionConnectionError)
          throw new OutboxAckQuarantineUnavailableError();
        throw error;
      });
  }

  /**
   * Request-path ACK: identity is taken from the trusted request context, and
   * both projection and evidence are written by stynx_app under FORCE RLS.
   * Invalid signatures are quarantined by the separate control path without
   * looking up a domain event.
   */
  async ackTenantEvent(input: Omit<OutboxEventAckInput, 'tenantId'>): Promise<void> {
    const tenantId = this.database.currentTenantId();
    if (!tenantId) throw new OutboxNotFoundError({ reason: 'missing-tenant-context' });
    if ('tenantId' in input)
      throw new OutboxNotFoundError({ reason: 'tenant-identity-must-come-from-context' });
    if (input.hmacVerified !== true) {
      // Require the same live actor/tenant identity as a valid ACK before the
      // separate control path quarantines bytes; it never reads domain rows.
      await this.database.tx(async () => undefined, {
        role: 'app',
        requireActor: true,
        readonly: true,
        retry: false,
      });
      await this.recordUnboundAck(input.rawBody, 'invalid-hmac');
      throw new OutboxNotFoundError({ reason: 'invalid-hmac' });
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    if (
      (input.eventId && !uuid.test(input.eventId)) ||
      (!input.eventId && !input.idempotencyKey) ||
      (input.eventId && input.idempotencyKey)
    ) {
      throw new OutboxNotFoundError({ reason: 'missing-or-ambiguous-event-identity' });
    }
    const hash = createHash('sha256').update(input.rawBody).digest('hex');
    await this.database.tx(
      async (trx) => {
        const found = await executeTypedQuery(trx, lookupAckEvent,
          [tenantId, input.eventId ?? null, input.idempotencyKey ?? null],
        );
        const eventId = found[0]?.id;
        if (!eventId)
          throw new OutboxNotFoundError({
            eventId: input.eventId,
            idempotencyKey: input.idempotencyKey,
          });
        const delivery = await executeTypedQuery(trx, lockAckDelivery,
          [tenantId, eventId],
        );
        if (!delivery[0]) throw new OutboxNotFoundError({ eventId });
        const nextAttemptAt =
          input.status === 'ERROR'
            ? this.backoffPolicy.nextAttemptAt(delivery[0].attempts, new Date())
            : null;
        await executeTypedQuery(trx, applyTenantAck,
          [tenantId, eventId, input.status, nextAttemptAt],
        );
        await executeTypedQuery(trx, recordTenantAck,
          [tenantId, eventId, input.status, input.rawBody, hash],
        );
      },
      { role: 'app', requireActor: true, retry: false },
    );
  }

  /**
   * Claim and deliver only events visible to the active app-role tenant. With `filter`,
   * only deliveries whose event `entity` matches are claimed; a destination name stands
   * for its selector.
   */
  async dispatchTenantEventsDue(
    limit: number = this.dispatchBatchSize,
    filter?: OutboxDispatchFilter,
  ): Promise<OutboxDispatchOutcome[]> {
    const tenantId = this.database.currentTenantId();
    if (!tenantId) throw new OutboxNotFoundError({ reason: 'missing-tenant-context' });
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('limit must be a positive integer');
    const only = this.dispatchMatcher(filter);
    const claimed = await this.database.tx(
      async (trx) => {
        const result = await (only ? executeTypedQuery(trx, claimTenantEventsFiltered, [tenantId, limit, this.options.eventLeaseMs ?? 300_000, only.entities, only.prefixes]) : executeTypedQuery(trx, claimTenantEvents, [tenantId, limit, this.options.eventLeaseMs ?? 300_000]));
        for (const row of result) {
          await executeTypedQuery(trx, recordClaimedAttempt,
            [tenantId, row.event_id, row.attempts],
          );
        }
        return result;
      },
      { role: 'app', requireActor: true, retry: false },
    );
    const outcomes: OutboxDispatchOutcome[] = [];
    for (const claim of claimed) {
      const row: OutboxRow = {
        id: claim.event_id,
        tenantId,
        entity: claim.entity,
        entityId: claim.entity_id,
        idempotencyKey: claim.idempotency_key,
        payload: claim.payload,
        metadata: claim.metadata,
        status: 'SENT',
        attempts: claim.attempts,
        lastError: null,
        ackTime: null,
        nextAttemptAt: null,
        createdAt: resultTimestampIso(claim.created_at, 'claim.created_at'),
        updatedAt: new Date().toISOString(),
      };
      const port = this.portFor(claim.entity);
      if (!port) {
        outcomes.push({ row, dispatched: false });
        continue;
      }
      let evidence: OutboxTransportEvidence | undefined;
      let transportError: unknown;
      let transportFailed = false;
      try {
        evidence = port.sendEvent
          ? await port.sendEvent(row)
          : (await port.send(row), {} as OutboxTransportEvidence);
      } catch (error) {
        transportFailed = true;
        transportError = error;
      }
      if (!transportFailed) {
        const sentEvidence = evidence ?? {};
        const requestHash = sentEvidence.requestBytes
          ? createHash('sha256').update(sentEvidence.requestBytes).digest('hex')
          : null;
        const responseHash = sentEvidence.responseBytes
          ? createHash('sha256').update(sentEvidence.responseBytes).digest('hex')
          : null;
        try {
          await this.database.tx(
            async (trx) => {
              await executeTypedQuery(trx, extendTenantLease,
                [tenantId, claim.event_id, claim.attempts, this.options.eventLeaseMs ?? 300_000],
              );
              await executeTypedQuery(trx, persistTenantSent,
                [
                  tenantId,
                  claim.event_id,
                  claim.attempts,
                  sentEvidence.provider ?? null,
                  sentEvidence.protocol ?? null,
                  sentEvidence.requestBytes ?? null,
                  requestHash,
                  sentEvidence.responseBytes ?? null,
                  responseHash,
                  sentEvidence.requestHeaders ? JSON.stringify(sentEvidence.requestHeaders) : null,
                  sentEvidence.responseStatus ?? null,
                  transportEvidenceState(sentEvidence),
                ],
              );
            },
            { role: 'app', requireActor: true, retry: false },
          );
        } catch (persistenceError) {
          outcomes.push({
            row,
            dispatched: true,
            reconciliationRequired: true,
            error: `Send succeeded; attempt persistence unresolved: ${errorMessage(persistenceError)}`,
          });
          continue;
        }
        outcomes.push({ row, dispatched: true });
      } else {
        const message = errorMessage(transportError);
        const failedEvidence = (transportError as { evidence?: OutboxTransportEvidence })?.evidence;
        const requestHash = failedEvidence?.requestBytes
          ? createHash('sha256').update(failedEvidence.requestBytes).digest('hex')
          : null;
        const responseHash = failedEvidence?.responseBytes
          ? createHash('sha256').update(failedEvidence.responseBytes).digest('hex')
          : null;
        const next = this.backoffPolicy.nextAttemptAt(claim.attempts, new Date());
        try {
          const projectionChanged = await this.database.tx(
            async (trx) => {
              const delivery = await executeTypedQuery(trx, markDeliveryFailed,
                [tenantId, claim.event_id, next, message, claim.attempts],
              );
              await executeTypedQuery(trx, persistFailedAttempt,
                [
                  tenantId,
                  claim.event_id,
                  claim.attempts,
                  message,
                  failedEvidence?.provider ?? null,
                  failedEvidence?.protocol ?? null,
                  failedEvidence?.requestBytes ?? null,
                  requestHash,
                  failedEvidence?.responseBytes ?? null,
                  responseHash,
                  failedEvidence?.requestHeaders
                    ? JSON.stringify(failedEvidence.requestHeaders)
                    : null,
                  failedEvidence?.responseStatus ?? null,
                  transportEvidenceState(failedEvidence),
                ],
              );
              return delivery.length > 0;
            },
            { role: 'app', requireActor: true, retry: false },
          );
          outcomes.push({
            row: projectionChanged
              ? { ...row, status: 'ERROR', lastError: message, nextAttemptAt: next.toISOString() }
              : row,
            dispatched: false,
            error: message,
          });
        } catch (persistenceError) {
          outcomes.push({
            row,
            dispatched: false,
            reconciliationRequired: true,
            error: `Send failed: ${message}; attempt persistence unresolved: ${errorMessage(persistenceError)}`,
          });
        }
      }
    }
    return outcomes;
  }

  private requestTenant(): string {
    const tenantId = this.database.currentTenantId();
    if (!tenantId) throw new OutboxNotFoundError({ reason: 'missing-tenant-context' });
    return tenantId;
  }

  /** Read-only, actor-bearing stynx_app transaction; nested calls join the caller's transaction. */
  private tenantRead<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    return this.database.tx(fn, { role: 'app', readonly: true, requireActor: true, retry: false });
  }

  private async deliveriesForEvent(trx: Transaction, tenantId: string, eventId: string): Promise<OutboxEventDelivery[]> {
    const rows = await executeTypedQuery(trx, eventDeliveryRows, [tenantId, eventId]);
    return rows.map((row) => ({ ...eventSummary(row), delivery: deliveryState(row)! }));
  }

  /**
   * Lists the context tenant's events with their delivery state, newest first
   * (`createdAt desc, id desc`), filtered by delivery status and `entity`.
   */
  async listEvents(query: OutboxEventListQuery = {}): Promise<OutboxEventListPage> {
    const tenantId = this.requestTenant();
    const limit = query.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new RangeError('limit must be an integer from 1 to 500');
    const rawStatus: unknown = query.deliveryStatus;
    const statuses: unknown[] | null =
      rawStatus === undefined
        ? null
        : typeof rawStatus === 'string'
          ? [rawStatus]
          : Array.isArray(rawStatus)
            ? [...rawStatus]
            : [];
    if (
      statuses &&
      (statuses.length === 0 ||
        statuses.some((status) => !DELIVERY_STATUSES.includes(status as OutboxEventDeliveryStatus)))
    ) {
      throw new RangeError('deliveryStatus must name event delivery states');
    }
    const entity = filterText(query.entity, 'entity');
    const entityPrefix = filterText(query.entityPrefix, 'entityPrefix');
    const cursor = query.cursor ?? null;
    if (
      cursor &&
      (!(cursor.createdAt instanceof Date) ||
        Number.isNaN(cursor.createdAt.getTime()) ||
        !EVENT_UUID.test(cursor.id))
    ) {
      throw new RangeError('cursor must be a listEvents nextCursor');
    }
    const rows = await this.tenantRead(
      async (trx) =>
        (
          await executeTypedQuery(trx, listEventRows, [
              tenantId,
              statuses,
              entity,
              entityPrefix,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              limit + 1,
            ])
        ),
    );
    const items = rows
      .slice(0, limit)
      .map((row) => ({ ...eventSummary(row), delivery: deliveryState(row) }));
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  /** Delivery of one event in the context tenant; `null` when absent, foreign or without delivery. */
  async getEventDelivery(eventId: string): Promise<OutboxEventDelivery | null> {
    const tenantId = this.requestTenant();
    if (!EVENT_UUID.test(eventId)) return null;
    const rows = await this.tenantRead((trx) =>
      this.deliveriesForEvent(trx, tenantId, eventId),
    );
    return rows[0] ?? null;
  }

  /** Delivery state of one aggregate in the context tenant; `null` when it has no delivery row. */
  async getAggregateDelivery(
    entity: string,
    entityId: string,
    options: { limit?: number } = {},
  ): Promise<OutboxAggregateDelivery | null> {
    const tenantId = this.requestTenant();
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('limit must be an integer from 1 to 1000');
    // One statement, so counts, head and page come from a single snapshot even
    // inside a caller's READ COMMITTED transaction.
    const rows = await this.tenantRead(
      async (trx) =>
        (
          await executeTypedQuery(trx, aggregateEventRows, [tenantId, entity, entityId, limit])
        ),
    );
    if (rows.length === 0) return null;
    const view = (row: EventDeliverySqlRow): OutboxEventDelivery => ({
      ...eventSummary(row),
      delivery: deliveryState(row)!,
    });
    // The oldest outstanding delivery is first in its own status partition, so it is always selected.
    const head = rows.find((row) => row.status !== 'ACKED' && row.status !== 'RETIRED');
    return {
      entity,
      entityId,
      head: head ? view(head) : null,
      counts: statusCounts(
        rows
          .filter((row) => row.statusRank === 1)
          .map((row) => ({ status: row.status!, count: row.statusCount })),
      ),
      events: rows.filter((row) => row.position <= limit).map(view),
    };
  }

  /** Attempt ledger of one context-tenant event by ordinal; empty when absent or foreign. */
  async listEventAttempts(
    eventId: string,
    options: { includeBytes?: boolean } = {},
  ): Promise<OutboxEventAttempt[]> {
    const tenantId = this.requestTenant();
    if (!EVENT_UUID.test(eventId)) return [];
    const bytes = options.includeBytes === true;
    const result = await this.tenantRead((trx) =>
      executeTypedQuery(trx, bytes ? eventAttemptRowsWithBytes : eventAttemptRows, [tenantId, eventId]),
    );
    return [...result];
  }

  /** Delivery counts by status for the context tenant, optionally per `entity` or per named destination. */
  async getQueueHealth(query: OutboxQueueHealthQuery = {}): Promise<OutboxQueueHealth> {
    const tenantId = this.requestTenant();
    const entity = filterText(query.entity, 'entity');
    const entityPrefix = filterText(query.entityPrefix, 'entityPrefix');
    const only =
      query.destination === undefined
        ? null
        : this.destination(query.destination, 'destination').matcher;
    const result = await this.tenantRead((trx) =>
      (only ? executeTypedQuery(trx, queueHealthRowsFiltered, [tenantId, entity, entityPrefix, only.entities, only.prefixes]) : executeTypedQuery(trx, queueHealthRows, [tenantId, entity, entityPrefix])),
    );
    const oldest =
      result
        .map((row) => row.oldest)
        .filter((value): value is OutboxTimestampResult => value !== null)
        .sort((left, right) => resultTimestampTime(left, 'left') - resultTimestampTime(right, 'right'))[0] ?? null;
    return {
      tenantId,
      total: result.reduce((sum, row) => sum + row.count, 0),
      byStatus: statusCounts(result),
      oldestUnackedCreatedAt: oldest,
    };
  }

  /**
   * Operator retry of one context-tenant event whose delivery is `ERROR`: it
   * becomes `PENDING` and eligible now (`immediate`) or at the earlier of its
   * current eligibility and the backoff time, so a retry never delays it.
   * `attempts`, `last_error` and the attempt/ACK ledgers are preserved.
   */
  async retryEvent(
    eventId: string,
    options: { immediate?: boolean } = {},
  ): Promise<OutboxEventDelivery> {
    const tenantId = this.requestTenant();
    if (!EVENT_UUID.test(eventId)) throw new OutboxNotFoundError({ eventId });
    return this.database.tx(
      async (trx) => {
        // The row lock serializes with a claim; a claimed row is SENT and refused.
        const current = await executeTypedQuery(trx, lockRetryDelivery,
          [tenantId, eventId],
        );
        const row = current[0];
        if (!row) throw new OutboxNotFoundError({ eventId });
        if (row.status !== 'ERROR')
          throw new OutboxEventNotFailedError({ eventId, status: row.status });
        const nextAttemptAt = options.immediate
          ? null
          : this.backoffPolicy.nextAttemptAt(row.attempts, new Date());
        const updated = await executeTypedQuery(trx, retryDelivery,
          [tenantId, eventId, nextAttemptAt],
        );
        if (!updated[0]) throw new OutboxEventNotFailedError({ eventId });
        const [delivery] = await this.deliveriesForEvent(trx, tenantId, eventId);
        return delivery!;
      },
      { role: 'app', requireActor: true, retry: false },
    );
  }

  /** Immutable operator disposition of a context-tenant delivery. */
  async retireEvent(
    eventId: string,
    input: OutboxEventRetirementInput,
  ): Promise<OutboxEventRetirementResult> {
    const tenantId = this.requestTenant();
    if (
      typeof eventId !== 'string' ||
      !EVENT_UUID.test(eventId) ||
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== 'idempotencyKey' && key !== 'reason') ||
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.length === 0 ||
      Buffer.byteLength(input.idempotencyKey, 'utf8') > 255 ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length === 0 ||
      Buffer.byteLength(input.reason, 'utf8') > 2048 ||
      input.idempotencyKey.includes('\0') ||
      input.reason.includes('\0') ||
      Buffer.from(input.idempotencyKey, 'utf8').toString('utf8') !== input.idempotencyKey ||
      Buffer.from(input.reason, 'utf8').toString('utf8') !== input.reason
    )
      throw new OutboxRetirementInputError();
    const canonicalEventId = eventId.toLowerCase();
    try {
      return await this.database.tx(
        async (trx) => {
          // Lock first: ACKs, claims and all retirements serialize on this row.
          const locked = await executeTypedQuery(trx, lockRetirementDelivery,
            [tenantId, canonicalEventId],
          );
          const current = locked[0];
          if (!current) throw new OutboxNotFoundError({ eventId });
          const existing = await trx.runGuarded(findRetirementReceipt,
            [tenantId, canonicalEventId, input.idempotencyKey], isRetirementResult);
          if (existing.length > 0) {
            const receipt = existing[0]!;
            if (
              existing.length === 1 &&
              receipt.eventId === canonicalEventId &&
              receipt.idempotencyKey === input.idempotencyKey &&
              receipt.actorId === current.actorId &&
              receipt.reason === input.reason
            )
              return receipt;
            throw new OutboxRetirementConflictError(
              existing.some((row) => row.idempotencyKey === input.idempotencyKey)
                ? 'operation-conflict'
                : 'already-retired',
            );
          }
          if (current.status === 'ACKED') throw new OutboxRetirementConflictError('already-acked');
          if (current.status === 'RETIRED')
            throw new OutboxRetirementConflictError('already-retired');
          // Sample the database clock after acquiring the lock, including when
          // another transaction held the row long enough for a lease to expire.
          if (current.leaseUntil) {
            const lease = await executeTypedQuery(trx, checkRetirementLease,
              [current.leaseUntil],
            );
            if (lease[0]?.active) throw new OutboxRetirementConflictError('active-lease');
          }
          const inserted = await trx.runGuarded(insertRetirementReceipt,
            [tenantId, canonicalEventId, input.idempotencyKey, input.reason, current.status], isRetirementResult);
          await executeTypedQuery(trx, markEventRetired,
            [tenantId, canonicalEventId],
          );
          return inserted[0]!;
        },
        { role: 'app', requireActor: true, retry: false },
      );
    } catch (error) {
      // Different events can race for the same tenant operation key. The unique
      // constraint arbitrates without exposing the other event's receipt.
      if (isUniqueViolation(error)) throw new OutboxRetirementConflictError('operation-conflict');
      throw error;
    }
  }

  /** A foreign, missing, malformed or never-retired event has no visible receipt. */
  async getEventRetirement(eventId: string): Promise<OutboxEventRetirementResult | null> {
    const tenantId = this.requestTenant();
    if (typeof eventId !== 'string' || !EVENT_UUID.test(eventId)) return null;
    const result = await this.tenantRead((trx) =>
      trx.runGuarded(getRetirementReceipt,
        [tenantId, eventId], isRetirementResult),
    );
    return result[0] ?? null;
  }

  async ackEvent(input: OutboxEventAckInput): Promise<void> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    if (
      !input.tenantId ||
      !uuid.test(input.tenantId) ||
      (input.eventId && !uuid.test(input.eventId)) ||
      (!input.eventId && !input.idempotencyKey) ||
      (input.eventId && input.idempotencyKey)
    ) {
      await this.recordUnboundAck(input.rawBody, 'missing-or-ambiguous-event-identity');
      throw new OutboxNotFoundError({ reason: 'missing-or-ambiguous-event-identity' });
    }
    const found = await this.database.withSystemContext('outbox event ack lookup', () =>
      this.database.tx(
        async (trx) => {
          const rows = await executeTypedQuery(trx, lookupAckEvent,
            [input.tenantId, input.eventId ?? null, input.idempotencyKey ?? null],
          );
          return rows[0]?.id;
        },
        { role: 'owner', readonly: true, retry: false },
      ),
    );
    if (!found || input.hmacVerified !== true) {
      await this.recordUnboundAck(input.rawBody, found ? 'invalid-hmac' : 'unknown-event');
      throw new OutboxNotFoundError({
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
      });
    }
    const hash = createHash('sha256').update(input.rawBody).digest('hex');
    await this.ownerRetry('outbox event ack', async (trx) => {
      const delivery = await executeTypedQuery(trx, lockAckDelivery,
        [input.tenantId, found],
      );
      if (!delivery[0]) throw new OutboxNotFoundError({ eventId: found });
      const nextAttemptAt =
        input.status === 'ERROR'
          ? this.backoffPolicy.nextAttemptAt(delivery[0].attempts, new Date())
          : null;
      await executeTypedQuery(trx, applyTenantAck,
        [input.tenantId, found, input.status, nextAttemptAt],
      );
      await executeTypedQuery(trx, recordTenantAck,
        [input.tenantId, found, input.status, input.rawBody, hash],
      );
    });
  }

  /**
   * Trusted scheduler sweep over every tenant. With `filter`, only deliveries whose event
   * `entity` matches are claimed, so each destination can be drained by its own job; a
   * destination name stands for its selector.
   */
  async dispatchEventsDue(
    limit: number = this.dispatchBatchSize,
    filter?: OutboxDispatchFilter,
  ): Promise<OutboxDispatchOutcome[]> {
    const only = this.dispatchMatcher(filter);
    const claimed = await this.ownerRetry('outbox event claim', async (trx) => {
      const result = await (only ? executeTypedQuery(trx, claimOwnerEventsFiltered, [limit, this.options.eventLeaseMs ?? 300_000, only.entities, only.prefixes]) : executeTypedQuery(trx, claimOwnerEvents, [limit, this.options.eventLeaseMs ?? 300_000]));
      for (const row of result) {
        await executeTypedQuery(trx, recordOwnerClaimedAttempt,
          [row.tenant_id, row.event_id, row.attempts],
        );
      }
      return result;
    });
    const outcomes: OutboxDispatchOutcome[] = [];
    for (const claim of claimed) {
      const row: OutboxRow = {
        id: claim.event_id,
        tenantId: claim.tenant_id,
        entity: claim.entity,
        entityId: claim.entity_id,
        idempotencyKey: claim.idempotency_key,
        payload: claim.payload,
        metadata: claim.metadata,
        status: 'SENT',
        attempts: claim.attempts,
        lastError: null,
        ackTime: null,
        nextAttemptAt: null,
        createdAt: resultTimestampIso(claim.created_at, 'claim.created_at'),
        updatedAt: new Date().toISOString(),
      };
      const port = this.portFor(claim.entity);
      if (!port) {
        outcomes.push({ row, dispatched: false });
        continue;
      }
      let evidence: OutboxTransportEvidence | undefined;
      let transportError: unknown;
      let transportFailed = false;
      try {
        evidence = port.sendEvent
          ? await port.sendEvent(row)
          : (await port.send(row), {} as OutboxTransportEvidence);
      } catch (error) {
        transportFailed = true;
        transportError = error;
      }
      if (!transportFailed) {
        // Persistence can fail after the provider accepted the request. Never
        // turn that into a transport failure or schedule another send here.
        const sentEvidence = evidence ?? {};
        const requestHash = sentEvidence.requestBytes
          ? createHash('sha256').update(sentEvidence.requestBytes).digest('hex')
          : null;
        const responseHash = sentEvidence.responseBytes
          ? createHash('sha256').update(sentEvidence.responseBytes).digest('hex')
          : null;
        try {
          await this.ownerRetry('outbox event sent', async (trx) => {
            await executeTypedQuery(trx, extendOwnerLease,
              [
                claim.tenant_id,
                claim.event_id,
                claim.attempts,
                this.options.eventLeaseMs ?? 300_000,
              ],
            );
            await executeTypedQuery(trx, persistOwnerSent,
              [
                claim.tenant_id,
                claim.event_id,
                claim.attempts,
                sentEvidence.provider ?? null,
                sentEvidence.protocol ?? null,
                sentEvidence.requestBytes ?? null,
                requestHash,
                sentEvidence.responseBytes ?? null,
                responseHash,
                sentEvidence.requestHeaders ? JSON.stringify(sentEvidence.requestHeaders) : null,
                sentEvidence.responseStatus ?? null,
                transportEvidenceState(sentEvidence),
              ],
            );
          });
        } catch (persistenceError) {
          outcomes.push({
            row,
            dispatched: true,
            reconciliationRequired: true,
            error: `Send succeeded; attempt persistence unresolved: ${errorMessage(persistenceError)}`,
          });
          continue;
        }
        outcomes.push({ row, dispatched: true });
      } else {
        const error = transportError;
        const message = errorMessage(error);
        const evidence = (error as { evidence?: OutboxTransportEvidence })?.evidence;
        const requestHash = evidence?.requestBytes
          ? createHash('sha256').update(evidence.requestBytes).digest('hex')
          : null;
        const responseHash = evidence?.responseBytes
          ? createHash('sha256').update(evidence.responseBytes).digest('hex')
          : null;
        const next = this.backoffPolicy.nextAttemptAt(claim.attempts, new Date());
        let projectionChanged: boolean;
        try {
          projectionChanged = await this.ownerRetry('outbox event failure', async (trx) => {
            const delivery = await executeTypedQuery(trx, markOwnerDeliveryFailed,
              [claim.tenant_id, claim.event_id, next, message, claim.attempts],
            );
            await executeTypedQuery(trx, persistOwnerFailedAttempt,
              [
                claim.tenant_id,
                claim.event_id,
                claim.attempts,
                message,
                evidence?.provider ?? null,
                evidence?.protocol ?? null,
                evidence?.requestBytes ?? null,
                requestHash,
                evidence?.responseBytes ?? null,
                responseHash,
                evidence?.requestHeaders ? JSON.stringify(evidence.requestHeaders) : null,
                evidence?.responseStatus ?? null,
                transportEvidenceState(evidence),
              ],
            );
            return delivery.length > 0;
          });
        } catch (persistenceError) {
          outcomes.push({
            row,
            dispatched: false,
            reconciliationRequired: true,
            error: `Send failed: ${message}; attempt persistence unresolved: ${errorMessage(persistenceError)}`,
          });
          continue;
        }
        // A late attempt still owns its ledger row, but no longer owns the
        // delivery projection after a reclaim or ACK.
        outcomes.push({
          row: projectionChanged
            ? { ...row, status: 'ERROR', lastError: message, nextAttemptAt: next.toISOString() }
            : row,
          dispatched: false,
          error: message,
        });
      }
    }
    return outcomes;
  }

  constructor(
    private readonly database: Database,
    @Inject(STYNX_OUTBOX_OPTIONS)
    private readonly options: OutboxModuleOptions,
    @Optional()
    @Inject(STYNX_OUTBOX_DISPATCHER)
    private readonly dispatcher?: OutboxDispatcherPort,
    @Optional()
    @Inject(STYNX_OUTBOX_BACKOFF_POLICY)
    injectedBackoffPolicy?: OutboxBackoffPolicy,
    @Optional()
    @Inject(STYNX_OUTBOX_METRICS)
    private readonly metrics?: OutboxMetricsSink,
    @Optional()
    @Inject(STYNX_OUTBOX_DESTINATIONS)
    injectedDestinations?: readonly OutboxDestination[],
  ) {
    positiveMilliseconds(options.eventLeaseMs, 'eventLeaseMs');
    positiveMilliseconds(options.lockTimeoutMs, 'lockTimeoutMs');
    positiveMilliseconds(options.failurePersistenceDeadlineMs, 'failurePersistenceDeadlineMs');
    this.table = assertQualifiedIdentifier(options.table ?? DEFAULT_OUTBOX_TABLE, 'table');
    this.ackTable = assertQualifiedIdentifier(
      options.ackTable ?? DEFAULT_OUTBOX_ACK_TABLE,
      'ackTable',
    );
    this.dispatchBatchSize = options.dispatchBatchSize ?? DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE;
    this.backoffPolicy =
      injectedBackoffPolicy ?? options.backoffPolicy ?? new FixedIntervalBackoffPolicy();
    this.dispatchable = entityMatcher(options.dispatchableEntities, 'dispatchableEntities', true);
    this.destinations = destinationRegistry(
      injectedDestinations ?? options.destinations,
      this.dispatchable,
    );
  }

  /**
   * Enqueues (or, for a repeat call against the same `(entity, entityId)`,
   * touches) an outbox row inside the caller's own transaction. Tenant is
   * read from the active `app.tenant_id` session GUC — the same value RLS
   * itself checks — so the row can never be enqueued under a tenant the
   * transaction isn't already scoped to.
   */
  async enqueue(trx: OutboxSqlExecutor, envelope: OutboxEnvelope): Promise<OutboxRow> {
    const idempotencyKey = envelope.idempotencyKey ?? `${envelope.entity}:${envelope.entityId}`;
    try {
      const result = await executeConfiguredQuery(trx, 'outbox.legacy-enqueue', { table: this.table, ackTable: this.ackTable }, [
          envelope.entity,
          envelope.entityId,
          JSON.stringify(envelope.payload ?? {}),
          envelope.metadata ? JSON.stringify(envelope.metadata) : null,
          idempotencyKey,
        ]);
      const row = toRows(result)[0];
      if (!row) {
        if (this.platformLegacyTable) throw new OutboxLegacyCutoverError();
        throw new OutboxNotFoundError({ entity: envelope.entity, entityId: envelope.entityId });
      }
      this.metrics?.incrementEnqueued(envelope.entity);
      return row;
    } catch (error) {
      // The (tenant_id, entity, entity_id) conflict is absorbed by the
      // upsert above; only a *different* entity reusing an explicit
      // `idempotencyKey` can still violate the (tenant_id, idempotency_key)
      // unique constraint. Surface that as a typed conflict.
      if (isUniqueViolation(error)) {
        throw new OutboxAlreadyEnqueuedError({
          entity: envelope.entity,
          entityId: envelope.entityId,
          idempotencyKey,
        });
      }
      throw this.mapOwnershipError(error);
    }
  }

  /** Reads one row by `(entity, entityId)`, scoped to the caller's active tenant via RLS. */
  async getOne(entity: string, entityId: string): Promise<OutboxRow> {
    return this.database.tx(
      async (trx) => {
        const result = await executeConfiguredQuery(trx, 'outbox.legacy-get-one', { table: this.table, ackTable: this.ackTable }, [entity, entityId]);
        const row = toRows(result)[0];
        if (!row) {
          throw new OutboxNotFoundError({ entity, entityId });
        }
        return row;
      },
      { role: 'reader', readonly: true },
    );
  }

  /**
   * Claims up to `limit` due rows (`PENDING`/`ERROR` whose `next_attempt_at`
   * has passed) via `FOR UPDATE SKIP LOCKED`, marks them `SENT`, and — when a
   * dispatcher port is configured — hands each one to it. A dispatch failure
   * reverts that row to `ERROR` and schedules its next attempt through the
   * configured `OutboxBackoffPolicy`; it does not affect the other claimed
   * rows. Claiming spans all tenants (system context, `owner` role) so one
   * scheduler sweep drains the whole platform, matching the E3 "per-(tenant,
   * aggregate) ordering" spec note — rows are claimed oldest-`created_at`
   * first within that global sweep.
   *
   * With no dispatcher configured, this behaves exactly like pec's
   * `dispatchDue`: it claims and marks `SENT` without sending anything,
   * leaving actual delivery to the caller (or a future ack). Exposed as a
   * plain injectable method so `@stynx-nyx/jobs` or an app-level poller can
   * drive it on an interval — this package has no dependency on a job
   * runner.
   */
  async dispatchDue(limit: number = this.dispatchBatchSize): Promise<OutboxDispatchOutcome[]> {
    const claimed = await this.claimDue(limit).catch((error: unknown) => {
      throw this.mapOwnershipError(error);
    });
    if (claimed.length === 0) {
      return [];
    }
    if (!this.dispatcher) {
      return claimed.map((row) => ({ row, dispatched: false }));
    }

    const outcomes: OutboxDispatchOutcome[] = [];
    for (const row of claimed) {
      try {
        await this.dispatcher.send(row);
        this.metrics?.incrementDispatched(row.entity, 'sent');
        outcomes.push({ row, dispatched: true });
      } catch (error) {
        const message = errorMessage(error);
        let updated: OutboxRow;
        try {
          updated = await this.recordDispatchFailure(row, message);
        } catch (persistenceError) {
          if (
            !(persistenceError instanceof OutboxOwnershipContentionError) &&
            !retryableSqlCode(persistenceError) &&
            !(!this.platformLegacyTable && persistenceError instanceof OutboxNotFoundError)
          )
            throw persistenceError;
          outcomes.push({
            row,
            dispatched: false,
            reconciliationRequired: true,
            error: `Send failed: ${message}; persistence unresolved: ${errorMessage(persistenceError)}`,
          });
          continue;
        }
        this.metrics?.incrementDispatched(row.entity, 'error');
        outcomes.push({ row: updated, dispatched: false, error: message });
      }
    }
    return outcomes;
  }

  private async claimDue(limit: number): Promise<OutboxRow[]> {
    return this.database.withSystemContext('outbox claim', () =>
      this.database.tx(
        async (trx) => {
          const result = await executeConfiguredQuery(trx, 'outbox.legacy-claim-due', { table: this.table, ackTable: this.ackTable }, [limit]);
          return toRows(result);
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  private async recordDispatchFailure(row: OutboxRow, message: string): Promise<OutboxRow> {
    const nextAttemptAt = this.backoffPolicy.nextAttemptAt(row.attempts, new Date());
    const deadline = Date.now() + (this.options.failurePersistenceDeadlineMs ?? 5_000);
    const persist = () =>
      this.database.withSystemContext('outbox dispatch failure', () =>
        this.database.tx(
          async (trx) => {
            const result = await executeConfiguredQuery(trx, 'outbox.legacy-fail', { table: this.table, ackTable: this.ackTable }, [row.id, message.slice(0, 4000), nextAttemptAt]);
            let updated = toRows(result)[0];
            if (!updated) {
              const terminal = await executeConfiguredQuery(trx, 'outbox.legacy-acked-row', { table: this.table, ackTable: this.ackTable }, [row.id]);
              updated = terminal?.rows?.[0];
            }
            if (!updated) {
              throw new OutboxNotFoundError({ id: row.id });
            }
            if (this.platformLegacyTable) {
              const link = await executeTypedQuery(trx, readLegacyEventLink,
                [row.id],
              );
              const migration = link?.[0];
              if (migration?.migrated_event_id) {
                await executeTypedQuery(trx, recordLegacyFailedAttempt,
                  [migration.tenant_id, migration.migrated_event_id, row.attempts, row.id, message],
                );
                await executeTypedQuery(trx, markLegacyDeliveryFailed,
                  [migration.tenant_id, migration.migrated_event_id, nextAttemptAt, message],
                );
              }
            }
            return updated;
          },
          // A short per-lock timeout yields retryable 55P03 while the separate
          // wall-clock deadline limits how long this row can occupy a sweep.
          {
            role: 'owner',
            readonly: false,
            retry: false,
            lockTimeoutMs: Math.min(this.options.lockTimeoutMs ?? 250, 250),
          },
        ),
      );
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await persist();
      } catch (error) {
        if (!retryableSqlCode(error) || Date.now() >= deadline) {
          throw this.mapOwnershipError(error);
        }
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(Math.max(1, deadline - Date.now()), 250, 20 * 2 ** Math.min(attempt, 4)),
          ),
        );
      }
    }
  }

  /**
   * Manually resets a row to `PENDING` for redelivery — an operator action,
   * distinct from the automatic retry `dispatchDue()` performs on a
   * dispatcher failure. `immediate: true` makes it eligible right away;
   * otherwise the next attempt is scheduled through the backoff policy.
   */
  async retry(id: string, options: { immediate?: boolean } = {}): Promise<OutboxRow> {
    return this.database
      .withSystemContext('outbox retry', () =>
        this.database.tx(
          async (trx) => {
            const current = await executeConfiguredQuery(
              trx,
              'outbox.legacy-retry-state',
              { table: this.table, ackTable: this.ackTable },
              [id],
            );
            const currentRow = toRows(current)[0];
            if (!currentRow) {
              throw new OutboxNotFoundError({ id });
            }
            if (currentRow.migrated_event_id) throw new OutboxLegacyCutoverError();
            const attempts = currentRow.attempts + 1;
            const nextAttemptAt = options.immediate
              ? new Date()
              : this.backoffPolicy.nextAttemptAt(attempts, new Date());
            const result = await executeConfiguredQuery(trx, 'outbox.legacy-retry', { table: this.table, ackTable: this.ackTable }, [id, attempts, nextAttemptAt]);
            const updated = toRows(result)[0];
            if (!updated) {
              throw new OutboxNotFoundError({ id });
            }
            return updated;
          },
          { role: 'owner', readonly: false },
        ),
      )
      .catch((error: unknown) => {
        throw this.mapOwnershipError(error);
      });
  }

  /**
   * Records an inbound ACK (positive or negative) for a message, keyed by
   * `(entity, entityId)` — the shape the external system's webhook body
   * naturally carries. Runs under system context / `owner` role because an
   * inbound webhook has no authenticated tenant context of its own (verify
   * `verifyOutboxAckSignature()` against the raw body before calling this).
   *
   * `(entity, entityId)` alone is only unique when the external system's
   * identifier space is; when it isn't, pass `tenantId` (e.g. echoed back by
   * the external system as a correlation field) to disambiguate. Two or more
   * tenants matching without a supplied `tenantId` raises
   * `OutboxAmbiguousAckError` rather than guessing.
   */
  async ack(input: OutboxAckInput): Promise<OutboxRow> {
    return this.database
      .withSystemContext('outbox ack', () =>
        this.database.tx(
          async (trx) => {
            const target = await this.resolveAckTarget(trx, input);
            const nextAttemptAt =
              input.status === 'ERROR'
                ? this.backoffPolicy.nextAttemptAt(target.attempts, new Date())
                : null;
            const result = await executeConfiguredQuery(trx, 'outbox.legacy-ack', { table: this.table, ackTable: this.ackTable }, [target.id, input.status, input.detail ?? null, nextAttemptAt]);
            const row = toRows(result)[0];
            if (!row) {
              throw new OutboxNotFoundError({ entity: input.entity, entityId: input.entityId });
            }
            try {
              await executeConfiguredQuery(trx, 'outbox.legacy-record-ack', { table: this.ackTable },
                [row.tenantId, row.id, input.status, input.detail ?? null],
              );
            } catch (error) {
              if (!isUniqueViolation(error)) {
                throw error;
              }
            }
            if (target.migratedEventId) {
              await executeTypedQuery(trx, recordLegacyAssertedAck,
                [row.tenantId, target.migratedEventId, input.status],
              );
              await executeTypedQuery(trx, applyLegacyAck,
                [row.tenantId, target.migratedEventId, input.status, nextAttemptAt],
              );
            }
            this.metrics?.incrementAcked(row.entity, input.status === 'ACKED' ? 'acked' : 'error');
            return row;
          },
          { role: 'owner', readonly: false },
        ),
      )
      .catch((error: unknown) => {
        throw this.mapOwnershipError(error);
      });
  }

  private async resolveAckTarget(
    trx: OutboxSqlExecutor,
    input: OutboxAckInput,
  ): Promise<{ id: string; tenantId: string; migratedEventId: string | null; attempts: number }> {
    const params: [string, string] | [string, string, string] = input.tenantId
      ? [input.entity, input.entityId, input.tenantId]
      : [input.entity, input.entityId];
    const result = await executeConfiguredQuery(
      trx,
      'outbox.legacy-ack-target',
      { table: this.table, ackTable: this.ackTable, tenant: Boolean(input.tenantId) },
      params,
    );
    const rows = toRows(result);
    if (rows.length === 0) {
      throw new OutboxNotFoundError({ entity: input.entity, entityId: input.entityId });
    }
    const [first] = rows;
    if (rows.length > 1 || !first) {
      throw new OutboxAmbiguousAckError({
        entity: input.entity,
        entityId: input.entityId,
        matches: rows.length,
      });
    }
    return first;
  }
}
