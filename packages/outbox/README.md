# `@stynx-nyx/outbox` — transactional outbox: same-transaction enqueue, claim-and-dispatch, HMAC-verified ACK

`@stynx-nyx/outbox` records an external-delivery intent in the same database transaction as the domain write that caused it, then claims, sends, retries and acknowledges it. It ships two modes on one `OutboxService`: the legacy mode keeps one message per aggregate (`enqueue`, `dispatchDue`, `ack`, `retry`), and the event mode appends an ordered, idempotent event log with a per-event delivery projection and an attempt ledger (`appendInTransaction`, `dispatchEventsDue`, `ackEvent` and the tenant-scoped ports). An HTTP dispatcher, two backoff policies and HMAC-SHA256 ACK signature helpers are included.

## Purpose

A domain write and the message that announces it must commit or roll back together; otherwise a crash between the two loses the message or sends one for a write that never happened. The package stores the message with the caller's own transaction and leaves delivery to a separate claim-and-send step that is safe under concurrent schedulers.

It owns durable message state, concurrent claiming, retry scheduling, an HTTP dispatcher and the ACK signature helpers. The application owns its scheduler, destination selection, authentication, the inbound ACK route, auditing and any non-HTTP transport. The package has no dependency on a job runner: `dispatchDue()` and `dispatchEventsDue()` are plain injectable methods that `@stynx-nyx/jobs` or an application poller calls on an interval.

What it does not do: it does not expose HTTP routes, it does not run a scheduler, it does not recompute the ACK HMAC (the caller verifies and asserts the result), and it performs no permission check on the tenant read and retry ports beyond tenant isolation.

The normative contract is `docs/framework/contracts/outbox-api.md`. The decisions are `law/adr/ADR-OUTBOX-0001-transactional-outbox-promotion.md` (legacy mode) and `law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md` (event log and delivery).

## Audience

Backend developers who must deliver domain facts to an external system reliably, and operators who build queue-health or retry screens on top of the tenant read ports.

## Install

```bash
pnpm add @stynx-nyx/outbox
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

## Quick start

Register the module next to `StynxDataModule`; `OutboxService` injects `Database` from [`@stynx-nyx/data`](/docs/packages/data/).

```ts
import { HttpOutboxDispatcher, StynxOutboxModule } from '@stynx-nyx/outbox';

StynxOutboxModule.forRoot({
  dispatcher: new HttpOutboxDispatcher({ url: 'https://partner.example/hooks/stynx' }),
});
```

Enqueue inside the transaction that performs the domain write, then let a scheduler drain the queue:

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

// scheduler tick (system context, spans all tenants)
const outcomes = await outbox.dispatchDue();
```

## Public API surface

### Modules

| Export              | Signature                                 | Description                                                                                                                             |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxOutboxModule` | `.forRoot(options?: OutboxModuleOptions)` | Provides and exports `OutboxService`. Registers the dispatcher, backoff policy and metrics sink under their tokens when they are given. |

### `OutboxService` — legacy mode (one message per aggregate)

| Method                      | Description                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enqueue(trx, envelope)`    | Upserts the message for `(tenant, entity, entityId)` inside the caller's transaction. The tenant comes from the transaction's `app.tenant_id`. A repeat for the same aggregate keeps the original payload and refreshes the idempotency key.   |
| `getOne(entity, entityId)`  | Reads one row in the caller's tenant; throws `OutboxNotFoundError` when absent.                                                                                                                                                                |
| `dispatchDue(limit?)`       | Claims due `PENDING`/`ERROR` rows across all tenants with `FOR UPDATE SKIP LOCKED`, marks them `SENT` and calls `dispatcher.send(row)` for each. A failed send sets `ERROR` and schedules the next attempt. Returns `OutboxDispatchOutcome[]`. |
| `ack(input)`                | Records an inbound positive or negative ACK keyed by `(entity, entityId)` and optional `tenantId`. Runs in system context.                                                                                                                     |
| `retry(id, { immediate? })` | Operator reset of one row to `PENDING`; eligible now with `immediate: true`, otherwise at the backoff time.                                                                                                                                    |
| `cutoverLegacyMessages()`   | Idempotent owner maintenance operation that moves the default legacy tables to the event mode. Returns `{ migrated, generation }`.                                                                                                             |

### `OutboxService` — event mode

| Method                                               | Description                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appendInTransaction(trx, event)`                    | Appends one event using only the caller's `Transaction` and inserts its `PENDING` delivery row. Returns `OutboxEventRow`.                                                                                                                                                                                                                                                                       |
| `appendManyInTransaction(trx, events)`               | Same for several events; one call stamps the whole batch with the same instant.                                                                                                                                                                                                                                                                                                                 |
| `dispatchEventsDue(limit?, filter?)`                 | Trusted scheduler path across all tenants. An optional `OutboxDispatchFilter` (an `OutboxEntitySelector` or `{ destination }` naming a registered destination) claims only the deliveries whose `entity` matches. Claims the oldest non-terminal event per `(tenant, entity, entityId)`, leases it, sends it through the destination's port (or the module dispatcher) and records the attempt. |
| `dispatchTenantEventsDue(limit?, filter?)`           | Same claim and delivery restricted to the request-context tenant, running as the app role, with the same optional filter.                                                                                                                                                                                                                                                                       |
| `ackEvent(input)`                                    | Owner-path ACK for an event identified by exactly one of `eventId` or `idempotencyKey`, with the tenant in `input.tenantId`.                                                                                                                                                                                                                                                                    |
| `ackTenantEvent(input)`                              | Request-path ACK; the tenant comes from the request context and a runtime `tenantId` field is rejected.                                                                                                                                                                                                                                                                                         |
| `recordUnboundAck(rawBody, reason)`                  | Stores an ACK body that could not be bound to an event in the quarantine ledger.                                                                                                                                                                                                                                                                                                                |
| `listEvents(query?)`                                 | Keyset-paged tenant events with their delivery state, newest first. `limit` is 1–500, default 50.                                                                                                                                                                                                                                                                                               |
| `getEventDelivery(eventId)`                          | One event with its delivery, or `null` for a malformed, missing or foreign id.                                                                                                                                                                                                                                                                                                                  |
| `getAggregateDelivery(entity, entityId, { limit? })` | `head` (oldest non-`ACKED` delivery), per-status `counts` and up to `limit` deliveries (1–1000, default 100), or `null`.                                                                                                                                                                                                                                                                        |
| `listEventAttempts(eventId, { includeBytes? })`      | Attempt ledger rows ordered by ordinal. Raw request and response bytes are returned only with `includeBytes: true`.                                                                                                                                                                                                                                                                             |
| `getQueueHealth(query?)`                             | `{ tenantId, total, byStatus, oldestUnackedCreatedAt }` over the tenant's delivery rows, optionally per `entity`, `entityPrefix` or registered `destination` name.                                                                                                                                                                                                                              |
| `retryEvent(eventId, { immediate? })`                | Operator retry of a delivery in `ERROR`; any other state raises `OutboxEventNotFailedError`.                                                                                                                                                                                                                                                                                                    |

### Dispatchers, backoff, metrics and stream adapter

| Export                       | Description                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HttpOutboxDispatcher`       | `OutboxDispatcherPort` over `fetch`. Sends `row.payload` as JSON; a non-2xx response, network error or timeout is a failure. `sendEvent` also returns `OutboxTransportEvidence`. |
| `FixedIntervalBackoffPolicy` | Same delay for every retry; the constructor default is 15 minutes. This is the module default policy.                                                                            |
| `ExponentialBackoffPolicy`   | `min(baseMs * factor^(attempt-1), maxMs)` plus uniform jitter in `[0, jitterMs)`.                                                                                                |
| `InMemoryOutboxMetrics`      | In-process `OutboxMetricsSink` with a `snapshot()` of the enqueued, dispatched and acked counters.                                                                               |
| `OutboxEventStreamSource`    | Adapter over the event log with `now(scope)`, `findById(id, scope)` and `listSince(cursor, scope, limit)`; cursor is `(createdAt, id)` and `event` is the event's `entity`.      |

### Functions

| Export                     | Signature                                                    | Description                                                                                  |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `verifyOutboxAckSignature` | `(secret: string, rawBody: Buffer, header: string): boolean` | Verifies a `sha256=<hex>` HMAC-SHA256 header over the raw body with a constant-time compare. |
| `signOutboxAckPayload`     | `(secret: string, rawBody: Buffer): string`                  | Computes the `sha256=<hex>` header value; intended for tests and local fakes.                |

### Tokens and constants

| Export                               | Description                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `STYNX_OUTBOX_OPTIONS`               | Injection token for the `OutboxModuleOptions` value.                              |
| `STYNX_OUTBOX_DISPATCHER`            | Injection token for the `OutboxDispatcherPort`.                                   |
| `STYNX_OUTBOX_BACKOFF_POLICY`        | Injection token for the `OutboxBackoffPolicy`.                                    |
| `STYNX_OUTBOX_METRICS`               | Injection token for the `OutboxMetricsSink`.                                      |
| `STYNX_OUTBOX_DESTINATIONS`          | Injection token for the `OutboxDestination[]` registry; overrides `destinations`. |
| `DEFAULT_OUTBOX_TABLE`               | `'outbox.messages'`.                                                              |
| `DEFAULT_OUTBOX_ACK_TABLE`           | `'outbox.acknowledgements'`.                                                      |
| `DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE` | `25`.                                                                             |

### Errors

All extend `StynxOutboxError`, which extends `StynxError` from [`@stynx-nyx/core`](/docs/packages/core/).

| Export                                     | Code                                      | Status | Raised when                                                                           |
| ------------------------------------------ | ----------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `OutboxNotFoundError`                      | `OUTBOX_NOT_FOUND`                        | 404    | Row or event not found, missing tenant context, or an unverified or unbound ACK.      |
| `OutboxAlreadyEnqueuedError`               | `OUTBOX_ALREADY_ENQUEUED`                 | 409    | A different aggregate reuses an explicit `idempotencyKey` in `enqueue`.               |
| `OutboxAmbiguousAckError`                  | `OUTBOX_AMBIGUOUS_ACK`                    | 409    | `ack()` without `tenantId` matches rows in more than one tenant.                      |
| `OutboxEventConflictError`                 | `OUTBOX_EVENT_CONFLICT`                   | 409    | An append reuses an idempotency key with different content.                           |
| `OutboxEventTransactionError`              | `OUTBOX_EVENT_TRANSACTION`                | 409    | Append or stream read is not on a writable READ COMMITTED app transaction on primary. |
| `OutboxEventNotFailedError`                | `OUTBOX_EVENT_NOT_FAILED`                 | 409    | `retryEvent` on a delivery that is not in `ERROR`.                                    |
| `OutboxLegacyCutoverError`                 | `OUTBOX_LEGACY_CUTOVER`                   | 409    | A legacy write after the default tables were cut over.                                |
| `OutboxCustomTableCutoverUnsupportedError` | `OUTBOX_CUSTOM_TABLE_CUTOVER_UNSUPPORTED` | 409    | `cutoverLegacyMessages()` with a custom `table` or `ackTable`.                        |
| `OutboxCutoverAuditedTableError`           | `OUTBOX_CUTOVER_AUDITED_TABLE`            | 409    | Cutover finds an audit row trigger on a cutover table.                                |
| `OutboxClockAmbientTransactionError`       | `OUTBOX_CLOCK_AMBIENT_TRANSACTION`        | 409    | `OutboxEventStreamSource.now` is called while a transaction holds the connection.     |
| `OutboxOwnershipContentionError`           | `OUTBOX_OWNERSHIP_CONTENTION`             | 503    | The ownership marker is locked by a cutover; the caller may retry.                    |
| `OutboxAckQuarantineUnavailableError`      | `OUTBOX_ACK_QUARANTINE_UNAVAILABLE`       | 503    | An unbound ACK cannot be quarantined while a transaction holds the connection.        |
| `OutboxClockAdmissionTimeoutError`         | `SSE_SOURCE_UNAVAILABLE`                  | 503    | `OutboxEventStreamSource.now` timed out waiting for the per-tenant preflight.         |

### Types

| Export                                                                                               | Description                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OutboxModuleOptions`                                                                                | `forRoot()` options.                                                                                                                                            |
| `OutboxEnvelope`, `OutboxRow`, `OutboxStatus`, `OutboxAckInput`                                      | Legacy-mode input, persisted row, lifecycle state and ACK input.                                                                                                |
| `OutboxAppendEvent`, `OutboxEventRow`, `OutboxEventAckInput`                                         | Event-mode append input, stored event and ACK input.                                                                                                            |
| `OutboxEntitySelector`                                                                               | Entity set (`entities` exact, `entityPrefixes` literal) used by `dispatchableEntities` and the dispatch filters.                                                |
| `OutboxDestination`, `OutboxDestinationFilter`, `OutboxDispatchFilter`                               | Named destination (`name`, `selector`, optional `dispatcher`), the `{ destination }` filter and the union of selector and name accepted by the dispatch sweeps. |
| `OutboxDispatchOutcome`                                                                              | Per-row result of a dispatch sweep, including `reconciliationRequired`.                                                                                         |
| `OutboxDispatcherPort`, `OutboxTransportEvidence`                                                    | Transport port (`send`, optional `sendEvent`) and the evidence it may return.                                                                                   |
| `OutboxBackoffPolicy`, `ExponentialBackoffOptions`                                                   | Retry scheduling port and the exponential policy options.                                                                                                       |
| `OutboxMetricsSink`                                                                                  | Metrics hook: `incrementEnqueued`, `incrementDispatched`, `incrementAcked`.                                                                                     |
| `OutboxSqlExecutor`                                                                                  | Minimal `query()` surface `enqueue` needs from a transaction.                                                                                                   |
| `HttpOutboxDispatcherOptions`                                                                        | Options of `HttpOutboxDispatcher`.                                                                                                                              |
| `OutboxEventDeliveryStatus`, `OutboxEventDeliveryState`, `OutboxEventSummary`, `OutboxEventDelivery` | Delivery projection states and the event read shapes.                                                                                                           |
| `OutboxEventListQuery`, `OutboxEventListItem`, `OutboxEventListPage`, `OutboxEventListCursor`        | `listEvents` query, item, page and keyset cursor.                                                                                                               |
| `OutboxAggregateDelivery`, `OutboxDeliveryStatusCounts`                                              | `getAggregateDelivery` result and the zero-filled per-status counts.                                                                                            |
| `OutboxEventAttempt`, `OutboxEventAttemptResult`                                                     | Attempt ledger row and its result values.                                                                                                                       |
| `OutboxQueueHealth`, `OutboxQueueHealthQuery`                                                        | `getQueueHealth` result and filter.                                                                                                                             |
| `OutboxStreamScope`, `OutboxStreamCursor`, `OutboxStreamRow`                                         | Scope, cursor and row of `OutboxEventStreamSource`.                                                                                                             |

## Configuration

### `StynxOutboxModule.forRoot()` options

| Option                         | Type                   | Default                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `table`                        | `string`               | `'outbox.messages'`                | Qualified legacy message table. Validated as a qualified SQL identifier at construction.                                                                                                                                                                                                                                                                                                                                                                                 |
| `ackTable`                     | `string`               | `'outbox.acknowledgements'`        | Qualified legacy acknowledgement table.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dispatcher`                   | `OutboxDispatcherPort` | none                               | Transport. Without one, `dispatchDue()` claims and marks rows `SENT` without sending.                                                                                                                                                                                                                                                                                                                                                                                    |
| `backoffPolicy`                | `OutboxBackoffPolicy`  | `new FixedIntervalBackoffPolicy()` | Retry scheduling. A `STYNX_OUTBOX_BACKOFF_POLICY` provider takes precedence.                                                                                                                                                                                                                                                                                                                                                                                             |
| `metrics`                      | `OutboxMetricsSink`    | none                               | Metrics hook.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `dispatchBatchSize`            | `number`               | `25`                               | Default `limit` of the dispatch methods.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `eventLeaseMs`                 | `number`               | `300_000`                          | Lease for an event send and for the following ACK wait.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lockTimeoutMs`                | `number`               | `5_000` for append and cutover     | Upper bound on a database lock wait; owner dispatch steps cap it at 250 ms.                                                                                                                                                                                                                                                                                                                                                                                              |
| `failurePersistenceDeadlineMs` | `number`               | `5_000`                            | Deadline for persisting a legacy send failure.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `dispatchableEntities`         | `OutboxEntitySelector` | every event                        | Event-mode destinations. When set, only an appended event whose `entity` matches gets a delivery row; `{}` makes a pure log. Read at construction and applied at append time.                                                                                                                                                                                                                                                                                            |
| `destinations`                 | `OutboxDestination[]`  | none                               | Named destinations: each has a unique `name`, a non-empty `selector` and an optional `dispatcher` (the module `dispatcher` otherwise). A name replaces its selector in the dispatch filters and in `getQueueHealth`. Validated at construction: no entity may match two destinations, and with `dispatchableEntities` every destination must be covered by it. Does not decide which events get a delivery row. A `STYNX_OUTBOX_DESTINATIONS` provider takes precedence. |

`eventLeaseMs`, `lockTimeoutMs` and `failurePersistenceDeadlineMs` must be positive integers; otherwise the `OutboxService` constructor throws a `RangeError`.

### `HttpOutboxDispatcher` options

| Option      | Type                                                        | Default        | Description                                       |
| ----------- | ----------------------------------------------------------- | -------------- | ------------------------------------------------- |
| `url`       | `string \| (row) => string`                                 | (required)     | Absolute URL, or a function deriving one per row. |
| `headers`   | `Record<string, string> \| (row) => Record<string, string>` | `{}`           | Static or per-row headers.                        |
| `method`    | `'POST' \| 'PUT'`                                           | `'POST'`       | HTTP method.                                      |
| `timeoutMs` | `number`                                                    | `10_000`       | Abort timeout.                                    |
| `fetchImpl` | `typeof fetch`                                              | global `fetch` | Injectable for tests.                             |

`ExponentialBackoffPolicy` defaults: `baseMs` 30 000, `factor` 2, `maxMs` one hour, `jitterMs` 5 000.

The package reads no environment variables.

## Examples

### Example 1 — append an event in the caller's transaction

```ts
await database.withRequestContext({ tenantId, actorId }, () =>
  database.tx(
    (trx) =>
      outbox.appendInTransaction(trx, {
        entity: 'ctg9.compose',
        entityId: key,
        idempotencyKey: key,
        payload: { composed: true },
      }),
    { role: 'app', retry: false, isolation: 'read committed' },
  ),
);
```

Repeating the call with the same `idempotencyKey` and identical content returns the existing event without a second delivery row; different content raises `OutboxEventConflictError`.

### Example 2 — inbound ACK webhook (legacy mode)

```ts
if (!verifyOutboxAckSignature(secret, rawBody, signature)) throw new Error('invalid signature');
await outbox.ack({ entity, entityId, status: 'ACKED', detail, tenantId });
```

### Example 3 — exponential backoff and per-row headers

```ts
StynxOutboxModule.forRoot({
  dispatcher: new HttpOutboxDispatcher({
    url: 'https://provider.invalid/event',
    headers: (message) => ({ 'X-Trace-ID': message.id }),
  }),
  backoffPolicy: new ExponentialBackoffPolicy({ baseMs: 30_000, maxMs: 60 * 60_000 }),
});
```

### Example 4 — operator retry of a failed event

```ts
const health = await outbox.getQueueHealth({ entityPrefix: 'billing.' });
if (health.byStatus.ERROR > 0) {
  const page = await outbox.listEvents({ deliveryStatus: 'ERROR', limit: 50 });
  for (const item of page.items) await outbox.retryEvent(item.id, { immediate: true });
}
```

### Example 5 — an event log where only some events are delivered

```ts
StynxOutboxModule.forRoot({
  dispatcher,
  dispatchableEntities: {
    entities: ['ch.renach.exam-result'],
    entityPrefixes: ['SINISTRO_'],
  },
});
```

An event of any other `entity` is written to the log and reaches SSE clients, but it has no delivery row: it is never claimed, never sent, and is not counted by `getQueueHealth`. Without `dispatchableEntities`, every appended event is queued for delivery.

### Example 6 — one job per destination

```ts
// RENACH job
await outbox.dispatchEventsDue(50, { entities: ['ch.renach.exam-result'] });
// RENAEST job
await outbox.dispatchEventsDue(50, { entityPrefixes: ['SINISTRO_'] });
```

Each sweep claims only the deliveries its filter matches. `dispatchTenantEventsDue(limit, filter)` does the same inside a request, for the tenant of the request context and under the application role. An empty filter object throws a `RangeError`.

### Example 7 — named destinations with their own ports

```ts
StynxOutboxModule.forRoot({
  dispatcher: renaestDispatcher,
  dispatchableEntities: { entities: ['ch.renach.exam-result'], entityPrefixes: ['SINISTRO_'] },
  destinations: [
    {
      name: 'renach',
      selector: { entities: ['ch.renach.exam-result'] },
      dispatcher: renachDispatcher,
    },
    { name: 'renaest', selector: { entityPrefixes: ['SINISTRO_'] } }, // uses the module dispatcher
  ],
});

// RENACH job: the same claim as Example 6, by name, sent through renachDispatcher.
await outbox.dispatchEventsDue(50, { destination: 'renach' });
// Inside a request, for the context tenant.
await outbox.dispatchTenantEventsDue(50, { destination: 'renaest' });
// Queue health of one destination.
const renach = await outbox.getQueueHealth({ destination: 'renach' });
```

A destination name is sugar over its selector: it adds no table, column, status or stored state, and a delivery row records no destination. `OutboxService` refuses to construct when two destinations could match one entity, when a name repeats, or when `dispatchableEntities` does not cover a destination. An unknown name throws a `RangeError` before any transaction. Without `destinations`, the behaviour of 1.5.5 is unchanged.

## Common pitfalls

- **Enqueue outside the domain transaction.** `enqueue` and `appendInTransaction` only give atomicity when they receive the transaction that performs the domain write. Opening a second transaction for the outbox row defeats the purpose.
- **Append on the wrong transaction.** `appendInTransaction` requires `trx.role === 'app'`, a tenant in `app.tenant_id`, READ COMMITTED isolation, a writable transaction and the primary; anything else raises `OutboxEventTransactionError`.
- **Expecting a second legacy message per aggregate.** `enqueue` upserts on `(tenant, entity, entityId)` and keeps the original payload. Use the event mode when one aggregate needs several ordered in-flight messages.
- **No dispatcher configured.** `dispatchDue()` then only claims and marks rows `SENT`; nothing is sent.
- **Receivers must deduplicate.** A lease reclaim after a crash can resend an event. `HttpOutboxDispatcher.sendEvent` adds `x-outbox-event-id` and `x-outbox-idempotency-key` headers for that purpose.
- **Verify the signature against the raw body.** `verifyOutboxAckSignature` must see the unmodified bytes, before JSON decoding. `ackEvent` and `ackTenantEvent` trust the caller's `hmacVerified` flag and do not recompute it.
- **Owner paths in request handlers.** `dispatchDue`, `dispatchEventsDue`, `ack`, `ackEvent`, `retry` and `cutoverLegacyMessages` run in system context as the owner role. Request handlers use `dispatchTenantEventsDue`, `ackTenantEvent` and the tenant read ports.
- **Unauthorized operator calls.** The tenant read ports and `retryEvent` enforce tenant isolation only. Authorize the actor before `retryEvent` and before `listEventAttempts(..., { includeBytes: true })`.
- **`reconciliationRequired` outcomes.** The transport completed but the result could not be persisted. The package does not resend in that call; the caller reconciles.
- **A delivery that is never acknowledged.** A later event of the same `(entity, entityId)` waits for every older delivery that is not `ACKED`. Declare `dispatchableEntities` so that events without a destination never enter the queue.
- **Changing the declaration later.** `dispatchableEntities` applies when an event is appended. Deliveries created earlier stay in the queue.
- **Destinations do not declare dispatchability.** `destinations` only names entity sets and routes their claimed events to a port. Which events get a delivery row is still decided by `dispatchableEntities`; without it every event is queued, and a sweep without a filter still claims every due delivery, routing each to its destination's port.
- **Custom tables stay in legacy mode.** `cutoverLegacyMessages()` rejects a custom `table` or `ackTable` before any database call.

## Related packages

- [`@stynx-nyx/data`](/docs/packages/data/) — `Database` and `Transaction`; the outbox schema ships in its platform migrations (`packages/data/migrations/platform/0018_outbox.sql`, `packages/data/migrations/platform/0021_outbox_event_log.sql`, `packages/data/migrations/platform/0022_outbox_request_path.sql`).
- [`@stynx-nyx/core`](/docs/packages/core/) — `StynxError` base class.
- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — declared runtime dependency; no source file of this package imports it.
- [`@stynx-nyx/jobs`](/docs/packages/jobs/) — a scheduler that can drive the dispatch methods; not a dependency.
- [`@stynx-nyx/integration-adapter`](/docs/packages/integration-adapter/) — per-call resilience when wrapped around `fetchImpl`; not a dependency.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/contracts`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@types/node`: `24.13.4`
- `@types/supertest`: `^7.2.0`
- `supertest`: `^7.2.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
