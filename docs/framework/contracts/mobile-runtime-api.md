# Mobile Runtime API Contract

**Package:** `@stynx-nyx/mobile-runtime`
**Status:** Supported (E6)
**Authority:** `INV-OFFLINE-001` and `ADR-MOBILE-OFFLINE-0001`
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
   submitted items to `pending`; acknowledgements advance them to `synced` or `conflict`.
9. `resolveSimpleConflict` supports `device-wins`, `server-wins`, and `manual-review`.

`entityType` is an open generic string owned by the consumer. A consumer should narrow it to its
own union at compile time. STYNX does not attach meaning to values such as `ait`.

## Security and persistence

- Construction fails unless the store reports `encrypted: true`.
- Evidence and sync payload hashes are lowercase `sha256:<64 hex>` values.
- Session, draft, queue, evidence, reservation, and receipt records are tenant/device scoped.
- Client posture is informative, not attested. Phase 5 must add server-side attestation.
- Production Capacitor, camera, GPS, and printer adapters are consumer responsibilities.

## Compatibility

The public root export contains runtime, ports, and types. Test adapters are intentionally isolated
at `@stynx-nyx/mobile-runtime/testing` so production bundles do not depend on sandbox facilities.
