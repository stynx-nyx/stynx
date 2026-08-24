/**
 * Offline-first mobile runtime types.
 *
 * Promoted from TEAT `apps/mobile/src/app/mobile-runtime.ts` (E6). The entity
 * vocabulary is consumer-defined: `entityType` is an open generic string so a
 * consuming app declares its own union (for example `'ait' | 'crash-record'`).
 */

/** Local lifecycle of an offline-authored entity draft. */
export type LocalDraftStatus = 'draft' | 'finalized' | 'queued' | 'synced' | 'conflict' | 'wiped';

/** Local lifecycle of a sync queue item. */
export type SyncQueueStatus = 'pending' | 'sent' | 'received' | 'applied' | 'conflict' | 'rejected';

/** Conflict resolution strategies understood by the sync protocol. */
export type SyncConflictResolutionStrategy = 'device-wins' | 'server-wins' | 'manual-review';

/** Authenticated stynx session context projected onto the device. */
export interface MobileSessionContext {
  readonly tenantId: string;
  /** Organizational unit the agent acts for (a tenant-scoped org subdivision). */
  readonly orgUnitId: string;
  readonly agentId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly appVersion: string;
  /** Consumer-defined role vocabulary; enforced roles come from runtime options. */
  readonly roles: readonly string[];
}

/**
 * Device posture as asserted by the device itself.
 *
 * TODO(Phase 5 / BOAT): posture is client-asserted today. Server-side device
 * attestation must close this hole before hostile-device threat models apply.
 */
export interface MobileDevicePosture {
  readonly homologated: boolean;
  readonly remoteWipeVersion: number;
  readonly secureHardwareBacked: boolean;
  readonly printerStatus: 'paired' | 'missing' | 'error';
  readonly networkStatus: 'online' | 'offline' | 'limited';
}

/** Published normative rule package installed for offline validation. */
export interface MobileNormativePackageSnapshot {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly manifestHash: string;
  readonly validUntil: string;
  readonly status: 'published' | 'expired' | 'retired';
}

/** Reserved numbering interval granted by the server for offline issuance. */
export interface MobileNumberingReservation {
  readonly reservationId: string;
  readonly rangeId: string;
  readonly entityType: string;
  readonly series: string;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly nextNumber: number;
  readonly validUntil: string;
  readonly status: 'reserved' | 'consumed' | 'expired' | 'cancelled';
}

/** Where and when an entity was drafted. */
export interface MobileLocationContext {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number;
  readonly capturedAt: string;
  readonly source: 'gps' | 'network' | 'manual';
  readonly manualJustification?: string;
}

/** Hash-first evidence metadata captured offline; binaries travel separately. */
export interface MobileEvidenceDraft {
  readonly localEvidenceId: string;
  readonly hashAlgorithm: 'sha256';
  readonly hashValue: string;
  readonly mediaType: 'image/jpeg' | 'video/mp4' | 'application/pdf' | 'signature/json';
  readonly capturedAt: string;
  readonly storageIntentId?: string;
  readonly linkedLocalEntityId?: string;
}

/** Input for an entity-scoped numbering reservation. */
export interface ReserveMobileNumberingInput<TEntityType extends string = string> {
  readonly entityType: TEntityType;
  readonly requestedSize: number;
  readonly series?: string;
}

/** Input to create a local draft; the payload shape is consumer-defined. */
export interface CreateMobileDraftInput<TEntityType extends string = string> {
  readonly entityType: TEntityType;
  readonly payload: Record<string, unknown>;
  readonly location: MobileLocationContext;
  readonly observedAt: string;
  /** Pin a specific number from the active reservation, when required. */
  readonly reservedNumber?: number;
}

/** Locally persisted offline entity draft. */
export interface MobileEntityDraft<TEntityType extends string = string> {
  readonly localId: string;
  readonly entityType: TEntityType;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly agentId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly status: LocalDraftStatus;
  readonly reservedNumber: number;
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly normativePackageId: string;
  readonly normativePackageVersion: string;
  readonly localContentHash: string;
  readonly payload: Record<string, unknown>;
  readonly location: MobileLocationContext;
  readonly evidence: readonly MobileEvidenceDraft[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalizedAt?: string;
}

/** Queue entry awaiting (or undergoing) synchronization with the server. */
export interface MobileSyncQueueItem<TEntityType extends string = string> {
  readonly queueItemId: string;
  readonly entityType: TEntityType;
  readonly localEntityId: string;
  readonly status: SyncQueueStatus;
  readonly attempts: number;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly payloadJson: Record<string, unknown>;
  readonly deviceId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly normativePackageId: string;
  readonly reservedNumber?: number;
  readonly location?: MobileLocationContext;
  readonly createdLocallyAt: string;
  readonly lastSubmittedAt?: string;
}

/** Server acknowledgement for one submitted device batch. */
export interface MobileSyncBatchResult {
  readonly batchId: string;
  readonly acceptedItems: number;
  readonly conflicts: readonly string[];
}

/** Server-confirmed resolution for a conflicting queue item. */
export interface MobileConflictResolution {
  readonly conflictId: string;
  readonly queueItemId: string;
  readonly localEntityId: string;
  readonly resolution: SyncConflictResolutionStrategy;
  readonly status: 'resolved';
  readonly resolvedAt: string;
  readonly payloadHash: string;
}

/** Receipt produced by the paired printer adapter. */
export interface MobilePrintReceipt {
  readonly receiptId: string;
  readonly localEntityId: string;
  readonly reservedNumber: number;
  readonly printerAdapter: string;
  readonly status: 'simulated' | 'printed';
  readonly printedAt: string;
  readonly contentHash: string;
}

/** Receipt persisted after a remote wipe cleared the encrypted store. */
export interface MobileRemoteWipeReceipt {
  readonly wipeReceiptId: string;
  readonly deviceId: string;
  readonly reason: string;
  readonly wipedAt: string;
}

/** Aggregate view of local runtime state, for diagnostics and dashboards. */
export interface MobileRuntimeSnapshot {
  readonly activeSession?: MobileSessionContext;
  readonly activePackage?: MobileNormativePackageSnapshot;
  readonly devicePosture?: MobileDevicePosture;
  readonly draftCount: number;
  readonly queuedCount: number;
  readonly evidenceCount: number;
  readonly printReceiptCount: number;
  readonly conflictResolutionCount: number;
  readonly pendingWipe: boolean;
}

/** Behavior switches for the runtime; defaults preserve the promoted TEAT rules. */
export interface MobileRuntimeOptions {
  /**
   * Roles the bootstrapped session must carry before official offline
   * operation is allowed. Empty means any authenticated session is accepted.
   */
  readonly requiredRoles?: readonly string[];
  /**
   * Whether finalization requires at least one linked evidence record.
   * Defaults to true (the promoted TEAT behavior).
   */
  readonly requireEvidenceToFinalize?: boolean;
  /** Prefix used for locally generated draft identifiers. */
  readonly draftIdPrefix?: string;
}
