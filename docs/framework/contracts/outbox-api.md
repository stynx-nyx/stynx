# Transactional Outbox Contract

**Status:** Architecture contract for the legacy API and CTG9 append mode. CTG9 implementation passed Opus delivery-review cycle 4. Publication evidence is recorded separately in R-0002.
**Package:** `@stynx-nyx/outbox`.
**Decision:** [ADR-OUTBOX-0001](pathname:///adr/ADR-OUTBOX-0001-transactional-outbox-promotion).

## STYNX 1.5 append mode (UPS-OBX-01…02)

[ADR-OUTBOX-0002](../../../law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md) supersedes the one-message-per-aggregate limit **for the new mode only**. The published `enqueue(tx,envelope)` upsert and legacy aggregate ACK remain. Call `OutboxService.appendInTransaction(trx,event)` with the caller's live `@stynx-nyx/data` `Transaction`; OFS supplies the item transaction opened by `Database.txIndependent`. Use `appendManyInTransaction(trx,events)` for several facts in one item. Both append ports acquire `outbox.legacy_ownership FOR SHARE` on that Transaction before **their** audit advisory or tenant clock. The normal sequence is marker SHARE → advisory → clock. When a domain write already acquired audit advisory, the append marker request is `FOR SHARE NOWAIT`; 55P03 requires rollback and retry of the whole caller transaction. The invariant is that a clock holder acquired marker SHARE first, not that every legacy domain write followed the normal sequence. `OutboxAppendEvent` requires an explicit `idempotencyKey`; `(tenant_id,idempotency_key)` returns the same immutable event on identical replay and rejects a changed fact. Different keys on the same aggregate create distinct facts. The session GUC, live app role and RLS determine tenant. The new immutable log is separate from the mutable delivery queue.

The adapter `OutboxEventStreamSource` implements backend `EventStreamSource` with exactly `now`, `findById`, `listSince` and cursor `(createdAt,id)`. New IDs are ordered UUIDv7 and timestamps have millisecond precision. A per-tenant clock row serializes assignment and commit visibility; reads use the primary only. `now` runs in a short independent app-role transaction, rejects an ambient held write transaction as `OutboxClockAmbientTransactionError` before pool acquisition, holds no marker or audit advisory, uses local `lock_timeout` and one connection-bearing preflight per tenant/process; lock failure follows backend's existing 503 `SSE_SOURCE_UNAVAILABLE` path. An unknown Last-Event-ID retains the backend restart-at-now behavior without replay guarantee. A migrated legacy ID resolves through a persistent ID map. The log and map have no 1.5.0 purge.

The new public `OutboxService.dispatchEventsDue(limit)` and `OutboxService.ackEvent(input)` operate on event-mode rows; the published `dispatchDue`/`ack` remain legacy. The new delivery projection claims only the oldest nonterminal event per `(tenant,entity,entityId)`, with lease and two-scheduler safety. A later event cannot pass a PENDING, SENT or retry-waiting ERROR predecessor. Lease reclaim after crash can resend, so receivers deduplicate by `eventId` or key. A durable attempt row records exact request/response bytes when present, SHA-256 hashes, provider, protocol, result and lease. The event ACK ledger stores each **bound** receipt; only a valid ACK changes state. `ackEvent` takes `OutboxEventAckInput` with `rawBody` and requires `(tenantId,eventId)` or `(tenantId,idempotencyKey)` validated against the event. Composite tenant/event FKs prevent a cross-tenant association under the owner role. Invalid HMAC, unknown event ID or untrusted tenant/event identity is recorded in an owner-only unbound ACK quarantine with raw bytes/hash and reason, never attached to a guessed tenant. The app calls `OutboxService.recordUnboundAck(rawBody, reason)` after invalid HMAC; `ackEvent` calls it after unknown lookup before returning an error, in an independent owner transaction so rollback of the rejected ACK does not erase the diagnostic. The legacy `outbox.acknowledgements` table and `UNIQUE(message_id)` remain for the old `ON CONFLICT (message_id) DO NOTHING` call.

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
