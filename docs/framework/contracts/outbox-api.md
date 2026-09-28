# Transactional Outbox Contract

**Status:** Architecture contract.
**Package:** `@stynx-nyx/outbox`.
**Decision:** [ADR-OUTBOX-0001](pathname:///adr/ADR-OUTBOX-0001-transactional-outbox-promotion).

## STYNX 1.5 append mode (UPS-OBX-01…02)

[ADR-OUTBOX-0002](../../../law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md) supersedes the one-message-per-aggregate limit **for the new mode only**. The published `enqueue(tx,envelope)` upsert and legacy aggregate ACK remain. Call `OutboxService.appendInTransaction(trx,event)` with the caller's live `@stynx-nyx/data` `Transaction`; OFS supplies the item transaction opened by `Database.txIndependent`. Use `appendManyInTransaction(trx,events)` for several facts in one item. `OutboxAppendEvent` requires an explicit `idempotencyKey`; `(tenant_id,idempotency_key)` returns the same immutable event on identical replay and rejects a changed fact. Different keys on the same aggregate create distinct facts. The session GUC, live app role and RLS determine tenant. The new immutable log is separate from the mutable delivery queue.

The adapter `OutboxEventStreamSource` implements backend `EventStreamSource` with exactly `now`, `findById`, `listSince` and cursor `(createdAt,id)`. New IDs are ordered UUIDv7 and timestamps have millisecond precision. A per-tenant clock row serializes assignment and commit visibility; reads use the primary only. `now` holds no audit advisory, uses local `lock_timeout` and one connection-bearing preflight per tenant/process; lock failure follows backend's existing 503 `SSE_SOURCE_UNAVAILABLE` path. An unknown Last-Event-ID retains the backend restart-at-now behavior without replay guarantee. A migrated legacy ID resolves through a persistent ID map. The log and map have no 1.5.0 purge.

The new delivery projection claims only the oldest nonterminal event per `(tenant,entity,entityId)`, with lease and two-scheduler safety. A later event cannot pass a PENDING, SENT or retry-waiting ERROR predecessor. Lease reclaim after crash can resend, so receivers deduplicate by `eventId` or key. A durable attempt row records exact request/response bytes when present, SHA-256 hashes, provider, protocol, result and lease. ACK rows retain valid and invalid receipts; only valid ACK updates state. The new ACK identity is `(tenant,eventId)` or `(tenant,idempotencyKey)`; an aggregate-only ACK is accepted only when unambiguous. Composite tenant/event FKs prevent a cross-tenant association under the owner role. The migration preserves SENT in flight, terminal ACK and pending work without a second dispatcher claiming the same record.

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

There is exactly one outstanding message per aggregate, so aggregate ordering
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
