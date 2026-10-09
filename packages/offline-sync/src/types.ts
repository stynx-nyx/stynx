/** `pending` is entered only by `retry_after_correction` in CTG9 mode (ADR-MOBILE-OFFLINE-0003 D1). */
export type OfflineSyncQueueStatus = 'received' | 'applied' | 'conflict' | 'rejected' | 'pending';

/** Opaque consumer attributes (ADR-MOBILE-OFFLINE-0003 D3.3): a size-bounded JSON object stored and returned verbatim. */
export type OfflineSyncConsumerAttributes = Record<string, unknown>;

/**
 * Versioned platform context carried under the reserved `stynx` key of `context_json` (item receipts
 * and attempts) and `evidence` (conflict evidence), ADR-MOBILE-OFFLINE-0003 D3. A field the platform
 * did not produce on the writing path is absent; nothing is fabricated for rows written before 0004.
 */
export interface OfflineSyncStynxContext {
  readonly version: 1;
  /** Tenant-scoped storage key of the item receipt (same as `OfflineSyncItemContext.receiptId`). */
  readonly receiptId?: string;
  /** Instant of the original application, from the injected clock; never recomputed on replay. */
  readonly appliedAt?: string;
  /** `OfflineSyncApplyResult.serverEntityId` of the original application. */
  readonly serverEntityId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  /** Item transactions started for the receipt; replay and reads never increase it. */
  readonly attempts?: number;
  /** Numbering outcome code, `OFFLINE_SYNC_ITEM_INTEGRITY` or `OFFLINE_SYNC_CONCURRENCY_SUSPECTED`. */
  readonly reasonCode?: string;
  /** Hash received by a rejected integrity submission, verbatim (including a non-canonical one). */
  readonly receivedPayloadHash?: string;
  /** Hash stored for the original item of an integrity rejection. */
  readonly storedPayloadHash?: string;
  readonly relatedQueueItemId?: string;
  readonly retryable?: boolean;
  readonly consumerAttributes?: OfflineSyncConsumerAttributes;
}

export type OfflineSyncConflictResolutionStrategy = 'device-wins' | 'server-wins' | 'manual-review' | 'accept_server' | 'reject' | 'retry_after_correction' | 'manual_review';

export interface TrustedOfflineSyncScope {
  readonly tenantId: string;
  readonly actorId: string;
}

export interface OfflineSyncContextPort {
  current(): TrustedOfflineSyncScope;
}

export interface NumberingRange {
  readonly id: string;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly entityType: string;
  readonly series: string;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly nextNumber: number;
  readonly status: 'active' | 'exhausted' | 'cancelled';
}

export interface NumberingReservation {
  readonly reservationId: string;
  readonly rangeId: string;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly entityType: string;
  readonly series: string;
  readonly agentId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly nextNumber: number;
  readonly validUntil: string;
  readonly status: 'reserved' | 'consumed' | 'expired' | 'cancelled';
}

export interface ReserveNumberingInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly entityType: string;
  readonly requestedSize: number;
  readonly rangeId?: string;
  readonly series?: string;
  readonly validUntil?: string;
  /**
   * Optional tenant-scoped request key (1–255 UTF-8 bytes). A repeated key with the same request
   * returns the original reservation without consuming numbers; a different request under the
   * same key throws `OfflineSyncReservationReplayError`. Requires migration 0003 on PostgreSQL.
   */
  readonly idempotencyKey?: string;
}

export interface CancelNumberingReservationInput {
  readonly reason?: string;
}

export interface SyncBatchItemInput {
  readonly queueItemId: string;
  readonly entityType: string;
  readonly localEntityId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly payloadJson: Record<string, unknown>;
  readonly createdLocallyAt: string;
  readonly reservedNumber?: number;
}

export interface SubmitSyncBatchInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly items: readonly SyncBatchItemInput[];
}

export interface StoredSyncQueueItem extends SyncBatchItemInput {
  readonly tenantId: string;
  readonly agentId: string;
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly status: OfflineSyncQueueStatus;
  readonly receivedAt: string;
}

export interface SubmitSyncBatchResult {
  readonly batchId: string;
  readonly acceptedItems: number;
  readonly duplicateItems: number;
  readonly conflicts: readonly string[];
  readonly items: readonly StoredSyncQueueItem[];
}

export interface OpenSyncConflictInput {
  readonly conflictType: string;
  readonly description: string;
}

export interface ResolveSyncConflictInput {
  readonly resolution: OfflineSyncConflictResolutionStrategy;
  readonly description?: string;
  readonly userRef?: string;
}

export interface SyncConflict {
  readonly conflictId: string;
  readonly tenantId: string;
  readonly queueItemId: string;
  readonly localEntityId: string;
  readonly payloadHash: string;
  readonly conflictType: string;
  readonly description: string;
  readonly status: 'open' | 'resolved';
  readonly resolution?: OfflineSyncConflictResolutionStrategy;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  /** Platform context of the conflict evidence (ADR-MOBILE-OFFLINE-0003 D3.5), CTG9 conflicts only. */
  readonly stynx?: OfflineSyncStynxContext;
}

/** One accepted resolution action (ADR-MOBILE-OFFLINE-0003 D2), from `offline.sync_conflict_actions`. */
export interface SyncConflictActionRecord {
  readonly actionId: string;
  readonly tenantId: string;
  readonly conflictId: string;
  readonly action: OfflineSyncConflictResolutionStrategy;
  readonly reason?: string;
  readonly userRef?: string;
  readonly actorId: string;
  readonly resultingStatus: SyncConflict['status'];
  readonly createdAt: string;
}

export interface OfflineSyncStore {
  reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation>;
  /**
   * Returns the reservation stored for `input.idempotencyKey` in its current state, `null` when
   * the key is unused, or throws `OfflineSyncReservationReplayError` for a different request.
   */
  replayNumberingReservation?(scope: TrustedOfflineSyncScope, input: ReserveNumberingInput): Promise<NumberingReservation | null>;
  cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<NumberingReservation>;
  submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult>;
  openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    now: string,
  ): Promise<SyncConflict>;
  resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict>;
}

export interface StynxOfflineSyncModuleOptions {
  readonly store?: OfflineSyncStore;
  readonly context?: OfflineSyncContextPort;
  readonly mountControllers?: boolean;
  readonly now?: () => string;
  readonly reservationTtlMs?: number;
  readonly policyResolver?: OfflineSyncPolicyResolver;
  readonly agentResolver?: OfflineSyncAgentResolver;
  readonly itemApplier?: OfflineSyncItemApplier;
  readonly eventPort?: OfflineSyncEventPort;
  readonly concurrencyDetector?: OfflineSyncConcurrencyDetector;
  readonly handoffPort?: OfflineSyncHandoffPort;
  readonly conflictResolver?: OfflineSyncConflictResolver;
  readonly legacyItemIdentityResolver?: OfflineSyncLegacyItemIdentityResolver;
  readonly legacyIdempotencyStore?: import('@stynx-nyx/idempotency').IdempotencyStore;
  readonly leaseWaitMs?: number;
  readonly replayKeyHeaderName?: string;
  readonly replayMarkerHeaderName?: string;
}

export interface OfflineSyncAgentResolver {
  resolve(scope: TrustedOfflineSyncScope, operation: string): Promise<string>;
}
export interface OfflineSyncPolicy {
  reservationTtlMs?: number;
  concurrencyWindowMinutes?: number | null;
  maxBatchItems?: number | null;
}
export interface OfflineSyncPolicyResolver {
  resolve(input: { tenantId: string; orgUnitId: string; operation: string; at: string }): Promise<OfflineSyncPolicy>;
}
export interface OfflineSyncLegacyItemIdentityResolver {
  resolve(input: { tenantId: string; deviceId: string; deviceBatchId: string; queueItemId: string; localEntityId: string; entityType: string }): Promise<string>;
}
export interface CTG9SyncBatchItemInput extends Omit<SyncBatchItemInput, 'idempotencyKey'> {
  readonly idempotencyKey?: string;
  readonly reservationId?: string;
}
export interface CTG9SubmitSyncBatchInput extends Omit<SubmitSyncBatchInput, 'items'> {
  readonly batchSequence?: number | null;
  readonly items: readonly CTG9SyncBatchItemInput[];
}
export interface OfflineSyncItemContext extends TrustedOfflineSyncScope {
  readonly agentId: string;
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly batchId: string;
  readonly now: string;
  /** Stable item receipt identifier: the tenant-scoped storage key of the item receipt (UPS-OFS-09). */
  readonly receiptId?: string;
}
export interface OfflineSyncApplyResult {
  readonly serverEntityId: string;
  /** Optional opaque attributes stored under `stynx.consumerAttributes` of the item receipt (D3.3). */
  readonly consumerAttributes?: OfflineSyncConsumerAttributes;
}
export interface OfflineSyncEvent {
  readonly entity: string;
  readonly entityId: string;
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly metadata?: Record<string, unknown> | null;
}
export interface OfflineSyncItemApplier {
  apply(trx: import('@stynx-nyx/data').Transaction, item: CTG9SyncBatchItemInput, context: OfflineSyncItemContext): Promise<OfflineSyncApplyResult>;
}
export interface OfflineSyncEventPort {
  appendInTransaction(trx: import('@stynx-nyx/data').Transaction, event: OfflineSyncEvent): Promise<void>;
  appendManyInTransaction(trx: import('@stynx-nyx/data').Transaction, events: readonly OfflineSyncEvent[]): Promise<void>;
}
export interface OfflineSyncConcurrentPair { readonly firstItemId: string; readonly secondItemId: string }
export interface OfflineSyncConcurrencyResult { readonly suspected: boolean; readonly pairs: readonly OfflineSyncConcurrentPair[] }
export interface OfflineSyncConcurrencyDetector {
  detect(trx: import('@stynx-nyx/data').Transaction, item: CTG9SyncBatchItemInput, context: OfflineSyncItemContext): Promise<OfflineSyncConcurrencyResult>;
}
export interface OfflineSyncHandoffPort {
  permits(trx: import('@stynx-nyx/data').Transaction, pair: OfflineSyncConcurrentPair, context: OfflineSyncItemContext): Promise<boolean>;
}
/** Resolver result: `status: 'open'` records the action and keeps the conflict open (D2); `resolved` closes it. */
export interface OfflineSyncConflictResolution extends SyncConflict {
  /** Optional opaque attributes stored under `stynx.consumerAttributes` of the conflict evidence (D3.3). */
  readonly consumerAttributes?: OfflineSyncConsumerAttributes;
}
export interface OfflineSyncConflictResolver {
  resolve(trx: import('@stynx-nyx/data').Transaction, conflictId: string, action: string, context: OfflineSyncItemContext): Promise<OfflineSyncConflictResolution>;
  allowedActions?(trx: import('@stynx-nyx/data').Transaction, conflictId: string, context: OfflineSyncItemContext): Promise<readonly OfflineSyncConflictResolutionStrategy[]>;
}
export type NumberingReservationStatus = NumberingReservation['status'] | 'blocked';
export interface CTG9NumberingReservation extends Omit<NumberingReservation, 'status'> { readonly status: NumberingReservationStatus }
export interface NumberingConsumptionEntry {
  readonly number: number;
  readonly status: 'available' | 'claimed-locally' | 'applied' | 'blocked' | 'expired';
  readonly serverEntityId: string | null;
  readonly finalizedAt: string | null;
}
export interface NumberingConsumptionResult {
  readonly reservationId: string;
  readonly status: NumberingReservationStatus;
  readonly consumption: readonly NumberingConsumptionEntry[];
}
export interface ReconcileNumberingInput { readonly claimedNumbers?: readonly number[]; readonly userRef?: string }
export interface SettleNumberingInput { readonly reason?: string; readonly userRef?: string }
export interface ReconcileNumberingResult extends NumberingConsumptionResult {
  readonly missingOnServer: readonly number[];
  readonly unexpectedOnServer: readonly number[];
}
export interface SyncItemReceipt {
  readonly queueItemId: string;
  readonly status: OfflineSyncQueueStatus;
  readonly errorCode?: string;
  /** Host-visible context without the reserved `stynx` key, whose bytes are unchanged by D3. */
  readonly context?: Record<string, unknown>;
  /** Platform context (ADR-MOBILE-OFFLINE-0003 D3.5); absent for rows written before 0004 and for E6 rows. */
  readonly stynx?: OfflineSyncStynxContext;
}
export interface SyncBatchReceipt {
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly batchSequence: number | null;
  readonly status: 'open' | 'closed' | 'legacy_closed_unverified';
  readonly items: readonly SyncItemReceipt[];
  readonly responseStatus: number | null;
  readonly responseBodyBytes: Uint8Array | null;
  readonly responseHeaders: Readonly<Record<string, string>>;
}
export interface CTG9SubmitSyncBatchResult extends Omit<SubmitSyncBatchResult, 'items'> {
  readonly items: readonly (Omit<StoredSyncQueueItem, 'idempotencyKey'> & { readonly idempotencyKey?: string })[];
  readonly receipt: SyncBatchReceipt;
}
export interface SubmitSyncBatchOptions { readonly transportIdempotencyKey: string; readonly method: 'POST'; readonly path: string; readonly transportUserId?: string | null; readonly requestBody?: unknown; readonly response?: { status(code: number): unknown; setHeader(name: string, value: string): unknown; getHeaders?(): Record<string, string | number | readonly string[] | undefined> } }
export interface DurableBatchExecutionOptions extends SubmitSyncBatchOptions {
  readonly agentId: string;
  readonly policy: OfflineSyncPolicy;
  readonly ports: StynxOfflineSyncModuleOptions;
  readonly transport: SubmitSyncBatchOptions;
}
export interface OfflineSyncDurableStore extends OfflineSyncStore {
  blockNumberingReservation(scope: TrustedOfflineSyncScope, id: string, input: CancelNumberingReservationInput, now: string): Promise<CTG9NumberingReservation>;
  closeNumberingReservation(scope: TrustedOfflineSyncScope, id: string, input: CancelNumberingReservationInput, now: string): Promise<CTG9NumberingReservation>;
  reconcileNumberingReservation(scope: TrustedOfflineSyncScope, id: string, input: ReconcileNumberingInput, now: string): Promise<ReconcileNumberingResult>;
  settleNumberingReservation(scope: TrustedOfflineSyncScope, id: string, input: SettleNumberingInput, now: string): Promise<CTG9NumberingReservation>;
  getNumberingConsumption(scope: TrustedOfflineSyncScope, id: string): Promise<NumberingConsumptionResult>;
  submitDurableSyncBatch(scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput, options: SubmitSyncBatchOptions, now: string): Promise<CTG9SubmitSyncBatchResult>;
  getSyncBatchReceipt(scope: TrustedOfflineSyncScope, deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt | null>;
  getSyncItemReceipt(scope: TrustedOfflineSyncScope, idempotencyKey: string): Promise<SyncItemReceipt | null>;
  listSyncBatchReceipts?(scope: TrustedOfflineSyncScope, input: ListSyncBatchReceiptsInput): Promise<OfflineSyncPage<SyncBatchReceiptSummary>>;
  listSyncItemReceipts?(scope: TrustedOfflineSyncScope, input: ListSyncItemReceiptsInput): Promise<OfflineSyncPage<SyncItemReceiptRecord>>;
  listSyncQueueItems?(scope: TrustedOfflineSyncScope, input: ListSyncQueueItemsInput): Promise<OfflineSyncPage<SyncQueueItemRecord>>;
  listSyncConflicts?(scope: TrustedOfflineSyncScope, input: ListSyncConflictsInput): Promise<OfflineSyncPage<SyncConflictRecord>>;
  /** Action history of one conflict, newest first (ADR-MOBILE-OFFLINE-0003 D2.6). */
  listSyncConflictActions?(scope: TrustedOfflineSyncScope, input: ListSyncConflictActionsInput): Promise<OfflineSyncPage<SyncConflictActionRecord>>;
}
/** One keyset page, newest first. `nextCursor` is opaque and `null` on the last page. */
export interface OfflineSyncPage<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export interface OfflineSyncListInput { readonly limit?: number; readonly cursor?: string }
export interface ListSyncBatchReceiptsInput extends OfflineSyncListInput { readonly deviceId?: string; readonly status?: SyncBatchReceipt['status'] }
export interface ListSyncItemReceiptsInput extends OfflineSyncListInput { readonly deviceId?: string; readonly deviceBatchId?: string; readonly status?: OfflineSyncQueueStatus }
export interface ListSyncQueueItemsInput extends OfflineSyncListInput { readonly deviceId?: string; readonly status?: OfflineSyncQueueStatus; readonly entityType?: string }
export interface ListSyncConflictActionsInput extends OfflineSyncListInput { readonly conflictId: string }
export interface ListSyncConflictsInput extends OfflineSyncListInput { readonly status?: SyncConflict['status']; readonly conflictType?: string; readonly queueItemId?: string; /** Device of the referenced queue item (UPS-OFS-11). */ readonly deviceId?: string }
export interface SyncBatchReceiptSummary {
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly batchSequence: number | null;
  readonly status: SyncBatchReceipt['status'];
  readonly responseStatus: number | null;
  readonly createdAt: string;
}
export interface SyncItemReceiptRecord extends SyncItemReceipt {
  /** Same value as `OfflineSyncItemContext.receiptId` for applied items. */
  readonly receiptId: string;
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly payloadHash: string;
  readonly receivedAt: string;
}
export interface SyncQueueItemRecord extends StoredSyncQueueItem {
  readonly deviceBatchId: string;
  /** Platform context of the item receipt under the same key (ADR-MOBILE-OFFLINE-0003 D3.5). */
  readonly stynx?: OfflineSyncStynxContext;
}
export interface SyncConflictRecord extends SyncConflict {
  /** Device of the referenced queue item (UPS-OFS-11). */
  readonly deviceId: string;
  readonly createdAt: string;
}
