---
adr_id: ADR-OUTBOX-0002
title: Append-only event log and per-event delivery
status: accepted
date: 2026-09-28
authors: ['Architect']
tags: [stynx, outbox, sse, audit, tenancy, ctg9]
---

# ADR-OUTBOX-0002 — Event log and delivery

**Decision source:** DETRAN C-0002 A1 §8.1 UPS-OBX-01…02, included in STYNX 1.5.0 by OD-S15-03. **Companion:** [CTG9 OBX contract](../../work/rounds/R-0002/ctg9-obx-contract.md).

## Context and supersession

ADR-OUTBOX-0001 promoted PEC's one-row-per-aggregate upsert. Its statement that one outstanding message per aggregate satisfies ordering, and that append-only replay requires a later decision, is superseded **only for the new append mode**. Existing `enqueue`, aggregate ACK, HMAC, claim-only dispatch and legacy storage semantics stay valid. A1 requires distinct facts, tenant-key dedup, SSE replay and a durable attempt/ACK ledger. The existing upsert table cannot be an SSE event source.

## Decision

Add an immutable tenant-scoped event log, a mutable per-event delivery projection and an append-only attempt/ACK ledger. `appendInTransaction(trx,event)` is the public OFS port; `appendManyInTransaction(trx,events)` records multiple facts in one transaction. Both use the caller's actual `Transaction`, derive tenant from the SQL session and require READ COMMITTED. Dedup is `(tenant_id,idempotency_key)`, not aggregate; conflicting content under a reused key fails. Delivery claims only the oldest nonterminal event for each aggregate, with lease and two-scheduler `SKIP LOCKED` claiming. ACK identifies an event or idempotency key plus tenant and cannot guess an aggregate among multiple events. Composite tenant/event FKs protect the owner-role ledger association. Dispatch remains at least once after lease reclamation; provider dedup uses event ID/key.

For SSE, serialize appends per tenant on a tenant-clock row held until commit. Assign millisecond `created_at` and UUIDv7 using a full global `bigint` sequence in its ordered bits while holding that lock. The public cursor is `(createdAt,id)`; `now`, `findById`, `listSince` use the primary, FORCE RLS and actual SQL tenant identity. `now` locks only the clock row, applies local `lock_timeout`, and limits per-tenant/process connection occupancy; the existing backend maps source failure to 503. A legacy UUIDv4 maps persistently to the migrated UUIDv7. No purge or additional public limit is decided for 1.5.0.

The shared audit chain must be made linear **before** append's clock lock. Migration ≥0021 redefines `audit.fn_row_change`, `audit.write` and `audit.write_command_event` to take one advisory key per tenant, using a fixed NULL sentinel, before selecting the head. Under READ COMMITTED, each computes `occurred_at = greatest(clock_timestamp(), head.occurred_at + 1µs)` and hashes that exact timestamp. RR/SERIALIZABLE fail before head selection with SQLSTATE `40001`, fixed MESSAGE `audit_chain_requires_read_committed`, and HINT to use RC; data maps this specific error to nonretryable `AuditChainIsolationError`. `audit.write` remains revoked to app. Owner `AuditSqlSink` may pass a real tenant. A transaction-local `stynx.audit_chain_key` binds the first chain key; a change raises `STY41` before another advisory, mapped to `AuditChainKeyMismatchError`. This GUC is transaction self-protection, not a boundary against arbitrary SQL. Head indexes cover `(tenancy_id,occurred_at DESC,event_id DESC)` plus NULL partial case; lookups split equality and IS NULL.

Legacy audit hashes and timestamps are untouched. Migration follows `previous_hash` links and records linear, temporally misordered, forked and hash-mismatched segments, including NULL tenant, without aborting solely for a legacy defect. It records tips/diagnostics, then seals each segment with an explicit new-epoch anchor after its greatest timestamp under the advisory. `audit.verify_chain` keeps public columns and partitions `lag()` by epoch; legacy invalid rows remain invalid. `audit.verify_current_epoch(tenant,limit)` starts at the anchor regardless of how many legacy rows precede it. A diagnostic function exposes legacy state. Actual migration errors abort. A hash mismatch in release data requires Owner evaluation before final publication.

`Database.txIndependent` is additive: it refuses a held connection before pool acquisition, including across derived request/system contexts, using a mutable AsyncLocalStorage holder with `held` and `strict` cleared in `finally`. In strict item scope any `Database.tx` that would open a second connection fails typed; legacy `Database.tx` outside strict mode retains its behavior. `TxOptions.isolation` applies at top-level before the first query; nested mismatch fails. The item validates isolation and read/write state on the live connection. Audit chain lock precedes clock. An OFS item seals its last append with `SET LOCAL transaction_read_only = on`; a later write maps SQLSTATE 25006 to `ReadOnlyViolationError`. Generic append within a CTG5 transactional command may leave the connection writable for the command envelope's later audit/idempotency writes; it retains the clock until commit, and the advisory→clock order remains mandatory. This is a narrowly required composition, documented in the contract and bounded at SSE `now()` by timeout/admission. It does not change CTG5's published path.

Migration ≥0021 copies pending, ERROR, SENT in flight and ACKED legacy rows to mapped events and projection without making SENT immediately due or sending ACKED again. It retains lease/ACK provenance and cuts claim authority atomically. History without exact bytes is marked unavailable, never fabricated. Inspector proves an ACK race at cutover and no duplicate send. Engineer updates canonical DDL, seeds and DB tests; no historical migration is edited.

## Consequences

SSE replay has commit-monotonic visibility, at-least-once delivery and no replica-staleness gap. A long generic transaction after append retains the tenant clock and can cause same-tenant SSE `now()` to return 503; clients retry. The NULL audit chain sentinel and per-tenant clock can serialize writers, so contention and pool occupancy need measurements. No release conformity is claimed until migration, RLS, scheduler and Inspector sensors pass.
