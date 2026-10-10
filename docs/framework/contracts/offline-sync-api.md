# Offline Sync API Contract

**Package:** `@stynx-nyx/offline-sync`
**Status:** E6 server pair is the compatibility baseline; CTG9 1.5 behavior passed Opus delivery-review cycle 5. Publication evidence is recorded separately in R-0002.
**Authority:** `INV-OFFLINE-001`, `ADR-MOBILE-OFFLINE-0001`, `ADR-MOBILE-OFFLINE-0002`, `ADR-MOBILE-OFFLINE-0003` (D1, D2, D3, D4, D5), OD-S15-03.
**Effective:** E6 baseline 2026-08-24; CTG9 contract 2026-09-28; 1.5.6 slice (D4, D5) 2026-10-09; 1.5.7 slice (D1, D2, D3) 2026-10-09.

`StynxOfflineSyncModule.forRoot()` mounts authenticated NestJS routes backed by PostgreSQL. Hosts
that need only the service may set `mountControllers: false`; tests may use `inMemory()`.

| Method | Path                                              | Permission                       | Purpose                                       |
| ------ | ------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| `POST` | `/offline-sync/numbering-reservations`            | `offline-sync:numbering:reserve` | Atomically reserve an entity-scoped interval. |
| `POST` | `/offline-sync/numbering-reservations/:id/cancel` | `offline-sync:numbering:cancel`  | Cancel one tenant-owned reservation.          |
| `POST` | `/offline-sync/sync-batches`                      | `offline-sync:batches:submit`    | Persist an idempotent device batch.           |
| `POST` | `/offline-sync/conflicts/:id/resolve`             | `offline-sync:conflicts:resolve` | Resolve one tenant-owned conflict.            |

The E6 routes use STYNX authentication, permission, audit, and HTTP idempotency decorators. Tenant and
actor identity are derived from trusted `RequestContext`; a request body containing identity
override fields is rejected.

Configuring `OfflineSyncPolicyResolver` selects CTG9 durable parity mode at
module bootstrap, including when `mountControllers:false`. Without that
resolver, published E6 behavior remains: payload-hash dedup even with a
different item key, repeated cancellation 409, configured/default 24 h TTL
and 100-item maximum. CTG9 mode instead uses tenant+item key with hash
integrity, durable receipts and idempotent repetition of completed cancel.
The host cannot toggle mode with a request body.
The 0002 migration is required before any 1.5.0 offline-sync code runs,
including E6; a 0001-only schema causes `OFFLINE_SYNC_UPGRADE_REQUIRED`
at the first Postgres store operation (HTTP 503),
never raw 42703. It supports both modes at once: E6 queue rows retain
hash deduplication through an E6-only partial unique index and their
updated `ON CONFLICT` target and E6-only hash lookup, while CTG9 rows
explicitly select key identity. The queue column is
`identity_mode text NOT NULL DEFAULT 'e6' CHECK (identity_mode IN
('e6','ctg9'))`; the global tenant/key uniqueness remains. The published
`OfflineSyncStore` and E6 input/result types remain assignable;
the separate `OfflineSyncDurableStore` and CTG9 input/receipt types are
required only with the resolver. A CTG9-only port without the resolver, or
a resolver with a store missing durable operations, fails at bootstrap.
`options.policyResolver != null` is the mode check. The host may supply
`legacyItemIdentityResolver` for a stable legacy identity across batches;
its unkeyed items remain unapplied. `legacyIdempotencyStore` supplies the
published durable `IdempotencyStore` for read-only upgrade replay; absent
verified bytes, an unverified legacy batch fails closed.

The four rows above are the existing route contract and remain compatible. CTG9 adds service
operations for block, close, reconcile, settle, consumption and receipt reads. A mounted controller
exposes corresponding tenant-scoped routes; a host that sets `mountControllers:false` maps its own
TEAT/BOAT routes to the same service. Those adapters preserve their existing methods, paths,
statuses, bodies and error codes, verified by before/after HTTP characterization. In E6 mode,
the existing batch controller retains `@Idempotent('Idempotency-Key')`. In CTG9 mode, the module
mounts a controller at the same method/path/permission with OFS-specific in-service
verification; the other three routes retain their published decorator behavior. The CTG9 batch route
still requires a nonblank `Idempotency-Key` and returns the published 400 when absent. After
authentication, context and header validation, OFS checks the durable `(tenant,device,batchId)`
identity, sequence and declared item-key set first: a matching closed batch replays its original
status and exact body bytes, changed context/set returns 409, and sequence gap returns 422. For a
request not resolved as that same batch, reuse of a transport key with a changed method/path/body
fingerprint returns the published 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`. A new key may replay or
resume a matching batch, but its fingerprint is then bound to that batch in a tenant-scoped
transport-key ledger; later reuse with another body returns 422. Batch context includes a stable
digest of each `payloadJson` and the item's number, reservation and local creation time, so
changed effect-bearing fields cannot resume under an unchanged declared hash.
The transport key binds on batch admission before a lease wait, including a
contender that receives 503. A key already bound to another batch gives 422
for an existing or new target batch, without replay or another effect.
Persist the original key, fingerprint, status, exact body bytes and replayable response headers
with the batch receipt.
On either domain or transport replay, restore those headers and set the configured replay-key
(default `X-Idempotency-Key`) to the incoming key and replay-marker (default
`Idempotency-Replayed`) to `true`, matching the published interceptor. An outer interceptor that could
short-circuit these checks is unsupported and fails at bootstrap or before writing.

## Invariants

- `entityType` is consumer-defined and is part of range selection and queue identity.
- Numbering reservation locks one tenant/org-unit/entity/series range and advances `next_number`
  in the same transaction, so intervals cannot overlap.
- In the E6 baseline, `(tenant_id, payload_hash)` is unique. CTG9 changes item identity to
  `(tenant_id,idempotency_key)` and uses the hash for integrity. Identical bytes under distinct
  keys represent distinct items; same key/hash returns its durable receipt; same key/different
  hash records a rejected integrity result and cannot apply another effect.
- Stored payload hashes use `sha256:<64 lowercase hex>`; both `payload_hash` `CHECK` constraints and
  `INV-OFFLINE-001` are unchanged, so no item without a canonical hash is stored as an item or applied.
  In E6 mode a non-canonical `payloadHash` is a 400 for the batch. In CTG9 mode
  (ADR-MOBILE-OFFLINE-0003 D4) a `payloadHash` string of 1 to 255 bytes that is not canonical is a
  per-item `rejected` receipt with `OFFLINE_SYNC_ITEM_INTEGRITY`: it is diverted after key derivation
  and before any statement a `CHECK` could reject, recorded only in `offline.sync_item_attempts` with
  the received value in `payload_hash`, and creates no queue row, item receipt, numbering consumption
  or domain effect, so the idempotency key stays unconsumed and the same key with a canonical hash
  applies in a later batch. When the key already has an original, the item is rejected the same way,
  the original is unchanged and the [integrity conflict row](#integrity-conflict-row-ups-ofs-08-adr-mobile-offline-0003-d3-item-6)
  of D3 item 6 references it with the received value verbatim.
  A missing, non-string, empty or longer-than-255-byte `payloadHash` remains a batch-wide 400.
- The four original `offline.*` tables and every CTG9 batch, receipt or consumption table carry
  tenant-leading keys/indexes and forced RLS keyed by `app.tenant_id` set by `@stynx-nyx/data`.
- Device-local entity and queue identifiers are bounded text because device IDs need not be UUIDs.

Adopters must apply the shipped `migrations/0001_offline_sync.sql` with the STYNX migration owner
before mounting the PostgreSQL-backed module, then 0002, for keyed reservations 0003, and before any
resolution through a `conflictResolver` 0004 (see [Migration 0004](#migration-0004)). The package
does not create consumer numbering-range rows; a consumer writes them under the following contract.

### Numbering ranges: consumer write contract (UPS-OFS-12, ADR-MOBILE-OFFLINE-0003 D5)

Writing `offline.numbering_ranges` under the application role, the tenant context (`app.tenant_id`)
and FORCE RLS is a supported consumer operation. No DDL changes: the table is the 0001 table.

| Rule          | Contract                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insert        | A consumer may insert `tenant_id`, `org_unit_id`, `entity_type`, `series`, `start_number`, `end_number`, `next_number` and optionally `id` (default `gen_random_uuid()`) and `status` (default `active`). `created_at` defaults; `updated_at` is platform-written.                                                                                                                                                     |
| `next_number` | Equals `start_number` at creation. Afterwards it is written only by the platform: advanced by `reserveNumbering` and rewound by `cancelNumberingReservation` when the cancelled reservation is the unused tail of the range. The 0001 `CHECK (start_number <= next_number AND next_number <= end_number + 1)` holds.                                                                                                   |
| Immutable     | `start_number`, `end_number`, `org_unit_id`, `entity_type` and `series` must not change once a reservation references the range (`offline.numbering_reservations.range_id`).                                                                                                                                                                                                                                           |
| Status        | The only consumer status change is `active` to `cancelled`, made while holding the range row lock that reservations take (`select … for update` on the row, then the update, in one transaction). `exhausted` is platform-written when the last number is reserved. Returning an unused tail reactivates an `exhausted` range and never a `cancelled` one; a cancelled range is neither revived nor rewound.           |
| Uniqueness    | `(tenant_id, org_unit_id, entity_type, series)` is unique (0001 constraint); `(tenant_id, id)` is the reservation foreign key.                                                                                                                                                                                                                                                                                         |
| Selection     | `reserveNumbering` with `rangeId`, or with `series`, addresses exactly that range: a cancelled one is `OFFLINE_SYNC_RANGE_UNAVAILABLE` with `reason: 'inactive'`. Without `series`, cancelled ranges are not candidates and the first remaining range by `series` is locked; when none remains the result is `OFFLINE_SYNC_RANGE_NOT_FOUND`. An `exhausted` range is still selected and reports `reason: 'exhausted'`. |
| Attributes    | STYNX stores no range attribute (for example a usage mode). A consumer keeps them in its own table keyed by tenant and range identifier.                                                                                                                                                                                                                                                                               |
| No shift      | `OFFLINE_SYNC_NO_SHIFT` (`'stynx:no-shift'`) is the documented `shiftId` for a reservation without a shift. It is an ordinary value to the store, to `numbering_reservations.shift_id` (still `NOT NULL`) and to the reservation idempotency fingerprint; the host maps it back on output. Every other `stynx:`-prefixed `shiftId` is reserved and rejected with 400 `OFFLINE_SYNC_INVALID_INPUT`.                     |

Planned for a later minor and not delivered: nullable `shift_id`, a range administration API, a
consumer-attributes column and a single-active-reservation rule per device and shift.

## CTG9 1.5 public services and ports

`OfflineSyncService` retains `reserveNumbering`, `cancelNumberingReservation`,
the one-argument `submitSyncBatch`, `openConflict`, and `resolveConflict`. The mounted batch
controller passes a second `SubmitSyncBatchOptions` argument containing the required transport
key, method and path. Its additive operations are
`blockNumberingReservation`, `closeNumberingReservation`, `reconcileNumberingReservation`,
`settleNumberingReservation`, `getNumberingConsumption`, `getSyncBatchReceipt`, and
`getSyncItemReceipt`. The root package exports `OfflineSyncAgentResolver`,
`OfflineSyncPolicyResolver`, `OfflineSyncItemApplier`, `OfflineSyncEventPort`,
`OfflineSyncConcurrencyDetector`, `OfflineSyncHandoffPort`, and
`OfflineSyncConflictResolver`. Their exact TypeScript signatures, input/result and injection shape are fixed in the
[CTG9 OFS contract](../../../work/rounds/R-0002/ctg9-ofs-contract.md). These are specified
symbols until the package implementation and public API baseline prove them.

The trusted tenant and audit actor come from request context. An agent resolver can supply a
different business agent after host authorization; body identity fields cannot override either.
The policy resolver obtains TTL, concurrency window and batch policy per tenant/org/operation at
execution time with an injectable clock. With no resolver configured, the published
`reservationTtlMs ?? 86_400_000` and 100-item batch maximum remain legacy defaults. With a
resolver configured, missing tenant/org parameters use its explicit host policy and never another
tenant's value or a global fallback; a scoped policy may admit more than 100 items. Numbering transitions preserve already applied numbers,
allow release only of an unused tail, and expose reconciliation/consumption for every number in the
interval. Concurrent reservations cannot overlap.

Batches are durable by `(tenant,device,deviceBatchId)`, with optional positive `batchSequence`,
the declared item-key set, open/closed state and original receipts. A closed replay with equal
context returns the same receipt with no second effect. Changed context or a repeated sequence
under a new batch ID returns 409; a sequence gap returns 422. One DB-backed lease with a fencing
generation controls an open batch. A concurrent same-batch request waits for close and replays,
or safely resumes after lease expiry; it cannot run the same item twice. If the active lease
outlasts the bounded wait, the HTTP result is 503 with `errorCode: OFFLINE_SYNC:BATCH:in-progress`,
`retryable: true` and `Retry-After: 1`, without falling through to another applier. Unsequenced legacy batches
remain accepted. An unkeyed legacy item receives an internal
`stynx:legacy:v1:<sha256(tenantId || 0x00 || legacyIdentity)>`
storage key, where inputs are UTF-8 bytes and `||` concatenates bytes. The default
legacy identity is `deviceId || 0x00 || deviceBatchId || 0x00 || queueItemId`;
the optional host resolver can use a stable identity across batches. Explicit client keys in
the reserved `stynx:legacy:` namespace are rejected. The item stays `received` with neutral
`OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED` and is never applied; the TEAT adapter maps that code to
`TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED`. Existing string, hash, UUID and numbering limits remain
unchanged; the configured policy can accept valid batches of more than 100 items.

In CTG9 mode, `duplicateItems` counts same-key, same-hash duplicates from
another batch, including legacy E6 collisions answered with
`OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED`. It excludes same-batch resume,
integrity conflicts and reused queue IDs. E6 retains its published counting
behavior. A 503 in-progress response carries the current trusted request ID;
CTG9 fails closed if that context is unavailable.

Each keyed item applies sequentially in its own app-role, READ COMMITTED
`Database.txIndependent` transaction. The domain applier receives that `Transaction`; effect,
number consumption, receipt and the event port share its commit. OFS calls exactly one final
`OfflineSyncEventPort.appendInTransaction(trx,event)` or
`appendManyInTransaction(trx,events)` operation per item, after all other DML; the OBX seal
forbids later writes. The event port follows the stable OBX interface and has no second connection. A failed
item rolls back those effects, can receive a separately persisted rejection receipt, and does not
undo successful sibling items. The PostgreSQL durable store checks
`Database.hasHeldConnection()` and throws `IndependentTransactionConnectionError` before
its first write, including batch-receipt creation. The service does not inject `Database`.
An enclosing `@TransactionalCommand` is
rejected before writing; strict item mode rejects hidden second connections through derived
request or system contexts. Ordinary `Database.tx` outside that mode retains its legacy behavior.

Concurrency detection compares a business agent's acts across devices within the resolved
window. A verified handoff may exempt the pair; missing or disabled window follows the host's
existing warning/no-detection policy. A suspicion marks both affected acts. Conflict resolution
uses the allowed actions for that conflict kind. Legacy `device-wins`, `server-wins`, and
`manual-review` remain available for existing callers but are not aliases for TEAT action names.

Apply additive `migrations/0002_*.sql` only after 0001 and before running 1.5.0 offline-sync code in either mode. Upgrade
must preserve old queue rows and IDs, backfill legacy batch/receipt identity without pretending a
domain effect occurred, install the new item-key uniqueness and E6 partial hash index before
dropping global hash uniqueness, and add tenant-leading FORCE RLS, grants and indexes to new tables. It must not silently rewrite
stored hashes or statuses. A backfilled batch is `legacy_closed_unverified`: its stored item
receipts are immutable, but no fabricated HTTP replay is claimed because 0001 stored no original
response bytes. After domain identity/declared-set validation and before conflict or writes, a
read-only compatibility bridge looks up the existing `IdempotencyStore` with the original
tenant/user/route/key composite scope and method/path/body fingerprint. An unexpired completed
record with an equal fingerprint replays its recorded status, body and headers through the same
serialization path as the published interceptor, including configured replay-key/marker headers.
The bridge never reserves or persists a new legacy record. Pending, expired, mismatched or absent
records cannot authorize another effect; if byte-equivalent replay cannot be proven, the request
fails closed with a conflict. Independently verified archived ACK bytes and headers may instead
promote a row to replayable closed state. New batches persist original response status, bytes and
replayable headers on close. The release evidence includes an upgrade test, seed and `test/db`
checks, two-tenant PostgreSQL/RLS tests, and TEAT/BOAT HTTP before/after parity for status, body
bytes, replay headers, 503/Retry-After, and unexpired/expired legacy-store lookup with no duplicate effect. Publication and conformance
remain pending those proofs.

## 1.5.x additions (#317)

These additions are opt-in. Signatures published in 1.5.0 and keyless or unfiltered calls keep their
1.5.0 behavior, with one declared behaviour change:

**Declared behaviour change (UPS-OFS-10, ADR-MOBILE-OFFLINE-0003 D4, 1.5.6).** A CTG9 batch that
received 400 `OFFLINE_SYNC_INVALID_INPUT` in 1.5.5 because one `payloadHash` was a 1–255-byte string
outside `^sha256:[0-9a-f]{64}$` now receives its normal success status with that item `rejected`
(`OFFLINE_SYNC_ITEM_INTEGRITY`) and the other items processed; see the invariant above for what is and
is not written. E6 mode and the structural 400 cases are unchanged. TEAT and BOAT HTTP characterization
is to be repeated for the changed status by the consumer.

**Tenant listings (UPS-OFS-11).** `OfflineSyncService` exposes `listSyncBatchReceipts`,
`listSyncItemReceipts`, `listSyncQueueItems`, `listSyncConflicts` and, since 1.5.7,
`listSyncConflictActions`. Each takes an optional
input and returns `OfflineSyncPage<T> = { items, nextCursor }`. The tenant always comes from the
trusted context port. PostgreSQL reads run in the app-role `Database.tx` with `app.tenant_id` and a
`tenant_id` predicate under FORCE RLS, so another tenant's rows never appear. Filters are equality
matches:

| Listing                   | Filters                                                                                                                                                             | Order (newest first, stable tie-break)                  | Row type                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| batch receipts            | `deviceId`, `status` (`open`/`closed`/`legacy_closed_unverified`)                                                                                                   | `created_at desc, device_id desc, device_batch_id desc` | `SyncBatchReceiptSummary` (no item list or body bytes; use `getSyncBatchReceipt`)                                                                                                                                                     |
| item receipts             | `deviceId`, `deviceBatchId`, `status` (any `OfflineSyncQueueStatus`, including `pending`)                                                                           | `received_at desc, receiptId desc`                      | `SyncItemReceiptRecord` (`receiptId`, `deviceId`, `deviceBatchId`, `payloadHash`, `receivedAt`, plus `SyncItemReceipt` with its optional `stynx`)                                                                                     |
| queue items (E6 and CTG9) | `deviceId`, `status` (including `pending`), `entityType`                                                                                                            | `received_at desc, id desc`                             | `SyncQueueItemRecord` (`StoredSyncQueueItem` plus `deviceBatchId` and the optional `stynx` of the receipt under the same key)                                                                                                         |
| conflicts                 | `status` (`open`/`resolved`), `conflictType`, `queueItemId`, `deviceId` (of the referenced queue item, through the `offline.sync_queue_items (tenant_id, id)` join) | `created_at desc, id desc`                              | `SyncConflictRecord` (`SyncConflict` plus `deviceId`, `createdAt` and the optional `stynx` of its evidence)                                                                                                                           |
| conflict actions (1.5.7)  | `conflictId` (required)                                                                                                                                             | `created_at desc, id desc`                              | `SyncConflictActionRecord` (`actionId`, `tenantId`, `conflictId`, `action`, `reason?`, `userRef?`, `actorId`, `resultingStatus`, `createdAt`); see [D2](#open-manual-review-and-action-history-ups-ofs-07-adr-mobile-offline-0003-d2) |

Identifier tie-breaks use the `C` collation. `limit` defaults to 50 and must be an integer from 1 to 200. `cursor` is an opaque base64url keyset token: the microsecond UTC sort instant plus tie-break
identifiers of the last row. A malformed cursor, blank filter, unknown status or bad limit returns
400 `OFFLINE_SYNC_INVALID_INPUT`. A cursor whose instant is not a real calendar time, for example
`2026-99-99T99:00:00.000000Z`, is malformed and is rejected before any query. Rows created after a
cursor was issued do not shift later pages.

The PostgreSQL item-receipt timestamp is the database insertion time (`clock_timestamp()`). Queue
items and conflicts use the injected service clock, and batches use their database creation time.
`receiptId` is the receipt's tenant-scoped storage key: the client `idempotencyKey`, or the
`stynx:legacy:v1:` key for unkeyed items. The listing methods are optional on
`OfflineSyncDurableStore`, so existing custom stores still compile. Calling one against a store that
lacks it throws `OfflineSyncConfigurationError`. The packaged controllers do not mount listing
routes; hosts map their own routes to the service.

The listings are scoped only by tenant. For example, `listSyncQueueItems` returns every matching
queue item of the tenant with its full `payloadJson`, across all org units, agents and devices. Any
HTTP route that exposes a listing must add its own authorization and org-unit or device scoping,
typically by forcing the `deviceId` filter or post-filtering on `orgUnitId`.

Recorded follow-up: no index added in 1.5.x matches the listing sort keys exactly. Batches sort on
`created_at` (only `sync_batches_tenant_status_idx` exists), item receipts on `received_at` (only the
tenant/device/batch index exists), and an unfiltered queue or conflict listing cannot use the
existing tenant/device/status or tenant/status index for ordering. Large tenants may sort in memory
until a later forward-only migration adds tenant-leading sort indexes.

**Declared compatibility note (UPS-OFS-06, ADR-MOBILE-OFFLINE-0003 D1, 1.5.7).** `OfflineSyncQueueStatus`
is `'received' | 'applied' | 'conflict' | 'rejected' | 'pending'`. Consumer code that switches
exhaustively over it must handle the new member. At run time `pending` appears only after a
`retry_after_correction` resolution in CTG9 mode; materialization still stores `received`. The
widening ships in the 1.5.x line with migration 0004 and is declared in the changeset and CHANGELOG.

### Pending queue state (UPS-OFS-06, ADR-MOBILE-OFFLINE-0003 D1)

| Rule             | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storage          | Migration 0004 widens the status `CHECK` of `offline.sync_queue_items`, `offline.sync_item_receipts` and `offline.sync_item_attempts` with `pending`; no earlier migration changes.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Entry            | Only `resolveConflict(id, { resolution: 'retry_after_correction' })` with a configured `conflictResolver` whose result is `resolved`. In that transaction the conflict becomes `resolved`, the queue item and its item receipt move from `conflict` to `pending`, the receipt `error_code` is cleared and its `context`/`stynx` are kept. Every other closing action leaves the item status as it is.                                                                                                                                                                                                              |
| Preconditions    | Refused with the existing 409 `OFFLINE_SYNC_CONFLICT_RESOLUTION` ("The item cannot return to pending.") unless the queue item and its receipt are `conflict`, the receipt `stynx` has no `appliedAt`, no `applied` numbering consumption exists for the item's reserved number (same device, org unit and entity type), and no other open conflict references the item. An item applied with a concurrency suspicion therefore never returns to `pending`. The refusal writes no history row and no change.                                                                                                        |
| Re-application   | A `pending` receipt is applied again only when a later durable batch of the **same device** with a **different** `deviceBatchId` declares the same idempotency key with the **identical** payload hash and an `itemApplier` is configured. It runs as a fresh item transaction (decision 3 of ADR-MOBILE-OFFLINE-0002) with the receipt row locked, so under concurrent submissions the receipt leaves `pending` exactly once, to `applied`, `conflict` or `rejected`; a second submission receives the committed status as a cross-batch duplicate. A retryable failure leaves it `pending` and the batch `open`. |
| Identity         | The queue row keeps its original id; the applier and the detector receive the item with that id, and a batch that declared another `queueItemId` gets `context.originalQueueItemId`. The receipt keeps its original `deviceId`/`deviceBatchId` binding; the re-applying batch records its outcome in `offline.sync_item_attempts` (status, error code, context and `stynx`). `reservedNumber`, `reservationId` and `createdLocallyAt` may differ from the first submission, the payload hash may not.                                                                                                              |
| Never re-applies | A closed-batch replay returns the original status and body bytes; `getSyncItemReceipt`, `getSyncBatchReceipt` and the listings never apply; another device under the same key receives `pending` as a duplicate; a same-key submission with a different hash is an integrity rejection (plus the D3 item 6 conflict row) and leaves the item `pending`; without an `itemApplier` the committed status is returned. A corrected payload needs a new idempotency key.                                                                                                                                                |
| Numbering/events | Re-application consumes the reserved number under the unchanged rules; a number is never reissued. The single final `eventPort` call of the re-application uses the event idempotency key `<receipt key>:retry:<attempts>` (for example `k:retry:2`), distinct from the `<receipt key>` of the first application.                                                                                                                                                                                                                                                                                                  |
| No expiry        | STYNX neither expires nor supersedes a `pending` item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Open manual review and action history (UPS-OFS-07, ADR-MOBILE-OFFLINE-0003 D2)

With a `conflictResolver`, `OfflineSyncConflictResolver.resolve` returns an
`OfflineSyncConflictResolution` (a `SyncConflict` plus optional `consumerAttributes`) whose `status` is
`open` or `resolved`; any other status is refused with 409 `OFFLINE_SYNC_CONFLICT_RESOLUTION` and nothing
is written. The resolver's `allowedActions` callback is evaluated on every call and governs refusal;
stored evidence is the fallback when that callback is absent. STYNX attaches no meaning to an action
name; the resolver decides which actions close.

- **Open result.** One row is appended to `offline.sync_conflict_actions`; the `offline.sync_conflicts`
  row keeps `status = 'open'`, a null `resolution` and a null `resolved_at` (the 0001 `CHECK` is
  unchanged). The returned conflict has `status: 'open'` and no `resolution`, `resolvedBy` or
  `resolvedAt`. The queue item status does not change.
- **Final result.** The history row is inserted and the conflict resolved in the same transaction, as
  before (resolution, reason, user reference, actor and instant on the row and in the evidence).
- **History table.** `offline.sync_conflict_actions (id, tenant_id, conflict_id, action, reason,
user_ref, actor_id, resulting_status, created_at)`, primary key `(tenant_id, id)`, composite foreign key
  to `offline.sync_conflicts (tenant_id, id)`, FORCE ROW LEVEL SECURITY with the role-agnostic
  `offline_tenant_isolation` policy, `SELECT` and `INSERT` granted to the application role and
  `SELECT` to the reader role; rows are never updated or deleted. `created_at` is the database
  insertion time (`clock_timestamp()`).
- **Read.** `listSyncConflictActions({ conflictId, limit?, cursor? })` returns the rows newest first
  with the shared keyset cursor, under the application role and tenant context; another tenant's
  history is never visible. `conflictId` is required (400 `OFFLINE_SYNC_INVALID_INPUT` when blank).
- **Legacy.** Without a resolver, `resolveConflict` and the E6 `manual-review` value behave as in
  1.5.3 and write no history. On a schema without 0004, any resolver-backed resolution fails with
  503 `OFFLINE_SYNC_UPGRADE_REQUIRED` ("Offline-sync migration 0004 is required.").

### Typed receipt and conflict context (UPS-OFS-08, ADR-MOBILE-OFFLINE-0003 D3)

No column is added. The platform writes one reserved top-level key, `stynx`, into `context_json` of
`offline.sync_item_receipts` and `offline.sync_item_attempts` and into `evidence` of
`offline.sync_conflict_evidence`. Existing top-level keys keep their meaning and bytes. The object is
`OfflineSyncStynxContext` with `version: 1`; a member the writing path did not produce is absent and
nothing is fabricated for rows written before 0004.

| Member                | Type    | Written by                                                                                                                                                                                                                      |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receiptId`           | string  | every receipt and attempt write of a keyed item (the tenant-scoped receipt key), and the evidence of numbering and integrity conflicts                                                                                          |
| `appliedAt`           | string  | the item transaction that applied the item, from the injected clock; also for an item applied with a concurrency suspicion                                                                                                      |
| `serverEntityId`      | string  | the item transaction, from `OfflineSyncApplyResult.serverEntityId` of the original application                                                                                                                                  |
| `errorCode`           | string  | a failed item transaction (the receipt `error_code`), numbering conflict evidence and integrity attempts (`OFFLINE_SYNC_ITEM_INTEGRITY`)                                                                                        |
| `errorMessage`        | string  | a failed item transaction: the thrown error's `message` (or its string form)                                                                                                                                                    |
| `attempts`            | number  | item transactions that proceeded past the receipt lock for this receipt (1 for the first application, 2 for a re-application or a resumed retry); replay and reads never increase it                                            |
| `reasonCode`          | string  | the numbering outcome code on the receipt and its conflict evidence, `OFFLINE_SYNC_ITEM_INTEGRITY` on integrity attempts and conflicts, `OFFLINE_SYNC_CONCURRENCY_SUSPECTED` on both receipts and conflicts of a suspected pair |
| `receivedPayloadHash` | string  | integrity attempts and conflicts: the submitted value verbatim, including a non-canonical one                                                                                                                                   |
| `storedPayloadHash`   | string  | integrity attempts and conflicts: the hash stored for the original item                                                                                                                                                         |
| `relatedQueueItemId`  | string  | concurrency: the other item of the pair; integrity: the original queue item on the attempt and the submitting queue item on the conflict                                                                                        |
| `retryable`           | boolean | receipts: whether the item stays retryable (`received`/`pending` after a non-4xx failure); conflicts: whether `retry_after_correction` is among the allowed actions                                                             |
| `consumerAttributes`  | object  | verbatim from `OfflineSyncApplyResult.consumerAttributes` (receipt) or `OfflineSyncConflictResolution.consumerAttributes` (conflict evidence); never interpreted                                                                |

`consumerAttributes` must be a JSON object whose serialization is at most
`OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES` (4096) bytes; otherwise the applier's item is rejected
with `OFFLINE_SYNC_INVALID_INPUT` (effect and event rolled back) and a resolution fails with 400
`OFFLINE_SYNC_INVALID_INPUT` before any write. Product vocabulary lives only there.

The object is written in the transaction that produced it. The receipt's `stynx` is replaced on each
outcome of an item transaction (an applied receipt does not carry the failure fields of an earlier
attempt) while the host keys of `context_json` are kept; the suspicion marks of the other item of a
pair are merged into its receipt. A replay returns the stored values and never recomputes them.

**Exposure.** The object is the additive optional `stynx` property of `SyncItemReceipt` (from
`getSyncItemReceipt` and `getSyncBatchReceipt`), `SyncItemReceiptRecord`, `SyncQueueItemRecord` (the
receipt under the same idempotency key) and `SyncConflict`/`SyncConflictRecord` (the evidence row of
the conflict, also on the `resolveConflict` result). `SyncItemReceipt.context` never contains the
`stynx` key, so existing fields keep their bytes. The batch submit result (`CTG9SubmitSyncBatchResult`
and its `receipt.items`) keeps its published fields and does not carry `stynx`; the TEAT/BOAT HTTP
bodies are therefore unchanged. E6 rows and rows written before 0004 have no `stynx`.

### Integrity conflict row (UPS-OFS-08, ADR-MOBILE-OFFLINE-0003 D3 item 6)

A same-key submission whose hash differs from the stored one still records the rejected
`OFFLINE_SYNC_ITEM_INTEGRITY` attempt (now with both hashes in `stynx`). When the original has a
queue row, the same preflight transaction, under the existing tenant/key advisory lock, additionally
records one `offline.sync_conflicts` row of `conflict_type = 'integrity'` (description "Payload hash
differs from the stored item."): it references the original queue item, its `payload_hash` column holds
the stored hash (the unchanged `CHECK` is satisfied), and its evidence row carries `receivedPayloadHash`,
`storedPayloadHash`, `detectedAt` and the `stynx` object with both hashes verbatim. The original queue
item, its receipt, its status and its effect are unchanged. At most one such conflict exists per tenant,
idempotency key and received hash: a repeated submission reuses it, a different received hash is a
second conflict. Its allowed actions are `reject` only unless the resolver's `allowedActions`
overrides them, and even then the D1 preconditions keep an applied original out of `pending`. A
non-canonical hash with an existing original takes the same path (D4 item 4). Where the key has no
queue row, no conflict is written; the attempt alone carries the received hash.

### Migration 0004

`migrations/0004_pending_state_and_conflict_actions.sql` is forward-only and applied after 0003 with
the migration owner. PostgreSQL cannot alter a `CHECK` in place, so it drops and re-adds
`sync_queue_items_status_check`, `sync_item_receipts_status_check` and
`sync_item_attempts_status_check` by name with the same values plus `pending`; no row is deleted or
rewritten and the tables keep their FORCE RLS, indexes and grants. It creates
`offline.sync_conflict_actions` as described under D2. The 1.5.7 code requires it before any
resolver-backed resolution; everything else (batches, receipts, listings, E6) runs on 0003.

**Idempotent reservation (UPS-OFS-05).** `ReserveNumberingInput.idempotencyKey` is optional and
1–255 UTF-8 bytes. A key is unique per tenant: all devices and agents of a tenant share one key
space, so clients should generate a fresh UUID for each logical reservation request. The request fingerprint is a SHA-256 of the stable serialization
of the resolved business agent and the request fields: `orgUnitId`, `deviceId`, `shiftId`,
`entityType`, `requestedSize`, `rangeId`, `series` and the explicit `validUntil`, normalized to the
same instant via `new Date(value).toISOString()` (so `…T00:00:00Z` and `…T00:00:00.000Z` match). The
computed default validity is excluded.

- Same key and fingerprint: returns the original reservation in its current stored state. It
  consumes no numbers and emits no event. The replay is not a usability guarantee: the reservation
  may since have been `cancelled`, `blocked` or `consumed`, and time-based expiry does not change
  `status`, so a reservation past its `validUntil` still replays as `reserved`. Clients must check
  `status` and `validUntil` on every replay and request a new key when the reservation is no longer
  usable.
- Same key with a different fingerprint: throws `OfflineSyncReservationReplayError`, which is
  `HttpException` 409 with `code`/`errorCode` `OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT`. The
  original reservation is unchanged.
- Without a key, behavior is identical to 1.5.0.

On PostgreSQL, same-key requests serialize on a transaction-scoped advisory lock, and the partial
unique index `(tenant_id, idempotency_key)` backs that up. N concurrent replays therefore consume one
interval. For a keyed request, the service checks the input shape (required text, key length,
`requestedSize`) and resolves the business agent, which is part of the fingerprint, and then looks
up the key. Only on a miss does it apply the time- and policy-dependent checks: policy resolution,
TTL and `validUntil` in the future. A retry after `validUntil` has passed, or after the policy lost
its TTL, therefore still replays. The store repeats the lookup under the advisory lock before it
reserves. A custom `OfflineSyncStore` without the optional `replayNumberingReservation` keeps the
1.5.0 ordering.
Keyed reservations need forward-only `migrations/0003_reservation_idempotency.sql`, applied after 0002
with the migration owner. It adds nullable `idempotency_key` and `idempotency_fingerprint` columns,
which must be both null or both set, and the partial unique index. It keeps the table's 0001 FORCE
RLS policy and grants. Without 0003, a keyed request fails with 503 `OFFLINE_SYNC_UPGRADE_REQUIRED`
and the message "migration 0003 is required".

Range refusals keep the public `OFFLINE_SYNC_RANGE_UNAVAILABLE` code, 409 status and response body.
The thrown error is now `OfflineSyncRangeUnavailableError` (a subclass of `OfflineSyncError`) with
`reason`:

- `exhausted`: the matching range is fully consumed.
- `insufficient_capacity`: the range has fewer free numbers than `requestedSize`.
- `inactive`: the range is cancelled, or the selected `rangeId` belongs to another unit or entity.

STYNX does not enforce a single active reservation per device and shift. See V-11.

**Numbering sentinel and range contract (UPS-OFS-12, stage one).** `OFFLINE_SYNC_NO_SHIFT` and the
consumer write contract for `offline.numbering_ranges` are specified under
[Numbering ranges: consumer write contract](#numbering-ranges-consumer-write-contract-ups-ofs-12-adr-mobile-offline-0003-d5).
Two store behaviours changed with it: cancelling a reservation tail reactivates only an `exhausted`
range (a `cancelled` range stays cancelled and is not rewound), and a reservation without `series`
no longer selects a cancelled range.

**Applier receipt identifier (UPS-OFS-09, part).** `OfflineSyncItemContext.receiptId` (optional in
the type, always set by the shipped stores for keyed items) is the item receipt key above. It equals
`SyncItemReceiptRecord.receiptId` and is stable across replay. The detection order is unchanged:
concurrency detection runs after `apply` in the same item transaction. Passing the suspicion result
to the applier is not implemented.

**Batch cardinality message.** The 400 message reports the effective limit: "items must contain
between 1 and N queue items." With no limit (`maxBatchItems: null` or absent under a policy
resolver), an empty batch reports "items must contain at least 1 queue item." E6 keeps N = 100.

### UPS-OFS-14 verification map (V-01…V-15, except V-09)

The test paths are below `packages/offline-sync/test/`. Every row names a test titled after its
verification (`V-nn …`). The **Gap** column lists behavior that STYNX does not provide today; it is
documented here rather than implied.

| V    | Documented behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Gap                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-01 | With a resolver, `maxBatchItems: null` or absent means no item limit. No durable path applies the fixed 100; a 101-item batch is accepted. A numeric limit is enforced and reported.                                                                                                                                                                                                                                                                                                                                                                                                                               | `unit/offline-sync-lists-reserve.spec.ts` "V-01 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-02 admits scoped >100 items …"                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                    |
| V-02 | An unkeyed item gets a `stynx:legacy:v1:` key (host resolver optional), stays `received` with `OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED`, and is never applied. A batch without `batchSequence` is accepted with `batchSequence: null` and consumes no sequence.                                                                                                                                                                                                                                                                                                                                                       | `unit/offline-sync-lists-reserve.spec.ts` "V-02 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-02 stores unkeyed legacy items …"                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                    |
| V-03 | A repeated sequence under a new batch ID returns 409 `OFFLINE_SYNC_BATCH_CONFLICT`. A gap returns 422 `OFFLINE_SYNC_BATCH_SEQUENCE`. A replay with a different declared set, context or sequence returns 409 `OFFLINE_SYNC_BATCH_CONFLICT`. An integrity mismatch is a per-item `rejected`/`OFFLINE_SYNC_ITEM_INTEGRITY`.                                                                                                                                                                                                                                                                                          | `unit/offline-sync-lists-reserve.spec.ts` "V-03 …"; `integration/ctg9-upgrade.integration.spec.ts` "enforces PostgreSQL sequence duplicate and gap statuses …"; `unit/postgres-durable-coverage.spec.ts` "rejects skipped and reused batch sequences …"; `unit/in-memory-offline-sync.store.spec.ts` "rejects batch context and transport-key reuse …"                                                                                                                             | The expected and received sequence numbers and `deviceBatchId` appear only in the error message, not as structured context.                                                                          |
| V-04 | Each keyed item runs in one app-role `txIndependent` transaction covering the effect, consumption, receipt and final event. An applier error rolls the item back, and the outcome is then written to the receipt separately. 4xx `HttpException` (except `OFFLINE_SYNC_BATCH_CONFLICT`) → `rejected` with `errorCode = error.code`. `OfflineSyncNumberingOutcome` → its `receiptStatus` (`EXPIRED` → `conflict`, otherwise `rejected`) with context `{number,reservationId,conflictId,allowedActions}`. Any other error → `received`, retryable, and the batch stays `open`.                                       | `unit/offline-sync-lists-reserve.spec.ts` "V-04 …"; `integration/ctg9-upgrade.integration.spec.ts` "commits effect, consumption, receipt and final event …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-03 rolls back a failed item …", "UPS-OFS-03 treats an HttpException 4xx …"; `unit/postgres-durable-coverage.spec.ts` "rejects a business validation failure …"                                                                                                                    | A domain error's own `context` is not copied to the receipt; only numbering outcomes carry context.                                                                                                  |
| V-05 | A same-key, same-hash item in another batch returns the original receipt without `apply`, with `context.originalQueueItemId` when the IDs differ. A hash mismatch gives a `rejected` `OFFLINE_SYNC_ITEM_INTEGRITY` receipt, an attempt row with both hashes and one `integrity` conflict per received hash referencing the untouched original (D3 item 6). A `queueItemId` reused with another key gives `rejected` `OFFLINE_SYNC_QUEUE_ID_REUSED`, and processing continues. Receipts, queue items and conflicts expose `stynx` (`receiptId`, `appliedAt`, `serverEntityId`, `attempts`, …), identical on replay. | `unit/offline-sync-lists-reserve.spec.ts` "V-05 …"; `unit/offline-sync-pending-review-context.spec.ts` "V-05 UPS-OFS-08 …"; `unit/postgres-pending-review-context.spec.ts`; `integration/offline-sync-pending-review-context.integration.spec.ts` "V-05 UPS-OFS-08 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-02 …"; `integration/ctg9-upgrade.integration.spec.ts` "serializes a same-key cross-device race …"                                                                       | The batch submit result does not carry `stynx`; use the receipt lookups and listings.                                                                                                                |
| V-06 | `policyResolver.resolve` runs once per operation with `at` = `options.now()`. With a resolver, the policy's `reservationTtlMs` is the only TTL; `options.reservationTtlMs` and the 24 h default are ignored, and a missing TTL is 400. An explicit `validUntil` in the future is stored as sent.                                                                                                                                                                                                                                                                                                                   | `unit/offline-sync-lists-reserve.spec.ts` "V-06 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 resolves tenant/org/operation TTL …"; `unit/coverage-boundaries.spec.ts` "refuses a missing, nonfinite, or nonpositive reservation TTL …"                                                                                                                                                                                                                                               | —                                                                                                                                                                                                    |
| V-07 | The detector runs once per applied item, after `apply`, only when `concurrencyWindowMinutes` is truthy and a detector is configured. `null`/`0` disables it. Each suspected pair consults `handoffPort.permits`. Both items become `conflict` with an open `concurrency` conflict while the effect is kept. A resolver with a detector but no window logs a warning.                                                                                                                                                                                                                                               | `unit/offline-sync-lists-reserve.spec.ts` "V-07 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-04 marks both cross-device acts …", "UPS-OFS-04 suppresses suspicion …"; `integration/ctg9-upgrade.integration.spec.ts` "does not invent a PostgreSQL concurrency window …"                                                                                                                                                                                                                | The missing-window signal is only a log line, with no structured code for `SYNC_CONCURRENCY_WINDOW_SOURCE_PENDING`.                                                                                  |
| V-08 | `resolveWithPort` runs in one transaction. The resolver's `allowedActions` callback governs refusal on every call, with stored evidence as fallback when absent (409 `OFFLINE_SYNC_CONFLICT_RESOLUTION`). The resolver returns `open` (action recorded, conflict stays open with a null resolution) or `resolved` (conflict closed); any other status is refused. Every accepted action has a row in `offline.sync_conflict_actions`, readable through `listSyncConflictActions`; `retry_after_correction` moves an unapplied `conflict` item to `pending` (D1).                                                   | `unit/offline-sync-lists-reserve.spec.ts` "V-08 …"; `unit/offline-sync-pending-review-context.spec.ts` "V-08 UPS-OFS-07 …", "UPS-OFS-06 …"; `unit/postgres-pending-review-context.spec.ts`; `integration/offline-sync-pending-review-context.integration.spec.ts` "V-08 UPS-OFS-07 …", "UPS-OFS-06 …"; `integration/ctg9-upgrade.integration.spec.ts` "records PostgreSQL conflict evidence …"; `unit/in-memory-offline-sync.store.spec.ts` "supports conflict resolution ports …" | No event is emitted for a resolution. Migration 0004 is required before any resolver-backed resolution.                                                                                              |
| V-10 | The persisted `agent_id` comes from `agentResolver.resolve(scope, operation)`, and the audit actor comes from the context. They are stored separately (`audit_actor_id`, `resolved_by`).                                                                                                                                                                                                                                                                                                                                                                                                                           | `unit/offline-sync-lists-reserve.spec.ts` "V-10 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 resolves tenant/org/operation TTL and business agent independently of actor"; `unit/coverage-boundaries.spec.ts` "uses an agent resolver and an empty policy …"                                                                                                                                                                                                                         | The resolver does not receive the request's business `agent_id`; the host must carry it, for example through its own request context.                                                                |
| V-11 | `requestedSize` must be an integer from 1 to 100, and `shiftId` is required: a host without a shift sends `OFFLINE_SYNC_NO_SHIFT`, and any other `stynx:` shift is 400. Exhaustion is `OFFLINE_SYNC_RANGE_UNAVAILABLE` with `reason`. Concurrent reservations never overlap, including on a consumer-written range.                                                                                                                                                                                                                                                                                                | `unit/offline-sync-lists-reserve.spec.ts` "V-11 …"; `unit/offline-sync-depth.spec.ts` "accepts exact upper validation boundaries …"; `integration/ctg9-upgrade.integration.spec.ts` "UPS-OFS-01 allocates disjoint intervals …"; `integration/offline-sync-lists-reserve.integration.spec.ts` "UPS-OFS-05 …", "UPS-OFS-12 …"                                                                                                                                                       | No single-active-reservation check per device and shift, so there is no distinct "active exists" code (planned minor, ADR-MOBILE-OFFLINE-0003 D5). `shiftId` cannot be null; the sentinel stands in. |
| V-12 | Cancel accepts only `reserved`; in CTG9 mode a repeated cancel returns the cancelled row unchanged and rewinds the range only for an unused tail. Block and close accept `reserved`/`expired`; repeating the same target status returns the row unchanged. Settle also accepts `consumed`. Unused (`available`) numbers become `blocked`/`expired`.                                                                                                                                                                                                                                                                | `unit/offline-sync-lists-reserve.spec.ts` "V-12 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 makes configured-policy lifecycle transitions idempotent", "UPS-OFS-01 releases only an unused tail …"; `unit/in-memory-offline-sync.store.spec.ts` "cancels a CTG9 reservation idempotently …"                                                                                                                                                                                         | No events are emitted, so "no new event" holds trivially.                                                                                                                                            |
| V-13 | Claims outside the interval return 400 before any write. Claims are recorded only while the reservation is `reserved`. Consumption has one entry per number. `missingOnServer` lists claims not `applied`; `unexpectedOnServer` lists `applied` numbers that were not claimed.                                                                                                                                                                                                                                                                                                                                     | `unit/offline-sync-lists-reserve.spec.ts` "V-13 …"; `unit/postgres-durable-coverage.spec.ts` "reconciles claims and reports missing …", "rejects out-of-range claims …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 reconciles after close …"                                                                                                                                                                                                                                          | Reconciliation updates only `audit_actor_id`/`updated_at`; no separate reconciliation record is kept.                                                                                                |
| V-14 | The service emits exactly one `eventPort.appendInTransaction(trx, {entity: entityType, entityId: serverEntityId, idempotencyKey: <receipt key>, payload: payloadJson})` per applied item, inside that item's transaction. It emits nothing for rejections, conflict openings, reservations or resolutions, so the consumer's own envelopes are the only public trail.                                                                                                                                                                                                                                              | `unit/offline-sync-lists-reserve.spec.ts` "V-14 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-03 applies items serially and passes the identical transaction …"                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                    |
| V-15 | `stableStringify` sorts object keys recursively and serializes `undefined` as `null` rather than omitting it. `batchContextFingerprint` hashes it for batch identity only. `payloadHash` is client-declared and checked only for format; STYNX does not recompute it.                                                                                                                                                                                                                                                                                                                                              | `unit/offline-sync-lists-reserve.spec.ts` "V-15 …"; `unit/coverage-boundaries.spec.ts` "separates transport users and absent optional item fields …"                                                                                                                                                                                                                                                                                                                               | There is no port for a consumer canonical hash, and the `undefined` handling differs from JSON omission.                                                                                             |

Server-side device attestation is deferred to Phase 5. This API authenticates the actor and scopes
database access, but it cannot independently prove the client's posture claim.
