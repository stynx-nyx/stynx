# CTG9 OFS — offline sync parity contract for STYNX 1.5.0

**Role:** Architect. **Status:** implementation contract, pending Inspector and Engineer proof.
**Authority:** OD-S15-03; DETRAN C-0002 A1 §8.1 UPS-OFS-01…04 (read only); `INV-OFFLINE-001`; ADR-MOBILE-OFFLINE-0002. This document does not assert that an RC or final package implements the contract.

## Public boundary and trusted identity

`@stynx-nyx/offline-sync` exports `OfflineSyncService`, `OfflineSyncAgentResolver`, `OfflineSyncPolicyResolver`, `OfflineSyncItemApplier`, `OfflineSyncEventPort`, and their input/result types from its root. `StynxOfflineSyncModule.forRoot` accepts these ports and a testable clock; `mountControllers:false` retains the same service behavior. The tenant and audit actor come from trusted STYNX request context. `OfflineSyncAgentResolver.resolve(scope, operation)` supplies the business agent after host-owned membership and assignment checks. The business agent may differ from `scope.actorId`; body fields may not supply either trusted identity. The host supplies entity-specific appliers, authorization, catalogue data, and TEAT/BOAT envelope translation. STYNX does not acquire a closed entity allowlist.

**Adoption boundary:** configuring `OfflineSyncPolicyResolver` activates CTG9
durable parity mode for the module and its service, whether or not controllers
are mounted. Without that new resolver, the published E6 mode remains active:
`submitSyncBatch` deduplicates a repeated payload hash within a tenant even
when the key differs, a second `cancelNumberingReservation` returns its
published 409, `reservationTtlMs ?? 86_400_000` applies, and the 100-item
maximum remains. Existing E6 tests and route behavior stay valid. In CTG9
mode, item identity is `(tenant,idempotencyKey)` with hash as integrity and
a repeat of the same terminal cancellation returns the recorded result.
The mode is selected at module bootstrap, never by a request body. DETRAN
R-0022 supplies the resolver for catalogue TTL and enters CTG9 mode.

The existing four routes, their methods, permissions, HTTP statuses, and public bodies remain compatible. The extended controller adds tenant-scoped block, close, reconcile, settle, consumption, and receipt reads without changing those routes. The host may continue to mount its TEAT/BOAT routes over the service; their before/after HTTP characterization is mandatory. The batch endpoint must reject an enclosing CTG5 `@TransactionalCommand` before any batch or item write. At bootstrap, `StynxOfflineSyncModule.forRoot` mounts the E6 controller with its `@Idempotent('Idempotency-Key')` metadata when no policy resolver is configured, or the CTG9 controller with the same method/path/permission and an OFS-specific in-service transport-key ledger when the resolver is configured. The route never changes mode per request. The controller still requires a nonblank `Idempotency-Key` header and returns the published 400 when absent; the service-only API receives that key explicitly. After authentication, context and header validation, the service checks `(tenant,device,deviceBatchId)`, sequence and declared item-key set **before** transport-key fingerprint comparison. Batch context includes org unit, business agent, every item ID, key, hash, entity type and local entity ID, not merely the key set. A closed matching batch replays its persisted original HTTP status and exact body bytes, even if the transport key differs. Batch-context or declared-set divergence is 409; a sequence gap is 422. Only when no same-batch replay/mismatch applies does reuse of a transport key with a different method/path/body fingerprint return the published 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`. The transport namespace remains the published tenant/user/route/key scope, and fingerprinting uses the current `IdempotencyInterceptor` method, concrete path and stable body stringification so a CTG9 upgrade does not recategorize an existing key. An equal transport fingerprint for a different batch identity cannot authorize a new effect: batch identity and item keys still govern. Persist the transport key, fingerprint, response status and response body bytes with the batch receipt. Other routes retain their published idempotency decorator behavior. HTTP interceptors outside this OFS route must not short-circuit before these domain checks; an adopter that mounts the batch service under such an interceptor is unsupported and fails at bootstrap or before a write.

Persist the first response's replayable headers with the batch receipt. Both domain replay and transport replay restore those headers, then set the configured `replayKeyHeaderName` (default `X-Idempotency-Key`) to the incoming key and `replayMarkerHeaderName` (default `Idempotency-Replayed`) to `true`, as the published interceptor does. The replay metadata overrides a captured value of the same header. The original response does not claim to be a replay. The exact bytes guarantee covers status, body and stored replayable header values; response framing headers generated by the HTTP server follow its normal wire handling.

The new public TypeScript surface is pinned as follows. Existing method signatures remain assignable; `SubmitSyncBatchInput.items` accepts the additive optional key/sequence fields only in CTG9 mode. `OfflineSyncEventPort` is a structural port; the host adapter maps its event to OBX `OutboxAppendEvent` without making OFS import the outbox package.

```ts
interface OfflineSyncAgentResolver {
  resolve(scope: TrustedOfflineSyncScope, operation: string): Promise<string>;
}
interface OfflineSyncPolicyResolver {
  resolve(input: { tenantId: string; orgUnitId: string; operation: string; at: string }): Promise<{
    reservationTtlMs?: number;
    concurrencyWindowMinutes?: number | null;
    maxBatchItems?: number | null;
  }>;
}
interface OfflineSyncItemApplier {
  apply(
    trx: Transaction,
    item: SyncBatchItemInput,
    context: OfflineSyncItemContext,
  ): Promise<OfflineSyncApplyResult>;
}
interface OfflineSyncEventPort {
  appendInTransaction(trx: Transaction, event: OfflineSyncEvent): Promise<void>;
  appendManyInTransaction(trx: Transaction, events: readonly OfflineSyncEvent[]): Promise<void>;
}
interface OfflineSyncConcurrencyDetector {
  detect(
    trx: Transaction,
    item: SyncBatchItemInput,
    context: OfflineSyncItemContext,
  ): Promise<OfflineSyncConcurrencyResult>;
}
interface OfflineSyncHandoffPort {
  permits(
    trx: Transaction,
    pair: OfflineSyncConcurrentPair,
    context: OfflineSyncItemContext,
  ): Promise<boolean>;
}
interface OfflineSyncConflictResolver {
  resolve(
    trx: Transaction,
    conflictId: string,
    action: string,
    context: OfflineSyncItemContext,
  ): Promise<SyncConflict>;
}
interface OfflineSyncItemContext extends TrustedOfflineSyncScope {
  readonly agentId: string;
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly batchId: string;
  readonly now: string;
}
interface OfflineSyncApplyResult {
  readonly serverEntityId: string;
}
interface OfflineSyncEvent {
  readonly entity: string;
  readonly entityId: string;
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly metadata?: Record<string, unknown> | null;
}
interface OfflineSyncConcurrentPair {
  readonly firstItemId: string;
  readonly secondItemId: string;
}
interface OfflineSyncConcurrencyResult {
  readonly suspected: boolean;
  readonly pairs: readonly OfflineSyncConcurrentPair[];
}
interface SyncBatchItemInput {
  readonly queueItemId: string;
  readonly entityType: string;
  readonly localEntityId: string;
  readonly idempotencyKey?: string;
  readonly payloadHash: string;
  readonly payloadJson: Record<string, unknown>;
  readonly createdLocallyAt: string;
  readonly reservedNumber?: number;
}
interface SubmitSyncBatchInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly batchSequence?: number | null;
  readonly items: readonly SyncBatchItemInput[];
}
interface SubmitSyncBatchOptions {
  readonly transportIdempotencyKey: string;
  readonly method: 'POST';
  readonly path: string;
}
interface ReconcileNumberingInput {
  readonly claimedNumbers?: readonly number[];
  readonly userRef?: string;
}
interface SettleNumberingInput {
  readonly reason?: string;
  readonly userRef?: string;
}
type NumberingReservationStatus = 'reserved' | 'consumed' | 'expired' | 'cancelled' | 'blocked';
interface NumberingConsumptionEntry {
  readonly number: number;
  readonly status: 'available' | 'claimed-locally' | 'applied' | 'blocked' | 'expired';
  readonly serverEntityId: string | null;
  readonly finalizedAt: string | null;
}
interface NumberingConsumptionResult {
  readonly reservationId: string;
  readonly status: NumberingReservationStatus;
  readonly consumption: readonly NumberingConsumptionEntry[];
}
interface ReconcileNumberingResult extends NumberingConsumptionResult {
  readonly missingOnServer: readonly number[];
  readonly unexpectedOnServer: readonly number[];
}
interface SyncItemReceipt {
  readonly queueItemId: string;
  readonly status: OfflineSyncQueueStatus;
  readonly errorCode?: string;
  readonly context?: Record<string, unknown>;
}
interface SyncBatchReceipt {
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly batchSequence: number | null;
  readonly status: 'open' | 'closed' | 'legacy_closed_unverified';
  readonly items: readonly SyncItemReceipt[];
  readonly responseStatus: number | null;
  readonly responseBodyBytes: Uint8Array | null;
  readonly responseHeaders: Readonly<Record<string, string>>;
}
// Existing service methods remain. Additions:
interface OfflineSyncService {
  submitSyncBatch(input: SubmitSyncBatchInput): Promise<SubmitSyncBatchResult>;
  submitSyncBatch(
    input: SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
  ): Promise<SubmitSyncBatchResult>;
  blockNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput,
  ): Promise<NumberingReservation>;
  closeNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput,
  ): Promise<NumberingReservation>;
  reconcileNumberingReservation(
    id: string,
    input: ReconcileNumberingInput,
  ): Promise<ReconcileNumberingResult>;
  settleNumberingReservation(
    id: string,
    input: SettleNumberingInput,
  ): Promise<NumberingReservation>;
  getNumberingConsumption(id: string): Promise<NumberingConsumptionResult>;
  getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt>;
  getSyncItemReceipt(idempotencyKey: string): Promise<SyncItemReceipt>;
}
```

The published one-argument `submitSyncBatch(input)` remains callable for service-only adopters; when no HTTP transport exists it uses a separate service invocation identity derived from the trusted batch identity, not a fabricated HTTP header. It still performs all domain identity and receipt checks. `SubmitSyncBatchOptions` is mandatory only for the mounted HTTP controller. The implementation must publish concrete definitions of each named result/input above, retaining published field types and bounds.

## UPS-OFS-01 — numbering lifecycle

Keep `reserveNumbering` and `cancelNumberingReservation`. Add `blockNumberingReservation`, `closeNumberingReservation`, `reconcileNumberingReservation`, `settleNumberingReservation`, and `getNumberingConsumption` to `OfflineSyncService` and `OfflineSyncStore`. `NumberingReservation` retains the existing fields; additive lifecycle and consumption projections distinguish available, locally claimed, applied, blocked, and expired numbers. A range allocation locks its tenant/org/entity/series range and advances its cursor atomically. Cancellation can release only the unused tail; applied numbers are never made available again. Block may transition reserved or expired to blocked; close may transition reserved or expired to consumed; in CTG9 mode, idempotent repetition of the same terminal action, including cancel, returns its recorded result. The E6 no-resolver path keeps its second-cancel 409. Other transitions fail with the consumer-compatible status and envelope. Reconcile records one result for every number in the interval, rejects out-of-range claims, reports missing and unexpected server consumption, and does not erase applied evidence. Settlement and consumption reads must remain tenant scoped. Distinct reservations cannot overlap under concurrent app-role transactions.

`OfflineSyncPolicyResolver.resolve({tenantId,orgUnitId,operation,at})` returns the applicable reservation TTL, concurrency window, and batch cardinality policy from the host catalogue. The clock is injected. If the resolver is configured and returns no value for a required tenant/org policy, do not silently fall back to another tenant or a global default: apply the host's explicit missing-parameter outcome. With **no resolver configured**, preserve the published `reservationTtlMs ?? 86_400_000` behavior, identified as a legacy compatibility default rather than a catalogue value; keep the published 100-item maximum in that mode. With a resolver, accept its scoped policy, including more than 100 items when allowed; do not impose a new fixed ceiling. A missing or disabled concurrency window follows the host's existing warning/no-detection policy. A request-supplied `validUntil` remains subject to the host's existing contract and resolved policy. Do not add new limits for strings, hashes, UUIDs, or numbering.

## UPS-OFS-02 — durable batches and receipts

`SubmitSyncBatchInput` adds optional positive `batchSequence` and permits a legacy item with no `idempotencyKey`. Persist a batch keyed by `(tenant_id,device_id,device_batch_id)`, with sequence, declared idempotency-key set, open/closed state, and a durable result. A second unique key `(tenant_id,device_id,batch_sequence)` applies only when sequence is present. Serialize reservation of these identities so duplicate sequence under a new batch ID returns 409 and a gap returns 422 with expected/received sequence; first sequenced batch expects 1. A closed batch replay with the same device, sequence, declared set, and context returns the original receipt bytes and causes no new effect. A changed context or declared set returns 409. An open batch after a crash resumes from persisted item receipts in input order; an already completed item is never re-applied. Each open batch has a DB-backed lease with holder token and monotonically increasing fencing generation. Only the current holder may begin an item or close the batch. A concurrent same-batch request waits for the holder to close, then returns the exact closed receipt; if the lease expires, one contender atomically acquires the next generation and resumes uncompleted items. While a valid lease remains open beyond the bounded wait, return HTTP 503 with `errorCode: 'OFFLINE_SYNC:BATCH:in-progress'`, `retryable: true`, the current request ID and `Retry-After: 1` (seconds), with no item effect; this is the durable-strict timeout behavior, never a non-strict fall-through; a stale holder fails the fencing check before its next write. Unique-item conflicts from two contenders resolve by reading the committed receipt, never by re-running the applier. Prove this with simultaneous submissions of the same open batch.

`getSyncBatchReceipt` and `getSyncItemReceipt` return tenant-scoped durable receipts. In CTG9 mode, item identity is `(tenant_id,idempotency_key)` with `payloadHash` as integrity evidence: same key and hash returns the original receipt; same key and different hash records a rejected/integrity-conflict attempt receipt without overwriting the original item receipt or applying a second effect. Different keys with equal payload bytes remain distinct. A hash that does not match the canonical payload is rejected with the existing public integrity outcome. A missing item key uses an internal synthetic key `stynx:legacy:v1:<sha256(tenantId || 0x00 || deviceId || 0x00 || deviceBatchId || 0x00 || queueItemId)>`, where the inputs are UTF-8 byte strings and `||` is byte concatenation; explicit client keys beginning `stynx:legacy:` are rejected before writing, and the generated key is never returned as an accepted client key. The item remains `received` with neutral code `OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED` and invokes no applier. The TEAT adapter maps that code to `TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED` while preserving its public envelope. A batch without sequence remains accepted and unordered. Preserve the established receipt statuses `received`, `applied`, `conflict`, and `rejected`, with error code/context and the consumer's public envelopes. No path can infer tenant authority from device or request body data.

## UPS-OFS-03 — one independent transaction per item

`OfflineSyncItemApplier.apply(trx, item, context)` receives the actual `@stynx-nyx/data` `Transaction`; it does not create its own SQL connection. `OfflineSyncEventPort.appendInTransaction(trx,event)` is the stable OBX port and uses that same transaction. For one item, OFS calls exactly one **final** event-port operation after domain effect, consumption and receipt: `appendInTransaction` for one fact or `appendManyInTransaction` for several; it never invokes both. The port is the last write, and the OBX seal forbids later DML. OFS depends on this port's interface, not directly on the outbox package. The item executes under `Database.txIndependent` in explicit `read committed` isolation and app role with trusted tenant and actor. Domain effect, numbering consumption, item receipt, and event append commit together. Internal failure rolls all four back. A classified item rejection is persisted in a separate short receipt transaction after rollback, then the next item proceeds. A retryable 40P01/40001 after exhausted outer retries leaves the item open, without a completed ACK or consumption; it is not swallowed inside an aborted transaction.

Before creating or reopening a batch receipt, the service calls `Database.assertNoHeldConnection`; an enclosing `@TransactionalCommand` or other active transaction fails with a typed error before any write. `txIndependent` also asserts before connection acquisition, including when derived request/system context has hidden the CLS transaction key. Its inherited mutable connection holder is cleared after release. In strict item mode, a nested `Database.tx` may use a savepoint on the same connection, but any attempt by the applier, audit sink, or event port to open a second connection through `withRequestContext`, `withSystemContext`, or another wrapper fails before `pool.connect`. Outside this explicit strict mode, legacy `Database.tx` behavior is unchanged. Process items sequentially; concurrent `Promise.all` on one CLS store is rejected or given isolated context and bounded separate connections with proof. No transaction spans items.

## UPS-OFS-04 — concurrency and resolution

`OfflineSyncConcurrencyDetector.detect(trx, item, context)` compares the business agent's acts from different devices within the resolved policy window. A verified `OfflineSyncHandoffPort` may exempt a documented device handoff. An absent or disabled window produces the host-compatible warning or no detection, without inventing a value. A suspected pair marks both affected acts and their receipts/conflicts, preserving tenant isolation. `OfflineSyncConflictResolver` accepts the host's allowed action set per conflict kind; it records the action and resulting state and refuses forbidden actions. The legacy `device-wins`, `server-wins`, and `manual-review` values remain supported for their existing callers, but are not treated as aliases for DETRAN `accept_server`, `reject`, `retry_after_correction`, or concurrency-only `manual_review`. TEAT/BOAT mapping stays host-owned.

## Migration, compatibility, and proof

Ship an additive, forward-only `packages/offline-sync/migrations/0002_*.sql` after `0001_offline_sync.sql`. Preserve all four existing tables and rows; backfill batch and receipt identity from legacy queue rows without claiming a completed domain effect. Because 0001 has queue rows but no batch header or original HTTP response, a backfilled legacy batch is marked `legacy_closed_unverified`: immutable as to already stored item receipts, **not** eligible for fabricated HTTP replay. After batch identity, sequence and declared-set validation, but before an unverified conflict or any write, an OFS compatibility bridge performs a read-only lookup through the existing `IdempotencyStore.lookup(IdempotencyDecisionContext)` using the published tenant/user/route/key composite key and method/path/body fingerprint. Only an unexpired `completed` record with the same fingerprint qualifies. The bridge returns its recorded status, body and replayable headers through the same response serialization path as the published interceptor, plus configured replay-key/replay-marker headers; it must prove byte equivalence to that interceptor replay in the HTTP sensor. A pending, expired, mismatched or absent record cannot authorize an effect or be promoted. If the legacy store record has no byte-equivalent body representation, fail closed with an explicit conflict rather than claim exact replay. The bridge does not call `reserve` or `persistResponse` on the legacy store; the new batch ledger alone owns new writes. An adopter may instead attach independently verified archived ACK bytes/headers and promote to closed. New batches store original status/body bytes and replayable headers on close and replay exactly. Remove the exclusive `(tenant_id,payload_hash)` constraint only after the replacement key and integrity path are ready. Add batch, receipt, numbering-consumption, and conflict evidence structures with tenant-leading keys, grants, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and app/reader permissions. Keep nullable legacy sequence/key semantics explicit. State the upgrade order and rollback boundary; do not silently rewrite old hashes, statuses, or consumer-visible IDs. The Engineer owns migration, canonical DDL if applicable, seed, and `test/db`; the Architect rebinds trace/API baselines after sensors and implementation.

Inspector proof includes HTTP before/after status, body bytes and replay headers for missing header, same-key/different-body, identical transport retry and domain retry with a different transport key; 503 `OFFLINE_SYNC:BATCH:in-progress` with `Retry-After` under a held lease; and an unexpired legacy durable-store replay across upgrade with the same tenant/user/route/key/fingerprint, followed by expired and mismatched negative cases that cause no second effect. It also uses actual PostgreSQL app and owner roles, two tenants, concurrent reservations, expiry, all lifecycle transitions, >100 items, legacy receipt, sequence replay/gap, changed declared set, lost-ACK replay, per-item rollback and partial success, a crash-open batch resume, same/different key and hash, cross-tenant reads/writes, two-device suspicion and handoff, missing/disabled window, permitted/forbidden resolution, and real TEAT/BOAT HTTP before/after bodies/statuses. Include a CTG5 envelope regression and a miswired applier/event port that tries another connection with pool-sized concurrency, plus post-commit continuation, to prove strict mode does not regress ordinary CTG5, i18n, ratelimit, or tenancy. No existing assertion is removed or weakened.

`INV-OFFLINE-001` remains unchanged. A legacy item without a key is stored but does not become an offline-originated entity mutation; no domain applier runs. If implementation reveals an unavoidable change to that invariant or another public limit, stop and present the exact delta to the Owner before altering law or behavior.
