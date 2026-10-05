# `@stynx-nyx/outbox` — transactional outbox, tenant event log and delivery queue

`@stynx-nyx/outbox` records an external-delivery intent in the same database transaction as the domain change that produced it. It offers two modes: the legacy one-message-per-aggregate queue (`enqueue`, `dispatchDue`, `ack`) and the 1.5 event mode, an immutable tenant-scoped event log with a separate delivery queue, attempt ledger and ACK ledger.

## Purpose

A domain write and the message that announces it must commit together, or one of them is lost. This package stores the message through the caller's transaction and delivers it afterwards with leases, backoff and at-least-once semantics. In event mode the same log also feeds server-sent events through `OutboxEventStreamSource`.

It does not own a scheduler, routes, authentication or the choice of destination. The host calls the dispatch methods from its own job or request handler and supplies the dispatcher.

## Audience

Backend developers of a NestJS application built on `@stynx-nyx/data` who publish domain events to an external system, to SSE clients, or to both.

## Install

```bash
pnpm add @stynx-nyx/outbox
```

Runtime and peer dependencies are listed in the generated reference at the end of this page. The platform migrations shipped by `@stynx-nyx/data` create the `outbox` schema; apply them before using the package.

## Quick start

```ts
import { Module } from '@nestjs/common';
import { HttpOutboxDispatcher, StynxOutboxModule } from '@stynx-nyx/outbox';

@Module({
  imports: [
    StynxOutboxModule.forRoot({
      dispatcher: new HttpOutboxDispatcher({ url: 'https://partner.example/events' }),
    }),
  ],
})
export class AppModule {}
```

```ts
// Inside the request's application transaction (role `app`, tenant from the request context).
await database.tx(
  async (trx) => {
    await saveDomainChange(trx);
    await outbox.appendInTransaction(trx, {
      entity: 'ch.renach.exam-result',
      entityId: exam.id,
      idempotencyKey: `exam-result:${exam.id}:v1`,
      payload: { examId: exam.id },
    });
  },
  { role: 'app', isolation: 'read committed', requireActor: true },
);
```

## Public API surface

### Modules

- `StynxOutboxModule.forRoot(options)` — registers `OutboxService` with `OutboxModuleOptions`.

### Services / Injectables

- `OutboxService` — event mode: `appendInTransaction`, `appendManyInTransaction`, `dispatchEventsDue`, `dispatchTenantEventsDue`, `ackEvent`, `ackTenantEvent`, `recordUnboundAck`, `listEvents`, `getEventDelivery`, `getAggregateDelivery`, `listEventAttempts`, `getQueueHealth`, `retryEvent`, `cutoverLegacyMessages`. Legacy mode: `enqueue`, `dispatchDue`, `ack`, `retry`, `getOne`.
- `OutboxEventStreamSource` — `now`, `findById` and `listSince` over the event log, for the backend SSE service.

### Ports and helpers

- `OutboxDispatcherPort` and `HttpOutboxDispatcher`.
- `OutboxBackoffPolicy`, `FixedIntervalBackoffPolicy`, `ExponentialBackoffPolicy`.
- `OutboxMetricsSink`, `InMemoryOutboxMetrics`.
- `signOutboxAckPayload`, `verifyOutboxAckSignature`.
- Injection tokens `STYNX_OUTBOX_OPTIONS`, `STYNX_OUTBOX_DISPATCHER`, `STYNX_OUTBOX_BACKOFF_POLICY`, `STYNX_OUTBOX_METRICS`.

### Errors

All extend `StynxOutboxError`: `OutboxNotFoundError`, `OutboxEventNotFailedError`, `OutboxEventConflictError`, `OutboxEventTransactionError`, `OutboxOwnershipContentionError`, `OutboxLegacyCutoverError`, `OutboxCustomTableCutoverUnsupportedError`, `OutboxCutoverAuditedTableError`, `OutboxClockAmbientTransactionError`, `OutboxClockAdmissionTimeoutError`, `OutboxAckQuarantineUnavailableError`, `OutboxAlreadyEnqueuedError`, `OutboxAmbiguousAckError`.

### Types

`OutboxAppendEvent`, `OutboxEventRow`, `OutboxEntitySelector`, `OutboxEventAckInput`, `OutboxDispatchOutcome`, `OutboxTransportEvidence`, the read models (`OutboxEventListQuery`, `OutboxEventListPage`, `OutboxEventDelivery`, `OutboxAggregateDelivery`, `OutboxEventAttempt`, `OutboxQueueHealth`) and the legacy `OutboxEnvelope`, `OutboxRow`, `OutboxAckInput`.

## Configuration

### `StynxOutboxModule.forRoot()` options

| Option                         | Default                                      | Effect                                                                                                                                                          |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatcher`                   | none                                         | Transport for claimed rows. Without one, a dispatch claims and reports `dispatched: false`.                                                                     |
| `dispatchableEntities`         | every event                                  | Event-mode destinations: an `OutboxEntitySelector` (`entities`, `entityPrefixes`). When set, only an appended event whose `entity` matches gets a delivery row. |
| `backoffPolicy`                | fixed 15 minutes                             | When a failed delivery becomes eligible again.                                                                                                                  |
| `dispatchBatchSize`            | 25                                           | Default `limit` of the dispatch methods.                                                                                                                        |
| `eventLeaseMs`                 | 300 000                                      | Lease of an event send and of the wait for its ACK.                                                                                                             |
| `lockTimeoutMs`                | 5 000                                        | Upper bound of an append or cutover lock wait. Owner control steps never wait more than 250 ms.                                                                 |
| `failurePersistenceDeadlineMs` | 5 000                                        | Retry deadline for persisting a legacy send failure.                                                                                                            |
| `metrics`                      | none                                         | Counter sink.                                                                                                                                                   |
| `table`, `ackTable`            | `outbox.messages`, `outbox.acknowledgements` | Legacy-mode tables.                                                                                                                                             |

## Examples

### Example 1 — an event log where only some events are delivered

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

### Example 2 — one job per destination

```ts
// RENACH job
await outbox.dispatchEventsDue(50, { entities: ['ch.renach.exam-result'] });
// RENAEST job
await outbox.dispatchEventsDue(50, { entityPrefixes: ['SINISTRO_'] });
```

Each sweep claims only the deliveries its filter matches. `dispatchTenantEventsDue(limit, filter)` does the same inside a request, for the tenant of the request context and under the application role.

### Example 3 — operator view and retry

```ts
const page = await outbox.listEvents({ deliveryStatus: 'ERROR', entityPrefix: 'SINISTRO_' });
const health = await outbox.getQueueHealth();
await outbox.retryEvent(page.items[0].id, { immediate: true });
```

These ports take the tenant from the request context and run as the application role under FORCE RLS. Authorize the actor before calling `retryEvent`.

## Common pitfalls

- **Appending outside the caller's application transaction.** `appendInTransaction` requires the caller's own `app` transaction at READ COMMITTED with a tenant in context; it throws `OutboxEventTransactionError` otherwise.
- **Expecting exactly-once delivery.** A lease that expires after a crash is reclaimed and the event is sent again. Receivers deduplicate by event id or idempotency key.
- **A delivery that is never acknowledged.** A later event of the same `(entity, entityId)` waits for every older delivery that is not `ACKED`. Declare `dispatchableEntities` so that events without a destination never enter the queue.
- **Changing the declaration later.** It applies when an event is appended. Deliveries created earlier stay in the queue.
- **Calling `dispatchEventsDue` from a request.** It runs as owner across all tenants and belongs in a trusted scheduler. Request handlers use `dispatchTenantEventsDue` and `ackTenantEvent`.

## Related packages

- [`@stynx-nyx/data`](/docs/packages/data/) — transactions, tenant context and the platform migrations.
- [`@stynx-nyx/backend`](/docs/packages/backend/) — the SSE service that reads `OutboxEventStreamSource`.
- [`@stynx-nyx/offline-sync`](/docs/packages/offline-sync/) — appends one event per applied item through this package's port.

The [transactional outbox contract](/docs/framework/contracts/outbox-api) defines every behavior on this page.

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
