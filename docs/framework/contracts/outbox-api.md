# Transactional Outbox Contract

**Status:** Architecture contract for the legacy API and CTG9 append mode. CTG9 implementation passed Opus delivery-review cycle 4. Publication evidence is recorded separately in R-0002.
**Package:** `@stynx-nyx/outbox`.
**Decision:** [ADR-OUTBOX-0001](pathname:///adr/ADR-OUTBOX-0001-transactional-outbox-promotion).

## STYNX 1.5 append mode (UPS-OBX-01…02)

[ADR-OUTBOX-0002](../../../law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md) supersedes the one-message-per-aggregate limit **for the new mode only**. The published `enqueue(tx,envelope)` upsert and legacy aggregate ACK remain. Call `OutboxService.appendInTransaction(trx,event)` with the caller's live `@stynx-nyx/data` `Transaction`; OFS supplies the item transaction opened by `Database.txIndependent`. Use `appendManyInTransaction(trx,events)` for several facts in one item. Both append ports acquire `outbox.legacy_ownership FOR SHARE` on that Transaction before **their** audit advisory or tenant clock. The normal sequence is marker SHARE → advisory → clock. When a domain write already acquired audit advisory, the append marker request is `FOR SHARE NOWAIT`; 55P03 requires rollback and retry of the whole caller transaction. The invariant is that a clock holder acquired marker SHARE first, not that every legacy domain write followed the normal sequence. `OutboxAppendEvent` requires an explicit `idempotencyKey`; `(tenant_id,idempotency_key)` returns the same immutable event on identical replay and rejects a changed fact. Different keys on the same aggregate create distinct facts. The session GUC, live app role and RLS determine tenant. The new immutable log is separate from the mutable delivery queue.

The adapter `OutboxEventStreamSource` implements backend `EventStreamSource` with exactly `now`, `findById`, `listSince` and cursor `(createdAt,id)`. New IDs are ordered UUIDv7 and timestamps have millisecond precision. A per-tenant clock row serializes assignment and commit visibility; reads use the primary only. `now` runs in a short independent app-role transaction, rejects an ambient held write transaction as `OutboxClockAmbientTransactionError` before pool acquisition, holds no marker or audit advisory, uses local `lock_timeout` and one connection-bearing preflight per tenant/process; lock failure follows backend's existing 503 `SSE_SOURCE_UNAVAILABLE` path. An unknown Last-Event-ID retains the backend restart-at-now behavior without replay guarantee. A migrated legacy ID resolves through a persistent ID map. The log and map have no 1.5.0 purge.

The new public `OutboxService.dispatchEventsDue(limit)` and `OutboxService.ackEvent(input)` operate on event-mode rows; the published `dispatchDue`/`ack` remain legacy. The new delivery projection claims only the oldest nonterminal event per `(tenant,entity,entityId)`, with lease and two-scheduler safety. A later event cannot pass a PENDING, SENT or retry-waiting ERROR predecessor. Lease reclaim after crash can resend, so receivers deduplicate by `eventId` or key. A durable attempt row records exact request/response bytes when present, SHA-256 hashes, provider, protocol, result and lease. The event ACK ledger stores each **bound** receipt; only a valid ACK changes state. `ackEvent` takes `OutboxEventAckInput` with `rawBody` and requires `(tenantId,eventId)` or `(tenantId,idempotencyKey)` validated against the event. Composite tenant/event FKs prevent a cross-tenant association under the owner role. Invalid HMAC, unknown event ID or untrusted tenant/event identity is recorded in an owner-only unbound ACK quarantine with raw bytes/hash and reason, never attached to a guessed tenant. The app calls `OutboxService.recordUnboundAck(rawBody, reason)` after invalid HMAC; `ackEvent` calls it after unknown lookup before returning an error, in an independent owner transaction so rollback of the rejected ACK does not erase the diagnostic. The legacy `outbox.acknowledgements` table and `UNIQUE(message_id)` remain for the old `ON CONFLICT (message_id) DO NOTHING` call.

### Tenant-scoped request path after 1.5.0

The postrelease patch adds `OutboxService.dispatchTenantEventsDue(limit?)` and
`OutboxService.ackTenantEvent(input)` for a request path with trusted tenant and
actor context. `ackTenantEvent` accepts the event identity, raw body, status
and verified-HMAC flag from `OutboxEventAckInput`, omitting `tenantId`.
Tenant identity comes only from `RequestContext`; a runtime `tenantId` field
is rejected. Claim, attempt evidence, projection update and bound ACK each
use `Database.tx` under `stynx_app` with `requireActor`, explicit tenant
predicates and the existing FORCE RLS. Migration 0022 grants the app role
only the result-evidence columns on `outbox.event_attempts`; it does not relax
the tenant policy. A trigger allows the app role one completion from
`CLAIMED` to `SENT` or `ERROR` with `completed_at`; completed and migrated
legacy attempt evidence cannot be rewritten.
Invalid HMAC is quarantined by a separate owner-only control transaction
after live app identity validation and without a domain event lookup.
Unknown or cross-tenant event identities are rejected by the tenant path
without owner lookup or quarantine; the trusted owner-control `ackEvent`
retains its separate unbound-ACK diagnostic behavior.

The existing `dispatchEventsDue` and `ackEvent` owner paths remain for trusted
cross-tenant schedulers and control jobs. Request handlers must use the new
tenant-scoped ports. They may execute transport outside a database transaction;
the claim and result evidence are separate app-role transactions, so a
successful send with failed persistence returns `reconciliationRequired`.
After deploying migration 0022, wire the trusted request context and actor,
then switch each request-path caller to the new ports. Internal schedulers can
continue on the existing owner methods.

### Tenant event reads and operator retry (UPS-OBX-04…05, #316)

The 1.5.x patch adds read ports and an operator retry to `OutboxService`. All
of them take the tenant only from the trusted `RequestContext`
(`Database.currentTenantId()`); without one they throw `OutboxNotFoundError`
(`reason: 'missing-tenant-context'`) before any SQL. A system/owner context
carries no request tenant, so these ports can never run as owner. Each runs
in `Database.tx` with `role: 'app'`, `requireActor: true`, `retry: false`
(reads also `readonly: true`), adds an explicit `tenant_id = <context tenant>`
predicate and is additionally bound by the FORCE RLS tenant policies of
migration 0021. Called inside the caller's app transaction they join it as a
savepoint, and `requireActor` re-verifies the live `stynx_app` role, tenant and
actor. Migration 0021 already grants `stynx_app` `SELECT` on `outbox.events`,
`outbox.event_delivery`, `outbox.event_attempts` and `UPDATE` on
`outbox.event_delivery`, so no grant or migration was added.

| Port                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listEvents({ deliveryStatus?, entity?, entityPrefix?, limit?, cursor? })` | `{ items, nextCursor }`. Items are the tenant's events (`id`, `entity`, `entityId`, `idempotencyKey`, `metadata`, `createdAt`) with `delivery` (`status`, `attempts`, `lastError`, `nextAttemptAt`, `leaseUntil`, `updatedAt`) or `delivery: null` for an event without a delivery row. Order is `createdAt desc, id desc`; `cursor` is the previous page's `nextCursor` and selects rows strictly before `(createdAt, id)`. `deliveryStatus` is one state or a non-empty list (an event without delivery never matches). `entity` is exact; `entityPrefix` is a literal case-sensitive prefix (no `LIKE` pattern). `limit` is 1–500, default 50. Invalid filters throw `RangeError`. |
| `getEventDelivery(eventId)`                                                | The event with its delivery, or `null` for a malformed id, a missing event, another tenant's event, or an event without a delivery row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `getAggregateDelivery(entity, entityId, { limit? })`                       | `null` when the aggregate has no delivery row in the tenant; otherwise `head` (the oldest non-`ACKED` delivery, i.e. the one later events of the aggregate wait for, or `null`), `counts` per delivery status (all five states, zero-filled) and up to `limit` (1–1000, default 100) deliveries ordered `createdAt, id`.                                                                                                                                                                                                                                                                                                                                                              |
| `listEventAttempts(eventId, { includeBytes? })`                            | `outbox.event_attempts` rows ordered by `attemptOrdinal`: `provider`, `protocol`, `requestSha256`, `responseSha256`, `responseStatus`, `requestHeaders` (redacted/digested as captured), `evidenceState`, `result` (`CLAIMED`, `SENT`, `ERROR`, `LEGACY_HISTORY_UNAVAILABLE`), `error`, `leasedAt`, `completedAt`, `legacyMessageId`. `requestBytes`/`responseBytes` are selected only with `includeBytes: true`. Malformed, missing or foreign events return `[]`.                                                                                                                                                                                                                   |
| `getQueueHealth({ entity?, entityPrefix? })`                               | `{ tenantId, total, byStatus, oldestUnackedCreatedAt }` over the tenant's delivery rows only, so an event without a delivery row is never counted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `retryEvent(eventId, { immediate? })`                                      | Operator retry; see below. Returns the updated event delivery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

`retryEvent` locks the tenant's delivery row `FOR UPDATE` in one app
transaction. Only `ERROR` is retried: the row becomes `PENDING` with
`lease_until = null` and `next_attempt_at = clock_timestamp()` when
`immediate: true`, otherwise
`least(coalesce(next_attempt_at, clock_timestamp()), OutboxBackoffPolicy.nextAttemptAt(attempts, now))`,
so a retry never moves eligibility later (an already due row stays due).
`attempts` is unchanged (the next claim increments it and allocates the next
attempt ordinal), `last_error` is kept as the last observed failure until a
later failed attempt overwrites it, and the attempt and ACK ledgers are not
touched. `PENDING`, `SENT`, `SENT_UNRESOLVED` and `ACKED` raise
`OutboxEventNotFailedError` (`OUTBOX_EVENT_NOT_FAILED`, 409, context
`{ eventId, status }`) without any write; `ACKED` is never redelivered. A
malformed, missing or other-tenant event raises the same
`OutboxNotFoundError` (`OUTBOX_NOT_FOUND`, 404, context `{ eventId }`), so
existence in another tenant is not revealed. Concurrency with dispatch: a claim
selects due rows with `FOR UPDATE OF d SKIP LOCKED`, so it skips a row the retry
holds; a retry that reaches the row while a claim transaction is uncommitted
waits on its row lock and then sees the committed `SENT`, which it refuses, as
it refuses a claim that committed first. A retried event still waits for any
older non-`ACKED` event of its aggregate (ADR-OUTBOX-0002).

These ports have no package-level permission check: tenant isolation is
enforced, but any actor in the tenant context can call them. The caller must
authorize the actor before `retryEvent` (an operator mutation) and before
`listEventAttempts(..., { includeBytes: true })`, which returns raw request and
response bytes.

`getAggregateDelivery` reads counts, head and page in one SQL statement, so
they come from a single snapshot even inside a caller's READ COMMITTED
transaction. Separate port calls (for example `listEvents` pages and
`getQueueHealth`) are independent statements and may observe concurrent
dispatch or ACK changes between them.

### Contract verifications V-01, V-03…V-06 (UPS-OBX-09)

**V-01 `appendInTransaction`/`appendManyInTransaction`.** They use only the
caller's `trx` and never open a `Database` transaction, system context or owner
connection. They require `trx.role === 'app'` and, on the live connection,
`app.tenant_id` set, `app.role = 'app'`, `current_user = 'stynx_app'`, READ
COMMITTED, writable and primary; otherwise `OutboxEventTransactionError`. The
tenant is the SQL `app.tenant_id`; a different `RequestContext` tenant raises
`AuditChainKeyMismatchError`. Under the per-tenant advisory lock, `created_at`
comes from `outbox.tenant_clock` (`greatest(last_ms, now_ms)`), so it is
non-decreasing per tenant at millisecond precision and one call stamps every
event of a batch with the same instant; the UUIDv7 `id` embeds that instant and
a global sequence. A new event always inserts a `PENDING` delivery row. The same
`(tenant, idempotencyKey)` with identical `entity`, `entityId`, `payload` and
`metadata` returns the existing row without a second delivery; different content
raises `OutboxEventConflictError`.

**V-03 `dispatchEventsDue(limit = dispatchBatchSize)`.** Trusted scheduler path,
never a request path. Each database step runs in `withSystemContext` as
`owner` (`retry: false`, `lock_timeout` ≤ 250 ms) and retries the whole step up
to four times on `40P01`/`55P03`, then maps `55P03` to
`OutboxOwnershipContentionError`. It spans all tenants and has no tenant or
`entity` filter; the tenant-scoped variant is `dispatchTenantEventsDue`, and
neither filters by `entity` (destination routing is UPS-OBX-07). The claim
transaction selects deliveries that are (`PENDING` or `ERROR` with
`coalesce(next_attempt_at, created_at) <= clock_timestamp()`) or (`SENT` with an
expired `lease_until`), excluding migrated rows while the legacy marker is not
`NEW` and any event with an older non-`ACKED` event of the same
`(tenant, entity, entityId)`; it orders by `created_at, id`, takes `limit` rows
`FOR UPDATE OF d SKIP LOCKED`, sets `SENT`, `attempts + 1`,
`lease_until = now + eventLeaseMs` (default 300 000 ms) and clears
`next_attempt_at`, then inserts the attempt row (`attempt_ordinal` = new
`attempts`, `result = 'CLAIMED'`, `leased_at`). Transport runs after that commit
through `sendEvent(row)` (or `send(row)` with empty evidence). On success a new
transaction extends `lease_until` by `eventLeaseMs` as the ACK wait (the row
stays `SENT` until ACK or lease expiry, which reclaims and resends) and
completes the attempt as `SENT`. On transport failure the evidence is
`error.evidence`; the delivery becomes `ERROR` with
`next_attempt_at = OutboxBackoffPolicy.nextAttemptAt(attempts, now)` and
`last_error`, only if it is still `SENT` at the same `attempts`, and the attempt
completes as `ERROR` with `error`. In both cases the attempt row records
`provider`, `protocol`, `request_bytes`, `request_sha256` = hex SHA-256 of
`requestBytes`, `response_bytes`, `response_sha256` = hex SHA-256 of
`responseBytes` (each `null` when absent), `request_headers`, `response_status`
and `evidence_state` (`captured`/`unavailable` per field plus
`requestTransmission`). The policy is the `STYNX_OUTBOX_BACKOFF_POLICY`
provider, else `options.backoffPolicy`, else the 15-minute
`FixedIntervalBackoffPolicy`. Failed persistence after transport returns
`reconciliationRequired` and never resends.

**V-04 `ackEvent(input)`.** It always opens its own owner transactions in system
context (a read-only lookup, then the update) and must be called outside a held
transaction; the tenant comes from `input.tenantId`. Exactly one of a UUID
`eventId` or an `idempotencyKey` is required. Malformed identity, an unknown
event or `hmacVerified !== true` is quarantined through `recordUnboundAck`
(an independent owner transaction; with a held connection it raises
`OutboxAckQuarantineUnavailableError`) and raises `OutboxNotFoundError`.
`hmacVerified` is the caller's assertion that `verifyOutboxAckSignature` passed
over `rawBody`; the package does not recompute it. A verified ACK locks the
delivery, updates it with `status <> 'ACKED'` (any non-terminal state, including
`PENDING` and `SENT_UNRESOLVED`; `ERROR` schedules the backoff time) and appends
one `outbox.event_acks` row with the raw body and its SHA-256. Therefore a
replayed or late receipt is appended as evidence but never changes an `ACKED`
projection, and `ERROR` after `ACKED` does not regress. `ackTenantEvent` has the
same projection and ledger semantics, takes the tenant from `RequestContext`,
rejects a runtime `tenantId`, runs as `stynx_app` with `requireActor` and joins
a caller's app transaction (its invalid-HMAC quarantine still needs no held
connection).

**V-05 `OutboxEventStreamSource`.** `event` is the event's `entity` column.
`findById` and `listSince` run in `withRequestContext(scope)` and
`Database.tx` with `role: 'app'`, `readonly`, primary only, and verify
`current_user = 'stynx_app'`, `app.role = 'app'` and not in recovery (else
`OutboxEventTransactionError`); the tenant is the SQL `app.tenant_id` under
FORCE RLS. `listSince(cursor)` returns rows strictly after `(createdAt, id)`
ordered `createdAt, id`; an empty cursor `id` includes rows at exactly
`createdAt`. `findById` returns `null` for a malformed id or another tenant's
event and resolves a migrated legacy UUID through `outbox.legacy_event_map`.

**V-06 `cutoverLegacyMessages()`.** With a custom `table` or `ackTable` it throws
`OutboxCustomTableCutoverUnsupportedError` before any database call. Otherwise
it runs once in `withSystemContext` as `owner` (READ COMMITTED) and is
idempotent. It is a maintenance operation and must not be exposed to a request
route (until UPS-OBX-03).

| Item          | Named tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-01          | `outbox-contract-v.spec.ts` "V-01 appendInTransaction uses only the caller transaction…"; `contract-v-items.integration.spec.ts` "V-01 refuses an owner transaction, replays an identical key and keeps tenant created_at monotonic"; `outbox-events.spec.ts` "validates app transaction identity and tenant binding…", "returns an identical idempotent append and rejects content reuse"; `ctg9-append.integration.spec.ts` "persists two facts for one aggregate, replays an identical key, rejects divergent reuse, and scopes keys per tenant" |
| V-03          | `outbox-contract-v.spec.ts` "V-03 dispatchEventsDue claims as owner in system context, oldest head first…"; `ctg9-delivery.integration.spec.ts` "records final HTTP headers, status, exact bytes, and SHA-256 for success and failure", "allows one scheduler claim, then reclaims after a crashed lease without duplicate ordinal", "fences a late failure from attempt N after another scheduler reclaims attempt N+1"; `outbox.integration.spec.ts` "never double-claims one row across concurrent dispatcher sweeps"                            |
| V-04          | `outbox-contract-v.spec.ts` "V-04 ackEvent owns owner transactions, never regresses ACKED…"; `contract-v-items.integration.spec.ts` "V-04 a later ERROR never regresses ACKED and replayed receipts only append ledger rows (owner and tenant ACK)"; `ctg9-delivery.integration.spec.ts` "defers a negative ACK by backoff and accepts a later positive ACK as terminal"; `request-path-rls.integration.spec.ts` "rejects cross-tenant identity and runtime tenantId spoofing without an ACK ledger row"                                            |
| V-05          | `outbox-contract-v.spec.ts` "V-05 OutboxEventStreamSource maps entity to event…"; `contract-v-items.integration.spec.ts` "V-05 findById of another tenant is null; listSince is strictly after (createdAt,id) and maps entity to event"; `ctg9-append.integration.spec.ts` "pages through a same-millisecond append batch larger than the stream batch size"                                                                                                                                                                                        |
| V-06          | `outbox-contract-v.spec.ts` "V-06 cutoverLegacyMessages refuses custom tables before SQL and otherwise runs as owner in system context"; `outbox-events.spec.ts` "requires the platform tables and recognizes an already completed migration"; `ctg9-append.integration.spec.ts` "cuts over four legacy states exactly once and leaves their legacy queue unclaimed"                                                                                                                                                                                |
| UPS-OBX-04/05 | `outbox-event-reads.spec.ts`; `event-reads-retry-rls.integration.spec.ts` (two tenants, FORCE RLS, `stynx_app` without `BYPASSRLS`)                                                                                                                                                                                                                                                                                                                                                                                                                 |

The ≥0021 DDL creates structures but does **not** cut over legacy rows. An adopter that only uses `enqueue`/`dispatchDue`/`ack` continues to deliver after the DDL. Native append events are deliverable through `dispatchEventsDue` in both LEGACY and NEW; the marker NEW check is only for migrated events. `OutboxService.cutoverLegacyMessages()` explicitly and idempotently moves the **default** `outbox.messages`/`outbox.acknowledgements` tables to the event mode. Custom `OutboxModuleOptions.table`/`ackTable` are rejected before mutation with `OutboxCustomTableCutoverUnsupportedError`; they continue in legacy mode. Legacy `enqueue`, claim, ACK, retry and `recordDispatchFailure` take marker `FOR SHARE NOWAIT` before legacy row locks. A request encountering an UPDATE **already held** receives retryable `OutboxOwnershipContentionError` (55P03); the entire caller transaction rolls back and retries with the same idempotency key. After cutover commits NEW, retry of `enqueue` gets typed `OutboxLegacyCutoverError`. The cutover takes marker UPDATE, waits for those shared locks, locks legacy rows `FOR UPDATE` without `SKIP LOCKED`, copies events/map/projections, marks `migrated_event_id`, then atomically changes the marker from LEGACY to NEW. After marker UPDATE but before mutation, it locks target tables in fixed order with `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` to exclude concurrent trigger DDL, then queries `pg_trigger`/`pg_proc` for enabled `audit.fn_row_change` on every table it will mutate (messages, events, projections, map, ledgers, clock, ownership marker and physical partitions); any hit returns `OutboxCutoverAuditedTableError` with full rollback. The ≥0021 DDL installs no such triggers there. Cutover may take tenant-clock locks **after** marker UPDATE, but calls no audit writer and touches no audit-triggered table in that transaction; optional audit is a separate owner transaction after commit. Thus a clock holder already holds marker SHARE, and cutover cannot hold marker UPDATE while waiting for that clock. A legacy audited-domain-write→enqueue may hold advisory before marker. In the three-party queue, B holds marker SHARE and waits for A’s advisory, C queues marker UPDATE, then A requests marker SHARE. PostgreSQL may grant A’s compatible SHARE immediately despite C waiting: A/B must complete within the deadline, C commits after both, with no 40P01 or duplicate effect. A 55P03 is allowed but not required there. A separate deterministic NOWAIT case makes C **hold** UPDATE before A requests SHARE; A receives typed 55P03, rolls back its entire transaction and retries with the same key. If C committed NEW, that retry returns `OutboxLegacyCutoverError` without a second effect. The old claim excludes marked rows; after NEW, `enqueue` fails with `OutboxLegacyCutoverError` instead of silently changing the new log. A legacy `ack` for a marked row updates both legacy ACK and event ledger/projection in the **same transaction**, after application HMAC verification, preserving aggregate ambiguity checks. A delayed legacy send failure after cutover takes marker SHARE, records its failed attempt and policy retry time in the event projection, and moves `SENT_UNRESOLVED → ERROR` only if no terminal ACK has since committed. `recordDispatchFailure` retries its own idempotent persistence transaction on 55P03/40P01 with bounded backoff, never re-sends; exhausted retries yield an error outcome for that row while the dispatch loop continues other claimed rows. Other migrated SENT in flight has no automatic reclaim until ACK or explicit owner reconciliation. SQLSTATE `55P03`/`40P01` rolls back the full operation; a retry starts with the same idempotency key from the outer boundary and never continues an aborted transaction. Rollback before cutover commit leaves legacy as the only authority; after commit, no automatic reversal is offered. This prevents legacy/new schedulers from claiming the same migrated row.

Append runs on a READ COMMITTED primary transaction. It takes the audit-chain advisory before the clock and leaves both locks until commit. An OFS item finishes all domain, consumption, receipt and audit writes before append, then seals the transaction using `SET LOCAL transaction_read_only = on`; a later write fails as `ReadOnlyViolationError`. Generic CTG5 command callbacks may append and leave the transaction writable because the envelope still writes audit/idempotency after the callback. They must retain advisory→clock order; same-tenant SSE preflights have bounded waits and may receive 503. The exact migration, audit-chain and Inspector obligations are in the [CTG9 OBX contract](../../../work/rounds/R-0002/ctg9-obx-contract.md).

## Scope

The package records an entity-agnostic external-delivery intent in the same
database transaction as the domain mutation that created it. It owns durable
message state, concurrent claiming, retry scheduling, an HTTP dispatcher, and
ACK HMAC helpers. An application owns its scheduler, destination selection,
authentication, request controller, auditing, and any EventBridge adapter.

## Enqueue contract

Call `OutboxService.enqueue(tx, envelope)` using the exact transaction that
performs the domain write. `tx` must expose the `query()` surface of a
`@stynx-nyx/data` transaction. The active `app.tenant_id` database context
sets `tenant_id`; callers cannot pass or override it.

```ts
await database.tx(async (tx) => {
  await saveDomainMutation(tx);
  await outbox.enqueue(tx, {
    entity: 'renach.encounter',
    entityId: encounter.id,
    payload: { encounterId: encounter.id },
    metadata: { correlationId },
  });
});
```

The envelope has `entity`, `entityId`, JSON `payload`, optional JSON
`metadata`, and an optional `idempotencyKey`. The default key is
`${entity}:${entityId}`. The database enforces both unique
`(tenant_id, entity, entity_id)` and unique `(tenant_id, idempotency_key)`.
Repeating an enqueue for the same aggregate preserves the original payload and
only refreshes `idempotency_key` and `updated_at`; this matches PEC.

## Lifecycle and dispatch

Messages transition `PENDING → SENT → ACKED | ERROR`. `dispatchDue(limit)`
claims `PENDING` or due `ERROR` rows with an atomic CTE and `FOR UPDATE SKIP
LOCKED`, increments `attempts`, and marks them `SENT`. Claiming runs in the
system/owner context so a single scheduler sweep can serve all tenants.

If an `OutboxDispatcherPort` is configured, each claimed row is passed to
`send(row)`. A rejected send moves that row to `ERROR`, records a bounded
`last_error`, and sets `next_attempt_at` from `OutboxBackoffPolicy`. The
default fixed policy is 15 minutes, preserving PEC behavior; exponential
backoff with cap and jitter is also provided. With no dispatcher,
`dispatchDue()` deliberately performs PEC-compatible claim-only behavior.

`HttpOutboxDispatcher` sends the row payload as JSON by POST (or PUT), has a
10-second default timeout, and treats non-2xx responses as failures. EventBridge
is intentionally only a future `OutboxDispatcherPort` implementation.

In the legacy mode, there is exactly one outstanding message per aggregate, so aggregate ordering
is achieved by construction rather than by supporting an append-only event
stream. Domains needing multiple ordered in-flight events require a future
contract change.

## ACK contract

The receiving application exposes its own public webhook route, obtains the
unmodified raw body, and verifies `X-Signature: sha256=<hex>` before decoding
or acknowledging the request:

```ts
if (!verifyOutboxAckSignature(secret, rawBody, signature)) throw new Error('invalid signature');
await outbox.ack({ entity, entityId, status: 'ACKED', detail, tenantId });
```

Verification is HMAC-SHA256 with a constant-time comparison. `ack()` records
one acknowledgement per message and is replay-safe. It runs in system/owner
context because inbound webhooks have no authenticated tenant context. If an
ACK omits `tenantId` and `(entity, entityId)` resolves to multiple tenants,
the package fails closed with `OutboxAmbiguousAckError` (409); an integration
must send tenant/correlation information sufficient to disambiguate.

## Data and tenancy guarantees

The platform migration creates `outbox.messages` and
`outbox.acknowledgements`, both tenant-scoped with enabled and forced RLS.
Normal enqueue/read operations remain tenant-context constrained. Only
claim/retry/ACK operations use the owner role, and only inside
`withSystemContext`; they must never be exposed as tenant-selected SQL paths.
