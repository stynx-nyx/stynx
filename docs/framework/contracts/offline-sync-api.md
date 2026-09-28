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

The four rows above are the existing route contract and remain compatible. CTG9 adds service
operations for block, close, reconcile, settle, consumption and receipt reads. A mounted controller
exposes corresponding tenant-scoped routes; a host that sets `mountControllers:false` maps its own
TEAT/BOAT routes to the same service. Those adapters preserve their existing methods, paths,
statuses, bodies and error codes, verified by before/after HTTP characterization. The batch route's
durable receipt takes precedence over transport `Idempotency-Key` caching: a transport cache cannot
turn a changed declared key set or sequence into a successful replay or mask 409/422. The legacy
`@Idempotent` decorator may be removed from this one route to enforce that ordering; the header
remains accepted. Other route decorators and behavior are unchanged.

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
`submitSyncBatch`, `openConflict`, and `resolveConflict`. Its additive operations are
`blockNumberingReservation`, `closeNumberingReservation`, `reconcileNumberingReservation`,
`settleNumberingReservation`, `getNumberingConsumption`, `getSyncBatchReceipt`, and
`getSyncItemReceipt`. The root package exports `OfflineSyncAgentResolver`,
`OfflineSyncPolicyResolver`, `OfflineSyncItemApplier`, `OfflineSyncEventPort`,
`OfflineSyncConcurrencyDetector`, `OfflineSyncHandoffPort`, and
`OfflineSyncConflictResolver`. Their exact input/result and injection shape is fixed in the
[CTG9 OFS contract](../../../work/rounds/R-0002/ctg9-ofs-contract.md). These are specified
symbols until the package implementation and public API baseline prove them.

The trusted tenant and audit actor come from request context. An agent resolver can supply a
different business agent after host authorization; body identity fields cannot override either.
The policy resolver obtains TTL, concurrency window and batch policy per tenant/org/operation at
execution time with an injectable clock. Missing parameters retain the host's established policy;
there is no implicit fixed 24-hour TTL. Numbering transitions preserve already applied numbers,
allow release only of an unused tail, and expose reconciliation/consumption for every number in the
interval. Concurrent reservations cannot overlap.

Batches are durable by `(tenant,device,deviceBatchId)`, with optional positive `batchSequence`,
the declared item-key set, open/closed state and original receipts. A closed replay with equal
context returns the same receipt with no second effect. Changed context or a repeated sequence
under a new batch ID returns 409; a sequence gap returns 422. Unsequenced legacy batches remain
accepted. A legacy item without a supplied key receives a synthetic storage key, stays
`received` with `TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED`, and is never applied to the domain. There is
no fixed 100-item ceiling for otherwise valid batches; existing string, hash, UUID and numbering
limits remain unchanged.

Each keyed item applies sequentially in its own app-role, READ COMMITTED
`Database.txIndependent` transaction. The domain applier receives that `Transaction`; effect,
number consumption, receipt and `OfflineSyncEventPort.appendInTransaction(trx,event)` share its
commit. The event port follows the stable OBX interface and has no second connection. A failed
item rolls back those effects, can receive a separately persisted rejection receipt, and does not
undo successful sibling items. A batch service checks `Database.assertNoHeldConnection` before
its first write, including batch-receipt creation. An enclosing `@TransactionalCommand` is
rejected before writing; strict item mode rejects hidden second connections through derived
request or system contexts. Ordinary `Database.tx` outside that mode retains its legacy behavior.

Concurrency detection compares a business agent's acts across devices within the resolved
window. A verified handoff may exempt the pair; missing or disabled window follows the host's
existing warning/no-detection policy. A suspicion marks both affected acts. Conflict resolution
uses the allowed actions for that conflict kind. Legacy `device-wins`, `server-wins`, and
`manual-review` remain available for existing callers but are not aliases for TEAT action names.

Apply additive `migrations/0002_*.sql` only after 0001 and before enabling CTG9 code. Upgrade
must preserve old queue rows and IDs, backfill legacy batch/receipt identity without pretending a
domain effect occurred, install the new item-key uniqueness before dropping hash uniqueness,
and add tenant-leading FORCE RLS, grants and indexes to new tables. It must not silently rewrite
stored hashes or statuses. The release evidence includes an upgrade test, seed and `test/db`
checks, two-tenant PostgreSQL/RLS tests, and TEAT/BOAT HTTP parity. Publication and conformance
remain pending those proofs.

Server-side device attestation is deferred to Phase 5. This API authenticates the actor and scopes
database access, but it cannot independently prove the client's posture claim.
