/**
 * The seven ports of the offline-first mobile runtime.
 *
 * Every device capability the runtime touches is expressed as a port so the
 * runtime itself stays framework-free. Production adapters (Capacitor secure
 * storage, hardware printers, HTTP backend clients) are consumer-supplied;
 * sandbox adapters for tests ship from `@stynx-nyx/mobile-runtime`'s testing
 * entry point.
 */
import type {
  MobileConflictResolution,
  MobileEntityDraft,
  MobileNormativePackageSnapshot,
  MobileNumberingReservation,
  MobilePrintReceipt,
  MobileSessionContext,
  MobileSyncBatchResult,
  MobileSyncQueueItem,
  SyncConflictResolutionStrategy,
} from './types';

/** Encrypted device-local key-value store, grouped by named collections. */
export interface MobileEncryptedStorePort {
  readonly adapterName: string;
  readonly encrypted: boolean;
  readonly encryptionScope: 'device' | 'session';
  readonly securityLevel: 'software-sealed' | 'hardware-backed';
  put<T>(collection: string, key: string, value: T): Promise<void>;
  get<T>(collection: string, key: string): Promise<T | undefined>;
  list<T>(collection: string): Promise<T[]>;
  remove(collection: string, key: string): Promise<void>;
  clear(): Promise<void>;
}

/** Deterministic content hashing (`sha256:`-prefixed digests). */
export interface MobileCryptoPort {
  contentHash(value: unknown): string;
}

/** Wall clock as an ISO-8601 string source. */
export interface MobileClockPort {
  now(): string;
}

/** Local unique-id generation with a semantic prefix. */
export interface MobileIdPort {
  uuid(prefix: string): string;
}

/** Bridge to the authenticated stynx session on the device. */
export interface MobileStynxSessionPort {
  currentSession(): Promise<MobileSessionContext>;
}

/** Paired receipt printer. */
export interface MobilePrinterPort {
  readonly adapterName: string;
  printReceipt(input: {
    readonly session: MobileSessionContext;
    readonly draft: MobileEntityDraft;
    readonly contentHash: string;
  }): Promise<MobilePrintReceipt>;
}

/** Server API surface the runtime needs while (intermittently) online. */
export interface MobileBackendClientPort<TEntityType extends string = string> {
  fetchPublishedNormativePackage(): Promise<MobileNormativePackageSnapshot>;
  reserveNumbering(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly shiftId: string;
    readonly entityType: TEntityType;
    readonly requestedSize: number;
    readonly series?: string;
  }): Promise<MobileNumberingReservation>;
  submitSyncBatch(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly deviceBatchId: string;
    readonly items: readonly MobileSyncQueueItem<TEntityType>[];
  }): Promise<MobileSyncBatchResult>;
  resolveSyncConflict(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly queueItemId: string;
    readonly localEntityId: string;
    readonly resolution: SyncConflictResolutionStrategy;
    readonly payloadHash: string;
  }): Promise<MobileConflictResolution>;
}
