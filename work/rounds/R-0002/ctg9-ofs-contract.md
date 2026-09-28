# CTG9 OFS — offline sync parity contract for STYNX 1.5.0

**Role:** Architect. **Status:** implementation contract, pending Inspector and Engineer proof.
**Authority:** OD-S15-03; DETRAN C-0002 A1 §8.1 UPS-OFS-01…04 (read only); `INV-OFFLINE-001`; ADR-MOBILE-OFFLINE-0002. This document does not assert that an RC or final package implements the contract.

## Public boundary and trusted identity

`@stynx-nyx/offline-sync` exports `OfflineSyncService`, `OfflineSyncAgentResolver`, `OfflineSyncPolicyResolver`, `OfflineSyncLegacyItemIdentityResolver`, `OfflineSyncItemApplier`, `OfflineSyncEventPort`, and their input/result types from its root. `StynxOfflineSyncModule.forRoot` accepts these ports, an optional `legacyIdempotencyStore` of the published `IdempotencyStore` type and a testable clock; `mountControllers:false` retains the same service behavior. The tenant and audit actor come from trusted STYNX request context. `OfflineSyncAgentResolver.resolve(scope, operation)` supplies the business agent after host-owned membership and assignment checks. The business agent may differ from `scope.actorId`; body fields may not supply either trusted identity. The host supplies entity-specific appliers, authorization, catalogue data, and TEAT/BOAT envelope translation. STYNX does not acquire a closed entity allowlist.

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
`forRoot` selects CTG9 only when `options.policyResolver != null` (the
published test harness may spread `policyResolver: undefined`). Supplying a
CTG9-only port such as item applier, event port, agent resolver, legacy
identity resolver, legacy idempotency store, handoff or
concurrency detector without the resolver fails at bootstrap with a typed
configuration error; no port is silently ignored. With
`mountControllers:false`, the service still uses the selected mode.
The CTG9-only option keys are exactly `itemApplier`, `eventPort`,
`agentResolver`, `legacyItemIdentityResolver`, `legacyIdempotencyStore`,
`handoffPort`, `concurrencyDetector`, and `conflictResolver`; configuring
any of them without `policyResolver` is an error.
The typed bootstrap error is `OfflineSyncConfigurationError` with
`code: OFFLINE_SYNC_CONFIGURATION_ERROR` and the invalid option name.

The existing four routes, their methods, permissions, HTTP statuses, and public bodies remain compatible. The extended controller adds tenant-scoped block, close, reconcile, settle, consumption, and receipt reads without changing those routes. The host may continue to mount its TEAT/BOAT routes over the service; their before/after HTTP characterization is mandatory. The batch endpoint must reject an enclosing CTG5 `@TransactionalCommand` before any batch or item write. At bootstrap, `StynxOfflineSyncModule.forRoot` mounts the E6 controller with its `@Idempotent('Idempotency-Key')` metadata when no policy resolver is configured, or the CTG9 controller with the same method/path/permission and an OFS-specific in-service transport-key ledger when the resolver is configured. The route never changes mode per request. The controller still requires a nonblank `Idempotency-Key` header and returns the published 400 when absent; the service-only API receives that key explicitly. After authentication, context and header validation, the service checks `(tenant,device,deviceBatchId)`, sequence and declared item-key set **before** transport-key fingerprint comparison. Batch context includes org unit, business agent, every item ID, key, hash, entity type and local entity ID, not merely the key set. A closed matching batch replays its persisted original HTTP status and exact body bytes, even if the transport key differs. Batch-context or declared-set divergence is 409; a sequence gap is 422. Only when no same-batch replay/mismatch applies does reuse of a transport key with a different method/path/body fingerprint return the published 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`. The transport namespace remains the published tenant/user/route/key scope, and fingerprinting uses the current `IdempotencyInterceptor` method, concrete path and stable body stringification so a CTG9 upgrade does not recategorize an existing key. An equal transport fingerprint for a different batch identity cannot authorize a new effect: batch identity and item keys still govern. Persist the transport key, fingerprint, response status and response body bytes with the batch receipt. Other routes retain their published idempotency decorator behavior. HTTP interceptors outside this OFS route must not short-circuit before these domain checks; an adopter that mounts the batch service under such an interceptor is unsupported and fails at bootstrap or before a write.

Persist the first response's replayable headers with the batch receipt. Both domain replay and transport replay restore those headers, then set the configured `replayKeyHeaderName` (default `X-Idempotency-Key`) to the incoming key and `replayMarkerHeaderName` (default `Idempotency-Replayed`) to `true`, as the published interceptor does. The replay metadata overrides a captured value of the same header. The original response does not claim to be a replay. The exact bytes guarantee covers status, body and stored replayable header values; response framing headers generated by the HTTP server follow its normal wire handling.

The new public TypeScript surface is pinned as follows. The published
`OfflineSyncStore`, `SyncBatchItemInput`, `SubmitSyncBatchInput`, and
`StoredSyncQueueItem.idempotencyKey: string` stay source assignable for E6
callers. CTG9 adds distinct `CTG9SyncBatchItemInput` and
`CTG9SubmitSyncBatchInput` types with optional item key and batch sequence,
plus a CTG9 service overload. A legacy unkeyed CTG9 item exposes no
synthetic storage key in its receipt; its public item-key projection is
absent, while E6 `StoredSyncQueueItem` remains a non-null string. The
extended operations belong to `OfflineSyncDurableStore extends
OfflineSyncStore`; the original interface is unchanged. `forRoot` requires
the durable store only in CTG9 mode, with a typed bootstrap error if a
consumer-provided store lacks its operations. `OfflineSyncEventPort` is a
structural port; the host adapter maps its event to OBX
`OutboxAppendEvent` without making OFS import the outbox package.
The module option `legacyIdempotencyStore?: IdempotencyStore` injects the
published `@stynx-nyx/idempotency` store into the CTG9 bridge. Its only
permitted call is `lookup`; when absent, an unverified legacy batch fails
closed unless independently verified archived ACK bytes are provided.
The option `legacyItemIdentityResolver?: OfflineSyncLegacyItemIdentityResolver`
is CTG9-only and cannot be configured without the policy resolver.

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
interface OfflineSyncLegacyItemIdentityResolver {
  resolve(input: {
    tenantId: string;
    deviceId: string;
    deviceBatchId: string;
    queueItemId: string;
    localEntityId: string;
    entityType: string;
  }): Promise<string>;
}
interface OfflineSyncItemApplier {
  apply(
    trx: Transaction,
    item: CTG9SyncBatchItemInput,
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
    item: CTG9SyncBatchItemInput,
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
interface CTG9SyncBatchItemInput {
  readonly queueItemId: string;
  readonly entityType: string;
  readonly localEntityId: string;
  readonly idempotencyKey?: string;
  readonly payloadHash: string;
  readonly payloadJson: Record<string, unknown>;
  readonly createdLocallyAt: string;
  readonly reservedNumber?: number;
  readonly reservationId?: string;
}
interface CTG9SubmitSyncBatchInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly batchSequence?: number | null;
  readonly items: readonly CTG9SyncBatchItemInput[];
}
interface OfflineSyncDurableStore extends OfflineSyncStore {
  blockNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation>;
  closeNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation>;
  reconcileNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ReconcileNumberingInput,
    now: string,
  ): Promise<ReconcileNumberingResult>;
  settleNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: SettleNumberingInput,
    now: string,
  ): Promise<CTG9NumberingReservation>;
  getNumberingConsumption(
    scope: TrustedOfflineSyncScope,
    id: string,
  ): Promise<NumberingConsumptionResult>;
  submitDurableSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: CTG9SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
    now: string,
  ): Promise<SyncBatchReceipt>;
  getSyncBatchReceipt(
    scope: TrustedOfflineSyncScope,
    deviceId: string,
    deviceBatchId: string,
  ): Promise<SyncBatchReceipt | null>;
  getSyncItemReceipt(
    scope: TrustedOfflineSyncScope,
    idempotencyKey: string,
  ): Promise<SyncItemReceipt | null>;
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
// The published NumberingReservation status union remains unchanged.
// The new CTG9 projection can expose 'blocked'.
type NumberingReservationStatus = 'reserved' | 'consumed' | 'expired' | 'cancelled' | 'blocked';
interface CTG9NumberingReservation extends Omit<NumberingReservation, 'status'> {
  readonly status: NumberingReservationStatus;
}
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
interface CTG9SubmitSyncBatchResult extends Omit<SubmitSyncBatchResult, 'items'> {
  readonly items: readonly (Omit<StoredSyncQueueItem, 'idempotencyKey'> & {
    readonly idempotencyKey?: string;
  })[];
  readonly receipt: SyncBatchReceipt;
}
// Existing service methods remain. Additions:
interface OfflineSyncService {
  submitSyncBatch(input: SubmitSyncBatchInput): Promise<SubmitSyncBatchResult>;
  submitSyncBatch(
    input: CTG9SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
  ): Promise<CTG9SubmitSyncBatchResult>;
  blockNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput,
  ): Promise<CTG9NumberingReservation>;
  closeNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput,
  ): Promise<CTG9NumberingReservation>;
  reconcileNumberingReservation(
    id: string,
    input: ReconcileNumberingInput,
  ): Promise<ReconcileNumberingResult>;
  settleNumberingReservation(
    id: string,
    input: SettleNumberingInput,
  ): Promise<CTG9NumberingReservation>;
  getNumberingConsumption(id: string): Promise<NumberingConsumptionResult>;
  getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt>;
  getSyncItemReceipt(idempotencyKey: string): Promise<SyncItemReceipt>;
}
```

The published one-argument `submitSyncBatch(input)` remains callable for service-only adopters; when no HTTP transport exists it uses a separate service invocation identity derived from the trusted batch identity, not a fabricated HTTP header. It still performs all domain identity and receipt checks. `SubmitSyncBatchOptions` is mandatory only for the mounted HTTP controller. The implementation must publish concrete definitions of each named result/input above, retaining published field types and bounds.

## UPS-OFS-01 — numbering lifecycle

Keep `reserveNumbering` and `cancelNumberingReservation`. Add `blockNumberingReservation`, `closeNumberingReservation`, `reconcileNumberingReservation`, `settleNumberingReservation`, and `getNumberingConsumption` to `OfflineSyncService` and the separate `OfflineSyncDurableStore`, leaving `OfflineSyncStore` unchanged. `NumberingReservation` retains the existing fields; additive lifecycle and consumption projections distinguish available, locally claimed, applied, blocked, and expired numbers. A range allocation locks its tenant/org/entity/series range and advances its cursor atomically. Cancellation can release only the unused tail; applied numbers are never made available again. Block may transition reserved or expired to blocked; close may transition reserved or expired to consumed; in CTG9 mode, idempotent repetition of the same terminal action, including cancel, returns its recorded result. The E6 no-resolver path keeps its second-cancel 409. Other transitions fail with the consumer-compatible status and envelope. Reconcile records one result for every number in the interval, rejects out-of-range claims, reports missing and unexpected server consumption, and does not erase applied evidence. Settlement and consumption reads must remain tenant scoped. Distinct reservations cannot overlap under concurrent app-role transactions.

For CTG9 mode, `reservedNumber` asserts coverage by a reservation in the
trusted tenant/device/org/entity scope. An optional `reservationId` identifies
one such reservation; the host may derive it from trusted series/shift data in
its existing business adapter, then prove TEAT/BOAT HTTP behavior before and
after adoption. Without the ID, multiple covering reservations, including
different series with overlapping numbers, are ambiguous; never select by
creation time. A cancelled reservation covers only numbers it retains as
`applied` or `claimed-locally`; numbers in its released unused tail are not
coverage, so a new reservation of that tail by the same device is
unambiguous. Resolve coverage, lock the chosen reservation row against
close/block/cancel/settle, validate state and insert consumption inside the
same independent item transaction, before the applier or any effect. The
scope and numeric range are checked first; an existing `applied` consumption
then yields ALREADY_APPLIED before the reservation-state check. `reserved` is the only
consumable status; `validUntil` is compared with the item's
`createdLocallyAt` (not processing time) for the protocol's expiration guard.
The classified outcomes carry `{number,reservationId:null|string}` and are:

| Condition                                                             | Neutral STYNX item code                  | Receipt status                                | Host mapping                                     |
| --------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| No covering reservation, or supplied ID outside trusted scope/range   | `OFFLINE_SYNC_NUMBERING_NO_COVERAGE`     | `rejected` with open domain conflict evidence | `TEAT.NUMBERING_RESERVATION_FOREIGN_SHIFT`       |
| More than one covering reservation without ID                         | `OFFLINE_SYNC_NUMBERING_AMBIGUOUS`       | `rejected` with open domain conflict evidence | host equivalent of foreign/ambiguous reservation |
| Chosen reservation not `reserved`, or `validUntil < createdLocallyAt` | `OFFLINE_SYNC_NUMBERING_EXPIRED`         | `conflict` with open conflict evidence        | `TEAT.NUMBERING_RESERVATION_EXPIRED`             |
| Number already applied                                                | `OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED` | `rejected` with open domain conflict evidence | `TEAT.NUMBERING_NUMBER_ALREADY_APPLIED`          |

The host mapping preserves its existing HTTP envelope and guard precedence:
authorization and host item validation run first, then this numbering guard
before the domain effect. The TEAT/BOAT characterization is the acceptance
oracle; the STYNX neutral code does not replace a consumer's public code.
The E6 no-resolver path retains its published no-reservation behavior even
when `reservedNumber` is present. After close/settle, previously `available`
numbers project as `expired`; `claimed-locally` and `applied` remain unchanged,
identically in the PostgreSQL and in-memory stores. Reconcile serializes on
the reservation row with cancel, close and settle. A claim submitted after
close/settle is reported as a discrepancy without changing the terminal
`expired` projection; a cancelled reservation cannot gain a new claim in its
released tail or make a later reservation ambiguous.

`OfflineSyncPolicyResolver.resolve({tenantId,orgUnitId,operation,at})` returns the applicable reservation TTL, concurrency window, and batch cardinality policy from the host catalogue. The clock is injected. If the resolver is configured and returns no value for a required tenant/org policy, do not silently fall back to another tenant or a global default: apply the host's explicit missing-parameter outcome. With **no resolver configured**, preserve the published `reservationTtlMs ?? 86_400_000` behavior, identified as a legacy compatibility default rather than a catalogue value; keep the published 100-item maximum in that mode. With a resolver, accept its scoped policy, including more than 100 items when allowed; do not impose a new fixed ceiling. A missing or disabled concurrency window follows the host's existing warning/no-detection policy. A request-supplied `validUntil` remains subject to the host's existing contract and resolved policy. Do not add new limits for strings, hashes, UUIDs, or numbering.

## UPS-OFS-02 — durable batches and receipts

`CTG9SubmitSyncBatchInput` adds optional positive `batchSequence` and permits a legacy item with no `idempotencyKey`; the published E6 input type keeps its required key. Persist a batch keyed by `(tenant_id,device_id,device_batch_id)`, with sequence, declared idempotency-key set, open/closed state, and a durable result. A second unique key `(tenant_id,device_id,batch_sequence)` applies only when sequence is present. Serialize reservation of these identities so duplicate sequence under a new batch ID returns 409 and a gap returns 422 with expected/received sequence; first sequenced batch expects 1. A closed batch replay with the same device, sequence, declared set, and context returns the original receipt bytes and causes no new effect. A changed context or declared set returns 409. An open batch after a crash resumes from persisted item receipts in input order; an already completed item is never re-applied. Each open batch has a DB-backed lease with holder token and monotonically increasing fencing generation. Only the current holder may begin an item or close the batch. A concurrent same-batch request waits for the holder to close, then returns the exact closed receipt; if the lease expires, one contender atomically acquires the next generation and resumes uncompleted items. While a valid lease remains open beyond the bounded wait, return HTTP 503 with `errorCode: 'OFFLINE_SYNC:BATCH:in-progress'`, `retryable: true`, the current request ID and `Retry-After: 1` (seconds), with no item effect; this is the durable-strict timeout behavior, never a non-strict fall-through; a stale holder fails the fencing check before its next write. Unique-item conflicts from two contenders resolve by reading the committed receipt, never by re-running the applier. Prove this with simultaneous submissions of the same open batch.

`getSyncBatchReceipt` and `getSyncItemReceipt` return tenant-scoped durable receipts. In CTG9 mode, item identity is `(tenant_id,idempotency_key)` with `payloadHash` as integrity evidence: same key and hash returns the original receipt; same key and different hash records a rejected/integrity-conflict attempt receipt without overwriting the original item receipt or applying a second effect. Different keys with equal payload bytes remain distinct. A hash that does not match the canonical payload is rejected with the existing public integrity outcome. A missing item key uses an internal synthetic key `stynx:legacy:v1:<sha256(tenantId || 0x00 || legacyIdentity)>`, where the inputs are UTF-8 byte strings and `||` is byte concatenation. By default `legacyIdentity` is `deviceId || 0x00 || deviceBatchId || 0x00 || queueItemId`. Optional `OfflineSyncLegacyItemIdentityResolver.resolve` supplies a stable host identity, such as DETRAN's existing device/local-entity identity, so repeated legacy items across batches deduplicate without being applied. The resolver cannot supply tenant authority or a client-accepted key; empty/invalid results fail closed. Explicit client keys beginning `stynx:legacy:` are rejected before writing, and the generated key is never returned as an accepted client key. The item remains `received` with neutral code `OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED` and invokes no applier. The TEAT adapter maps that code to `TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED` while preserving its public envelope. A batch without sequence remains accepted and unordered. Preserve the established receipt statuses `received`, `applied`, `conflict`, and `rejected`, with error code/context and the consumer's public envelopes. No path can infer tenant authority from device or request body data.

A keyed CTG9 item with neither an item applier nor a numbering claim remains
terminal `received`: it has no domain effect or event, its batch closes, and
same-key duplicates return that receipt without leaving another batch open.
A keyed item that requests `reservedNumber` without an item applier fails
before the batch is written with `OfflineSyncConfigurationError('itemApplier')`;
the package cannot mark a number applied without a domain effect.
The normal same-key replay rule applies to CTG9 receipts. An E6 row with
`received` status is unverified legacy evidence, so a colliding CTG9 key
instead receives a terminal `rejected` receipt with
`OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED` and no domain effect; it must not
promote the E6 row into a verified CTG9 application or keep a lease open.

A same-key duplicate submitted from a different batch has a durable attempt
receipt indexed by that batch's submitted `queueItemId`. The receipt may
link to the original queue item in `context.originalQueueItemId`, but must not
replace the new queue item ID in the batch response or in
`getSyncBatchReceipt`. In CTG9 mode only, two items in one batch with the same
declared or legacy synthetic idempotency key fail batch validation with the
published 400 envelope before any write. E6 behavior remains unchanged.

## UPS-OFS-03 — one independent transaction per item

`OfflineSyncItemApplier.apply(trx, item, context)` receives the actual `@stynx-nyx/data` `Transaction`; it does not create its own SQL connection. `OfflineSyncEventPort.appendInTransaction(trx,event)` is the stable OBX port and uses that same transaction. For one item, OFS calls exactly one **final** event-port operation after domain effect, consumption and receipt: `appendInTransaction` for one fact or `appendManyInTransaction` for several; it never invokes both. The port is the last write, and the OBX seal forbids later DML. OFS depends on this port's interface, not directly on the outbox package. The item executes under `Database.txIndependent(..., {role:'app', isolation:'read committed', strictItemMode:true})` with trusted tenant and actor. Domain effect, numbering consumption, item receipt, and event append commit together. Internal failure rolls all four back. A classified item rejection is persisted in a separate short receipt transaction after rollback, then the next item proceeds. A retryable 40P01/40001 after exhausted outer retries leaves the item open, without a completed ACK or consumption; it is not swallowed inside an aborted transaction.

The durable store owns the item transaction boundary. The in-memory store
supplies a `Transaction`-shaped test double to unit appliers and event ports;
it is not evidence of PostgreSQL atomicity. Real app-role PostgreSQL
integration sensors must prove the shared transaction and rollback.

Before creating or reopening a batch receipt, the PostgreSQL durable store calls the real `Database.hasHeldConnection()` API and throws `IndependentTransactionConnectionError` when true; an enclosing `@TransactionalCommand` or other active transaction therefore fails before any write. The service does not inject `Database`. `txIndependent` also asserts before connection acquisition, including when derived request/system context has hidden the CLS transaction key. Its inherited mutable connection holder is cleared after release. In strict item mode, a nested `Database.tx` may use a savepoint on the same connection, but any attempt by the applier, audit sink, or event port to open a second connection through `withRequestContext`, `withSystemContext`, or another wrapper fails before `pool.connect`. Outside this explicit strict mode, legacy `Database.tx` behavior is unchanged. Process items sequentially; concurrent `Promise.all` on one CLS store is rejected or given isolated context and bounded separate connections with proof. No transaction spans items.

## UPS-OFS-04 — concurrency and resolution

`OfflineSyncConcurrencyDetector.detect(trx, item, context)` compares the business agent's acts from different devices within the resolved policy window. A verified `OfflineSyncHandoffPort` may exempt a documented device handoff. An absent or disabled window produces the host-compatible warning or no detection, without inventing a value. A suspected pair marks both affected acts and their receipts/conflicts, preserving tenant isolation. `OfflineSyncConflictResolver` accepts the host's allowed action set per conflict kind; it records the action and resulting state and refuses forbidden actions. The legacy `device-wins`, `server-wins`, and `manual-review` values remain supported for their existing callers, but are not treated as aliases for DETRAN `accept_server`, `reject`, `retry_after_correction`, or concurrency-only `manual_review`. TEAT/BOAT mapping stays host-owned.

## Migration, compatibility, and proof

Ship an additive, forward-only `packages/offline-sync/migrations/0002_*.sql` after `0001_offline_sync.sql`. Preserve all four existing tables and rows; backfill batch and receipt identity from legacy queue rows without claiming a completed domain effect. Because 0001 has queue rows but no batch header or original HTTP response, a backfilled legacy batch is marked `legacy_closed_unverified`: immutable as to already stored item receipts, **not** eligible for fabricated HTTP replay. After batch identity, sequence and declared-set validation, but before an unverified conflict or any write, an OFS compatibility bridge performs a read-only lookup through the existing `IdempotencyStore.lookup(IdempotencyDecisionContext)` using the published tenant/user/route/key composite key and method/path/body fingerprint. Only an unexpired `completed` record with the same fingerprint qualifies. The bridge returns its recorded status, body and replayable headers through the same response serialization path as the published interceptor, plus configured replay-key/replay-marker headers; it must prove byte equivalence to that interceptor replay in the HTTP sensor. A pending, expired, mismatched or absent record cannot authorize an effect or be promoted. If the legacy store record has no byte-equivalent body representation, fail closed with an explicit conflict rather than claim exact replay. The bridge does not call `reserve` or `persistResponse` on the legacy store; the new batch ledger alone owns new writes. An adopter may instead attach independently verified archived ACK bytes/headers and promote to closed. New batches store original status/body bytes and replayable headers on close and replay exactly. Replace the global `(tenant_id,payload_hash)` constraint only after an E6-only partial unique index and the CTG9 key path are ready; never remove E6 hash deduplication on an upgraded schema. Add batch, receipt, numbering-consumption, and conflict evidence structures with tenant-leading keys, grants, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and app/reader permissions. Keep nullable legacy sequence/key semantics explicit. State the upgrade order and rollback boundary; do not silently rewrite old hashes, statuses, or consumer-visible IDs. The OFS Engineer owns package migration 0002; the maestro owns canonical DDL/seed and `test/db` integration for CTG9. The Architect rebinds trace/API baselines after sensors and implementation.

The 0002 schema is a prerequisite for **all** 1.5.0 offline-sync code, E6
and CTG9. A 1.5.0 Postgres store opened against 0001 alone fails at its
first DB operation, before queue DML, with `OfflineSyncUpgradeRequiredError`
(`code: OFFLINE_SYNC_UPGRADE_REQUIRED`, HTTP 503), never raw PostgreSQL 42703. The in-memory store needs no schema check. The existing E6 PostgreSQL test harness applies
0001→0002 while preserving every published assertion. The 0002 schema
guard cannot add a separate `trx.query` to published E6 unit paths whose
query sequence is fixed; fold the version check into an existing query or
map a 0002-only SQL failure from that query to the typed upgrade error.
The 0002 schema
serves both modes concurrently. Add server-owned queue
`identity_mode text NOT NULL DEFAULT 'e6' CHECK (identity_mode IN ('e6','ctg9'))`,
backfill old rows as `e6`, retain the existing global unique
`(tenant_id,idempotency_key)`, and create unique partial
index `(tenant_id,payload_hash) WHERE identity_mode='e6'` before dropping
the global hash uniqueness, then target that index from the E6 insert with
`ON CONFLICT (tenant_id,payload_hash) WHERE identity_mode='e6' DO NOTHING`.
The E6 precheck and raced read filter `identity_mode='e6'`, so CTG9 rows
with the same hash cannot be mistaken for E6 duplicates. CTG9 inserts
write their distinct `identity_mode` explicitly and use key uniqueness;
a schema constraint or sensor prevents CTG9 rows from silently defaulting
to E6. Request bodies cannot select `identity_mode`. An unchanged E6 module on a 0001→0002
database must continue hash deduplication across different keys, queue-ID
reuse 409 and second-cancel 409. The Inspector upgrade sensor proves this
against the actual 0002 schema rather than 0001 alone.

Inspector proof includes HTTP before/after status, body bytes and replay headers for missing header, same-key/different-body, identical transport retry and domain retry with a different transport key; 503 `OFFLINE_SYNC:BATCH:in-progress` with `Retry-After` under a held lease; and an unexpired legacy durable-store replay across upgrade with the same tenant/user/route/key/fingerprint, followed by expired and mismatched negative cases that cause no second effect. It also uses actual PostgreSQL app and owner roles, two tenants, concurrent reservations, expiry, all lifecycle transitions, >100 items, legacy receipt, sequence replay/gap, changed declared set, lost-ACK replay, per-item rollback and partial success, a crash-open batch resume, same/different key and hash, cross-tenant reads/writes, two-device suspicion and handoff, missing/disabled window, permitted/forbidden resolution, and real TEAT/BOAT HTTP before/after bodies/statuses. Include a CTG5 envelope regression and a miswired applier/event port that tries another connection with pool-sized concurrency, plus post-commit continuation, to prove strict mode does not regress ordinary CTG5, i18n, ratelimit, or tenancy. No existing assertion is removed or weakened.

`INV-OFFLINE-001` remains unchanged. A legacy item without a key is stored but does not become an offline-originated entity mutation; no domain applier runs. If implementation reveals an unavoidable change to that invariant or another public limit, stop and present the exact delta to the Owner before altering law or behavior.
