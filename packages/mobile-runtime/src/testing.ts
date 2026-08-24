/**
 * Sandbox adapters for the offline-first mobile runtime.
 *
 * Ported from TEAT's `mobile-test-adapters.ts`. These adapters run entirely
 * in-process (Node) and are intended for tests, sandboxes, and reference
 * wiring — never for production devices.
 */
import { createHash } from 'node:crypto';
import type {
  MobileBackendClientPort,
  MobileClockPort,
  MobileCryptoPort,
  MobileEncryptedStorePort,
  MobileIdPort,
  MobilePrinterPort,
  MobileStynxSessionPort,
} from './ports';
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

interface SealedValue {
  readonly sealed: string;
}

/** In-memory stand-in for an encrypted device store (values are sealed as base64). */
export class InMemoryEncryptedMobileStore implements MobileEncryptedStorePort {
  readonly adapterName = 'in-memory-encrypted-store';
  readonly encrypted: boolean = true;
  readonly encryptionScope = 'device' as const;
  readonly securityLevel = 'software-sealed' as const;
  private readonly collections = new Map<string, Map<string, SealedValue>>();

  async put<T>(collection: string, key: string, value: T): Promise<void> {
    this.collection(collection).set(key, {
      sealed: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
    });
  }

  async get<T>(collection: string, key: string): Promise<T | undefined> {
    const value = this.collection(collection).get(key);
    return value ? this.open<T>(value) : undefined;
  }

  async list<T>(collection: string): Promise<T[]> {
    return [...this.collection(collection).values()].map((value) => this.open<T>(value));
  }

  async remove(collection: string, key: string): Promise<void> {
    this.collection(collection).delete(key);
  }

  async clear(): Promise<void> {
    this.collections.clear();
  }

  rawCollection(collection: string): readonly SealedValue[] {
    return [...this.collection(collection).values()];
  }

  private collection(name: string): Map<string, SealedValue> {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new Map<string, SealedValue>();
      this.collections.set(name, collection);
    }
    return collection;
  }

  private open<T>(value: SealedValue): T {
    return JSON.parse(Buffer.from(value.sealed, 'base64').toString('utf8')) as T;
  }
}

/** Deterministic sha256 content hashing over stable JSON. */
export class NodeMobileCryptoPort implements MobileCryptoPort {
  contentHash(value: unknown): string {
    return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
  }
}

/** Manually advanced clock for deterministic tests. */
export class FixedMobileClock implements MobileClockPort {
  constructor(private current = '2026-05-20T12:00:00.000Z') {}

  now(): string {
    return this.current;
  }

  setNow(value: string): void {
    this.current = value;
  }
}

/** Sequential prefixed ids for deterministic tests. */
export class SequentialMobileIdPort implements MobileIdPort {
  private next = 1;

  uuid(prefix: string): string {
    const value = `${prefix}-${String(this.next).padStart(4, '0')}`;
    this.next += 1;
    return value;
  }
}

/** Fixed authenticated session (override the default to shape your scenario). */
export class SandboxStynxMobileSessionPort implements MobileStynxSessionPort {
  constructor(
    private readonly session: MobileSessionContext = {
      tenantId: '00000000-0000-4000-8000-000000000001',
      orgUnitId: '00000000-0000-4000-8000-0000000000aa',
      agentId: 'agent-001',
      deviceId: 'device-001',
      shiftId: 'shift-001',
      appVersion: '0.1.0-sandbox',
      roles: ['field-agent'],
    },
  ) {}

  async currentSession(): Promise<MobileSessionContext> {
    return this.session;
  }
}

/** Printer adapter that records simulated receipts instead of printing. */
export class SimulatedMobilePrinterPort implements MobilePrinterPort {
  readonly adapterName = 'simulated-receipt-printer';

  constructor(
    private readonly clock: MobileClockPort,
    private readonly ids: MobileIdPort,
  ) {}

  async printReceipt(input: {
    readonly session: MobileSessionContext;
    readonly draft: MobileEntityDraft;
    readonly contentHash: string;
  }): Promise<MobilePrintReceipt> {
    return {
      receiptId: this.ids.uuid('receipt'),
      localEntityId: input.draft.localId,
      reservedNumber: input.draft.reservedNumber,
      printerAdapter: this.adapterName,
      status: 'simulated',
      printedAt: this.clock.now(),
      contentHash: input.contentHash,
    };
  }
}

/** Scriptable in-process backend; records batches and conflict resolutions. */
export class SandboxMobileBackendClient<
  TEntityType extends string = string,
> implements MobileBackendClientPort<TEntityType> {
  readonly submittedBatches: Array<{
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly deviceBatchId: string;
    readonly items: readonly MobileSyncQueueItem<TEntityType>[];
  }> = [];

  readonly resolvedConflicts: MobileConflictResolution[] = [];

  constructor(
    private readonly packageSnapshot: MobileNormativePackageSnapshot = {
      packageId: 'pkg-2026-05',
      packageVersion: '2026.05',
      manifestHash: 'sha256:mobile-package-manifest',
      validUntil: '2026-06-30T23:59:59.000Z',
      status: 'published',
    },
    private readonly conflictReservedNumbers: readonly number[] = [],
  ) {}

  async fetchPublishedNormativePackage(): Promise<MobileNormativePackageSnapshot> {
    return this.packageSnapshot;
  }

  async reserveNumbering(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly shiftId: string;
    readonly entityType: TEntityType;
    readonly requestedSize: number;
    readonly series?: string;
  }): Promise<MobileNumberingReservation> {
    return {
      reservationId: `reservation-${input.deviceId}`,
      rangeId: `range-${input.orgUnitId}`,
      entityType: input.entityType,
      series: input.series ?? 'DEFAULT',
      startNumber: 1000,
      endNumber: 1000 + input.requestedSize - 1,
      nextNumber: 1000,
      validUntil: '2026-05-21T12:00:00.000Z',
      status: 'reserved',
    };
  }

  async submitSyncBatch(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly deviceBatchId: string;
    readonly items: readonly MobileSyncQueueItem<TEntityType>[];
  }): Promise<MobileSyncBatchResult> {
    this.submittedBatches.push(input);
    return {
      batchId: input.deviceBatchId,
      acceptedItems: input.items.length,
      conflicts: input.items
        .filter(
          (item) =>
            this.conflictReservedNumbers.includes(item.reservedNumber ?? -1) ||
            item.payloadJson['force_conflict'] === true,
        )
        .map((item) => item.queueItemId),
    };
  }

  async resolveSyncConflict(input: {
    readonly tenantId: string;
    readonly orgUnitId: string;
    readonly agentId: string;
    readonly deviceId: string;
    readonly queueItemId: string;
    readonly localEntityId: string;
    readonly resolution: SyncConflictResolutionStrategy;
    readonly payloadHash: string;
  }): Promise<MobileConflictResolution> {
    const resolved: MobileConflictResolution = {
      conflictId: `conflict-${input.queueItemId}`,
      queueItemId: input.queueItemId,
      localEntityId: input.localEntityId,
      resolution: input.resolution,
      status: 'resolved',
      resolvedAt: '2026-05-20T12:00:00.000Z',
      payloadHash: input.payloadHash,
    };
    this.resolvedConflicts.push(resolved);
    return resolved;
  }
}

/** Stable JSON serialization (sorted keys) for deterministic hashing. */
export function stableJson(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
