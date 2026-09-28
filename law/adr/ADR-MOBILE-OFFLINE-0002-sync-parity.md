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

1. **Numbering.** Extend the reservation lifecycle with block, close, reconcile, settle, and consumption reads. Preserve current reserve and cancel APIs and route behavior. Range allocation and consumption remain tenant scoped under FORCE RLS and are serialized at the range. Applied numbers are never reissued; only an unused tail may be released. `OfflineSyncPolicyResolver` obtains TTL, concurrency window, and batch policy per tenant/org/operation at execution time using an injectable clock. A missing catalogue value follows the host's established policy, never an implicit 24-hour replacement. `OfflineSyncAgentResolver` obtains business `agentId` independently of trusted `actorId`; authorization remains application-owned.
2. **Batch and item identity.** Add durable batches unique by `(tenant,device,device_batch_id)` and sequenced batches unique by `(tenant,device,batch_sequence)`. Persist the declared key set and item receipts. Closed replay with identical context returns the original receipt; mismatch returns 409. Repeated sequence returns 409 and gap returns 422. A missing sequence remains a valid legacy batch. Item deduplication becomes `(tenant,idempotency_key)` with hash verification: same key/hash replays, same key/different hash produces a rejected integrity receipt, and different keys with identical payloads remain independent. A missing key receives a synthetic storage key and a `received` receipt with `TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED`; no domain effect is attempted. No fixed 100-item ceiling applies to otherwise valid batches.
3. **Atomic item application.** Export `OfflineSyncItemApplier`. Each item runs serially in a top-level `Database.txIndependent` app-role READ COMMITTED transaction. Its domain effect, numbering consumption, receipt, and event through `OfflineSyncEventPort.appendInTransaction(trx,event)` share the same `Transaction` and commit. If one item fails, its transaction rolls back, its classified result is persisted separately, and the batch may continue. No outer transaction spans items. The service checks `Database.assertNoHeldConnection` before the first batch write; strict item mode refuses a second connection hidden by derived CLS context. Ordinary `Database.tx` semantics outside that mode remain unchanged. The event port name is the OBX contract's stable seam; this ADR does not redefine data, audit, or outbox semantics.
4. **Concurrency.** Export `OfflineSyncConcurrencyDetector`, `OfflineSyncHandoffPort`, and `OfflineSyncConflictResolver`. Detect the same business agent acting from different devices inside a resolved window, except for an authorized handoff. Mark both affected acts and preserve conflict-specific allowed actions. Existing resolution names continue to work for legacy callers but are not mechanical equivalents of DETRAN actions.
5. **Storage and transport.** Ship an additive `migrations/0002_*.sql` after the existing 0001 migration. Preserve legacy rows and public route/status/envelope behavior while adding tenant-leading batch, receipt, consumption, and conflict evidence structures, grants, and FORCE RLS. Transport-level `Idempotency-Key` cannot mask domain 409/422; the durable batch receipt governs replay for controller and service users. Maintain TEAT and BOAT adoption through thin adapters, not product vocabulary inside STYNX.

## Compatibility and boundaries

`INV-OFFLINE-001` is not weakened. An unkeyed legacy item remains stored but unapplied; any actual offline-originated entity mutation still requires the invariant's key, hash, numbering, actor/device context, local time, and normative package information. Existing source clients retain the four current service operations and routes. Additive APIs and nullable legacy input fields allow migration without inventing a new public limit. A later implementation that cannot preserve these conditions needs an exact Owner decision and an authorized invariant/contract change before release.

CTG5's `Database.tx` and `Transaction` are dependencies, not authority to wrap the entire batch in `@TransactionalCommand`. An enclosing command boundary fails before any write. The independent transaction and strict connection-holder behavior are defined by the CTG9 OBX/data work; OFS consumes them by name. OFS has no direct dependency on OBX. The event port implementation must operate on the supplied `Transaction` without a second `Database.tx` or system context.

## Required evidence and migration risk

Inspector must prove the new storage from an empty database and an upgrade of populated 0001 data, including old queue rows whose payload hash is duplicated only after the new key policy is enabled. Real PostgreSQL tests must prove two-tenant RLS, reservation races, crash/replay and sequence races, partial batch completion, item rollback, and pool-sized strict-mode failures without deadlock. TEAT and BOAT HTTP characterization must compare routes, statuses, bodies, and conflict/receipt codes. Root `test/db` and seed obligations apply to changed DDL. The Architect rebinds trace and API baselines after implementation; the maestro serializes shared migration, lockfile, changeset, and generated README work. No package publication follows from this ADR alone.
