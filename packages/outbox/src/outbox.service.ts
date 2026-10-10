import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import {
  AuditChainKeyMismatchError,
  Database,
  IndependentTransactionConnectionError,
} from '@stynx-nyx/data';
import { createHash } from 'node:crypto';
import type { Transaction } from '@stynx-nyx/data';
import { FixedIntervalBackoffPolicy } from './backoff';
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
} from './constants';
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
} from './errors';
import {
  assertQualifiedIdentifier,
  errorMessage,
  isUniqueViolation,
  outboxColumns,
  toRows,
} from './row-mapper';
import type {
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
} from './types';

const EVENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DELIVERY_STATUSES: readonly OutboxEventDeliveryStatus[] = [
  'PENDING',
  'SENT',
  'SENT_UNRESOLVED',
  'ERROR',
  'ACKED',
];
const EVENT_DELIVERY_COLUMNS = `e.id,e.tenant_id as "tenantId",e.entity,e.entity_id as "entityId",
  e.idempotency_key as "idempotencyKey",e.metadata,e.created_at as "createdAt",d.status,d.attempts,
  d.last_error as "lastError",d.next_attempt_at as "nextAttemptAt",d.lease_until as "leaseUntil",d.updated_at as "updatedAt"`;
type EventDeliverySqlRow = OutboxEventSummary & {
  status: OutboxEventDeliveryStatus | null;
  attempts: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  leaseUntil: Date | null;
  updatedAt: Date | null;
};

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
function entityFilterSql(first: number): string {
  return `and (e.entity=any($${first}::text[]) or exists (
                select 1 from unnest($${first + 1}::text[]) as prefix(value)
                 where left(e.entity,length(prefix.value))=prefix.value))`;
}

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
  private get ownershipCte(): string {
    return this.platformLegacyTable
      ? `with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)`
      : '';
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
      const marker = await trx.query<{ state: 'LEGACY' | 'NEW' }>(
        `select state from outbox.legacy_ownership where id = true for share ${nowait ? 'nowait' : ''}`,
      );
      if (!marker.rows[0]) throw new OutboxOwnershipContentionError();
      return marker.rows[0].state;
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
          const result = await trx.query<{
            relation: string;
            owner: string;
            owns: boolean | null;
            member: boolean | null;
          }>(
            `select c.relname as relation, o.rolname::text as owner,
                  (a.oid = c.relowner) as owns,
                  pg_catalog.pg_has_role(a.oid, c.relowner, 'MEMBER') as member
             from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             join pg_catalog.pg_roles o on o.oid = c.relowner
             left join pg_catalog.pg_roles a on a.rolname = $1
            where n.nspname = 'outbox' and c.relname = any($2::text[])
            order by c.relname`,
            [role, [...OUTBOX_APP_ROLE_CHECKED_RELATIONS]],
          );
          return result.rows;
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
    const state = await trx.query<{
      tenant_id: string | null;
      role: string | null;
      sql_role: string;
      isolation: string;
      read_only: string;
      recovery: boolean;
    }>(
      `select nullif(current_setting('app.tenant_id',true),'')::uuid::text as tenant_id,
              current_setting('app.role',true) as role,
              current_user as sql_role,
              current_setting('transaction_isolation') as isolation,
              current_setting('transaction_read_only') as read_only,
              pg_is_in_recovery() as recovery`,
    );
    const live = state.rows[0];
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
    const previousLockTimeout = await trx.query<{ value: string }>(
      `select current_setting('lock_timeout') as value`,
    );
    await trx.query(`select set_config('lock_timeout',$1,true)`, [
      String(this.options.lockTimeoutMs ?? 5_000),
    ]);
    const tenantId = live.tenant_id;
    let ms!: string;
    let restoreError: unknown;
    try {
      const priorKey = await trx.query<{ key: string | null }>(
        `select nullif(current_setting('stynx.audit_chain_key',true),'') as key`,
      );
      await this.ownership(trx, Boolean(priorKey.rows[0]?.key));
      if (priorKey.rows[0]?.key && priorKey.rows[0]?.key !== tenantId) {
        throw new AuditChainKeyMismatchError();
      }
      await trx.query(`select set_config('stynx.audit_chain_key',$1,true)`, [tenantId]);
      await trx.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [tenantId]);
      const clock = await trx.query<{ last_ms: string }>(
        `insert into outbox.tenant_clock (tenant_id,last_ms)
         values ($1,greatest(0,floor(extract(epoch from clock_timestamp()) * 1000)::bigint))
         on conflict (tenant_id) do update
           set last_ms = greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
         returning last_ms::text`,
        [tenantId],
      );
      ms = clock.rows[0]!.last_ms;
    } finally {
      // A JS validation error leaves the caller's transaction usable. If SQL
      // aborted it, preserve that original error instead of masking it with
      // the expected 25P02 from restoration.
      try {
        await trx.query(`select set_config('lock_timeout',$1,true)`, [
          previousLockTimeout.rows[0]!.value,
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
      const inserted = await trx.query<OutboxEventRow>(
        `insert into outbox.events
           (id,tenant_id,entity,entity_id,idempotency_key,payload,metadata,created_at)
         values (outbox.event_uuid($1::bigint,nextval('outbox.event_order_seq')), $2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,to_timestamp($1::double precision/1000))
         on conflict (tenant_id,idempotency_key) do nothing
         returning id,tenant_id as "tenantId",entity,entity_id as "entityId",idempotency_key as "idempotencyKey",payload,metadata,created_at as "createdAt"`,
        [
          ms,
          tenantId,
          event.entity,
          event.entityId,
          event.idempotencyKey,
          JSON.stringify(event.payload),
          event.metadata ? JSON.stringify(event.metadata) : null,
        ],
      );
      let row = inserted.rows[0];
      if (!row) {
        const previous = await trx.query<OutboxEventRow>(
          `select id,tenant_id as "tenantId",entity,entity_id as "entityId",idempotency_key as "idempotencyKey",payload,metadata,created_at as "createdAt"
             from outbox.events where tenant_id=$1::uuid and idempotency_key=$2
               and entity=$3 and entity_id=$4 and payload=$5::jsonb
               and metadata is not distinct from $6::jsonb`,
          [
            tenantId,
            event.idempotencyKey,
            event.entity,
            event.entityId,
            JSON.stringify(event.payload),
            event.metadata ? JSON.stringify(event.metadata) : null,
          ],
        );
        row = previous.rows[0];
        if (!row) {
          throw new OutboxEventConflictError();
        }
      } else if (this.hasDestination(row.entity)) {
        // Only an event with a declared destination enters the delivery queue.
        await trx.query(
          `insert into outbox.event_delivery (tenant_id,event_id) values ($1::uuid,$2::uuid)`,
          [tenantId, row.id],
        );
      }
      result.push(row);
    }
    if (trx.strictItemMode) await trx.query('set local transaction_read_only = on');
    return result;
  }

  /** Explicit, idempotent owner cutover for the two platform legacy tables. */
  async cutoverLegacyMessages(): Promise<{ migrated: number; generation: number }> {
    if (this.table !== DEFAULT_OUTBOX_TABLE || this.ackTable !== DEFAULT_OUTBOX_ACK_TABLE) {
      throw new OutboxCustomTableCutoverUnsupportedError();
    }
    return this.database.withSystemContext('outbox legacy cutover', () =>
      this.database.tx(
        async (trx) => {
          await trx.query(`select set_config('lock_timeout',$1,true)`, [
            String(this.options.lockTimeoutMs ?? 5_000),
          ]);
          const marker = await trx.query<{ state: string; generation: string }>(
            `select state,generation::text from outbox.legacy_ownership where id=true for update`,
          );
          const current = marker.rows[0]!;
          if (current.state === 'NEW') {
            const count = await trx.query<{ count: string }>(
              `select count(*)::text as count from outbox.legacy_event_map`,
            );
            return {
              migrated: Number(count.rows[0]!.count),
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
          for (const target of targets) {
            await trx.query(`lock table outbox.${target} in share row exclusive mode`);
          }
          const audited = await trx.query<{ relname: string }>(
            `with recursive target(oid) as (
           select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='outbox' and c.relname=any($1::text[])
           union all
           select i.inhrelid from pg_inherits i join target t on t.oid=i.inhparent
         )
         select distinct c.relname from pg_trigger t
           join target x on x.oid=t.tgrelid join pg_class c on c.oid=t.tgrelid
          where t.tgfoid='audit.fn_row_change()'::regprocedure and t.tgenabled<>'D'`,
            [targets],
          );
          if (audited.rows.length) throw new OutboxCutoverAuditedTableError();
          const legacy = await trx.query<{
            id: string;
            tenant_id: string;
            entity: string;
            entity_id: string;
            payload: Record<string, unknown>;
            metadata: Record<string, unknown> | null;
            idempotency_key: string;
            status: string;
            attempts: number;
            next_attempt_at: Date | null;
            last_error: string | null;
            created_at: Date;
            updated_at: Date;
          }>(`select id,tenant_id,entity,entity_id,payload,metadata,idempotency_key,status,attempts,next_attempt_at,last_error,created_at,updated_at
            from outbox.messages order by tenant_id,created_at,id for update`);
          const generation = Number(current.generation) + 1;
          for (const row of legacy.rows) {
            const clock = await trx.query<{ last_ms: string }>(
              `insert into outbox.tenant_clock (tenant_id,last_ms)
             values ($1::uuid,greatest(0,floor(extract(epoch from clock_timestamp())*1000)::bigint))
           on conflict (tenant_id) do update set last_ms=greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
           returning last_ms::text`,
              [row.tenant_id],
            );
            const event = await trx.query<{ id: string }>(
              `insert into outbox.events (id,tenant_id,entity,entity_id,idempotency_key,payload,metadata,created_at)
           values (outbox.event_uuid($1::bigint,nextval('outbox.event_order_seq')),$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,to_timestamp($1::double precision/1000))
           returning id`,
              [
                clock.rows[0]!.last_ms,
                row.tenant_id,
                row.entity,
                row.entity_id,
                row.idempotency_key,
                JSON.stringify(row.payload),
                row.metadata ? JSON.stringify(row.metadata) : null,
              ],
            );
            const eventId = event.rows[0]!.id;
            await trx.query(
              `insert into outbox.event_delivery
             (tenant_id,event_id,legacy_id,status,attempts,next_attempt_at,last_error)
           values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)`,
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
            await trx.query(
              `insert into outbox.legacy_event_map (legacy_id,tenant_id,event_id,generation)
           values ($1::uuid,$2::uuid,$3::uuid,$4)`,
              [row.id, row.tenant_id, eventId, generation],
            );
            if (row.attempts > 0) {
              await trx.query(
                `insert into outbox.event_attempts
               (tenant_id,event_id,attempt_ordinal,legacy_message_id,result,error,legacy_state)
             values ($1::uuid,$2::uuid,0,$3::uuid,'LEGACY_HISTORY_UNAVAILABLE',$4,$5::jsonb)`,
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
            const legacyAck = await trx.query<{
              id: string;
              ack_status: string;
              ack_message: string | null;
              ack_time: Date;
            }>(
              `select id,ack_status,ack_message,ack_time from outbox.acknowledgements where message_id=$1::uuid`,
              [row.id],
            );
            if (legacyAck.rows[0]) {
              await trx.query(
                `insert into outbox.event_acks
               (tenant_id,event_id,status,identity_verified,hmac_verified,verification_source,legacy_ack_id,
                legacy_ack_message,legacy_ack_time,received_at)
             values ($1::uuid,$2::uuid,$3,false,false,'legacy-import',$4::uuid,$5,$6,$6)`,
                [
                  row.tenant_id,
                  eventId,
                  legacyAck.rows[0].ack_status,
                  legacyAck.rows[0].id,
                  legacyAck.rows[0].ack_message,
                  legacyAck.rows[0].ack_time,
                ],
              );
            }
            await trx.query(
              `update outbox.messages set migrated_event_id=$2::uuid,cutover_generation=$3 where id=$1::uuid`,
              [row.id, eventId, generation],
            );
          }
          await trx.query(
            `update outbox.legacy_ownership set state='NEW',generation=$1 where id=true`,
            [generation],
          );
          return { migrated: legacy.rows.length, generation };
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
            await trx.query(
              `insert into outbox.ack_quarantine (raw_body,raw_sha256,reason) values ($1,$2,$3)`,
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
        const found = await trx.query<{ id: string }>(
          `select id from outbox.events where tenant_id=$1::uuid
           and ($2::uuid is null or id=$2::uuid)
           and ($3::text is null or idempotency_key=$3) limit 1`,
          [tenantId, input.eventId ?? null, input.idempotencyKey ?? null],
        );
        const eventId = found.rows[0]?.id;
        if (!eventId)
          throw new OutboxNotFoundError({
            eventId: input.eventId,
            idempotencyKey: input.idempotencyKey,
          });
        const delivery = await trx.query<{ attempts: number }>(
          `select attempts from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,
          [tenantId, eventId],
        );
        if (!delivery.rows[0]) throw new OutboxNotFoundError({ eventId });
        const nextAttemptAt =
          input.status === 'ERROR'
            ? this.backoffPolicy.nextAttemptAt(delivery.rows[0].attempts, new Date())
            : null;
        await trx.query(
          `update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,updated_at=clock_timestamp()
          where tenant_id=$1::uuid and event_id=$2::uuid and status<>'ACKED'`,
          [tenantId, eventId, input.status, nextAttemptAt],
        );
        await trx.query(
          `insert into outbox.event_acks (tenant_id,event_id,status,raw_body,raw_sha256,identity_verified,hmac_verified,verification_source)
         values ($1::uuid,$2::uuid,$3,$4,$5,true,true,'verified-raw-body')`,
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
        const result = await trx.query<{
          tenant_id: string;
          event_id: string;
          attempts: number;
          entity: string;
          entity_id: string;
          idempotency_key: string;
          payload: Record<string, unknown>;
          metadata: Record<string, unknown> | null;
          created_at: Date;
        }>(
          `with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where d.tenant_id=$1::uuid and e.tenant_id=$1::uuid
              and (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=$1::uuid and pd.tenant_id=$1::uuid
                   and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status<>'ACKED'
              )
              ${only ? entityFilterSql(4) : ''}
            order by e.created_at,e.id limit $2 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($3::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=$1::uuid and d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=$1::uuid and e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
          [
            tenantId,
            limit,
            this.options.eventLeaseMs ?? 300_000,
            ...(only ? [only.entities, only.prefixes] : []),
          ],
        );
        for (const row of result.rows) {
          await trx.query(
            `insert into outbox.event_attempts (tenant_id,event_id,attempt_ordinal,result,leased_at)
           values ($1::uuid,$2::uuid,$3,'CLAIMED',clock_timestamp())
           on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,
            [tenantId, row.event_id, row.attempts],
          );
        }
        return result.rows;
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
        createdAt: claim.created_at.toISOString(),
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
              await trx.query(
                `update outbox.event_delivery set lease_until=clock_timestamp()+($4::integer * interval '1 millisecond'),updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$3 and status='SENT'`,
                [tenantId, claim.event_id, claim.attempts, this.options.eventLeaseMs ?? 300_000],
              );
              await trx.query(
                `update outbox.event_attempts set result='SENT',completed_at=clock_timestamp(),
                   provider=$4,protocol=$5,request_bytes=$6,request_sha256=$7,
                   response_bytes=$8,response_sha256=$9,request_headers=$10::jsonb,
                   response_status=$11,evidence_state=$12::jsonb
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
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
              const delivery = await trx.query(
                `update outbox.event_delivery set status='ERROR',lease_until=null,
                   next_attempt_at=$3,last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$5 and status='SENT'
                 returning event_id`,
                [tenantId, claim.event_id, next, message, claim.attempts],
              );
              await trx.query(
                `update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                   provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                   response_bytes=$9,response_sha256=$10,request_headers=$11::jsonb,
                   response_status=$12,evidence_state=$13::jsonb
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
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
              return delivery.rows.length > 0;
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

  private async deliveriesWhere(
    trx: OutboxSqlExecutor,
    tenantId: string,
    where: string,
    params: unknown[],
    tail: string,
  ): Promise<OutboxEventDelivery[]> {
    const result = await trx.query<EventDeliverySqlRow>(
      `select ${EVENT_DELIVERY_COLUMNS}
         from outbox.events e join outbox.event_delivery d
           on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
        where e.tenant_id=$1::uuid and ${where} ${tail}`,
      [tenantId, ...params],
    );
    return result.rows.map((row) => ({ ...eventSummary(row), delivery: deliveryState(row)! }));
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
          await trx.query<EventDeliverySqlRow>(
            `select ${EVENT_DELIVERY_COLUMNS}
         from outbox.events e left join outbox.event_delivery d
           on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
        where e.tenant_id=$1::uuid
          and ($2::text[] is null or d.status=any($2::text[]))
          and ($3::text is null or e.entity=$3)
          and ($4::text is null or left(e.entity,length($4))=$4)
          and ($5::timestamptz is null or (e.created_at,e.id)<($5::timestamptz,$6::uuid))
        order by e.created_at desc,e.id desc limit $7`,
            [
              tenantId,
              statuses,
              entity,
              entityPrefix,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              limit + 1,
            ],
          )
        ).rows,
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
      this.deliveriesWhere(trx, tenantId, 'e.id=$2::uuid', [eventId], ''),
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
          await trx.query<
            EventDeliverySqlRow & {
              position: number;
              statusRank: number;
              statusCount: number;
            }
          >(
            `select * from (
         select ${EVENT_DELIVERY_COLUMNS},
                row_number() over (order by e.created_at,e.id)::integer as "position",
                row_number() over (partition by d.status order by e.created_at,e.id)::integer as "statusRank",
                count(*) over (partition by d.status)::integer as "statusCount"
           from outbox.events e join outbox.event_delivery d
             on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
          where e.tenant_id=$1::uuid and e.entity=$2 and e.entity_id=$3
       ) ranked where "position"<=$4 or "statusRank"=1 order by "position"`,
            [tenantId, entity, entityId, limit],
          )
        ).rows,
    );
    if (rows.length === 0) return null;
    const view = (row: EventDeliverySqlRow): OutboxEventDelivery => ({
      ...eventSummary(row),
      delivery: deliveryState(row)!,
    });
    // The oldest non-ACKED delivery is first in its own status partition, so it is always selected.
    const head = rows.find((row) => row.status !== 'ACKED');
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
      trx.query<OutboxEventAttempt>(
        `select id,event_id as "eventId",attempt_ordinal as "attemptOrdinal",provider,protocol,
              request_sha256 as "requestSha256",response_sha256 as "responseSha256",
              response_status as "responseStatus",request_headers as "requestHeaders",
              evidence_state as "evidenceState",result,error,leased_at as "leasedAt",
              completed_at as "completedAt",legacy_message_id as "legacyMessageId"
              ${bytes ? ',request_bytes as "requestBytes",response_bytes as "responseBytes"' : ''}
         from outbox.event_attempts
        where tenant_id=$1::uuid and event_id=$2::uuid order by attempt_ordinal,id`,
        [tenantId, eventId],
      ),
    );
    return result.rows;
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
      trx.query<{ status: OutboxEventDeliveryStatus; count: number; oldest: Date | null }>(
        `select d.status,count(*)::integer as count,min(e.created_at) filter (where d.status<>'ACKED') as oldest
         from outbox.event_delivery d join outbox.events e
           on e.tenant_id=$1::uuid and e.tenant_id=d.tenant_id and e.id=d.event_id
        where d.tenant_id=$1::uuid
          and ($2::text is null or e.entity=$2)
          and ($3::text is null or left(e.entity,length($3))=$3)
          ${only ? entityFilterSql(4) : ''}
        group by d.status`,
        [tenantId, entity, entityPrefix, ...(only ? [only.entities, only.prefixes] : [])],
      ),
    );
    const oldest =
      result.rows
        .map((row) => row.oldest)
        .filter((value): value is Date => value !== null)
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    return {
      tenantId,
      total: result.rows.reduce((sum, row) => sum + row.count, 0),
      byStatus: statusCounts(result.rows),
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
        const current = await trx.query<{ status: OutboxEventDeliveryStatus; attempts: number }>(
          `select status,attempts from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,
          [tenantId, eventId],
        );
        const row = current.rows[0];
        if (!row) throw new OutboxNotFoundError({ eventId });
        if (row.status !== 'ERROR')
          throw new OutboxEventNotFailedError({ eventId, status: row.status });
        const nextAttemptAt = options.immediate
          ? null
          : this.backoffPolicy.nextAttemptAt(row.attempts, new Date());
        const updated = await trx.query<{ event_id: string }>(
          `update outbox.event_delivery
            set status='PENDING',next_attempt_at=case when $3::timestamptz is null then clock_timestamp()
                  else least(coalesce(next_attempt_at,clock_timestamp()),$3::timestamptz) end,
                lease_until=null,updated_at=clock_timestamp()
          where tenant_id=$1::uuid and event_id=$2::uuid and status='ERROR' returning event_id`,
          [tenantId, eventId, nextAttemptAt],
        );
        if (!updated.rows[0]) throw new OutboxEventNotFailedError({ eventId });
        const [delivery] = await this.deliveriesWhere(
          trx,
          tenantId,
          'e.id=$2::uuid',
          [eventId],
          '',
        );
        return delivery!;
      },
      { role: 'app', requireActor: true, retry: false },
    );
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
          const rows = await trx.query<{ id: string }>(
            `select id from outbox.events where tenant_id=$1::uuid
           and ($2::uuid is null or id=$2::uuid)
           and ($3::text is null or idempotency_key=$3) limit 1`,
            [input.tenantId, input.eventId ?? null, input.idempotencyKey ?? null],
          );
          return rows.rows[0]?.id;
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
      const delivery = await trx.query<{ attempts: number }>(
        `select attempts from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,
        [input.tenantId, found],
      );
      if (!delivery.rows[0]) throw new OutboxNotFoundError({ eventId: found });
      const nextAttemptAt =
        input.status === 'ERROR'
          ? this.backoffPolicy.nextAttemptAt(delivery.rows[0].attempts, new Date())
          : null;
      await trx.query(
        `update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,updated_at=clock_timestamp()
          where tenant_id=$1::uuid and event_id=$2::uuid and status<>'ACKED'`,
        [input.tenantId, found, input.status, nextAttemptAt],
      );
      await trx.query(
        `insert into outbox.event_acks (tenant_id,event_id,status,raw_body,raw_sha256,identity_verified,hmac_verified,verification_source)
         values ($1::uuid,$2::uuid,$3,$4,$5,true,true,'verified-raw-body')`,
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
      const result = await trx.query<{
        tenant_id: string;
        event_id: string;
        attempts: number;
        status: string;
        entity: string;
        entity_id: string;
        idempotency_key: string;
        payload: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        created_at: Date;
      }>(
        `with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=e.tenant_id and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status<>'ACKED'
              )
              ${only ? entityFilterSql(3) : ''}
            order by e.created_at,e.id limit $1 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($2::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts,d.status
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
        [
          limit,
          this.options.eventLeaseMs ?? 300_000,
          ...(only ? [only.entities, only.prefixes] : []),
        ],
      );
      for (const row of result.rows) {
        await trx.query(
          `insert into outbox.event_attempts
             (tenant_id,event_id,attempt_ordinal,result,leased_at)
           values ($1::uuid,$2::uuid,$3,'CLAIMED',clock_timestamp())
           on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,
          [row.tenant_id, row.event_id, row.attempts],
        );
      }
      return result.rows;
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
        createdAt: claim.created_at.toISOString(),
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
            await trx.query(
              `update outbox.event_delivery
                  set lease_until=clock_timestamp()+($4::integer * interval '1 millisecond'),
                      updated_at=clock_timestamp()
                where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$3 and status='SENT'`,
              [
                claim.tenant_id,
                claim.event_id,
                claim.attempts,
                this.options.eventLeaseMs ?? 300_000,
              ],
            );
            await trx.query(
              `update outbox.event_attempts set result='SENT',completed_at=clock_timestamp(),
                   provider=$4,protocol=$5,request_bytes=$6,request_sha256=$7,
                   response_bytes=$8,response_sha256=$9,
                   request_headers=$10::jsonb,response_status=$11,evidence_state=$12::jsonb
                where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
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
            const delivery = await trx.query(
              `update outbox.event_delivery set status='ERROR',lease_until=null,
                   next_attempt_at=$3,last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid
                   and attempts=$5 and status='SENT'
                 returning event_id`,
              [claim.tenant_id, claim.event_id, next, message, claim.attempts],
            );
            await trx.query(
              `update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                  provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                  response_bytes=$9,response_sha256=$10,
                  request_headers=$11::jsonb,response_status=$12,evidence_state=$13::jsonb
                where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,
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
            return delivery.rows.length > 0;
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
      const result = await trx.query<OutboxRow>(
        `${this.ownershipCte}
         insert into ${this.table} (id, tenant_id, entity, entity_id, payload, metadata, status, idempotency_key, next_attempt_at)
         select
           gen_random_uuid(),
           nullif(current_setting('app.tenant_id', true), '')::uuid,
           $1, $2, $3::jsonb, $4::jsonb, 'PENDING', $5, null
         ${this.platformLegacyTable ? "from ownership where state='LEGACY'" : ''}
         on conflict (tenant_id, entity, entity_id)
         do update set updated_at = now(), idempotency_key = excluded.idempotency_key
         returning ${outboxColumns()}`,
        [
          envelope.entity,
          envelope.entityId,
          JSON.stringify(envelope.payload ?? {}),
          envelope.metadata ? JSON.stringify(envelope.metadata) : null,
          idempotencyKey,
        ],
      );
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
        const result = await trx.query<OutboxRow>(
          `select ${outboxColumns()} from ${this.table} where entity = $1 and entity_id = $2`,
          [entity, entityId],
        );
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
          const result = await trx.query<OutboxRow>(
            `${this.platformLegacyTable ? this.ownershipCte + ',' : 'with'} due as (
               select id
                 from ${this.table} ${this.platformLegacyTable ? 'cross join ownership' : ''}
                where status in ('PENDING', 'ERROR')
                  ${this.platformLegacyTable ? "and ownership.state='LEGACY'" : ''}
                  ${this.platformLegacyTable ? 'and migrated_event_id is null' : ''}
                  and coalesce(next_attempt_at, created_at) <= now()
                order by created_at asc
                limit $1
                for update skip locked
             )
             update ${this.table} o
                set status = 'SENT',
                    attempts = attempts + 1,
                    last_error = null,
                    next_attempt_at = null,
                    updated_at = now()
               from due
              where o.id = due.id
              returning ${outboxColumns('o')}`,
            [limit],
          );
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
            const result = await trx.query<OutboxRow>(
              `${this.ownershipCte} update ${this.table}
                set status = 'ERROR',
                    last_error = $2,
                    next_attempt_at = $3,
                    updated_at = now()
              ${this.platformLegacyTable ? 'from ownership' : ''}
              where id = $1 and status <> 'ACKED'
              returning ${outboxColumns()}`,
              [row.id, message.slice(0, 4000), nextAttemptAt],
            );
            let updated = toRows(result)[0];
            if (!updated) {
              const terminal = await trx.query<OutboxRow>(
                `select ${outboxColumns()}
                 from ${this.table} where id=$1::uuid and status='ACKED'`,
                [row.id],
              );
              updated = terminal?.rows?.[0];
            }
            if (!updated) {
              throw new OutboxNotFoundError({ id: row.id });
            }
            if (this.platformLegacyTable) {
              const link = await trx.query<{ tenant_id: string; migrated_event_id: string | null }>(
                `select tenant_id,migrated_event_id from outbox.messages where id=$1::uuid`,
                [row.id],
              );
              const migration = link?.rows?.[0];
              if (migration?.migrated_event_id) {
                await trx.query(
                  `insert into outbox.event_attempts
                   (tenant_id,event_id,attempt_ordinal,legacy_message_id,result,error,completed_at)
                 values ($1::uuid,$2::uuid,$3,$4::uuid,'ERROR',$5,clock_timestamp())
                 on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,
                  [migration.tenant_id, migration.migrated_event_id, row.attempts, row.id, message],
                );
                await trx.query(
                  `update outbox.event_delivery set status='ERROR',next_attempt_at=$3,
                   last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid
                   and status='SENT_UNRESOLVED'`,
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
            const current = await trx.query<{
              attempts: number;
              migrated_event_id?: string | null;
            }>(
              `${this.ownershipCte} select attempts${this.platformLegacyTable ? ',migrated_event_id' : ''} from ${this.table} ${this.platformLegacyTable ? 'cross join ownership' : ''} where id = $1`,
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
            const result = await trx.query<OutboxRow>(
              `update ${this.table}
                set attempts = $2,
                    status = 'PENDING',
                    last_error = null,
                    next_attempt_at = $3,
                    updated_at = now()
              where id = $1
              returning ${outboxColumns()}`,
              [id, attempts, nextAttemptAt],
            );
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
            const result = await trx.query<OutboxRow>(
              `update ${this.table}
                set status = $2::outbox.message_status,
                    ack_time = now(),
                    last_error = case when $2::text = 'ERROR' then $3 else null end,
                    next_attempt_at = $4,
                    updated_at = now()
              where id = $1
              returning ${outboxColumns()}`,
              [target.id, input.status, input.detail ?? null, nextAttemptAt],
            );
            const row = toRows(result)[0];
            if (!row) {
              throw new OutboxNotFoundError({ entity: input.entity, entityId: input.entityId });
            }
            try {
              await trx.query(
                `insert into ${this.ackTable} (id, tenant_id, message_id, ack_status, ack_message, ack_time)
               values (gen_random_uuid(), $1, $2, $3, $4, now())
               on conflict (message_id) do nothing`,
                [row.tenantId, row.id, input.status, input.detail ?? null],
              );
            } catch (error) {
              if (!isUniqueViolation(error)) {
                throw error;
              }
            }
            if (target.migratedEventId) {
              await trx.query(
                `insert into outbox.event_acks
                 (tenant_id,event_id,status,identity_verified,hmac_verified,verification_source)
               values ($1::uuid,$2::uuid,$3,false,false,'caller-asserted-legacy-api')`,
                [row.tenantId, target.migratedEventId, input.status],
              );
              await trx.query(
                `update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,
                 updated_at=clock_timestamp()
               where tenant_id=$1::uuid and event_id=$2::uuid and status<>'ACKED'`,
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
    const params: unknown[] = [input.entity, input.entityId];
    let whereTenant = '';
    if (input.tenantId) {
      params.push(input.tenantId);
      whereTenant = 'and tenant_id = $3::uuid';
    }
    const result = await trx.query<{
      id: string;
      tenantId: string;
      migratedEventId: string | null;
      attempts: number;
    }>(
      `${this.ownershipCte} select id, tenant_id as "tenantId", attempts, ${this.platformLegacyTable ? 'migrated_event_id' : 'null::uuid'} as "migratedEventId"
         from ${this.table} ${this.platformLegacyTable ? 'cross join ownership' : ''}
         where entity = $1 and entity_id = $2 ${whereTenant} for update of ${this.table.split('.')[1]}`,
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
