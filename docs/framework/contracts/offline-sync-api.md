# Offline Sync API Contract

**Package:** `@stynx-nyx/offline-sync`
**Status:** E6 server pair supported; CTG9 1.5 parity specified, implementation and release proof pending.
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
fingerprint returns the published 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`. Persist that key,
fingerprint, status, exact body bytes and replayable response headers with the batch receipt.
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
before mounting the PostgreSQL-backed module. The package does not create consumer numbering-range
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

Server-side device attestation is deferred to Phase 5. This API authenticates the actor and scopes
database access, but it cannot independently prove the client's posture claim.
