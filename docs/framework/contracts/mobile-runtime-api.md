# Mobile Runtime API Contract

**Package:** `@stynx-nyx/mobile-runtime`
**Status:** Supported (E6)
**Authority:** `INV-OFFLINE-001`, `ADR-MOBILE-OFFLINE-0001`, and [ADR0051 checked storage migration](../../../law/adr/2026-10-25-s10-mobile-checked-storage-migration.md)
**Effective:** 2026-08-24

The runtime is framework-free TypeScript. It owns orchestration and durable local state, while
platform and network behavior enter through seven consumer-supplied ports: encrypted store,
crypto, clock, ID, STYNX session, printer, and backend client. The package's `testing` export
provides deterministic sandbox implementations; it is not a production security boundary.

## Normative sequence

1. `bootstrapSession` (or `bootstrapFromStynxSession`) validates session and device posture.
2. `installPublishedNormativePackage` pins an unexpired published package.
3. `reserveNumbering({ entityType, requestedSize, series? })` obtains an entity-scoped interval.
4. `createDraft` allocates one number and creates an idempotency-keyed local draft.
5. `attachEvidence` accepts only `hashAlgorithm: 'sha256'` with a `sha256:` digest.
6. `finalizeOffline` enforces normative-package, numbering, hash, and optional evidence rules.
7. `enqueue` creates a stable retry payload and payload hash.
8. `submitPendingQueue` submits pending items as a device batch. A transport failure restores
   submitted items to `pending`; acknowledgements advance them to `received` or `conflict`.
9. `resolveSimpleConflict` supports `device-wins`, `server-wins`, and `manual-review`.

`entityType` remains a consumer-owned generic string. The required seventh constructor argument,
`MobileRuntimeCheckedOptions<TEntityType>`, supplies `entityTypes: readonly TEntityType[]` so
persisted drafts and queue items are checked against that vocabulary, including after restarting
with an existing store. The sixth argument is a printer or explicit `undefined`. STYNX does not
attach domain meaning to values such as `ait`.

## Checked storage and results

Raw `MobileEncryptedStorePort.get` returns `Promise<unknown>` and `list` returns
`Promise<unknown[]>`; callers must check values rather than select a generic read type. `put<T>`
and native storage serialization remain unchanged. Missing reads still yield `undefined`.

Typed runtime consumers validate stored session, device, normative-package, reservation, draft,
and queue records before use. Invalid configuration throws `TypeError('Invalid mobile runtime
entityTypes')`; invalid stored shapes or draft/queue subtypes throw
`TypeError('Invalid stored mobile record: <collection>')` without stored data. Existing missing-read
fallbacks remain. Validation can reject malformed later list items before earlier writes and can
reject an invalid session before a remote wipe clears storage. Count-only collections remain raw.

Checked object envelopes are fresh snapshots: own enumerable extras and symbol values are
preserved shallowly; declared inherited/non-enumerable fields may be materialized. Only declared
structures are recursively copied, with dense checked array indices and no array extras. Opaque
values retain their references. Original envelope identity, prototypes and getter timing are not
promised; storage/getter exceptions propagate unchanged. Optional absence remains absent, while a
present `undefined` is invalid where the declared field type excludes it. No date parsing or
number coercion is added.

`CreateMobileDraftInput.payload` and the constructed `createDraft` result remain records.
`attachEvidence` and `finalizeOffline` return `MobileStoredEntityDraft<TEntityType>` with
`payload: unknown`, and printer input uses that stored draft model. This preserves scalar payloads
produced by native serialization of valid record inputs. `enqueue` and backend contracts retain
an outer record `MobileSyncQueueItem.payloadJson`, whose nested draft payload may be unknown.
See the [package migration guide](../../../packages/mobile-runtime/README.md#checked-storage-migration)
for constructor examples and snapshot details.

## Security and persistence

- Construction fails unless the store reports `encrypted: true`.
- Evidence and sync payload hashes are lowercase `sha256:<64 hex>` values.
- Session, draft, queue, evidence, reservation, and receipt records are tenant/device scoped.
- Client posture is informative, not attested. Phase 5 must add server-side attestation.
- Production Capacitor, camera, GPS, and printer adapters are consumer responsibilities.

## Compatibility

The public root export contains runtime, ports, and types. Test adapters are intentionally isolated
at `@stynx-nyx/mobile-runtime/testing` so production bundles do not depend on sandbox facilities.
