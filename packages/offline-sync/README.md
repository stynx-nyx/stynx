# `@stynx-nyx/offline-sync` — tenant-scoped numbering reservations, idempotent sync batches and conflict resolution

`@stynx-nyx/offline-sync` provides NestJS server primitives for tenant-scoped numbering reservations, idempotent offline sync batches, and conflict resolution. It is the server pair of `@stynx-nyx/mobile-runtime`: a device reserves an interval of official numbers while online, authors records offline, and later submits them as device batches that the server stores exactly once.

## Purpose

Offline clients retry. A batch can be sent twice, a reservation request can be repeated after a timeout, and two devices can claim the same number. This package gives the server side a single place that handles those cases:

- **Numbering reservations** carve a non-overlapping interval out of a tenant, org-unit, entity-type and series range, with an expiry.
- **Sync batches** persist queue items with replay protection, so a repeated item is reported as a duplicate instead of being stored again.
- **Conflicts** can be opened against a queue item and resolved with a recorded strategy.

Tenant and actor identity always come from the trusted request context. A request body that carries an identity field such as `tenantId` or `actorId` is rejected.

The module runs in one of two modes, chosen at bootstrap. Without a `policyResolver` it keeps the published E6 behaviour: queue items are deduplicated by payload hash, the reservation time-to-live and the 100-item batch limit are fixed defaults, and cancelling a reservation twice is an error. Supplying a `policyResolver` selects the CTG9 durable mode: items are identified by tenant and idempotency key with the hash used for integrity, batches have durable receipts, policy is resolved per tenant and org unit, and the additional ports listed under [Configuration](#configuration) become available.

What it does not do: it does not create numbering ranges (provisioning range rows is a host-domain responsibility), it does not interpret `entityType` values, and it does not apply synced items to domain tables unless the host supplies an `OfflineSyncItemApplier`.

## Audience

Backend developers adding offline-capable clients to a STYNX application, and developers mapping existing device endpoints onto `OfflineSyncService` with their own controllers.

## Install

```bash
pnpm add @stynx-nyx/offline-sync
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

The package ships its SQL migrations. Apply `packages/offline-sync/migrations/0001_offline_sync.sql` before mounting the PostgreSQL store, then `packages/offline-sync/migrations/0002_durable_sync.sql`, and `packages/offline-sync/migrations/0003_reservation_idempotency.sql` if reservations use `idempotencyKey`. The first migration uses a generic `entity_type`, unique `(tenant_id, payload_hash)` replay protection, and forced tenant RLS; the second narrows that uniqueness to E6-mode rows and adds the durable batch, receipt and consumption tables.

## Quick start

```ts
import { Module } from '@nestjs/common';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';

@Module({ imports: [StynxOfflineSyncModule.forRoot()] })
export class AppModule {}
```

`forRoot()` with no options mounts `OfflineSyncController` and uses `PostgresOfflineSyncStore` and `StynxOfflineSyncContext`. The controller relies on `StynxAuthGuard`, `PermissionGuard` and `@Permission` from `@stynx-nyx/auth`, `@Audit` from `@stynx-nyx/backend` and `@Idempotent` from `@stynx-nyx/idempotency`, so the host must have those packages configured.

Use `StynxOfflineSyncModule.inMemory()` only for tests or sandboxes.

To call the service from your own code, inject `OfflineSyncService`:

```ts
const reservation = await offlineSync.reserveNumbering({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  shiftId: 'shift-a',
  entityType: 'crash-record',
  requestedSize: 2,
});
```

## Public API surface

### Modules

| Export                   | Signature                                                           | Description                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxOfflineSyncModule` | `.forRoot(options?: StynxOfflineSyncModuleOptions)`                 | Registers the service, store and context port, and mounts a controller unless `mountControllers` is `false`. Exports `OfflineSyncService` and `STYNX_OFFLINE_SYNC_STORE`. |
| `StynxOfflineSyncModule` | `.inMemory(options?: Omit<StynxOfflineSyncModuleOptions, 'store'>)` | Same as `forRoot()` with a new `InMemoryOfflineSyncStore`.                                                                                                                |

### Service

`OfflineSyncService` methods. Each reads the tenant and actor from the context port.

| Method                                                                                     | Description                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reserveNumbering(input: ReserveNumberingInput)`                                           | Reserves `requestedSize` numbers (1 to 100). With `idempotencyKey`, a repeated identical request returns the original reservation.               |
| `cancelNumberingReservation(reservationId, input?)`                                        | Cancels a reservation; optional `reason` of at most 500 characters.                                                                              |
| `submitSyncBatch(input: SubmitSyncBatchInput)`                                             | Validates and stores a device batch. Returns accepted and duplicate counts, conflicts and the stored items.                                      |
| `submitSyncBatch(input: CTG9SubmitSyncBatchInput, options: SubmitSyncBatchOptions)`        | CTG9 form used by the mounted controller; carries the transport idempotency key, method and path and returns a result with a `SyncBatchReceipt`. |
| `openConflict(queueItemId, input: OpenSyncConflictInput)`                                  | Opens a conflict for a stored queue item.                                                                                                        |
| `resolveConflict(conflictId, input: ResolveSyncConflictInput)`                             | Resolves a conflict. Without a `conflictResolver` the resolution must be `device-wins`, `server-wins` or `manual-review`.                        |
| `blockNumberingReservation`, `closeNumberingReservation`, `settleNumberingReservation`     | Reservation transitions `(id, input?)` returning a `CTG9NumberingReservation`.                                                                   |
| `reconcileNumberingReservation(id, input: ReconcileNumberingInput)`                        | Compares device-claimed numbers with server consumption and returns a `ReconcileNumberingResult`.                                                |
| `getNumberingConsumption(id)`                                                              | Per-number consumption of a reservation.                                                                                                         |
| `getSyncBatchReceipt(deviceId, deviceBatchId)`, `getSyncItemReceipt(idempotencyKey)`       | Durable receipts; throw a 404 `OfflineSyncError` when absent.                                                                                    |
| `listSyncBatchReceipts`, `listSyncItemReceipts`, `listSyncQueueItems`, `listSyncConflicts` | Keyset-paginated tenant listings, newest first, returning `OfflineSyncPage`. `limit` defaults to 50 and must be between 1 and 200.               |

The transition, consumption, receipt and listing methods need a store that implements `OfflineSyncDurableStore`; both bundled stores do. The listing methods are not exposed by either controller.

### Controllers

Both controllers are mounted at `offline-sync` behind `StynxAuthGuard` and `PermissionGuard`. `OfflineSyncController` is mounted in E6 mode and `CTG9OfflineSyncController` when a `policyResolver` is configured.

| Method | Path                                                          | Permission                         | Controller |
| ------ | ------------------------------------------------------------- | ---------------------------------- | ---------- |
| `POST` | `/offline-sync/numbering-reservations`                        | `offline-sync:numbering:reserve`   | both       |
| `POST` | `/offline-sync/numbering-reservations/:id/cancel`             | `offline-sync:numbering:cancel`    | both       |
| `POST` | `/offline-sync/sync-batches`                                  | `offline-sync:batches:submit`      | both       |
| `POST` | `/offline-sync/conflicts/:id/resolve`                         | `offline-sync:conflicts:resolve`   | both       |
| `POST` | `/offline-sync/numbering-reservations/:id/block`              | `offline-sync:numbering:block`     | CTG9       |
| `POST` | `/offline-sync/numbering-reservations/:id/close`              | `offline-sync:numbering:close`     | CTG9       |
| `POST` | `/offline-sync/numbering-reservations/:id/reconcile`          | `offline-sync:numbering:reconcile` | CTG9       |
| `POST` | `/offline-sync/numbering-reservations/:id/settle`             | `offline-sync:numbering:settle`    | CTG9       |
| `GET`  | `/offline-sync/numbering-reservations/:id/consumption`        | `offline-sync:numbering:read`      | CTG9       |
| `GET`  | `/offline-sync/sync-batches/:deviceId/:deviceBatchId/receipt` | `offline-sync:batches:read`        | CTG9       |
| `GET`  | `/offline-sync/sync-items/:idempotencyKey/receipt`            | `offline-sync:items:read`          | CTG9       |

Every `POST` route is audited and uses `@Idempotent('Idempotency-Key')`, except the CTG9 batch route, which opts out of the interceptor, requires a non-blank `Idempotency-Key` header itself, and performs its own durable replay.

### Stores and context

| Export                     | Description                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PostgresOfflineSyncStore` | Default store, implementing `OfflineSyncDurableStore` over the `Database` from `@stynx-nyx/data`.                                                |
| `InMemoryOfflineSyncStore` | Test store implementing the same interface. `seedNumberingRange(range)` adds a range; `getQueueItem(tenantId, queueItemId)` reads a stored item. |
| `StynxOfflineSyncContext`  | Default `OfflineSyncContextPort`; reads tenant and actor from `RequestContext` in `@stynx-nyx/core`.                                             |

### Tokens

| Export                       | Description                               |
| ---------------------------- | ----------------------------------------- |
| `STYNX_OFFLINE_SYNC_OPTIONS` | The options object passed to `forRoot()`. |
| `STYNX_OFFLINE_SYNC_STORE`   | The active `OfflineSyncStore`.            |
| `STYNX_OFFLINE_SYNC_CONTEXT` | The active `OfflineSyncContextPort`.      |

### Errors

| Export                              | Base               | Code and status                                      | Description                                                                                         |
| ----------------------------------- | ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `OfflineSyncError`                  | `HttpException`    | an `OfflineSyncErrorCode`, status per call site      | Response body carries `statusCode`, `errorCode`, `message`, `retryable` and, when set, `requestId`. |
| `OfflineSyncRangeUnavailableError`  | `OfflineSyncError` | `OFFLINE_SYNC_RANGE_UNAVAILABLE`, 409                | Adds `reason`: `inactive`, `exhausted` or `insufficient_capacity`.                                  |
| `OfflineSyncNumberingOutcome`       | `OfflineSyncError` | an `OfflineSyncNumberingCode`, 409                   | Adds `receiptStatus` (`conflict` for the expired code, otherwise `rejected`) and `context`.         |
| `OfflineSyncReservationReplayError` | `HttpException`    | `OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT`, 409 | A reservation `idempotencyKey` was reused with a different request.                                 |
| `OfflineSyncUpgradeRequiredError`   | `HttpException`    | `OFFLINE_SYNC_UPGRADE_REQUIRED`, 503, retryable      | The PostgreSQL schema is missing a required migration.                                              |
| `OfflineSyncConfigurationError`     | `Error`            | `OFFLINE_SYNC_CONFIGURATION_ERROR`                   | Invalid module options, thrown at bootstrap or when a required port or store operation is missing.  |

`OfflineSyncErrorCode` values used with their status by the service, controllers and context port include `OFFLINE_SYNC_INVALID_INPUT` (400), `OFFLINE_SYNC_CONTEXT_OVERRIDE` (400), `OFFLINE_SYNC_UNAUTHENTICATED` (401), `OFFLINE_SYNC_FORBIDDEN` (403), `OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND` (404) and `OFFLINE_SYNC:BATCH:in-progress` (503, with a `Retry-After` header). The remaining codes in the union are raised by the stores.

### Types

| Export                                                                                                                                                                                                                                                                                                                                                                                                  | Description                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `StynxOfflineSyncModuleOptions`                                                                                                                                                                                                                                                                                                                                                                         | Module options; see [Configuration](#configuration).              |
| `OfflineSyncStore`, `OfflineSyncDurableStore`                                                                                                                                                                                                                                                                                                                                                           | Store interfaces. The durable interface is required in CTG9 mode. |
| `OfflineSyncContextPort`, `TrustedOfflineSyncScope`                                                                                                                                                                                                                                                                                                                                                     | Source of the trusted `{ tenantId, actorId }`.                    |
| `NumberingRange`, `NumberingReservation`, `ReserveNumberingInput`, `CancelNumberingReservationInput`                                                                                                                                                                                                                                                                                                    | Range and reservation shapes and inputs.                          |
| `SubmitSyncBatchInput`, `SyncBatchItemInput`, `StoredSyncQueueItem`, `SubmitSyncBatchResult`                                                                                                                                                                                                                                                                                                            | E6 batch input and result.                                        |
| `CTG9SubmitSyncBatchInput`, `CTG9SyncBatchItemInput`, `CTG9SubmitSyncBatchResult`, `SubmitSyncBatchOptions`, `DurableBatchExecutionOptions`                                                                                                                                                                                                                                                             | CTG9 batch input, result and transport options.                   |
| `SyncBatchReceipt`, `SyncItemReceipt`                                                                                                                                                                                                                                                                                                                                                                   | Durable receipts.                                                 |
| `SyncConflict`, `OpenSyncConflictInput`, `ResolveSyncConflictInput`, `OfflineSyncConflictResolutionStrategy`                                                                                                                                                                                                                                                                                            | Conflict shapes and strategies.                                   |
| `CTG9NumberingReservation`, `NumberingReservationStatus`, `NumberingConsumptionEntry`, `NumberingConsumptionResult`, `ReconcileNumberingInput`, `ReconcileNumberingResult`, `SettleNumberingInput`                                                                                                                                                                                                      | Reservation transitions, consumption and reconciliation.          |
| `OfflineSyncPolicy`, `OfflineSyncPolicyResolver`, `OfflineSyncAgentResolver`, `OfflineSyncItemApplier`, `OfflineSyncApplyResult`, `OfflineSyncItemContext`, `OfflineSyncEventPort`, `OfflineSyncEvent`, `OfflineSyncConcurrencyDetector`, `OfflineSyncConcurrencyResult`, `OfflineSyncConcurrentPair`, `OfflineSyncHandoffPort`, `OfflineSyncConflictResolver`, `OfflineSyncLegacyItemIdentityResolver` | Host-supplied ports for CTG9 mode and their inputs and results.   |
| `OfflineSyncPage`, `OfflineSyncListInput`, `ListSyncBatchReceiptsInput`, `ListSyncItemReceiptsInput`, `ListSyncQueueItemsInput`, `ListSyncConflictsInput`, `SyncBatchReceiptSummary`, `SyncItemReceiptRecord`, `SyncQueueItemRecord`, `SyncConflictRecord`                                                                                                                                              | Listing inputs, page shape and row types.                         |
| `OfflineSyncQueueStatus`                                                                                                                                                                                                                                                                                                                                                                                | `'received' \| 'applied' \| 'conflict' \| 'rejected'`.            |
| `OfflineSyncErrorCode`, `OfflineSyncNumberingCode`, `OfflineSyncRangeUnavailableReason`                                                                                                                                                                                                                                                                                                                 | Error code and reason unions.                                     |

## Configuration

### `StynxOfflineSyncModule.forRoot()` options

| Option                       | Type                                    | Default                       | Description                                                                                                                        |
| ---------------------------- | --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `store`                      | `OfflineSyncStore`                      | `PostgresOfflineSyncStore`    | Storage backend. In CTG9 mode a custom store must implement the durable operations or bootstrap fails.                             |
| `context`                    | `OfflineSyncContextPort`                | `StynxOfflineSyncContext`     | Source of the trusted tenant and actor.                                                                                            |
| `mountControllers`           | `boolean`                               | `true`                        | `false` registers only the providers, for hosts that map their own routes to the service.                                          |
| `now`                        | `() => string`                          | current time as ISO-8601      | Clock seam.                                                                                                                        |
| `reservationTtlMs`           | `number`                                | `86_400_000` (24 hours)       | Reservation lifetime in E6 mode. In CTG9 mode the lifetime comes from the policy resolver.                                         |
| `policyResolver`             | `OfflineSyncPolicyResolver`             | none                          | Selects CTG9 mode. Resolves `reservationTtlMs`, `concurrencyWindowMinutes` and `maxBatchItems` per tenant, org unit and operation. |
| `agentResolver`              | `OfflineSyncAgentResolver`              | none (the actor is the agent) | CTG9 only. Supplies the business agent for an operation.                                                                           |
| `itemApplier`                | `OfflineSyncItemApplier`                | none                          | CTG9 only. Applies an item inside the batch transaction and returns the server entity id. Requires `eventPort`.                    |
| `eventPort`                  | `OfflineSyncEventPort`                  | none                          | CTG9 only. Appends events in the same transaction.                                                                                 |
| `concurrencyDetector`        | `OfflineSyncConcurrencyDetector`        | none                          | CTG9 only. Detects suspected concurrent items.                                                                                     |
| `handoffPort`                | `OfflineSyncHandoffPort`                | none                          | CTG9 only. Decides whether a detected concurrent pair is permitted.                                                                |
| `conflictResolver`           | `OfflineSyncConflictResolver`           | none                          | CTG9 only. Host-defined conflict resolution and allowed actions.                                                                   |
| `legacyItemIdentityResolver` | `OfflineSyncLegacyItemIdentityResolver` | none                          | CTG9 only. Stable identity for items submitted without an idempotency key.                                                         |
| `legacyIdempotencyStore`     | `IdempotencyStore`                      | none                          | CTG9 only. The `@stynx-nyx/idempotency` store used for read-only replay of batches recorded before the upgrade.                    |
| `leaseWaitMs`                | `number`                                | `750`                         | How long a batch submission waits for a concurrent submission of the same batch.                                                   |
| `replayKeyHeaderName`        | `string`                                | `X-Idempotency-Key`           | Header set to the incoming key on a replayed batch response.                                                                       |
| `replayMarkerHeaderName`     | `string`                                | `Idempotency-Replayed`        | Header set to `true` on a replayed batch response.                                                                                 |

Passing any option marked CTG9 only without a `policyResolver` throws `OfflineSyncConfigurationError` at bootstrap, as does `itemApplier` without `eventPort`.

In E6 mode a batch holds 1 to 100 items. In CTG9 mode the maximum is `maxBatchItems` from the resolved policy, and a policy without a positive `reservationTtlMs` makes `reserveNumbering` fail with `OFFLINE_SYNC_INVALID_INPUT`.

The package reads no environment variables.

## Examples

### Example 1 — in-memory module with a seeded range

```ts
import { InMemoryOfflineSyncStore, StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';

const store = new InMemoryOfflineSyncStore();
store.seedNumberingRange({
  id: '10000000-0000-4000-8000-000000000001',
  tenantId,
  orgUnitId: 'org-a',
  entityType: 'crash-record',
  series: 'CRASH',
  startNumber: 1000,
  endNumber: 1002,
  nextNumber: 1000,
  status: 'active',
});

StynxOfflineSyncModule.forRoot({ store, mountControllers: false });
```

### Example 2 — submit a batch through the service

```ts
const result = await offlineSync.submitSyncBatch({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: 'batch-1',
  items: [
    {
      queueItemId: 'sync-item-1',
      entityType: 'crash-record',
      localEntityId: 'crash-local-1',
      idempotencyKey: 'idem-1',
      payloadHash: `sha256:${'a'.repeat(64)}`,
      payloadJson: { severity: 'minor' },
      createdLocallyAt: '2026-08-24T12:00:00.000Z',
      reservedNumber: 1000,
    },
  ],
});
// result.acceptedItems, result.duplicateItems, result.conflicts, result.items
```

### Example 3 — keyed reservation retry

```ts
const input = {
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  shiftId: 'shift-a',
  entityType: 'crash-record',
  requestedSize: 5,
  idempotencyKey: 'shift-a:reserve-1',
};

const first = await offlineSync.reserveNumbering(input);
const retry = await offlineSync.reserveNumbering(input);
// retry.reservationId === first.reservationId; no further numbers are consumed
```

### Example 4 — open and resolve a conflict

```ts
const conflict = await offlineSync.openConflict('sync-item-1', {
  conflictType: 'duplicate-number',
  description: 'Number 1000 was already issued.',
});

await offlineSync.resolveConflict(conflict.conflictId, { resolution: 'server-wins' });
```

## Common pitfalls

- **Do not send identity in the body.** Any of `tenantId`, `tenant_id`, `agentId`, `agent_id`, `actorId`, `actor_id`, `userId` or `user_id` in a controller request body is rejected with `OFFLINE_SYNC_CONTEXT_OVERRIDE`.
- **A numbering range must exist first.** The package never creates range rows; without a matching range `reserveNumbering` fails with `OFFLINE_SYNC_RANGE_NOT_FOUND`.
- **`payloadHash` must be canonical.** Only `sha256:` followed by 64 lowercase hexadecimal characters is accepted.
- **Mode cannot be switched per request.** It is decided once at bootstrap by the presence of `policyResolver`, including when `mountControllers` is `false`.
- **E6 mode deduplicates by payload hash.** Two items with identical payload hashes are treated as the same item even under different idempotency keys. CTG9 mode uses the tenant and item key instead.
- **Reusing a `queueItemId` with a different payload hash is an error** (`OFFLINE_SYNC_QUEUE_ID_REUSED`), as is repeating a `queueItemId` within one batch.
- **Item keys starting with `stynx:legacy:` are reserved** and rejected as invalid input.
- **A missing migration surfaces as HTTP 503.** The PostgreSQL store raises `OfflineSyncUpgradeRequiredError` instead of a raw SQL error when a column or table is absent.
- **In CTG9 mode the batch route can answer 503 with `Retry-After`** while another submission of the same batch is in progress; clients should retry with the same `Idempotency-Key`.
- **`inMemory()` keeps state in the process.** Use it only for tests or sandboxes.

## Related packages

- [`@stynx-nyx/mobile-runtime`](/docs/packages/mobile-runtime/) — the client-side runtime whose backend port these endpoints serve. It is not a dependency of this package.
- [`@stynx-nyx/auth`](/docs/packages/auth/) — `StynxAuthGuard`, `PermissionGuard` and `@Permission` on the controllers.
- [`@stynx-nyx/backend`](/docs/packages/backend/) — the `@Audit` decorator on the mutating routes.
- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — `@Idempotent` on the routes and the `IdempotencyStore` type of `legacyIdempotencyStore`.
- [`@stynx-nyx/core`](/docs/packages/core/) — `RequestContext`, the source of the trusted tenant and actor.
- [`@stynx-nyx/data`](/docs/packages/data/) — `Database` and `Transaction`, used by the PostgreSQL store and passed to the CTG9 ports.

Contract and decisions: `docs/framework/contracts/offline-sync-api.md`, `law/adr/ADR-MOBILE-OFFLINE-0001-teat-promotion.md` and `law/adr/ADR-MOBILE-OFFLINE-0002-sync-parity.md`.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/auth`: `workspace:*`
- `@stynx-nyx/backend`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/testing`: `^11.1.26`
- `@types/node`: `24.13.4`
- `@types/supertest`: `^7.2.0`
- `supertest`: `^7.2.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
