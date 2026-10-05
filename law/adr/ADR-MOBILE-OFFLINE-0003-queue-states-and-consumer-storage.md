---
adr_id: ADR-MOBILE-OFFLINE-0003
title: Pending queue state, open manual review, typed receipt context and consumer-owned offline storage
status: accepted
date: 2026-10-05
authors: ['Architect']
tags: [stynx, offline-sync, mobile, tenancy, idempotency, rls, detran]
supersedes: ADR-MOBILE-OFFLINE-0002 queue status set, always-closing resolution, integrity recording and batch-wide hash rejection decisions only
---

# ADR-MOBILE-OFFLINE-0003 — Pending queue state, open manual review, typed receipt context and consumer-owned offline storage

**Status:** Accepted. This ADR is specification only. It authorizes no source,
test, migration or workflow change by itself, and it is no release evidence.
**Authority:** Architect, recording the Owner decisions of 2026-10-05 on
stynx-nyx/stynx#317 (DETRAN C-0002, consumer round R-0022, contract CTG-0009).
**Amends:** [ADR-MOBILE-OFFLINE-0002](ADR-MOBILE-OFFLINE-0002-sync-parity.md).
Every decision of that ADR that this ADR does not name stays in force,
including the E6 mode, which none of the decisions below changes.
**Related:** [ADR-OUTBOX-0003](ADR-OUTBOX-0003-configurable-role-and-consumer-storage.md)
D1 (application role name), D2 and D3 (consumer-owned storage).

## Context

STYNX 1.5.3 (`main@2505251f`) closed UPS-OFS-05 and partly delivered
UPS-OFS-09, UPS-OFS-11 and UPS-OFS-14. Six requests need a decision that
ADR-MOBILE-OFFLINE-0002 does not contain.

Verified state of `packages/offline-sync` at `main@2505251f`:

- `OfflineSyncQueueStatus` is `'received' | 'applied' | 'conflict' | 'rejected'`
  (`src/types.ts:1`). The same four values are a `CHECK` on
  `offline.sync_queue_items.status` (`migrations/0001_offline_sync.sql:75-76`),
  `offline.sync_item_receipts.status` and `offline.sync_item_attempts.status`
  (`migrations/0002_durable_sync.sql:68`, `:87`).
- `offline.sync_conflicts` requires `status = 'open'` with a null `resolution`
  and `resolved_at`, or `status = 'resolved'` with both set
  (`0001_offline_sync.sql:113-116`). `PostgresOfflineSyncStore.resolveWithPort`
  refuses a resolver result other than `resolved`
  (`src/postgres-offline-sync.store.ts:125`). There is no action history.
- `SyncItemReceipt` is `queueItemId`, `status`, `errorCode?`, `context?`
  (`src/types.ts:258-263`). The receipt identifier is the tenant-scoped storage
  key of the item receipt (`src/types.ts:209-210`). `server_entity_id` exists
  only in `offline.numbering_consumption`.
- A same-key submission with a different hash writes a rejected
  `OFFLINE_SYNC_ITEM_INTEGRITY` row in `offline.sync_item_attempts` and
  nothing else (`src/postgres-durable.ts:326-333`).
- `payload_hash` must match `^sha256:[0-9a-f]{64}$` in
  `offline.sync_queue_items` and `offline.sync_conflicts`
  (`0001_offline_sync.sql:72`, `:98`). The receipt and attempt tables have no
  such `CHECK`. The service rejects the whole batch with 400 before any SQL
  (`src/offline-sync.service.ts:38`, `:194-196`).
- `offline.sync_conflicts` has a foreign key to
  `offline.sync_queue_items (tenant_id, id)` (`0001_offline_sync.sql:111-112`),
  so a conflict row cannot exist without a queue row.
- `offline.numbering_reservations.shift_id` is `text NOT NULL`
  (`0001_offline_sync.sql:38`) and `shiftId` is required
  (`src/offline-sync.service.ts:53`). No range administration symbol exists.
- Every `offline_tenant_isolation` policy is `FOR ALL` with no role. Schema
  owner, tenant foreign keys and grants are fixed to `stynx_owner`,
  `tenancy.tenants(id)`, `stynx_app` and `stynx_reader`
  (`0001_offline_sync.sql:4`, `:158-160`; `0002_durable_sync.sql:169-171`).
  `packages/offline-sync/src` compares no SQL role name.

## Decision

Decision identifiers are stable. Cite them as `ADR-MOBILE-OFFLINE-0003 D1` to
`D6`. Unless a decision says otherwise it applies to CTG9 durable mode only.

### D1 — Queue state `pending` (UPS-OFS-06, option A)

**Amends** ADR-MOBILE-OFFLINE-0002 decision 2 ("Batch and item identity") and
decision 4 ("Concurrency") by adding one item state and its transitions.

1. **Storage and type.** A forward migration, next free number in
   `packages/offline-sync/migrations` (`0004` at the time of writing), widens
   the three status `CHECK` constraints listed in the context to include
   `pending`. `OfflineSyncQueueStatus` gains `'pending'`. No earlier
   migration is edited.
2. **Entry.** The only transition into `pending` is the resolution action
   `retry_after_correction` when the consumer resolver closes the conflict.
   In that same transaction the conflict becomes `resolved` and the queue
   item and its item receipt move from `conflict` to `pending`.
   Materialization is unchanged: a newly stored item is still `received`.
3. **Entry preconditions.** The transition is refused, with the existing 409
   `OFFLINE_SYNC_CONFLICT_RESOLUTION` and no change, unless all hold:
   - the item's current status is `conflict`;
   - no domain effect was committed for the item: it has no recorded
     `appliedAt` (D3) and no `applied` numbering consumption. An item that was
     applied with a concurrency suspicion therefore never returns to
     `pending`;
   - no other open conflict references the item.
4. **Re-application rule.** A `pending` item is applied again only when all
   hold:
   - a later durable batch, with a different `device_batch_id`, declares the
     same idempotency key from the same device;
   - that submission carries a payload hash identical to the stored one.

   Application then runs as a fresh item transaction under decision 3 of
   ADR-MOBILE-OFFLINE-0002, with the item receipt row locked. The receipt
   leaves `pending` exactly once, to `applied`, `conflict` or `rejected`. A
   concurrent second submission never runs the effect; it receives the
   committed result. The receipt keeps its original batch binding. The
   re-applying batch records its outcome in `offline.sync_item_attempts`, as
   every cross-batch duplicate already does.

5. **What never re-applies.** Replay of a closed batch returns the original
   status and body bytes and applies nothing, even when one of its items is
   now `pending`. A read, a listing or a receipt lookup never applies. A
   submission with the same key and a different hash is an integrity
   rejection under decision 2 and D3; the `pending` item is unchanged. A
   corrected payload therefore needs a new idempotency key.
6. **Numbering and events.** Re-application consumes the reserved number
   under the unchanged rules of decision 1; a number is never reissued. The
   single final event-port call of the new item transaction must use an event
   idempotency key distinct from any event recorded for the earlier attempt,
   because the outbox rejects different content under a reused key.
7. **No expiry.** STYNX neither expires nor supersedes a `pending` item.

### D2 — `manual_review` keeps the conflict open (UPS-OFS-07, option A)

**Amends** ADR-MOBILE-OFFLINE-0002 decision 4, which today makes every
accepted resolution final.

1. **History table.** The D1 migration (or the next one) adds a
   tenant-leading, append-only action-history table, proposed name
   `offline.sync_conflict_actions`: tenant, conflict (composite foreign key to
   `offline.sync_conflicts (tenant_id, id)`), action, reason, user reference,
   trusted actor, resulting conflict status, instant. It has ROW LEVEL
   SECURITY enabled and forced, with the same role-agnostic
   `offline_tenant_isolation` policy as its siblings. The application role is
   granted `SELECT` and `INSERT` only.
2. **Resolver may return `open`.** `OfflineSyncConflictResolver.resolve` may
   return a conflict whose status is `open` or `resolved`. Any other result
   is refused as today.
3. **Open result.** One history row is inserted. The `offline.sync_conflicts`
   row keeps `status = 'open'`, a null `resolution` and a null `resolved_at`.
   The `CHECK` at `0001_offline_sync.sql:113-116` is **not** changed. The
   returned conflict has `status: 'open'` and no resolution instant.
4. **Final result.** A later action that the resolver closes inserts its
   history row and resolves the conflict in the same transaction, exactly as
   today. Every accepted action, final or not, has a history row.
5. **Governance of actions.** `allowedActions` is evaluated on every call and
   still governs refusal. STYNX attaches no meaning to an action name: the
   resolver decides which actions close.
6. **Reads.** The history is readable under the application role and tenant
   context through an additive typed read. History rows are never updated or
   deleted.
7. **Legacy.** Without a configured resolver, `resolveConflict` and the E6
   `manual-review` value behave as in 1.5.3.

### D3 — Typed receipt and conflict context; integrity conflict row (UPS-OFS-08, option C)

**Amends** ADR-MOBILE-OFFLINE-0002 decision 2, sentence "same key/different
hash produces a rejected integrity attempt receipt without changing the
original". The original still does not change; a conflict row is added.

1. **Carriers.** No column is added for these fields. They are carried in the
   existing `context_json` of `offline.sync_item_receipts` and
   `offline.sync_item_attempts`, and in `evidence` of
   `offline.sync_conflict_evidence`, under one reserved top-level key with a
   format version. Existing top-level keys keep their meaning and bytes.
2. **Platform fields.** The versioned object carries, when the corresponding
   path produced them: receipt identifier; `appliedAt`; `serverEntityId`;
   error code and error message; application attempt count; reason code;
   received and stored payload hashes; related queue item; retryable flag.
   The contract fixes each name, type and the path that writes it. A field
   the platform did not produce is absent. Nothing is fabricated for rows
   written before the upgrade.
3. **Consumer attributes.** The same object has one generic, opaque
   consumer-attributes member: a JSON object supplied by the consumer's
   applier or resolver through an additive typed return, size-bounded, stored
   and returned verbatim, never interpreted. Product vocabulary, for example
   an agency identifier, lives only there. STYNX defines no product field.
4. **Written once, identical on replay.** Values are written in the
   transaction that produced them, from the injected clock and the original
   application result. A replay returns the stored values and never
   recomputes them: `serverEntityId` and `appliedAt` are those of the original
   application. The attempt count increases only when an item transaction
   starts, never on a replay or a read.
5. **Exposure.** The object is exposed as an additive, optional, typed
   property on the item receipt, queue item and conflict records returned by
   the receipt lookups and listings. It is not merged into the published
   `SyncItemReceipt.context`, so existing response fields keep their bytes.
6. **Integrity conflict row.** A same-key submission with a different hash
   additionally records, in the preflight transaction that writes the
   rejected attempt, one `offline.sync_conflicts` row of type `integrity`:
   - it references the **original** queue item;
   - its `payload_hash` column holds the stored hash, which satisfies the
     unchanged `CHECK`;
   - its evidence carries both hashes, received and stored; the received
     value is recorded verbatim, including a non-canonical one admitted by
     D4;
   - the original queue item, its receipt, its status and its effect are
     unchanged;
   - at most one such conflict exists per tenant, idempotency key and
     received hash; a repeated submission reuses it;
   - without a resolver override its allowed actions are `reject` only, so it
     can never drive the original into `pending`.

   Where the original has no queue row, no conflict row can be written; the
   rejected attempt alone carries both hashes.

### D4 — Non-canonical `payload_hash` is a per-item rejection (UPS-OFS-10, option A)

**Amends** ADR-MOBILE-OFFLINE-0002 decision 5 ("Storage and transport") for
CTG9 input validation. This changes published CTG9 validation behaviour.

1. **Kept.** Both `payload_hash` `CHECK` constraints and `INV-OFFLINE-001`
   are unchanged. A non-canonical value is never stored in
   `offline.sync_queue_items` or in `offline.sync_conflicts.payload_hash`,
   never identifies an item and never authorizes an effect.
2. **Changed.** In CTG9 mode a `payloadHash` that is a string of 1 to 255
   bytes but not canonical no longer fails the batch with 400. That item
   receives a rejected receipt with `OFFLINE_SYNC_ITEM_INTEGRITY` in the batch
   result; the other items are processed. The rejection is recorded in
   `offline.sync_item_attempts` with the received value in the D3 context.
   No queue row, no item receipt row, no numbering consumption and no domain
   effect is created for it, so the idempotency key is not consumed.
3. **Never a database error.** The item is diverted before any statement that
   a `CHECK` could reject.
4. **With an existing original.** If the key already has a receipt, D3 item 6
   applies and the integrity conflict row carries both hashes.
5. **Still 400.** A `payloadHash` that is missing, not a string, empty or
   longer than 255 bytes remains structural invalid input for the whole
   batch.
6. **Not adopted.** "Accept and persist a 1–128 character hash" is declined.
7. **E6 mode** keeps the 400.

### D5 — Numbering ranges: now and planned (UPS-OFS-12, option C)

**Delivered in 1.5.x** (additive to ADR-MOBILE-OFFLINE-0002 decision 1):

1. **Sentinel shift.** STYNX publishes one documented constant that means "no
   shift", in the reserved `stynx:` namespace. A host that has no shift sends
   it and maps it back on output. It is an ordinary `shiftId` value to the
   store and to the reservation idempotency fingerprint. `shift_id` stays
   `NOT NULL`.
2. **Supported write contract.** Writing `offline.numbering_ranges` under the
   application role, tenant context and FORCE RLS is a supported consumer
   operation. The contract fixes: the columns a consumer may insert; that
   `next_number` equals `start_number` at creation and is afterwards written
   only by the platform; that `start_number`, `end_number`, `org_unit_id`,
   `entity_type` and `series` are immutable once a reservation references the
   range; that the only consumer status change is `active` to `cancelled`,
   made while holding the range row lock that reservations take; that
   `exhausted` is platform-written; and the uniqueness of
   `(tenant_id, org_unit_id, entity_type, series)`.
3. **Consumer attributes stay consumer-side.** STYNX stores no range
   attribute. A consumer keeps them in its own table keyed by tenant and
   range identifier.

**Planned for a later minor, not delivered and not authorized by this ADR:**
nullable `shift_id` with null-safe matching and a `string | null` output type;
a range administration API; a consumer-attributes column; an optional
single-active-reservation rule per device and shift with its own error code.
Each needs its own decision text before code.

### D6 — Consumer-owned offline storage: contract and verifier (UPS-OFS-13, option B)

Decided together with ADR-OUTBOX-0003 D2 and D3. One stance holds for both
schemas: historical migrations are not edited; STYNX publishes what the store
references and verifies a live database; the consumer owns its DDL and its
data migration.

1. **Storage contract.** `@stynx-nyx/offline-sync` publishes a versioned,
   machine-readable closed list of every database object its store SQL
   references (tables, columns, types, constraints, indexes, FORCE RLS flags
   and policies), with the minimum grants per role. Tenant table, owner role
   and application and reader roles are named as the consumer's choice. A
   sensor keeps the list equal to the package migrations and fails when the
   store SQL references an object outside it.
2. **Verifier.** STYNX publishes a read-only verifier that a consumer runs as
   the owner role against a live database. It checks structure and the data
   invariants decidable from stored rows, reports per check and per tenant,
   and exits non-zero on any failure. A pass for the installed package
   version defines supported consumer-owned mode.
3. **No generated DDL for `offline.*` in 1.5.x.** Unlike the outbox, no
   parameterized artifact is shipped: the offline policies are already
   role-agnostic and the package migrations do not touch another schema.
4. **Migration is the consumer's.** STYNX ships no import port and no state
   transfer. DETRAN migrates its existing protocol state on its side, under
   an exception from its own Owner. The contract states the write invariants:
   written by the owner role outside any request path; tenant preserved;
   identity and uniqueness constraints respected; applied numbers never
   reissued.
5. **Replay of migrated batches.** No new mechanism is added. A migrated batch
   without the original response is `legacy_closed_unverified` and never
   replays fabricated bytes. It becomes replayable only through the existing
   rule of ADR-MOBILE-OFFLINE-0002 decision 5: independently verified archived
   response bytes and headers.
6. **Role name.** Offline-sync compares no SQL role name. A consumer that also
   uses `requireActor` transactions under a non-default role depends on
   ADR-OUTBOX-0003 D1.

## Consequences

- **Declared compatibility note (D1).** Adding `'pending'` to
  `OfflineSyncQueueStatus` widens an output union. Consumer code that
  switches exhaustively over it stops compiling until it handles the new
  member. At run time `pending` appears only after a `retry_after_correction`
  resolution in CTG9 mode. The change ships in the **1.5.x line**, in the
  first patch that carries the D1 migration, and is declared as such in the
  changeset, the CHANGELOG and the contract.
- **Declared behaviour change (D4).** A CTG9 batch that received 400 in 1.5.3
  for a non-canonical hash now receives its normal success status with one
  rejected item. It ships in the 1.5.x line and is declared in the same
  places.
- **Upgrade order.** The D1 and D2 schema is required before the code that
  uses it runs; the store raises the existing typed upgrade-required error
  otherwise.
- **Migration.** One or two forward migrations in
  `packages/offline-sync/migrations`. Root `test/db` and seed obligations
  apply. The Architect rebinds the trace and the `@stynx-nyx/offline-sync` API
  baseline after implementation and updates
  `docs/framework/contracts/offline-sync-api.md` with it.
- **Security and RLS.** The new table is tenant-leading with FORCE RLS and no
  update or delete grant. `INV-OFFLINE-001` is not weakened: no item without
  a canonical hash is stored as an item or applied.
- **Invariant scope.** `INV-OFFLINE-001` lists four `offline.*` tables as its
  data scope. If the Architect judges the history table part of it, that is a
  separate invariant change under its own change policy.

## Verification obligations

All database evidence is real PostgreSQL, application role without
`BYPASSRLS`, FORCE RLS and two tenants, from an empty database and from an
upgrade of a populated 0003 database.

| Decision | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | `retry_after_correction` moves the item to `pending` and the conflict to `resolved` in one transaction; the item is listed with that status; refusal when an effect was committed or another conflict is open; re-application from a later batch applies once under two concurrent submissions; closed-batch replay returns the original bytes; a different hash is rejected and leaves the item `pending`; no number is reissued. |
| D2       | `manual_review` leaves the conflict `open` with a null resolution and one history row; a later final action resolves it; an action outside `allowedActions` is refused; a resolver that forbids `accept_server` on a concurrency conflict is honoured; tenant B's history is invisible to tenant A; the application role cannot update or delete history.                                                                          |
| D3       | Applied batch: receipt carries its identifier, `appliedAt` and `serverEntityId`. Failed item: error code, message and attempt count. Integrity rejection: one conflict row with received and stored hashes, original untouched, no duplicate on repetition. Replay returns identical values. Consumer attributes round-trip verbatim. Rows written before the upgrade read without fabricated fields.                              |
| D4       | Batch containing items whose hash has 1 byte and 128 bytes: success status, those items rejected for integrity, the others applied, no `CHECK` violation, no queue row for the rejected items; the same key resubmitted with a canonical hash in a later batch applies; E6 mode still returns 400. TEAT and BOAT HTTP characterization is repeated for the changed status.                                                         |
| D5       | Reservation with the sentinel shift; a range inserted through the write contract serves concurrent reservations without overlap; a cancelled range refuses reservation; tenant isolation of consumer-written ranges.                                                                                                                                                                                                               |
| D6       | Verifier passes on a database migrated by the package and on one built from the contract with a tenant table and roles other than the defaults; the UPS-OFS-01 to UPS-OFS-04 suites pass there; the verifier fails, naming the check, for a table without FORCE RLS, a missing policy, a missing constraint and an application-owned table.                                                                                        |

## Implementation order

1. D3 items 1 to 5 (typed context), because D1 reads `appliedAt`.
2. D1 and D2 with their migration.
3. D4, then D3 item 6 (integrity conflict row), which D4 item 4 uses.
4. D5 (contract text, constant, sensors).
5. D6, after ADR-OUTBOX-0003 D2 and D3 so both verifiers share one shape.

ADR-OUTBOX-0003 D1 precedes all of this in the DETRAN campaign.

## Deferred and declined

- Declined: persisting a non-canonical hash as item data (D4 item 6); a STYNX
  import port or state transfer for `offline.*` (D6 item 4).
- Planned for a later minor, undecided in detail: the four items at the end
  of D5.
- Not decided: expiry or supersession of `pending` items; replacing the
  payload of a `pending` item under its key.

## Open points for Owner confirmation

1. **Re-application rule (D1 items 4 and 5).** The request text does not
   determine it. This ADR writes the most conservative rule consistent with
   key identity and hash integrity: same key, same hash, same device, later
   batch. A corrected payload needs a new key and the `pending` original then
   stays `pending` for good. Confirm, or decide that a `pending` item may
   accept a replaced payload, which would further amend decision 2.
2. **Materialization (D1 item 2).** DETRAN also uses `pending` for an item
   that is stored and awaiting application. STYNX keeps `received` there, so
   existing receipts do not change. Confirm that the DETRAN adapter maps it.
3. **Patch-line union widening (D1).** Confirm that a 1.5.x patch may carry
   the declared output-type widening.
4. **Integrity conflict for an unknown key (D4).** DETRAN's acceptance text
   expects a conflict whose local hash is the received value. With both
   `CHECK` constraints and the queue foreign key kept, a conflict row is
   possible only when an original item exists. For a new key the rejected
   attempt carries the received hash and there is no conflict row. Confirm.
5. **Bound for the per-item path (D4 items 2 and 5).** 255 bytes is this
   ADR's choice; the DETRAN public contract allows 128.
6. **Default action for integrity conflicts (D3 item 6).** `reject` only.
7. **Single active reservation (D5).** DETRAN's proof asks for refusal of a
   second active reservation on the same device without a shift. STYNX has no
   such rule in 1.5.x; it is in the planned minor. Confirm that UPS-OFS-12
   stays open for that part.
8. **DETRAN exception (D6 item 4).** The issue records that no DETRAN Owner
   exception exists for an own migration of offline state (OD-R22-22). Option
   B needs one.
