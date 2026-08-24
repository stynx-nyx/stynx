# Transactional Outbox Contract

**Status:** Architecture contract.
**Package:** `@stynx-nyx/outbox`.
**Decision:** [ADR-OUTBOX-0001](pathname:///adr/ADR-OUTBOX-0001-transactional-outbox-promotion).

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
