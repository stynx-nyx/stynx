---
adr_id: ADR-MOBILE-OFFLINE-0002
title: Durable offline batch and numbering parity
status: accepted
date: 2026-09-28
authors: ['Architect']
tags: [stynx, offline-sync, mobile, tenancy, idempotency]
supersedes: ADR-MOBILE-OFFLINE-0001 queue deduplication and fixed-policy decisions only
---

# ADR-MOBILE-OFFLINE-0002 — Durable offline batch and numbering parity

## Authority and context

OD-S15-03 includes DETRAN C-0002 A1 §8.1 UPS-OFS-01…04 in STYNX 1.5.0. This decision extends the E6 promotion recorded in ADR-MOBILE-OFFLINE-0001. Its framework-free mobile runtime, open `entityType`, tenant RLS, authenticated actor, and consumer-owned policy remain in force. The detailed interface is the [CTG9 OFS contract](../../work/rounds/R-0002/ctg9-ofs-contract.md) and the [offline-sync API contract](../../docs/framework/contracts/offline-sync-api.md). Acceptance requires implementation and independent sensors; this ADR alone is no release evidence.

The current `offline.sync_queue_items` unique `(tenant_id,payload_hash)` and a global 24-hour TTL cannot represent distinct items with identical bytes, a catalogue TTL, durable batch identity, or the consumer's receipt protocol. `submitSyncBatch` presently stores queue rows without domain application. Manual `device-wins/server-wins/manual-review` cannot implement conflict-specific DETRAN actions by name substitution.

## Decision

Configuring the new `OfflineSyncPolicyResolver` selects CTG9 durable parity
mode at module bootstrap. Without it, existing E6 callers keep payload-hash
deduplication across different keys, second-cancel 409, the published TTL
default and the 100-item maximum. In CTG9 mode, item identity is the key
with hash integrity and a repeated terminal cancellation returns its prior
result. The two modes use the same public routes but the module binds the E6
or CTG9 batch controller once at bootstrap; no request body can select mode.
The 0002 schema is required before running any 1.5.0 offline-sync code,
even E6, with a typed upgrade-required error on 0001 alone. It preserves
E6 hash deduplication with an E6-only partial unique index, filtered
lookup and updated insert conflict target. The queue adds server-owned
`identity_mode text NOT NULL DEFAULT 'e6' CHECK (identity_mode IN
('e6','ctg9'))` while retaining global tenant/key uniqueness. CTG9 rows
explicitly use key identity.
The published `OfflineSyncStore` stays unchanged; CTG9 requires a separate
durable store interface and distinct input/receipt types. Missing durable
operations or CTG9-only ports without a policy resolver fail at bootstrap.

1. **Numbering.** Extend the reservation lifecycle with block, close, reconcile, settle, and consumption reads. Preserve current reserve and cancel APIs and route behavior. Range allocation and consumption remain tenant scoped under FORCE RLS and are serialized at the range. Applied numbers are never reissued; only an unused tail may be released. `OfflineSyncPolicyResolver` obtains TTL, concurrency window, and batch policy per tenant/org/operation at execution time using an injectable clock. With no resolver, keep the published `reservationTtlMs ?? 86_400_000` and 100-item maximum as legacy defaults. With a resolver, a missing tenant/org value follows the host's explicit missing-parameter policy and never falls back to another tenant or global default; a scoped policy can admit more than 100 items. `OfflineSyncAgentResolver` obtains business `agentId` independently of trusted `actorId`; authorization remains application-owned.
2. **Batch and item identity.** Add durable batches unique by `(tenant,device,device_batch_id)` and sequenced batches unique by `(tenant,device,batch_sequence)`. Persist the declared key set and item receipts. Closed replay with identical context returns the original status and body bytes; mismatch returns 409. Repeated sequence returns 409 and gap returns 422. A DB-backed open-batch lease with fencing generation allows one active applier, then exact replay or safe resume after expiration; a second concurrent request never runs the same item effect. A missing sequence remains a valid legacy batch. CTG9 item deduplication becomes `(tenant,idempotency_key)` with hash verification: same key/hash replays, same key/different hash produces a rejected integrity attempt receipt without changing the original, and different keys with identical payloads remain independent. A missing key receives an internal `stynx:legacy:v1:` SHA-256-derived storage key in a namespace forbidden to explicit client keys and a `received` receipt with neutral `OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED`; optional `OfflineSyncLegacyItemIdentityResolver` preserves a host's cross-batch legacy identity without applying the item. The TEAT adapter maps the neutral code to its existing public code. No domain effect is attempted.
3. **Atomic item application.** Export `OfflineSyncItemApplier`. Each item runs serially in a top-level `Database.txIndependent` app-role READ COMMITTED transaction. Its domain effect, numbering consumption, receipt, and event through `OfflineSyncEventPort.appendInTransaction(trx,event)` share the same `Transaction` and commit. Exactly one final event-port call per item uses `appendInTransaction` or `appendManyInTransaction`; no item DML follows the OBX seal. If one item fails, its transaction rolls back, its classified result is persisted separately, and the batch may continue. No outer transaction spans items. The service checks `Database.assertNoHeldConnection` before the first batch write; strict item mode refuses a second connection hidden by derived CLS context. Ordinary `Database.tx` semantics outside that mode remain unchanged. The event port name is the OBX contract's stable seam; this ADR does not redefine data, audit, or outbox semantics.
4. **Concurrency.** Export `OfflineSyncConcurrencyDetector`, `OfflineSyncHandoffPort`, and `OfflineSyncConflictResolver`. Detect the same business agent acting from different devices inside a resolved window, except for an authorized handoff. Mark both affected acts and preserve conflict-specific allowed actions. Existing resolution names continue to work for legacy callers but are not mechanical equivalents of DETRAN actions.
5. **Storage and transport.** Ship an additive `migrations/0002_*.sql` after the existing 0001 migration. Preserve legacy rows and public route/status/envelope behavior while adding tenant-leading batch, receipt, consumption, and conflict evidence structures, grants, and FORCE RLS. In CTG9 mode the batch route replaces its generic `@Idempotent` interceptor with OFS in-service verification; the E6 controller retains its decorator. Nonblank `Idempotency-Key` is mandatory (missing 400); trusted batch identity, sequence, and declared set are checked first (domain 409/422); unrelated reuse of that transport key with a changed method/path/body fingerprint keeps 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`; identical closed retry returns the persisted original HTTP status, body bytes and replayable headers, plus the configured replay-key and replay-marker headers. A held open-batch lease that outlasts the bounded wait returns 503 `OFFLINE_SYNC:BATCH:in-progress`, `retryable:true` and `Retry-After: 1`, without starting a second applier. Other routes retain `@Idempotent`. Legacy 0001 rows lack original response bytes; their backfilled batch is `legacy_closed_unverified` and cannot fabricate exact replay or reapply an effect. Before conflict or write, a read-only bridge checks the existing `IdempotencyStore` with the published tenant/user/route/key scope and fingerprint; an unexpired completed record replays its status/body/headers through the legacy interceptor serialization path, including configured replay headers, and never reapplies the item. Pending, expired, mismatched or absent records cannot authorize an effect. The bridge does not reserve or persist into the legacy store. Independently verified archived ACK bytes/headers can also promote the row to replayable closed state. Maintain TEAT and BOAT adoption through thin adapters, not product vocabulary inside STYNX.

## Compatibility and boundaries

`INV-OFFLINE-001` is not weakened. An unkeyed legacy item remains stored but unapplied; any actual offline-originated entity mutation still requires the invariant's key, hash, numbering, actor/device context, local time, and normative package information. Existing source clients retain the four current service operations and routes. Additive APIs and nullable legacy input fields allow migration without inventing a new public limit; the existing 100-item maximum persists only for adopters that do not configure the new resolver. A later implementation that cannot preserve these conditions needs an exact Owner decision and an authorized invariant/contract change before release.

CTG5's `Database.tx` and `Transaction` are dependencies, not authority to wrap the entire batch in `@TransactionalCommand`. An enclosing command boundary fails before any write. The independent transaction and strict connection-holder behavior are defined by the CTG9 OBX/data work; OFS consumes them by name. OFS has no direct dependency on OBX. The event port implementation must operate on the supplied `Transaction` without a second `Database.tx` or system context.

## Required evidence and migration risk

Inspector must prove the new storage from an empty database and an upgrade of populated 0001 data, including old queue rows whose payload hash is duplicated only after the new key policy is enabled. Real PostgreSQL tests must prove two-tenant RLS, reservation races, crash/replay and sequence races, partial batch completion, item rollback, and pool-sized strict-mode failures without deadlock. TEAT and BOAT HTTP characterization must compare routes, statuses, exact body bytes, replayable and replay-marker/key headers, and conflict/receipt codes. A held lease must produce 503/Retry-After, and upgrade sensors must prove unexpired legacy durable-store replay and expired/mismatched fail-closed outcomes without a second effect. Root `test/db` and seed obligations apply to changed DDL. The Architect rebinds trace and API baselines after implementation; the maestro serializes shared migration, lockfile, changeset, and generated README work. No package publication follows from this ADR alone.
