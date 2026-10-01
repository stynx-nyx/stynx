# Offline Sync API Contract

**Package:** `@stynx-nyx/offline-sync`
**Status:** E6 server pair is the compatibility baseline; CTG9 1.5 behavior passed Opus delivery-review cycle 5. Publication evidence is recorded separately in R-0002.
**Authority:** `INV-OFFLINE-001`, `ADR-MOBILE-OFFLINE-0001`, `ADR-MOBILE-OFFLINE-0002`, OD-S15-03.
**Effective:** E6 baseline 2026-08-24; CTG9 contract 2026-09-28.

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
- Payload hashes use `sha256:<64 lowercase hex>`.
- The four original `offline.*` tables and every CTG9 batch, receipt or consumption table carry
  tenant-leading keys/indexes and forced RLS keyed by `app.tenant_id` set by `@stynx-nyx/data`.
- Device-local entity and queue identifiers are bounded text because device IDs need not be UUIDs.

Adopters must apply the shipped `migrations/0001_offline_sync.sql` with the STYNX migration owner
before mounting the PostgreSQL-backed module, then 0002 and, for keyed reservations, 0003. The package does not create consumer numbering-range
rows; provisioning those ranges remains a host-domain responsibility.

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
1.5.0 behavior.

**Tenant listings (UPS-OFS-11).** `OfflineSyncService` exposes `listSyncBatchReceipts`,
`listSyncItemReceipts`, `listSyncQueueItems`, and `listSyncConflicts`. Each takes an optional
input and returns `OfflineSyncPage<T> = { items, nextCursor }`. The tenant always comes from the
trusted context port. PostgreSQL reads run in the app-role `Database.tx` with `app.tenant_id` and a
`tenant_id` predicate under FORCE RLS, so another tenant's rows never appear. Filters are equality
matches:

| Listing                   | Filters                                                           | Order (newest first, stable tie-break)                  | Row type                                                                                                                |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| batch receipts            | `deviceId`, `status` (`open`/`closed`/`legacy_closed_unverified`) | `created_at desc, device_id desc, device_batch_id desc` | `SyncBatchReceiptSummary` (no item list or body bytes; use `getSyncBatchReceipt`)                                       |
| item receipts             | `deviceId`, `deviceBatchId`, `status`                             | `received_at desc, receiptId desc`                      | `SyncItemReceiptRecord` (`receiptId`, `deviceId`, `deviceBatchId`, `payloadHash`, `receivedAt`, plus `SyncItemReceipt`) |
| queue items (E6 and CTG9) | `deviceId`, `status`, `entityType`                                | `received_at desc, id desc`                             | `SyncQueueItemRecord` (`StoredSyncQueueItem` plus `deviceBatchId`)                                                      |
| conflicts                 | `status` (`open`/`resolved`), `conflictType`, `queueItemId`       | `created_at desc, id desc`                              | `SyncConflictRecord` (`SyncConflict` plus `createdAt`)                                                                  |

Identifier tie-breaks use the `C` collation. `limit` defaults to 50 and must be an integer from 1 to 200. `cursor` is an opaque base64url keyset token: the microsecond UTC sort instant plus tie-break
identifiers of the last row. A malformed cursor, blank filter, unknown status or bad limit returns
400 `OFFLINE_SYNC_INVALID_INPUT`. Rows created after a cursor was issued do not shift later pages.

The PostgreSQL item-receipt timestamp is the database insertion time (`clock_timestamp()`). Queue
items and conflicts use the injected service clock, and batches use their database creation time.
`receiptId` is the receipt's tenant-scoped storage key: the client `idempotencyKey`, or the
`stynx:legacy:v1:` key for unkeyed items. The listing methods are optional on
`OfflineSyncDurableStore`, so existing custom stores still compile. Calling one against a store that
lacks it throws `OfflineSyncConfigurationError`. The packaged controllers do not mount listing
routes; hosts map their own routes to the service.

**Idempotent reservation (UPS-OFS-05).** `ReserveNumberingInput.idempotencyKey` is optional, 1–255
UTF-8 bytes, and scoped by tenant. The request fingerprint is a SHA-256 of the stable serialization
of the resolved business agent and the request fields: `orgUnitId`, `deviceId`, `shiftId`,
`entityType`, `requestedSize`, `rangeId`, `series` and the explicit `validUntil`. The computed default
validity is excluded.

- Same key and fingerprint: returns the original reservation in its current state. It consumes no
  numbers and emits no event.
- Same key with a different fingerprint: throws `OfflineSyncReservationReplayError`, which is
  `HttpException` 409 with `code`/`errorCode` `OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT`. The
  original reservation is unchanged.
- Without a key, behavior is identical to 1.5.0.

On PostgreSQL, same-key requests serialize on a transaction-scoped advisory lock, and the partial
unique index `(tenant_id, idempotency_key)` backs that up. N concurrent replays therefore consume one
interval. Request validation, including `validUntil` in the future, runs before the replay lookup.
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

**Applier receipt identifier (UPS-OFS-09, part).** `OfflineSyncItemContext.receiptId` (optional in
the type, always set by the shipped stores for keyed items) is the item receipt key above. It equals
`SyncItemReceiptRecord.receiptId` and is stable across replay. The detection order is unchanged:
concurrency detection runs after `apply` in the same item transaction. Passing the suspicion result
to the applier is not implemented.

**Batch cardinality message.** The 400 message reports the effective limit: "items must contain
between 1 and N queue items." With no limit (`maxBatchItems: null` or absent under a policy
resolver), an empty batch reports "items must contain at least 1 queue item." E6 keeps N = 100.

### UPS-OFS-14 verification map (V-01…V-15, except V-09)

The test paths are below `packages/offline-sync/test/`. The **Gap** column lists behavior that STYNX
does not provide today; it is documented here rather than implied.

| V    | Documented behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Tests                                                                                                                                                                                                                                                                                                       | Gap                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V-01 | With a resolver, `maxBatchItems: null` or absent means no item limit. No durable path applies the fixed 100; a 101-item batch is accepted. A numeric limit is enforced and reported.                                                                                                                                                                                                                                                                                                                                                                                         | `unit/offline-sync-lists-reserve.spec.ts` "V-01 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-02 admits scoped >100 items …"                                                                                                                                                                                      | —                                                                                                                                             |
| V-02 | An unkeyed item gets a `stynx:legacy:v1:` key (host resolver optional), stays `received` with `OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED`, and is never applied. A batch without `batchSequence` is accepted with `batchSequence: null` and consumes no sequence.                                                                                                                                                                                                                                                                                                                 | `unit/offline-sync-lists-reserve.spec.ts` "V-02 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-02 stores unkeyed legacy items …"                                                                                                                                                                                   | —                                                                                                                                             |
| V-03 | A repeated sequence under a new batch ID returns 409 `OFFLINE_SYNC_BATCH_CONFLICT`. A gap returns 422 `OFFLINE_SYNC_BATCH_SEQUENCE`. A replay with a different declared set, context or sequence returns 409 `OFFLINE_SYNC_BATCH_CONFLICT`. An integrity mismatch is a per-item `rejected`/`OFFLINE_SYNC_ITEM_INTEGRITY`.                                                                                                                                                                                                                                                    | `integration/ctg9-upgrade.integration.spec.ts` "enforces PostgreSQL sequence duplicate and gap statuses …"; `unit/postgres-durable-coverage.spec.ts` "rejects skipped and reused batch sequences …"; `unit/in-memory-offline-sync.store.spec.ts` "rejects batch context and transport-key reuse …"          | The expected and received sequence numbers and `deviceBatchId` appear only in the error message, not as structured context.                   |
| V-04 | Each keyed item runs in one app-role `txIndependent` transaction covering the effect, consumption, receipt and final event. An applier error rolls the item back, and the outcome is then written to the receipt separately. 4xx `HttpException` (except `OFFLINE_SYNC_BATCH_CONFLICT`) → `rejected` with `errorCode = error.code`. `OfflineSyncNumberingOutcome` → its `receiptStatus` (`EXPIRED` → `conflict`, otherwise `rejected`) with context `{number,reservationId,conflictId,allowedActions}`. Any other error → `received`, retryable, and the batch stays `open`. | `integration/ctg9-upgrade.integration.spec.ts` "commits effect, consumption, receipt and final event …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-03 rolls back a failed item …", "UPS-OFS-03 treats an HttpException 4xx …"; `unit/postgres-durable-coverage.spec.ts` "rejects a business validation failure …" | A domain error's own `context` is not copied to the receipt; only numbering outcomes carry context.                                           |
| V-05 | A same-key, same-hash item in another batch returns the original receipt without `apply`, with `context.originalQueueItemId` when the IDs differ. A hash mismatch gives a `rejected` `OFFLINE_SYNC_ITEM_INTEGRITY` receipt and an attempt row, and leaves the original unchanged. A `queueItemId` reused with another key gives `rejected` `OFFLINE_SYNC_QUEUE_ID_REUSED`, and processing continues.                                                                                                                                                                         | `unit/ctg9-parity.spec.ts` "UPS-OFS-02 returns the submitted queue ID …", "UPS-OFS-02 retains original key/hash receipt …", "UPS-OFS-02 continues after a queue ID reused …"; `integration/ctg9-upgrade.integration.spec.ts` "serializes a same-key cross-device race …"                                    | No `integrity` conflict row holds both hashes. `server_entity_id` is not stored on the receipt, so replay cannot return it (UPS-OFS-08).      |
| V-06 | `policyResolver.resolve` runs once per operation with `at` = `options.now()`. With a resolver, the policy's `reservationTtlMs` is the only TTL; `options.reservationTtlMs` and the 24 h default are ignored, and a missing TTL is 400. An explicit `validUntil` in the future is stored as sent.                                                                                                                                                                                                                                                                             | `unit/offline-sync-lists-reserve.spec.ts` "V-06 …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 resolves tenant/org/operation TTL …"; `unit/coverage-boundaries.spec.ts` "refuses a missing, nonfinite, or nonpositive reservation TTL …"                                                                        | —                                                                                                                                             |
| V-07 | The detector runs once per applied item, after `apply`, only when `concurrencyWindowMinutes` is truthy and a detector is configured. `null`/`0` disables it. Each suspected pair consults `handoffPort.permits`. Both items become `conflict` with an open `concurrency` conflict while the effect is kept. A resolver with a detector but no window logs a warning.                                                                                                                                                                                                         | `unit/ctg9-parity.spec.ts` "UPS-OFS-04 marks both cross-device acts …", "UPS-OFS-04 suppresses suspicion …"; `integration/ctg9-upgrade.integration.spec.ts` "does not invent a PostgreSQL concurrency window …"                                                                                             | The missing-window signal is only a log line, with no structured code for `SYNC_CONCURRENCY_WINDOW_SOURCE_PENDING`.                           |
| V-08 | `resolveWithPort` runs in one transaction. `allowedActions` stored on the evidence governs refusal (409 `OFFLINE_SYNC_CONFLICT_RESOLUTION`). The resolver must return `resolved`. Resolution updates the conflict and appends evidence history.                                                                                                                                                                                                                                                                                                                              | `integration/ctg9-upgrade.integration.spec.ts` "records PostgreSQL conflict evidence and allowed actions …"; `unit/in-memory-offline-sync.store.spec.ts` "supports conflict resolution ports …"                                                                                                             | A resolver cannot keep a conflict open (UPS-OFS-07). No event is emitted for a resolution.                                                    |
| V-10 | The persisted `agent_id` comes from `agentResolver.resolve(scope, operation)`, and the audit actor comes from the context. They are stored separately (`audit_actor_id`, `resolved_by`).                                                                                                                                                                                                                                                                                                                                                                                     | `unit/ctg9-parity.spec.ts` "UPS-OFS-01 resolves tenant/org/operation TTL and business agent independently of actor"; `unit/coverage-boundaries.spec.ts` "uses an agent resolver and an empty policy …"                                                                                                      | The resolver does not receive the request's business `agent_id`; the host must carry it, for example through its own request context.         |
| V-11 | `requestedSize` must be an integer from 1 to 100, and `shiftId` is required. Exhaustion is `OFFLINE_SYNC_RANGE_UNAVAILABLE` with `reason`. Concurrent reservations never overlap.                                                                                                                                                                                                                                                                                                                                                                                            | `unit/offline-sync-depth.spec.ts` "accepts exact upper validation boundaries …"; `integration/ctg9-upgrade.integration.spec.ts` "UPS-OFS-01 allocates disjoint intervals …"; `integration/offline-sync-lists-reserve.integration.spec.ts` "UPS-OFS-05 …"                                                    | No single-active-reservation check per device and shift, so there is no distinct "active exists" code. `shiftId` cannot be null (UPS-OFS-12). |
| V-12 | Cancel accepts only `reserved`; in CTG9 mode a repeated cancel returns the cancelled row unchanged and rewinds the range only for an unused tail. Block and close accept `reserved`/`expired`; repeating the same target status returns the row unchanged. Settle also accepts `consumed`. Unused (`available`) numbers become `blocked`/`expired`.                                                                                                                                                                                                                          | `unit/ctg9-parity.spec.ts` "UPS-OFS-01 makes configured-policy lifecycle transitions idempotent", "UPS-OFS-01 releases only an unused tail …"; `unit/in-memory-offline-sync.store.spec.ts` "cancels a CTG9 reservation idempotently …"                                                                      | No events are emitted, so "no new event" holds trivially.                                                                                     |
| V-13 | Claims outside the interval return 400 before any write. Claims are recorded only while the reservation is `reserved`. Consumption has one entry per number. `missingOnServer` lists claims not `applied`; `unexpectedOnServer` lists `applied` numbers that were not claimed.                                                                                                                                                                                                                                                                                               | `unit/postgres-durable-coverage.spec.ts` "reconciles claims and reports missing …", "rejects out-of-range claims …"; `unit/ctg9-parity.spec.ts` "UPS-OFS-01 reconciles after close …"                                                                                                                       | Reconciliation updates only `audit_actor_id`/`updated_at`; no separate reconciliation record is kept.                                         |
| V-14 | The service emits exactly one `eventPort.appendInTransaction(trx, {entity: entityType, entityId: serverEntityId, idempotencyKey: <receipt key>, payload: payloadJson})` per applied item, inside that item's transaction. It emits nothing for rejections, conflict openings, reservations or resolutions, so the consumer's own envelopes are the only public trail.                                                                                                                                                                                                        | `unit/ctg9-parity.spec.ts` "UPS-OFS-03 applies items serially and passes the identical transaction …"                                                                                                                                                                                                       | —                                                                                                                                             |
| V-15 | `stableStringify` sorts object keys recursively and serializes `undefined` as `null` rather than omitting it. `batchContextFingerprint` hashes it for batch identity only. `payloadHash` is client-declared and checked only for format; STYNX does not recompute it.                                                                                                                                                                                                                                                                                                        | `unit/offline-sync-lists-reserve.spec.ts` "V-15 …"; `unit/coverage-boundaries.spec.ts` "separates transport users and absent optional item fields …"                                                                                                                                                        | There is no port for a consumer canonical hash, and the `undefined` handling differs from JSON omission.                                      |

Server-side device attestation is deferred to Phase 5. This API authenticates the actor and scopes
database access, but it cannot independently prove the client's posture claim.
