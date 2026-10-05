# `@stynx-nyx/mobile-runtime` — framework-free offline-first runtime for mobile consumers

`@stynx-nyx/mobile-runtime` is framework-free offline-first orchestration for STYNX mobile consumers (spec extension E6). It promotes TEAT's proven runtime behind seven ports and keeps entity vocabulary consumer-defined. The runtime owns the sequence and the local state; every device capability it touches (encrypted storage, hashing, clock, id generation, session, printer, backend) is supplied by the consuming app as a port.

## Purpose

A field application has to keep issuing numbered, official records while the device is offline, and must not double-issue them when connectivity returns. `OfflineFirstMobileRuntime` enforces one workflow for that: session bootstrap, normative-package install, entity-scoped number reservation, draft, evidence, finalization, queue submission, and conflict resolution.

Every draft carries a device-generated idempotency key, a number consumed from a server-granted reservation, and a content hash, so a batch can be retried after a transport failure without creating a second entity.

What it does not do: it has no dependency on Angular, Capacitor, NestJS or any HTTP client. Production secure-storage, session, backend, camera, GPS, and printer adapters are consumer-owned. It does not attest device posture; posture is asserted by the device. It does not transport evidence binaries; only hash-first evidence metadata is stored.

## Audience

Developers of a mobile or other offline-capable client that syncs with a STYNX backend, and developers writing the port adapters for a specific device platform.

## Install

```bash
pnpm add @stynx-nyx/mobile-runtime
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

The package has no runtime dependencies. It has two entry points: the root export (runtime, ports, types) and `@stynx-nyx/mobile-runtime/testing` (sandbox adapters).

## Quick start

The constructor takes the ports positionally: store, backend, crypto, clock, ids, optional printer, optional options. The sandbox adapters from the testing entry are enough to run the whole journey in a test.

```ts
import { OfflineFirstMobileRuntime } from '@stynx-nyx/mobile-runtime';
import {
  FixedMobileClock,
  InMemoryEncryptedMobileStore,
  NodeMobileCryptoPort,
  SandboxMobileBackendClient,
  SandboxStynxMobileSessionPort,
  SequentialMobileIdPort,
} from '@stynx-nyx/mobile-runtime/testing';

type EntityType = 'inspection' | 'notice';

const clock = new FixedMobileClock();
const runtime = new OfflineFirstMobileRuntime<EntityType>(
  new InMemoryEncryptedMobileStore(),
  new SandboxMobileBackendClient<EntityType>(),
  new NodeMobileCryptoPort(),
  clock,
  new SequentialMobileIdPort(),
);

await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
  homologated: true,
  remoteWipeVersion: 1,
  secureHardwareBacked: true,
  printerStatus: 'paired',
  networkStatus: 'online',
});
await runtime.installPublishedNormativePackage();
await runtime.reserveNumbering({ entityType: 'inspection', requestedSize: 10 });
```

## Public API surface

### Runtime

`OfflineFirstMobileRuntime<TEntityType extends string = string>` is the only class in the root export.

| Method                                            | Returns                                   | Description                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrapSession(context, posture)`              | `Promise<void>`                           | Checks required roles and device posture, then stores the active session and posture.                                                 |
| `bootstrapFromStynxSession(sessionPort, posture)` | `Promise<MobileSessionContext>`           | Reads the session from a `MobileStynxSessionPort` and calls `bootstrapSession`.                                                       |
| `installPublishedNormativePackage()`              | `Promise<MobileNormativePackageSnapshot>` | Fetches the package from the backend port and stores it; rejects a package that is not `published` or whose `validUntil` has passed.  |
| `reserveNumbering(input)`                         | `Promise<MobileNumberingReservation>`     | Requests an entity-scoped interval for the active session and stores it; rejects a reservation returned for a different `entityType`. |
| `createDraft(input)`                              | `Promise<MobileEntityDraft>`              | Consumes the next number of a usable reservation and stores a draft with idempotency key and content hash.                            |
| `attachEvidence(localEntityId, evidence)`         | `Promise<MobileEntityDraft>`              | Links evidence metadata to a draft; requires `hashAlgorithm: 'sha256'` and a `hashValue` starting with `sha256:`.                     |
| `finalizeOffline(localEntityId)`                  | `Promise<MobileEntityDraft>`              | Moves a `draft` to `finalized` after checking the offline invariants, and recomputes the content hash.                                |
| `enqueue(localEntityId)`                          | `Promise<MobileSyncQueueItem>`            | Creates a `pending` queue item from a `finalized` draft and marks the draft `queued`.                                                 |
| `submitPendingQueue()`                            | `Promise<MobileSyncBatchResult>`          | Submits all `pending` items as one device batch; marks each `received` or `conflict` from the server result.                          |
| `resolveSimpleConflict(queueItemId, resolution)`  | `Promise<MobileConflictResolution>`       | Resolves a `conflict` item through the backend port, marks the item `applied` and its draft `synced`.                                 |
| `printReceipt(localEntityId)`                     | `Promise<MobilePrintReceipt>`             | Prints through the printer port for a `finalized`, `queued` or `synced` draft and stores the receipt.                                 |
| `applyRemoteWipe(reason)`                         | `Promise<MobileRemoteWipeReceipt>`        | Clears the store, then stores a wipe receipt.                                                                                         |
| `snapshot()`                                      | `Promise<MobileRuntimeSnapshot>`          | Aggregate counts and the active session, package and posture, for diagnostics.                                                        |

The runtime throws plain `Error` instances with descriptive messages; the package exports no error classes or error codes.

### Ports

| Export                     | Members                                                                                                 | Description                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `MobileEncryptedStorePort` | `adapterName`, `encrypted`, `encryptionScope`, `securityLevel`, `put`, `get`, `list`, `remove`, `clear` | Encrypted device-local key-value store grouped by named collections. |
| `MobileBackendClientPort`  | `fetchPublishedNormativePackage`, `reserveNumbering`, `submitSyncBatch`, `resolveSyncConflict`          | Server calls the runtime makes while online.                         |
| `MobileCryptoPort`         | `contentHash(value): string`                                                                            | Deterministic content hashing producing `sha256:`-prefixed digests.  |
| `MobileClockPort`          | `now(): string`                                                                                         | Wall clock as an ISO-8601 string.                                    |
| `MobileIdPort`             | `uuid(prefix): string`                                                                                  | Local unique ids with a semantic prefix.                             |
| `MobileStynxSessionPort`   | `currentSession(): Promise<MobileSessionContext>`                                                       | Bridge to the authenticated STYNX session on the device.             |
| `MobilePrinterPort`        | `adapterName`, `printReceipt(input)`                                                                    | Paired receipt printer. Optional.                                    |

### Types

| Export                                                                 | Description                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `MobileSessionContext`                                                 | Tenant, org unit, agent, device, shift, app version and roles of the active session.                    |
| `MobileDevicePosture`                                                  | Device-asserted posture: homologation, remote-wipe version, secure hardware, printer and network state. |
| `MobileNormativePackageSnapshot`                                       | Published rule package pinned for offline validation.                                                   |
| `MobileNumberingReservation`, `ReserveMobileNumberingInput`            | Reserved interval and the input that requests one.                                                      |
| `MobileEntityDraft`, `CreateMobileDraftInput`, `MobileLocationContext` | Local draft, its creation input, and where it was drafted.                                              |
| `MobileEvidenceDraft`                                                  | Hash-first evidence metadata.                                                                           |
| `MobileSyncQueueItem`, `MobileSyncBatchResult`                         | Queue entry and the server acknowledgement of a submitted batch.                                        |
| `MobileConflictResolution`, `SyncConflictResolutionStrategy`           | Server-confirmed resolution; strategies are `device-wins`, `server-wins` and `manual-review`.           |
| `MobilePrintReceipt`, `MobileRemoteWipeReceipt`                        | Receipts stored after printing and after a remote wipe.                                                 |
| `MobileRuntimeSnapshot`                                                | Result of `snapshot()`.                                                                                 |
| `MobileRuntimeOptions`                                                 | Constructor options; see [Configuration](#configuration).                                               |
| `LocalDraftStatus`                                                     | `'draft' \| 'finalized' \| 'queued' \| 'synced' \| 'conflict' \| 'wiped'`.                              |
| `SyncQueueStatus`                                                      | `'pending' \| 'sent' \| 'received' \| 'applied' \| 'conflict' \| 'rejected'`.                           |

### Testing entry (`@stynx-nyx/mobile-runtime/testing`)

These adapters run in-process on Node and are intended for tests, sandboxes and reference wiring, never for production devices.

| Export                          | Implements                 | Description                                                                                                                 |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `InMemoryEncryptedMobileStore`  | `MobileEncryptedStorePort` | In-memory store that keeps values base64-sealed; `rawCollection(name)` exposes the sealed values for assertions.            |
| `NodeMobileCryptoPort`          | `MobileCryptoPort`         | SHA-256 over stable JSON, returned as `sha256:<hex>`.                                                                       |
| `FixedMobileClock`              | `MobileClockPort`          | Clock that returns a fixed instant until `setNow(value)` is called.                                                         |
| `SequentialMobileIdPort`        | `MobileIdPort`             | Ids of the form `<prefix>-0001`, `<prefix>-0002`, and so on.                                                                |
| `SandboxStynxMobileSessionPort` | `MobileStynxSessionPort`   | Returns a fixed session; pass a `MobileSessionContext` to override the default.                                             |
| `SimulatedMobilePrinterPort`    | `MobilePrinterPort`        | Returns receipts with status `simulated`.                                                                                   |
| `SandboxMobileBackendClient`    | `MobileBackendClientPort`  | Scriptable backend. Records `submittedBatches` and `resolvedConflicts`; reports a conflict for configured reserved numbers. |
| `stableJson`                    | function                   | `(value: unknown): string`, JSON with sorted object keys.                                                                   |

## Configuration

Configuration is the optional last constructor argument, `MobileRuntimeOptions`. The package reads no environment variables.

| Option                      | Type                | Default          | Description                                                                     |
| --------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `requiredRoles`             | `readonly string[]` | `[]`             | Roles the bootstrapped session must carry. Empty means any session is accepted. |
| `requireEvidenceToFinalize` | `boolean`           | `true`           | Whether `finalizeOffline` requires at least one linked evidence record.         |
| `draftIdPrefix`             | `string`            | `'entity-local'` | Prefix passed to the id port for local draft identifiers.                       |

## Examples

### Example 1 — draft, evidence, finalize, enqueue

Continuing from the quick start:

```ts
const draft = await runtime.createDraft({
  entityType: 'inspection',
  payload: { plate: 'QWE4A21' },
  observedAt: clock.now(),
  location: {
    latitude: -3.119,
    longitude: -60.0217,
    accuracyMeters: 8,
    capturedAt: clock.now(),
    source: 'gps',
  },
});

await runtime.attachEvidence(draft.localId, {
  localEvidenceId: 'evidence-local-0001',
  hashAlgorithm: 'sha256',
  hashValue: 'sha256:demo-evidence-hash-0001',
  mediaType: 'image/jpeg',
  capturedAt: clock.now(),
});

await runtime.finalizeOffline(draft.localId);
const queueItem = await runtime.enqueue(draft.localId);
```

### Example 2 — submit and resolve a conflict

```ts
const result = await runtime.submitPendingQueue();

for (const queueItemId of result.conflicts) {
  await runtime.resolveSimpleConflict(queueItemId, 'device-wins');
}
```

When no item is pending, `submitPendingQueue()` returns `{ batchId: 'empty', acceptedItems: 0, conflicts: [] }` without calling the backend. If the backend port throws, the submitted items are restored to `pending` and the error is rethrown.

### Example 3 — required roles and optional evidence

```ts
const runtime = new OfflineFirstMobileRuntime<'crash-record'>(
  store,
  backend,
  crypto,
  clock,
  ids,
  undefined,
  {
    requiredRoles: ['field-agent'],
    requireEvidenceToFinalize: false,
    draftIdPrefix: 'crash-local',
  },
);
```

### Example 4 — receipt and remote wipe

```ts
const receipt = await runtime.printReceipt(draft.localId);

await runtime.applyRemoteWipe('supervisor-revoked-device');
const state = await runtime.snapshot();
// state.pendingWipe === true; the session, drafts and queue are gone
```

## Common pitfalls

- **Construction rejects an unencrypted store.** The constructor throws unless the store port reports `encrypted: true`. The flag is self-reported by the adapter; the runtime cannot verify the encryption.
- **The sandbox store is not encryption.** `InMemoryEncryptedMobileStore` base64-encodes values. Never ship the testing entry to a device.
- **Device posture is client-asserted.** `bootstrapSession` requires `homologated` and `secureHardwareBacked` to be true, but nothing on the device proves them. Do not treat posture as a control against a hostile device.
- **Order is enforced.** `reserveNumbering` and `createDraft` throw without a bootstrapped session, and `createDraft` throws without an installed normative package or a usable reservation for the entity type.
- **A reservation is usable only while it is `reserved`, unexpired and not exhausted.** When `reservedNumber` is passed to `createDraft`, it must equal the reservation's next number.
- **`createDraft` adds `observed_at` to the stored payload** from the `observedAt` input.
- **Evidence and payload digests use `sha256:` prefixes.** `attachEvidence` rejects any other evidence hash. The payload hash comes from the `MobileCryptoPort`; a production adapter must return the same prefixed form, because the server pair validates it.
- **A successful submit does not mark the draft `synced`.** Acknowledged items become `received` and the draft stays `queued`; the runtime sets `synced` only in `resolveSimpleConflict`.
- **`printReceipt` needs a printer port.** It throws when the runtime was constructed without one, and for a draft that is not yet finalized.
- **A remote wipe clears everything, including the session.** Bootstrap again before any further operation.

## Related packages

- [`@stynx-nyx/offline-sync`](/docs/packages/offline-sync/) — the server pair: NestJS numbering reservation, sync batch and conflict endpoints that a production `MobileBackendClientPort` adapter calls. It is not a dependency of this package.

Contract and decisions: `docs/framework/contracts/mobile-runtime-api.md`, `law/adr/ADR-MOBILE-OFFLINE-0001-teat-promotion.md` and `law/adr/ADR-MOBILE-OFFLINE-0002-sync-parity.md`.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

_None._

### Optional dependencies

_None._

### Peer dependencies

_None._

### Development-only dependencies

- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
