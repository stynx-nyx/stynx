import {
  reconciliationConflict,
  reconciliationList,
  reconciliationRequest,
  reconciliationResult,
  reconciliationSortInstant,
} from './reconciliation.js';
import { domainErrorContext } from './domain-error-context.js';
import { classifyDomainOutcome, domainFailureCode } from './domain-outcome.js';
import { consumptionReadInstant, projectNumberingConsumption } from './consumption-projection.js';
import {
  cloneRange,
  rangeCreation,
  rangeIdentity,
  rangeList,
  rangeCancellation,
  rangeConflict,
  rangeNotFound,
} from './range-administration.js';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import {
  OfflineSyncConfigurationError,
  OfflineSyncError,
  OfflineSyncNumberingOutcome,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
} from './errors.js';
import { pageOf, rangeUnavailableReason, reservationFingerprint, sortInstantOf } from './listing.js';
import {
  applyReplayResponse,
  batchContextFingerprint,
  captureReplayableHeaders,
  transportCompositeKey,
  transportFingerprint,
} from './transport.js';
import { verifyOfflineSyncPayloadHash } from './payload-integrity.js';
import { prepareOfflineSyncItem } from './pre-apply.js';
import {
  activeReservationError,
  legacyReservation,
  reservationShiftScope,
} from './reservation-admission.js';
import {
  boundedConsumerAttributes,
  executionStynxContext,
  stynxContextOf,
  withoutResolution,
} from './stynx-context.js';
import type {
  CreateNumberingRangeInput,
  CancelNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRangePage,
  CancelNumberingReservationInput,
  NumberingRange,
  NumberingReservation,
  OpenSyncConflictInput,
  ResolveSyncConflictInput,
  StoredSyncQueueItem,
  SubmitSyncBatchInput,
  SubmitSyncBatchResult,
  SyncConflict,
  TrustedOfflineSyncScope,
  ReserveNumberingInput,
  OfflineSyncDurableStore,
  CTG9NumberingReservation,
  CTG9ReserveNumberingInput,
  ListNumberingReconciliationsInput,
  NumberingReconciliationRecord,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  SettleNumberingInput,
  NumberingConsumptionResult,
  NumberingConsumptionEntry,
  CTG9SubmitSyncBatchInput,
  CTG9SubmitSyncBatchResult,
  DurableBatchExecutionOptions,
  SubmitSyncBatchOptions,
  SyncBatchReceipt,
  SyncItemReceipt,
  SyncIntegrityRejection,
  SyncIntegrityRejectionIdentity,
  OfflineSyncConflictResolver,
  OfflineSyncStynxContext,
  OfflineSyncItemContext,
  OfflineSyncConcurrentPair,
  CTG9SyncBatchItemInput,
  ListSyncBatchReceiptsInput,
  ListSyncConflictActionsInput,
  ListSyncConflictsInput,
  ListSyncItemReceiptsInput,
  ListSyncQueueItemsInput,
  OfflineSyncPage,
  SyncBatchReceiptSummary,
  SyncConflictActionRecord,
  SyncConflictRecord,
  SyncItemReceiptRecord,
  SyncQueueItemRecord,
} from './types.js';

interface MemoryMutationFrame {
  tenantId: string;
  active: boolean;
  children: Set<MemoryMutationFrame>;
  changes: MemoryProjectionChange[];
  claims: Set<MemoryProjectionClaim>;
  releases: (() => void)[];
  parent?: MemoryMutationFrame;
  conflictId?: string;
}

interface MemoryProjectionVersion {
  previous: MemoryProjectionVersion | undefined;
  restore: () => void;
  rolledBack: boolean;
}

interface MemoryProjectionChange {
  order: number;
  version?: MemoryProjectionVersion;
  undo: () => void;
}

interface MemoryProjectionClaim {
  owners: Set<MemoryMutationFrame>;
  versions: Map<unknown, MemoryProjectionVersion>;
  key: unknown;
}

/** Deterministic process-local store for tests and sandbox wiring. */
export class InMemoryOfflineSyncStore implements OfflineSyncDurableStore {
  readonly supportsDomainOutcomeClassifier = true as const;
  private readonly rangeCreationReceipts = new Map<
    string,
    { fingerprint: string; receipt: NumberingRange }
  >();
  private readonly ranges = new Map<string, NumberingRange>();
  private readonly reservations = new Map<string, CTG9NumberingReservation>();
  private readonly reservationOrigins = new Map<string, 'e6' | 'ctg9'>();
  private readonly queueItems = new Map<string, StoredSyncQueueItem>();
  private readonly payloadIndex = new Map<string, string>();
  private readonly e6Items = new Map<
    string,
    { item: StoredSyncQueueItem; batchKey: string; deviceBatchId: string }
  >();
  private readonly conflicts = new Map<string, SyncConflict>();
  private readonly consumption = new Map<string, Map<number, NumberingConsumptionEntry>>();
  private readonly reconciliations = new Map<
    string,
    { fingerprint: string; record: NumberingReconciliationRecord }
  >();
  private readonly itemReceipts = new Map<
    string,
    {
      hash: string;
      batchKey: string;
      receipt: SyncItemReceipt;
      item: CTG9SubmitSyncBatchResult['items'][number];
      deviceBatchId: string;
      receivedAt: string;
    }
  >();
  private readonly batches = new Map<
    string,
    {
      contextHash: string;
      initialQueueStatus: 'received' | 'pending';
      receipt: SyncBatchReceipt;
      result?: CTG9SubmitSyncBatchResult;
      promise?: Promise<CTG9SubmitSyncBatchResult>;
      transportKey: string;
      fingerprint: string;
      createdAt: string;
    }
  >();
  private readonly reservationKeys = new Map<
    string,
    { fingerprint: string; reservationId: string }
  >();
  private readonly queueBatches = new Map<string, string>();
  private readonly conflictCreatedAt = new Map<string, string>();
  private readonly conflictAllowedActions = new Map<string, readonly string[]>();
  private readonly conflictStynx = new Map<string, OfflineSyncStynxContext>();
  private readonly conflictDomainContexts = new Map<string, Record<string, unknown>>();
  private readonly conflictActions: {
    record: SyncConflictActionRecord;
    sequence: string;
  }[] = [];
  private conflictActionSequence = 0;
  private readonly integrityConflicts = new Map<string, string>();
  private readonly integrityRejections = new Map<string, SyncIntegrityRejection>();
  /** Batches of one tenant run one at a time, standing in for the PostgreSQL receipt row lock (D1 item 4). */
  private readonly tenantGate = new Map<string, Promise<void>>();
  private readonly mutationContext = new AsyncLocalStorage<MemoryMutationFrame>();
  private readonly sharedMutations = new Map<string, Set<Promise<void>>>();
  private readonly projectionVersions = new WeakMap<
    object,
    Map<unknown, MemoryProjectionVersion>
  >();
  private readonly projectionClaims = new WeakMap<object, Map<unknown, MemoryProjectionClaim>>();
  private projectionSequence = 0;
  private readonly queueResolutionLocks = new Map<
    string,
    {
      owner: MemoryMutationFrame;
      frame: MemoryMutationFrame;
      promise: Promise<void>;
    }
  >();
  private readonly transport = new Map<string, { batchIdentity: string; fingerprint: string }>();

  private frameIsActive(frame: MemoryMutationFrame): boolean {
    for (let current: MemoryMutationFrame | undefined = frame; current; current = current.parent)
      if (!current.active) return false;
    return true;
  }

  private assertMutationOwner(scope: Pick<TrustedOfflineSyncScope, 'tenantId'>): void {
    const frame = this.mutationContext.getStore();
    if (frame && (frame.tenantId !== scope.tenantId || !this.frameIsActive(frame)))
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_STATE',
        409,
        'Memory transaction ownership is no longer valid for this tenant.',
      );
  }

  private assertFrameComplete(frame: MemoryMutationFrame): void {
    if (!this.frameIsActive(frame) || frame.children.size !== 0)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_STATE',
        409,
        'Memory transaction cannot commit closed or unfinished owned work.',
      );
  }

  private async checkedAwait<T>(
    scope: TrustedOfflineSyncScope,
    operation: T | PromiseLike<T>,
  ): Promise<T> {
    const result = await operation;
    this.assertMutationOwner(scope);
    return result;
  }

  private isAncestor(ancestor: MemoryMutationFrame, frame: MemoryMutationFrame): boolean {
    for (let current: MemoryMutationFrame | undefined = frame; current; current = current.parent)
      if (current === ancestor) return true;
    return false;
  }

  private releaseClaims(frame: MemoryMutationFrame): void {
    for (const claim of frame.claims) {
      claim.owners.delete(frame);
      if (claim.owners.size === 0) claim.versions.get(claim.key)!.previous = undefined;
    }
    frame.claims.clear();
  }

  private assertProjectionClaim<K, V>(map: Map<K, V>, key: K): void {
    const frame = this.mutationContext.getStore()!;
    this.assertMutationOwner(frame);
    const claim = this.projectionClaims.get(map)?.get(key);
    if (claim)
      for (const owner of claim.owners)
        if (!this.isAncestor(owner, frame) && !this.isAncestor(frame, owner))
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_STATE',
            409,
            'Another memory transaction owns this projection key.',
          );
  }

  private readProjection<K, V>(map: Map<K, V>, key: K): V | undefined {
    this.assertProjectionClaim(map, key);
    return map.get(key);
  }

  private claimProjection<V>(map: Map<string, V>, key: string) {
    const frame = this.mutationContext.getStore()!;
    this.assertProjectionClaim(map, key);
    let versions = this.projectionVersions.get(map);
    if (!versions) this.projectionVersions.set(map, (versions = new Map<unknown, MemoryProjectionVersion>()));
    let claims = this.projectionClaims.get(map);
    if (!claims) this.projectionClaims.set(map, (claims = new Map<unknown, MemoryProjectionClaim>()));
    let claim = claims.get(key);
    if (!claim) claims.set(key, (claim = { owners: new Set(), versions, key }));
    for (let current: MemoryMutationFrame | undefined = frame; current; current = current.parent) {
      claim.owners.add(current);
      current.claims.add(claim);
    }
    let previous = versions.get(key);
    if (!previous) {
      const present = map.has(key);
      const value = map.get(key);
      // This same-map view only restores the value captured above, including undefined.
      const restorationMap: Map<string, V | undefined> = map;
      previous = {
        previous: undefined,
        restore: () => {
          if (present) restorationMap.set(key, value);
          else map.delete(key);
        },
        rolledBack: false,
      };
      versions.set(key, previous);
    }
    return { frame, versions, previous };
  }

  private writeProjection<V>(map: Map<string, V>, key: string, value: V): Map<string, V> {
    const { frame, versions, previous } = this.claimProjection(map, key);
    const version: MemoryProjectionVersion = {
      previous,
      restore: () => { map.set(key, value); },
      rolledBack: false,
    };
    frame.changes.push({
      order: ++this.projectionSequence,
      version,
      undo: () => {
        if (versions.get(key) !== version) return;
        let prior = version.previous!;
        while (prior.rolledBack) prior = prior.previous!;
        prior.restore();
        versions.set(key, prior);
      },
    });
    versions.set(key, version);
    return map.set(key, value);
  }

  private appendConflictAction(entry: {
    record: SyncConflictActionRecord;
    sequence: string;
  }): void {
    const frame = this.mutationContext.getStore()!;
    this.assertMutationOwner(frame);
    frame.changes.push({
      order: ++this.projectionSequence,
      undo: () => {
        for (let index = this.conflictActions.length - 1; index >= 0; index -= 1)
          if (this.conflictActions[index]!.record.actionId === entry.record.actionId)
            this.conflictActions.splice(index, 1);
      },
    });
    this.conflictActions.push(entry);
  }

  private rollbackFrame(frame: MemoryMutationFrame): void {
    const frames: MemoryMutationFrame[] = [];
    const changes: MemoryProjectionChange[] = [];
    const close = (current: MemoryMutationFrame): void => {
      current.active = false;
      frames.push(current);
      changes.push(...current.changes);
      current.changes = [];
      for (const child of current.children) close(child);
    };
    close(frame);
    for (const change of changes) if (change.version) change.version.rolledBack = true;
    for (const change of changes.sort((left, right) => right.order - left.order)) change.undo();
    for (const current of frames) this.releaseClaims(current);
  }

  private async mutateTenant<T>(
    scope: TrustedOfflineSyncScope,
    operation: () => Promise<T>,
    exclusive = false,
  ): Promise<T> {
    this.assertMutationOwner(scope);
    if (this.mutationContext.getStore()) return operation();
    const previous = this.tenantGate.get(scope.tenantId) ?? Promise.resolve();
    const readers = this.sharedMutations.get(scope.tenantId) ?? new Set<Promise<void>>();
    const owner: MemoryMutationFrame = {
      tenantId: scope.tenantId,
      active: true,
      children: new Set(),
      changes: [],
      claims: new Set(),
      releases: [],
    };
    const run = () => this.mutationContext.run(owner, operation);
    const admitted = exclusive ? Promise.all([previous, ...readers]) : previous;
    const result = admitted.then(run, run);
    const gate = result.then(
      () => undefined,
      () => undefined,
    );
    if (exclusive) this.tenantGate.set(scope.tenantId, gate);
    else {
      readers.add(gate);
      this.sharedMutations.set(scope.tenantId, readers);
    }
    try {
      const value = await result;
      this.assertFrameComplete(owner);
      return value;
    } catch (error) {
      this.rollbackFrame(owner);
      throw error;
    } finally {
      owner.active = false;
      owner.changes = [];
      this.releaseClaims(owner);
      for (const release of owner.releases) release();
      if (exclusive) {
        if (this.tenantGate.get(scope.tenantId) === gate) this.tenantGate.delete(scope.tenantId);
      } else {
        readers.delete(gate);
        if (readers.size === 0) this.sharedMutations.delete(scope.tenantId);
      }
    }
  }

  private async ownedFrame<T>(
    scope: TrustedOfflineSyncScope,
    operation: (frame: MemoryMutationFrame) => Promise<T>,
    conflictId?: string,
  ): Promise<T> {
    this.assertMutationOwner(scope);
    const parent = this.mutationContext.getStore()!;
    if (conflictId !== undefined)
      for (let current: MemoryMutationFrame | undefined = parent; current; current = current.parent)
        if (current.conflictId === conflictId)
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_STATE',
            409,
            'A conflict cannot recursively resolve itself.',
          );
    const frame: MemoryMutationFrame = {
      tenantId: scope.tenantId,
      active: true,
      children: new Set(),
      changes: [],
      claims: new Set(),
      releases: [],
      parent,
      ...(conflictId === undefined ? {} : { conflictId }),
    };
    parent.children.add(frame);
    try {
      const result = await this.mutationContext.run(frame, () => operation(frame));
      this.assertFrameComplete(frame);
      parent.changes.push(...frame.changes);
      frame.changes = [];
      return result;
    } catch (error) {
      this.rollbackFrame(frame);
      throw error;
    } finally {
      frame.active = false;
      parent.children.delete(frame);
      this.releaseClaims(frame);
    }
  }

  private async queueResolution<T>(
    scope: TrustedOfflineSyncScope,
    id: string,
    nested: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    const frame = this.mutationContext.getStore()!;
    let owner = frame;
    while (owner.parent) owner = owner.parent;
    const conflict = this.conflicts.get(this.key(scope.tenantId, id));
    const key = this.key(scope.tenantId, conflict?.queueItemId ?? id);
    for (;;) {
      const previous = this.queueResolutionLocks.get(key);
      if (!previous) break;
      if (previous.owner === owner) {
        if (this.frameIsActive(previous.frame))
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_STATE',
            409,
            'A queue item cannot recursively resolve itself.',
          );
        previous.frame = frame;
        this.claimProjection(this.queueItems, key);
        return operation();
      }
      if (nested)
        throw new OfflineSyncError(
          'OFFLINE_SYNC_CONFLICT_STATE',
          409,
          'An owned callback cannot wait for another queue owner.',
        );
      await this.checkedAwait(scope, previous.promise);
    }
    let release!: () => void;
    const lock = {
      owner,
      frame,
      promise: new Promise<void>((done) => {
        release = done;
      }),
    };
    this.queueResolutionLocks.set(key, lock);
    owner.releases.push(() => {
      this.queueResolutionLocks.delete(key);
      release();
    });
    this.claimProjection(this.queueItems, key);
    return operation();
  }

  seedNumberingRange(range: NumberingRange): void {
    this.ranges.set(this.key(range.tenantId, range.id), cloneRange(range));
  }

  async createNumberingRange(
    scope: TrustedOfflineSyncScope,
    original: CreateNumberingRangeInput,
    now: string,
  ): Promise<NumberingRange> {
    const { input, fingerprint } = rangeCreation(scope, original);
    const key =
      input.idempotencyKey === undefined
        ? undefined
        : this.key(scope.tenantId, input.idempotencyKey);
    const prior = key === undefined ? undefined : this.rangeCreationReceipts.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw rangeConflict('key');
      return cloneRange(prior.receipt);
    }
    if (
      [...this.ranges.values()].some(
        (range) =>
          range.tenantId === scope.tenantId &&
          range.orgUnitId === input.orgUnitId &&
          range.entityType === input.entityType &&
          range.series === input.series,
      )
    )
      throw rangeConflict('scope');
    const at = new Date(now);
    if (!Number.isFinite(at.getTime())) throw new OfflineSyncConfigurationError('rangeTimestamp');
    const range: NumberingRange = {
      id: randomUUID(),
      tenantId: scope.tenantId,
      orgUnitId: input.orgUnitId,
      entityType: input.entityType,
      series: input.series,
      startNumber: input.startNumber,
      endNumber: input.endNumber,
      nextNumber: input.startNumber,
      status: 'active',
      createdBy: scope.actorId,
      createdAt: at.toISOString(),
      ...(input.consumerAttributes === undefined
        ? {}
        : { consumerAttributes: input.consumerAttributes }),
    };
    this.ranges.set(this.key(scope.tenantId, range.id), cloneRange(range));
    if (key !== undefined)
      this.rangeCreationReceipts.set(key, { fingerprint, receipt: cloneRange(range) });
    return cloneRange(range);
  }

  async getNumberingRange(
    scope: TrustedOfflineSyncScope,
    original: string,
  ): Promise<NumberingRange | null> {
    const range = this.ranges.get(this.key(scope.tenantId, rangeIdentity(original)));
    return range ? cloneRange(range) : null;
  }

  async listNumberingRanges(
    scope: TrustedOfflineSyncScope,
    original: ListNumberingRangesInput,
  ): Promise<NumberingRangePage> {
    const input = rangeList(original);
    const rows = [...this.ranges.values()]
      .filter(
        (range) =>
          range.tenantId === scope.tenantId &&
          (input.orgUnitId === undefined || input.orgUnitId === range.orgUnitId) &&
          (input.entityType === undefined || input.entityType === range.entityType) &&
          (input.series === undefined || input.series === range.series) &&
          (input.status === undefined || input.status === range.status) &&
          (input.cursor === undefined || range.id > input.cursor),
      )
      .sort((left, right) => left.id.localeCompare(right.id, 'en'));
    const items = rows.slice(0, input.limit).map(cloneRange);
    return { items, nextCursor: rows.length > input.limit ? items[items.length - 1]!.id : null };
  }

  async cancelNumberingRange(
    scope: TrustedOfflineSyncScope,
    original: string,
    originalInput: CancelNumberingRangeInput,
    now: string,
  ): Promise<NumberingRange> {
    const id = rangeIdentity(original);
    const input = rangeCancellation(originalInput);
    const range = this.ranges.get(this.key(scope.tenantId, id));
    if (!range) throw rangeNotFound();
    if (range.status === 'cancelled') return cloneRange(range);
    if (range.status !== 'active') throw rangeConflict('state');
    const at = new Date(now);
    if (!Number.isFinite(at.getTime())) throw new OfflineSyncConfigurationError('rangeTimestamp');
    const cancelled: NumberingRange = {
      ...range,
      status: 'cancelled',
      cancelledBy: scope.actorId,
      cancelledAt: at.toISOString(),
      updatedAt: at.toISOString(),
      ...(input.reason === undefined ? {} : { cancellationReason: input.reason }),
    };
    this.ranges.set(this.key(scope.tenantId, id), cancelled);
    return cloneRange(cancelled);
  }

  async reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation> {
    return legacyReservation(this.allocateReservation(scope, input, now, defaultValidUntil, 'e6'));
  }

  async reserveDurableNumbering(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<CTG9NumberingReservation> {
    return this.allocateReservation(scope, input, now, defaultValidUntil, 'ctg9');
  }

  async replayNumberingReservation(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
  ): Promise<NumberingReservation | null> {
    const prior = this.replayReservation(scope, input);
    return prior ? legacyReservation(prior) : null;
  }

  async replayDurableNumberingReservation(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
  ): Promise<CTG9NumberingReservation | null> {
    return this.replayReservation(scope, input);
  }

  async cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<NumberingReservation> {
    return legacyReservation(this.cancelReservation(scope, id, input, now, false));
  }

  async cancelDurableNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation> {
    return this.cancelReservation(scope, id, input, now, true);
  }

  private assertReservationAdmission(
    tenantId: string,
    deviceId: string,
    shiftId: string | null,
    now: string,
    origin: 'e6' | 'ctg9',
    excludeId?: string,
  ): void {
    for (const [key, existing] of this.reservations) {
      if (
        existing.reservationId !== excludeId &&
        existing.tenantId === tenantId &&
        existing.deviceId === deviceId &&
        reservationShiftScope(existing.shiftId) === reservationShiftScope(shiftId) &&
        (existing.status === 'reserved' || existing.status === 'blocked') &&
        Date.parse(existing.validUntil) > Date.parse(now) &&
        (origin === 'ctg9' || this.reservationOrigins.get(key) === 'ctg9')
      )
        throw activeReservationError();
    }
  }

  private allocateReservation(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
    origin: 'e6' | 'ctg9',
  ): CTG9NumberingReservation {
    const replay = this.replayReservation(scope, input);
    if (replay) return replay;
    if (origin === 'e6' && input.shiftId === null)
      throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'shiftId is required.');
    this.assertReservationAdmission(scope.tenantId, input.deviceId, input.shiftId, now, origin);
    const replayKey =
      input.idempotencyKey === undefined
        ? undefined
        : this.key(scope.tenantId, input.idempotencyKey);
    const fingerprint = reservationFingerprint(scope, input);
    const range = [...this.ranges.values()].find(
      (candidate) =>
        candidate.tenantId === scope.tenantId &&
        (input.rangeId
          ? candidate.id === input.rangeId
          : candidate.orgUnitId === input.orgUnitId &&
            candidate.entityType === input.entityType &&
            // Without a series a cancelled range is not a candidate (ADR-MOBILE-OFFLINE-0003 D5).
            (input.series ? candidate.series === input.series : candidate.status !== 'cancelled')),
    );
    if (!range) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_NOT_FOUND',
        404,
        'No tenant-scoped numbering range matches this entity and organizational unit.',
      );
    }
    if (
      range.status !== 'active' ||
      range.orgUnitId !== input.orgUnitId ||
      range.entityType !== input.entityType
    ) {
      throw new OfflineSyncRangeUnavailableError(
        rangeUnavailableReason(range, input),
        'The selected numbering range is not active for this entity and organizational unit.',
      );
    }
    const endNumber = range.nextNumber + input.requestedSize - 1;
    if (endNumber > range.endNumber) {
      throw new OfflineSyncRangeUnavailableError(
        'insufficient_capacity',
        'The selected numbering range has insufficient capacity.',
      );
    }
    this.ranges.set(this.key(scope.tenantId, range.id), {
      ...range,
      nextNumber: endNumber + 1,
      status: endNumber === range.endNumber ? 'exhausted' : 'active',
    });
    const reservation: CTG9NumberingReservation = {
      reservationId: randomUUID(),
      rangeId: range.id,
      tenantId: scope.tenantId,
      orgUnitId: input.orgUnitId,
      entityType: input.entityType,
      series: range.series,
      agentId: (scope as TrustedOfflineSyncScope & { agentId?: string }).agentId ?? scope.actorId,
      deviceId: input.deviceId,
      shiftId: input.shiftId,
      startNumber: range.nextNumber,
      endNumber,
      nextNumber: range.nextNumber,
      validUntil: input.validUntil ?? defaultValidUntil,
      status: 'reserved',
    };
    this.reservations.set(this.key(scope.tenantId, reservation.reservationId), reservation);
    this.reservationOrigins.set(this.key(scope.tenantId, reservation.reservationId), origin);
    if (replayKey !== undefined)
      this.reservationKeys.set(replayKey, {
        fingerprint,
        reservationId: reservation.reservationId,
      });
    const entries = new Map<number, NumberingConsumptionEntry>();
    for (let number = reservation.startNumber; number <= reservation.endNumber; number += 1)
      entries.set(number, { number, status: 'available', serverEntityId: null, finalizedAt: null });
    this.consumption.set(this.key(scope.tenantId, reservation.reservationId), entries);
    return reservation;
  }

  private replayReservation(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
  ): CTG9NumberingReservation | null {
    const prior =
      input.idempotencyKey === undefined
        ? undefined
        : this.reservationKeys.get(this.key(scope.tenantId, input.idempotencyKey));
    if (!prior) return null;
    if (prior.fingerprint !== reservationFingerprint(scope, input))
      throw new OfflineSyncReservationReplayError();
    return this.reservations.get(this.key(scope.tenantId, prior.reservationId))!;
  }

  private cancelReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    _input: CancelNumberingReservationInput,
    _now: string,
    durable: boolean,
  ): CTG9NumberingReservation {
    const key = this.key(scope.tenantId, reservationId);
    const reservation = this.reservations.get(key);
    if (!reservation) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        `Numbering reservation ${reservationId} was not found.`,
      );
    }
    if (!durable) legacyReservation(reservation);
    if (
      reservation.status === 'cancelled' &&
      (durable || (scope as TrustedOfflineSyncScope & { ctg9?: boolean }).ctg9)
    )
      return reservation;
    if (reservation.status !== 'reserved') {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        `Numbering reservation ${reservationId} is ${reservation.status}; expected reserved.`,
      );
    }
    const cancelled: CTG9NumberingReservation = { ...reservation, status: 'cancelled' };
    this.reservations.set(key, cancelled);
    if (durable || (scope as TrustedOfflineSyncScope & { ctg9?: boolean }).ctg9) {
      const rangeKey = this.key(scope.tenantId, reservation.rangeId);
      const range = this.ranges.get(rangeKey);
      const entries = this.consumption.get(key)!;
      const highestApplied = Math.max(
        reservation.startNumber - 1,
        ...[...entries.values()]
          .filter((entry) => ['applied', 'claimed-locally'].includes(entry.status))
          .map((entry) => entry.number),
      );
      // A returned tail reactivates only an exhausted range; a cancelled range is never revived.
      if (range && range.nextNumber === reservation.endNumber + 1 && range.status !== 'cancelled')
        this.ranges.set(rangeKey, { ...range, nextNumber: highestApplied + 1, status: 'active' });
      for (const [number, entry] of entries)
        if (entry.status === 'available') entries.set(number, { ...entry, status: 'expired' });
    }
    return cancelled;
  }

  async submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult> {
    return this.mutateTenant(scope, async () => {
      const stored: StoredSyncQueueItem[] = [];
      let duplicateItems = 0;
      for (const item of input.items) {
        const payloadKey = this.key(scope.tenantId, item.payloadHash);
        const existingId = this.readProjection(this.payloadIndex, payloadKey);
        if (existingId) {
          const existing = this.readProjection(
            this.queueItems,
            this.key(scope.tenantId, existingId),
          );
          if (existing) {
            duplicateItems += 1;
            stored.push(existing);
            continue;
          }
        }
        const itemKey = this.key(scope.tenantId, item.queueItemId);
        const reused = this.readProjection(this.queueItems, itemKey);
        if (reused && reused.payloadHash !== item.payloadHash) {
          throw new OfflineSyncError(
            'OFFLINE_SYNC_QUEUE_ID_REUSED',
            409,
            `Queue item ${item.queueItemId} was already used with another payload hash.`,
          );
        }
        const queueItem: StoredSyncQueueItem = {
          ...item,
          tenantId: scope.tenantId,
          agentId: scope.actorId,
          orgUnitId: input.orgUnitId,
          deviceId: input.deviceId,
          status: 'received',
          receivedAt: now,
        };
        this.writeProjection(this.queueItems, itemKey, queueItem);
        this.writeProjection(this.queueBatches, itemKey, input.deviceBatchId);
        this.writeProjection(this.e6Items, this.key(scope.tenantId, item.idempotencyKey), {
          item: queueItem,
          batchKey: this.key(scope.tenantId, `${input.deviceId}:${input.deviceBatchId}`),
          deviceBatchId: input.deviceBatchId,
        });
        this.writeProjection(this.payloadIndex, payloadKey, item.queueItemId);
        stored.push(queueItem);
      }
      return {
        batchId: input.deviceBatchId,
        acceptedItems: input.items.length,
        duplicateItems,
        conflicts: stored
          .filter((item) => item.status === 'conflict')
          .map((item) => item.queueItemId),
        items: stored,
      };
    });
  }

  async openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    return this.mutateTenant(scope, async () => {
      const queueKey = this.key(scope.tenantId, queueItemId);
      const item = this.readProjection(this.queueItems, queueKey);
      if (!item) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
          404,
          `Sync queue item ${queueItemId} was not found.`,
        );
      }
      this.writeProjection(this.queueItems, queueKey, { ...item, status: 'conflict' });
      const conflict: SyncConflict = {
        conflictId: randomUUID(),
        tenantId: scope.tenantId,
        queueItemId,
        localEntityId: item.localEntityId,
        payloadHash: item.payloadHash,
        conflictType: input.conflictType,
        description: input.description,
        status: 'open',
      };
      this.saveConflict(conflict, now);
      return conflict;
    });
  }

  async resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    const nested = this.mutationContext.getStore() !== undefined;

    return this.mutateTenant(scope, () =>
      this.ownedFrame(
        scope,
        () =>
          this.queueResolution(scope, conflictId, nested, async () => {
            const conflictKey = this.key(scope.tenantId, conflictId);
            const conflict = this.readProjection(this.conflicts, conflictKey);
            if (!conflict) {
              throw new OfflineSyncError(
                'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
                404,
                `Sync conflict ${conflictId} was not found.`,
              );
            }
            if (conflict.status !== 'open') {
              throw new OfflineSyncError(
                'OFFLINE_SYNC_CONFLICT_STATE',
                409,
                `Sync conflict ${conflictId} is ${conflict.status}; expected open.`,
              );
            }
            const resolved: SyncConflict = {
              ...conflict,
              description: input.description ?? conflict.description,
              status: 'resolved',
              resolution: input.resolution,
              resolvedBy: scope.actorId,
              resolvedAt: now,
            };
            this.writeProjection(this.conflicts, conflictKey, resolved);
            const queueKey = this.key(scope.tenantId, conflict.queueItemId);
            const queueItem = this.readProjection(this.queueItems, queueKey);
            if (queueItem) {
              this.writeProjection(this.queueItems, queueKey, {
                ...queueItem,
                status: input.resolution === 'server-wins' ? 'rejected' : 'applied',
              });
            }
            return resolved;
          }),
        conflictId,
      ),
    );
  }

  /** Same transitions as `PostgresOfflineSyncStore.resolveWithPort` (ADR-MOBILE-OFFLINE-0003 D1, D2, D3). */
  async resolveWithPort(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ResolveSyncConflictInput,
    now: string,
    port: OfflineSyncConflictResolver,
    eventPort?: import('./types.js').OfflineSyncEventPort,
  ): Promise<SyncConflict> {
    const nested = this.mutationContext.getStore() !== undefined;

    return this.mutateTenant(scope, () =>
      this.ownedFrame(
        scope,
        () =>
          this.queueResolution(scope, id, nested, () =>
            this.resolveWithPortLocked(scope, id, input, now, port, eventPort),
          ),
        id,
      ),
    );
  }

  private async resolveWithPortLocked(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ResolveSyncConflictInput,
    now: string,
    port: OfflineSyncConflictResolver,
    eventPort?: import('./types.js').OfflineSyncEventPort,
  ): Promise<SyncConflict> {
    const frame = this.mutationContext.getStore()!;
    const key = this.key(scope.tenantId, id);
    const conflict = this.readProjection(this.conflicts, key);
    if (!conflict)
      throw new OfflineSyncError('OFFLINE_SYNC_CONFLICT_NOT_FOUND', 404, 'Conflict was not found.');
    if (conflict.status !== 'open')
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_STATE',
        409,
        'Conflict is already resolved.',
      );
    const prefix = `${scope.tenantId}:`;
    const itemKey = this.key(scope.tenantId, conflict.queueItemId);
    const item = this.readProjection(this.queueItems, itemKey)!;
    const trx = { token: randomUUID() };
    const receiptEntry = [...this.itemReceipts.entries()].find(
      ([storedKey, value]) =>
        storedKey.startsWith(prefix) && value.item.queueItemId === conflict.queueItemId,
    );
    const receipt = receiptEntry?.[1].receipt;
    const context = {
      ...scope,
      agentId: item.agentId,
      orgUnitId: item.orgUnitId,
      deviceId: item.deviceId,
      batchId: receiptEntry?.[1].deviceBatchId ?? '',
      now,
    };

    const allowed = (await port.allowedActions?.(trx, id, context)) ??
      this.readProjection(this.conflictAllowedActions, key) ??
      (receipt?.context?.allowedActions as readonly string[] | undefined) ?? [
        'device-wins',
        'server-wins',
        'manual-review',
      ];
    this.assertMutationOwner(scope);
    if (!allowed.includes(input.resolution))
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_RESOLUTION',
        409,
        'Resolution action is not allowed.',
      );
    const actionId = randomUUID();

    const { consumerAttributes: supplied, ...resolved } = await this.checkedAwait(
      scope,
      port.resolve(trx, id, input.resolution, context),
    );
    this.assertMutationOwner(scope);
    if (resolved.status !== 'resolved' && resolved.status !== 'open')
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_RESOLUTION',
        409,
        'Conflict resolver did not resolve the conflict.',
      );
    const consumerAttributes = boundedConsumerAttributes(supplied);
    if (resolved.status === 'resolved' && input.resolution === 'retry_after_correction') {
      // D1 item 3: only a `conflict` item without a committed effect and without another open conflict.
      const otherOpen = [...this.conflicts.entries()].some(
        ([storedKey, other]) =>
          storedKey.startsWith(prefix) &&
          storedKey !== key &&
          other.queueItemId === conflict.queueItemId &&
          other.status === 'open',
      );
      const appliedNumber =
        item.reservedNumber !== undefined &&
        [...this.reservations.entries()].some(
          ([reservationKey, reservation]) =>
            reservationKey.startsWith(prefix) &&
            reservation.deviceId === item.deviceId &&
            reservation.orgUnitId === item.orgUnitId &&
            reservation.entityType === item.entityType &&
            this.consumption.get(reservationKey)?.get(item.reservedNumber!)?.status === 'applied',
        );
      if (
        item.status !== 'conflict' ||
        receipt?.status !== 'conflict' ||
        receipt.stynx?.appliedAt !== undefined ||
        appliedNumber ||
        otherOpen
      )
        throw new OfflineSyncError(
          'OFFLINE_SYNC_CONFLICT_RESOLUTION',
          409,
          'The item cannot return to pending.',
        );
      this.writeProjection(this.queueItems, itemKey, { ...item, status: 'pending' });
      const pending = {
        ...Object.fromEntries(Object.entries(receipt).filter(([name]) => name !== 'errorCode')),
        status: 'pending',
      } as SyncItemReceipt;
      this.writeProjection(this.itemReceipts, receiptEntry![0], {
        ...receiptEntry![1],
        receipt: pending,
      });
    }
    this.appendConflictAction({
      record: {
        actionId,
        tenantId: scope.tenantId,
        conflictId: id,
        action: input.resolution,
        ...(input.description === undefined ? {} : { reason: input.description }),
        ...(input.userRef === undefined ? {} : { userRef: input.userRef }),
        actorId: scope.actorId,
        resultingStatus: resolved.status,
        createdAt: now,
      },
      sequence: String(++this.conflictActionSequence).padStart(12, '0'),
    });
    const platform = this.readProjection(this.conflictStynx, key);
    if (consumerAttributes !== undefined)
      this.writeProjection(this.conflictStynx, key, {
        ...(platform ?? { version: 1 }),
        consumerAttributes,
      });
    const stynx = this.readProjection(this.conflictStynx, key);
    const canonical = { ...resolved, ...conflict, status: resolved.status };
    if (resolved.status === 'resolved') {
      // The stored conflict keeps its identity, as the PostgreSQL row does; the resolver's object is returned.
      this.writeProjection(this.conflicts, key, {
        ...conflict,
        status: 'resolved',
        resolution: input.resolution,
        resolvedBy: scope.actorId,
        resolvedAt: now,
      });
      await this.checkedAwait(
        scope,
        eventPort?.appendInTransaction(trx, {
          entity: 'offline.sync-conflict',
          entityId: id,
          idempotencyKey: `stynx:offline-sync:resolution:${actionId}`,
          payload: {
            actionId,
            conflictId: id,
            queueItemId: conflict.queueItemId,
            action: input.resolution,
            resultingStatus: resolved.status,
            actorId: scope.actorId,
            at: now,
          },
        }),
      );
      this.assertFrameComplete(frame);
      return {
        ...canonical,
        resolution: input.resolution,
        resolvedBy: scope.actorId,
        resolvedAt: now,
        ...(stynx ? { stynx } : {}),
      };
    }
    await this.checkedAwait(
      scope,
      eventPort?.appendInTransaction(trx, {
        entity: 'offline.sync-conflict',
        entityId: id,
        idempotencyKey: `stynx:offline-sync:resolution:${actionId}`,
        payload: {
          actionId,
          conflictId: id,
          queueItemId: conflict.queueItemId,
          action: input.resolution,
          resultingStatus: resolved.status,
          actorId: scope.actorId,
          at: now,
        },
      }),
    );
    this.assertFrameComplete(frame);
    return { ...withoutResolution(canonical), ...(stynx ? { stynx } : {}) };
  }

  /** D3 item 6 in memory: one `integrity` conflict per tenant, key and received hash, referencing the original item. */
  private async integrityConflict(
    scope: TrustedOfflineSyncScope,
    input: CTG9SubmitSyncBatchInput,
    item: CTG9SyncBatchItemInput,
    key: string,
    original: StoredSyncQueueItem | undefined,
    runtime: DurableBatchExecutionOptions,
    now: string,
  ): Promise<OfflineSyncStynxContext> {
    const rejectionKey = this.key(
      scope.tenantId,
      JSON.stringify([input.deviceId, input.deviceBatchId, item.queueItemId]),
    );
    const saveRejection = (): void => {
      if (this.readProjection(this.integrityRejections, rejectionKey) === undefined)
        this.writeProjection(this.integrityRejections, rejectionKey, {
          tenantId: scope.tenantId,
          deviceId: input.deviceId,
          deviceBatchId: input.deviceBatchId,
          queueItemId: item.queueItemId,
          idempotencyKey: key,
          receivedPayloadHash: item.payloadHash,
          ...(original
            ? { storedPayloadHash: original.payloadHash, originalQueueItemId: original.queueItemId }
            : {}),
          rejectedAt: now,
          errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
        });
    };
    const rejectionContext = (): OfflineSyncStynxContext => {
      const recorded = this.readProjection(this.integrityRejections, rejectionKey)!;
      return stynxContextOf({
        receiptId: recorded.idempotencyKey,
        errorCode: recorded.errorCode,
        reasonCode: recorded.errorCode,
        receivedPayloadHash: recorded.receivedPayloadHash,
        storedPayloadHash: recorded.storedPayloadHash,
        relatedQueueItemId: recorded.originalQueueItemId,
        retryable: false,
      });
    };
    const dedupe = this.key(scope.tenantId, `${key}\0${item.payloadHash}`);
    if (!original || this.readProjection(this.integrityConflicts, dedupe) !== undefined) {
      saveRejection();
      return rejectionContext();
    }

    const conflictId = randomUUID();
    const trx = { token: randomUUID() };
    const context = {
      ...scope,
      agentId: runtime.agentId,
      orgUnitId: input.orgUnitId,
      deviceId: input.deviceId,
      batchId: input.deviceBatchId,
      now,
      receiptId: key,
    };
    const allowedActions = (await this.checkedAwait(
      scope,
      runtime.ports.conflictResolver?.allowedActions?.(trx, conflictId, context),
    )) ?? ['reject'];
    saveRejection();
    this.writeProjection(this.integrityConflicts, dedupe, conflictId);
    this.saveConflict(
      {
        conflictId,
        tenantId: scope.tenantId,
        queueItemId: original.queueItemId,
        localEntityId: original.localEntityId,
        payloadHash: original.payloadHash,
        conflictType: 'integrity',
        description: 'Payload hash differs from the stored item.',
        status: 'open',
      },
      now,
      allowedActions,
      stynxContextOf({
        receiptId: key,
        reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
        receivedPayloadHash: item.payloadHash,
        storedPayloadHash: original.payloadHash,
        relatedQueueItemId: item.queueItemId,
        retryable: allowedActions.includes('retry_after_correction'),
      }),
    );
    return rejectionContext();
  }

  getQueueItem(tenantId: string, queueItemId: string): StoredSyncQueueItem | undefined {
    return this.queueItems.get(this.key(tenantId, queueItemId));
  }

  async blockNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    _input: CancelNumberingReservationInput,
    _now: string,
  ): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'blocked', _now);
  }

  async closeNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    _input: CancelNumberingReservationInput,
    _now: string,
  ): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'consumed', _now);
  }

  async settleNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    _input: SettleNumberingInput,
    _now: string,
  ): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'consumed', _now);
  }

  private transitionReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    status: 'blocked' | 'consumed',
    now: string,
  ): CTG9NumberingReservation {
    const key = this.key(scope.tenantId, id);
    const current = this.reservations.get(key);
    if (!current)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    if (current.status === status) return current;
    if (!['reserved', 'expired'].includes(current.status))
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        'Reservation cannot transition from its current state.',
      );
    if (status === 'blocked' && Date.parse(current.validUntil) > Date.parse(now))
      this.assertReservationAdmission(
        scope.tenantId,
        current.deviceId,
        current.shiftId,
        now,
        this.reservationOrigins.get(key)!,
        id,
      );
    const changed = { ...current, status };
    this.reservations.set(key, changed);
    const entries = this.consumption.get(key)!;
    for (const [number, entry] of entries)
      if (entry.status === 'available')
        entries.set(number, { ...entry, status: status === 'blocked' ? 'blocked' : 'expired' });
    return changed;
  }

  async reconcileNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ReconcileNumberingInput,
    now: string,
  ): Promise<ReconcileNumberingResult> {
    const observedAt = consumptionReadInstant(now);
    const request = reconciliationRequest(scope, input);
    const key = this.key(scope.tenantId, id);
    const reservation = this.reservations.get(key);
    const entries = this.consumption.get(key);
    if (!reservation || !entries)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    const replay =
      input.idempotencyKey === undefined
        ? undefined
        : [...this.reconciliations.values()].find(
            ({ record }) =>
              record.tenantId === scope.tenantId &&
              record.reservationId === id &&
              record.idempotencyKey === input.idempotencyKey,
          );
    if (replay) {
      if (replay.fingerprint !== request.fingerprint) reconciliationConflict();
      return structuredClone(replay.record.result);
    }
    for (const number of request.claimedNumbers)
      if (!entries.has(number))
        throw new OfflineSyncError(
          'OFFLINE_SYNC_INVALID_INPUT',
          400,
          'Claimed number is outside the reservation.',
        );
    if (reservation.status === 'reserved')
      for (const number of request.claimedNumbers) {
        const entry = entries.get(number)!;
        if (entry.status === 'available')
          entries.set(number, { ...entry, status: 'claimed-locally' });
      }
    const reconciliationId = randomUUID();
    const result = reconciliationResult(
      {
        reservationId: id,
        status: reservation.status,
        consumption: projectNumberingConsumption(reservation, [...entries.values()], observedAt),
      },
      request.claimedNumbers,
      reconciliationId,
    );
    const record: NumberingReconciliationRecord = {
      reconciliationId,
      tenantId: scope.tenantId,
      reservationId: id,
      actorId: scope.actorId,
      createdAt: now,
      claimedNumbers: request.claimedNumbers,
      ...(input.userRef === undefined ? {} : { userRef: input.userRef }),
      ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
      result,
    };
    this.reconciliations.set(this.key(scope.tenantId, reconciliationId), {
      fingerprint: request.fingerprint,
      record: structuredClone(record),
    });
    return result;
  }

  async listNumberingReconciliations(
    scope: TrustedOfflineSyncScope,
    input: ListNumberingReconciliationsInput,
  ): Promise<OfflineSyncPage<NumberingReconciliationRecord>> {
    const limit = reconciliationList(input);
    return pageOf(
      [...this.reconciliations.values()]
        .filter(
          ({ record }) =>
            record.tenantId === scope.tenantId && record.reservationId === input.reservationId,
        )
        .map(({ record }) => ({
          key: [reconciliationSortInstant(record.createdAt), record.reconciliationId],
          value: structuredClone(record),
        })),
      2,
      input.cursor,
      limit,
    );
  }

  async getNumberingConsumption(
    scope: TrustedOfflineSyncScope,
    id: string,
    now?: string,
  ): Promise<NumberingConsumptionResult> {
    const observedAt = consumptionReadInstant(now);
    const key = this.key(scope.tenantId, id);
    const reservation = this.reservations.get(key);
    if (!reservation)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    return {
      reservationId: id,
      status: reservation.status,
      consumption: projectNumberingConsumption(
        reservation,
        [...this.consumption.get(key)!.values()],
        observedAt,
      ),
    };
  }

  async getSyncBatchReceipt(
    scope: TrustedOfflineSyncScope,
    deviceId: string,
    deviceBatchId: string,
  ): Promise<SyncBatchReceipt | null> {
    return (
      this.batches.get(this.key(scope.tenantId, `${deviceId}:${deviceBatchId}`))?.receipt ?? null
    );
  }

  async getSyncIntegrityRejection(
    scope: TrustedOfflineSyncScope,
    identity: SyncIntegrityRejectionIdentity,
  ): Promise<SyncIntegrityRejection | null> {
    const record = this.integrityRejections.get(
      this.key(
        scope.tenantId,
        JSON.stringify([identity.deviceId, identity.deviceBatchId, identity.queueItemId]),
      ),
    );
    return record ? { ...record } : null;
  }

  async getSyncItemReceipt(
    scope: TrustedOfflineSyncScope,
    idempotencyKey: string,
  ): Promise<SyncItemReceipt | null> {
    return this.itemReceipts.get(this.key(scope.tenantId, idempotencyKey))?.receipt ?? null;
  }

  async submitDurableSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: CTG9SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
    now: string,
  ): Promise<CTG9SubmitSyncBatchResult> {
    this.assertMutationOwner(scope);
    if (this.mutationContext.getStore())
      throw new OfflineSyncError(
        'OFFLINE_SYNC:BATCH:in-progress',
        503,
        'Nested durable batches cannot wait on their owner.',
        true,
      );
    const supplied = options as Partial<DurableBatchExecutionOptions>;
    const runtime: DurableBatchExecutionOptions = {
      ...options,
      agentId: supplied.agentId ?? scope.actorId,
      policy: supplied.policy ?? {},
      ports: supplied.ports ?? {},
      transport: supplied.transport ?? options,
    };
    const itemKeys = new Map<string, string>();
    const declaredKeys = new Set<string>();
    for (const item of input.items) {
      if (item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber))
        throw new OfflineSyncError(
          'OFFLINE_SYNC_INVALID_INPUT',
          400,
          'reservedNumber must be a safe integer.',
        );
      if (item.idempotencyKey?.startsWith('stynx:legacy:'))
        throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'Reserved item namespace.');
      let key = item.idempotencyKey;
      if (!key) {
        const identityText = runtime.ports.legacyItemIdentityResolver
          ? await runtime.ports.legacyItemIdentityResolver.resolve({
              tenantId: scope.tenantId,
              deviceId: input.deviceId,
              deviceBatchId: input.deviceBatchId,
              queueItemId: item.queueItemId,
              localEntityId: item.localEntityId,
              entityType: item.entityType,
            })
          : [input.deviceId, input.deviceBatchId, item.queueItemId].join('\0');
        if (!identityText)
          throw new OfflineSyncError(
            'OFFLINE_SYNC_INVALID_INPUT',
            400,
            'Legacy identity is empty.',
          );
        key = `stynx:legacy:v1:${createHash('sha256').update(`${scope.tenantId}\0${identityText}`).digest('hex')}`;
      }
      if (declaredKeys.has(key))
        throw new OfflineSyncError(
          'OFFLINE_SYNC_INVALID_INPUT',
          400,
          'Item identity appears more than once in the batch.',
        );
      declaredKeys.add(key);
      itemKeys.set(item.queueItemId, key);
    }
    if (
      !runtime.ports.itemApplier &&
      input.items.some((item) => item.idempotencyKey && item.reservedNumber !== undefined)
    )
      throw new OfflineSyncConfigurationError('itemApplier');
    if (runtime.ports.itemApplier && !runtime.ports.eventPort)
      throw new OfflineSyncConfigurationError('eventPort');
    const identity = this.key(scope.tenantId, `${input.deviceId}:${input.deviceBatchId}`);
    const contextHash = batchContextFingerprint(input, runtime.agentId);
    const fingerprint = transportFingerprint(runtime.transport, input);
    const transportKey = transportCompositeKey(scope, runtime.transport);
    const prior = this.batches.get(identity);
    if (prior) {
      if (prior.contextHash !== contextHash)
        throw new OfflineSyncError(
          'OFFLINE_SYNC_BATCH_CONFLICT',
          409,
          'Batch context differs from the original.',
        );
      const bound = this.transport.get(transportKey);
      if (bound && bound.fingerprint !== fingerprint)
        throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
      if (bound && bound.batchIdentity !== identity)
        throw new OfflineSyncError(
          'OFFLINE_SYNC_BATCH_CONFLICT',
          409,
          'Transport key belongs to another batch.',
        );
      this.transport.set(transportKey, { batchIdentity: identity, fingerprint });
      if (prior.result) {
        applyReplayResponse(
          runtime.transport,
          runtime.ports,
          prior.receipt.responseStatus!,
          prior.receipt.responseHeaders,
        );
        return prior.result;
      }
      if (prior.promise) {
        const waited = await Promise.race([
          prior.promise.then((value) => ({ value })),
          new Promise<{ value?: CTG9SubmitSyncBatchResult }>((resolve) =>
            setTimeout(() => resolve({}), runtime.ports.leaseWaitMs ?? 750),
          ),
        ]);
        if (waited.value) {
          applyReplayResponse(
            runtime.transport,
            runtime.ports,
            prior.receipt.responseStatus!,
            prior.receipt.responseHeaders,
          );
          return waited.value;
        }
        throw new OfflineSyncError(
          'OFFLINE_SYNC:BATCH:in-progress',
          503,
          'Batch is in progress.',
          true,
        );
      }
    }
    if (!prior && input.batchSequence != null) {
      const siblings = [...this.batches.entries()]
        .filter(([key]) => key.startsWith(`${scope.tenantId}:`))
        .map(([, value]) => value.receipt)
        .filter((receipt) => receipt.deviceId === input.deviceId);
      const expected = Math.max(0, ...siblings.map((receipt) => receipt.batchSequence ?? 0)) + 1;
      const sequenceContext = {
        expectedSequence: expected,
        receivedSequence: input.batchSequence,
        deviceBatchId: input.deviceBatchId,
      };
      if (siblings.some((receipt) => receipt.batchSequence === input.batchSequence))
        throw new OfflineSyncError(
          'OFFLINE_SYNC_BATCH_CONFLICT',
          409,
          'Batch sequence is already used.',
          false,
          undefined,
          sequenceContext,
        );
      if (input.batchSequence !== expected)
        throw new OfflineSyncError(
          'OFFLINE_SYNC_BATCH_SEQUENCE',
          422,
          `Expected batch sequence ${expected}; received ${input.batchSequence}.`,
          false,
          undefined,
          sequenceContext,
        );
    }
    const bound = this.transport.get(transportKey);
    if (!prior && bound?.fingerprint !== undefined && bound.fingerprint !== fingerprint)
      throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
    if (!prior && bound && bound.batchIdentity !== identity)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_BATCH_CONFLICT',
        409,
        'Transport key belongs to another batch.',
      );
    const receipt: SyncBatchReceipt = prior?.receipt ?? {
      deviceId: input.deviceId,
      deviceBatchId: input.deviceBatchId,
      batchSequence: input.batchSequence ?? null,
      status: 'open',
      items: [],
      responseStatus: null,
      responseBodyBytes: null,
      responseHeaders: {},
    };
    const record = (prior ?? {
      contextHash,
      initialQueueStatus: runtime.ports.initialQueueStatus ?? 'received',
      receipt,
      transportKey,
      fingerprint,
      createdAt: now,
    }) as {
      contextHash: string;
      initialQueueStatus: 'received' | 'pending';
      receipt: SyncBatchReceipt;
      result?: CTG9SubmitSyncBatchResult;
      promise?: Promise<CTG9SubmitSyncBatchResult>;
      transportKey: string;
      fingerprint: string;
      createdAt: string;
    };
    this.batches.set(identity, record);
    this.transport.set(transportKey, { batchIdentity: identity, fingerprint });
    const run = async (): Promise<CTG9SubmitSyncBatchResult> => {
      const stored: CTG9SubmitSyncBatchResult['items'][number][] = [];
      const itemReceipts: SyncItemReceipt[] = [];
      let duplicates = 0;
      let retryable = false;
      const processItem = async (
        item: CTG9SyncBatchItemInput,
        itemFrame: MemoryMutationFrame,
      ): Promise<void> => {
        const key = itemKeys.get(item.queueItemId)!;
        const initialStatus =
          item.idempotencyKey && record.initialQueueStatus === 'pending' ? 'pending' : 'received';
        if (
          !(await this.checkedAwait(
            scope,
            verifyOfflineSyncPayloadHash(
              item,
              {
                ...scope,
                agentId: runtime.agentId,
                orgUnitId: input.orgUnitId,
                deviceId: input.deviceId,
                batchId: input.deviceBatchId,
                now,
                receiptId: key,
              },
              runtime.ports.payloadHashPort,
            ),
          ))
        ) {
          // ADR-MOBILE-OFFLINE-0003 D4: per-item integrity rejection; no queue row, receipt or effect.
          const original = this.readProjection(
            this.itemReceipts,
            this.key(scope.tenantId, key),
          )?.item;
          const integrityStynx = await this.checkedAwait(
            scope,
            this.integrityConflict(
              scope,
              input,
              item,
              key,
              original ? { ...original, idempotencyKey: key } : undefined,
              runtime,
              now,
            ),
          );
          const rejected = {
            ...item,
            tenantId: scope.tenantId,
            agentId: runtime.agentId,
            orgUnitId: input.orgUnitId,
            deviceId: input.deviceId,
            status: 'rejected' as const,
            receivedAt: now,
            errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
            stynx: integrityStynx,
          };
          stored.push(rejected);
          itemReceipts.push({
            queueItemId: item.queueItemId,
            status: 'rejected',
            errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
            stynx: integrityStynx,
          });
          return;
        }
        const previousQueue = this.readProjection(
          this.queueItems,
          this.key(scope.tenantId, item.queueItemId),
        );
        if (previousQueue && previousQueue.idempotencyKey !== key) {
          const rejected = {
            ...item,
            tenantId: scope.tenantId,
            agentId: runtime.agentId,
            orgUnitId: input.orgUnitId,
            deviceId: input.deviceId,
            status: 'rejected' as const,
            receivedAt: now,
            errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED',
          };
          stored.push(rejected);
          itemReceipts.push({
            queueItemId: item.queueItemId,
            status: 'rejected',
            errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED',
          });
          return;
        }
        const itemKey = this.key(scope.tenantId, key);
        const e6 = this.readProjection(this.e6Items, itemKey);
        if (e6) {
          const legacy = this.readProjection(
            this.queueItems,
            this.key(scope.tenantId, e6.item.queueItemId),
          )!;
          const sameHash = legacy.payloadHash === item.payloadHash;
          const integrityStynx = !sameHash
            ? await this.checkedAwait(
                scope,
                this.integrityConflict(scope, input, item, key, legacy, runtime, now),
              )
            : undefined;
          if (sameHash && e6.batchKey !== identity) duplicates += 1;
          const legacyReceived = sameHash && legacy.status === 'received';
          const status: SyncItemReceipt['status'] =
            !sameHash || legacyReceived ? 'rejected' : legacy.status;
          const errorCode = !sameHash
            ? 'OFFLINE_SYNC_ITEM_INTEGRITY'
            : legacyReceived
              ? 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED'
              : undefined;
          const context =
            legacy.queueItemId !== item.queueItemId
              ? { originalQueueItemId: legacy.queueItemId }
              : undefined;
          const originalReceipt: SyncItemReceipt = {
            queueItemId: legacy.queueItemId,
            status: legacy.status,
          };
          this.writeProjection(this.itemReceipts, itemKey, {
            hash: legacy.payloadHash,
            batchKey: e6.batchKey,
            receipt: originalReceipt,
            item: legacy,
            deviceBatchId: e6.deviceBatchId,
            receivedAt: legacy.receivedAt,
          });
          stored.push({
            ...item,
            tenantId: scope.tenantId,
            agentId: runtime.agentId,
            orgUnitId: input.orgUnitId,
            deviceId: input.deviceId,
            status,
            receivedAt: now,
            ...(errorCode ? { errorCode } : {}),
            ...(context ? { context } : {}),
            ...(integrityStynx ? { stynx: integrityStynx } : {}),
          });
          itemReceipts.push({
            queueItemId: item.queueItemId,
            status,
            ...(errorCode ? { errorCode } : {}),
            ...(context ? { context } : {}),
            ...(integrityStynx ? { stynx: integrityStynx } : {}),
          });
          return;
        }
        const previous = this.readProjection(this.itemReceipts, itemKey);
        // D1 item 4: a `pending` receipt is applied again only by a later batch of the same device under a
        // different batch id with the identical hash; the receipt keeps its original batch binding.
        const reapplying =
          previous !== undefined &&
          previous.hash === item.payloadHash &&
          previous.receipt.status === 'pending' &&
          previous.item.deviceId === input.deviceId &&
          previous.batchKey !== identity &&
          !!item.idempotencyKey &&
          !!runtime.ports.itemApplier;
        if (previous && !reapplying) {
          if (previous.batchKey !== identity && previous.hash === item.payloadHash) duplicates += 1;
          if (
            previous.hash === item.payloadHash &&
            (previous.batchKey !== identity ||
              previous.receipt.status !== initialStatus ||
              previous.receipt.stynx?.terminalReceived === true ||
              !item.idempotencyKey)
          ) {
            if (
              previous.receipt.status === initialStatus &&
              item.idempotencyKey &&
              runtime.ports.itemApplier &&
              previous.receipt.stynx?.terminalReceived !== true
            )
              retryable = true;
            // A new response repeats original committed platform facts; closed response bytes stay untouched.
            const duplicateContext = {
              ...previous.receipt.context,
              ...(previous.item.queueItemId !== item.queueItemId
                ? { originalQueueItemId: previous.item.queueItemId }
                : {}),
            };
            stored.push({ ...previous.item, queueItemId: item.queueItemId });
            itemReceipts.push({
              queueItemId: item.queueItemId,
              status: previous.receipt.status,
              ...(previous.receipt.errorCode ? { errorCode: previous.receipt.errorCode } : {}),
              ...(Object.keys(duplicateContext).length ? { context: duplicateContext } : {}),
              ...(previous.receipt.stynx ? { stynx: previous.receipt.stynx } : {}),
            });
            return;
          }
          if (previous.hash !== item.payloadHash) {
            const integrityStynx = await this.checkedAwait(
              scope,
              this.integrityConflict(
                scope,
                input,
                item,
                key,
                { ...previous.item, idempotencyKey: key },
                runtime,
                now,
              ),
            );
            const rejected = {
              ...previous.item,
              queueItemId: item.queueItemId,
              status: 'rejected' as const,
              errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
              stynx: integrityStynx,
            };
            stored.push(rejected);
            itemReceipts.push({
              queueItemId: item.queueItemId,
              status: 'rejected',
              errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
              stynx: integrityStynx,
            });
            return;
          }
        }
        let status: SyncItemReceipt['status'] = initialStatus;
        let errorCode: string | undefined;
        let serverEntityId: string | undefined;
        let receiptContext: Record<string, unknown> | undefined;
        let coveringReservationKey: string | undefined;

        let stynx: OfflineSyncStynxContext | undefined;
        const queueItemId = reapplying ? previous.item.queueItemId : item.queueItemId;
        const portItem = queueItemId === item.queueItemId ? item : { ...item, queueItemId };
        const attempts = (previous?.receipt.stynx?.attempts ?? 0) + 1;
        let itemContext: OfflineSyncItemContext = {
          ...scope,
          agentId: runtime.agentId,
          orgUnitId: input.orgUnitId,
          deviceId: input.deviceId,
          batchId: input.deviceBatchId,
          now,
          receiptId: key,
        };

        if (!item.idempotencyKey) errorCode = 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED';
        else {
          const trx = {
            token: randomUUID(),
          };

          const apply = async (): Promise<void> => {
            const prepared = await this.checkedAwait(
              scope,
              prepareOfflineSyncItem(
                trx,
                portItem,
                itemContext,
                runtime,
                async (id) =>
                  id === queueItemId || this.queueItems.has(this.key(scope.tenantId, id)),
              ),
            );
            itemContext = prepared.context;
            const recordPairs = async (
              pairs: readonly OfflineSyncConcurrentPair[],
            ): Promise<boolean> => {
              let conflict = false;
              for (const pair of pairs) {
                for (const affected of [pair.firstItemId, pair.secondItemId]) {
                  const conflictId = randomUUID();
                  const relatedQueueItemId =
                    affected === pair.firstItemId ? pair.secondItemId : pair.firstItemId;
                  const allowedActions = (await this.checkedAwait(
                    scope,
                    runtime.ports.conflictResolver?.allowedActions?.(trx, conflictId, itemContext),
                  )) ?? ['manual-review'];
                  const evidence = { conflictId, relatedQueueItemId, allowedActions };
                  const conflictStynx = executionStynxContext(runtime, {
                    reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED',
                    concurrencySuspected: true,
                    concurrentPairs: [pair],
                    relatedQueueItemId,
                    retryable: allowedActions.includes('retry_after_correction'),
                  });
                  for (const [storedKey, old] of this.itemReceipts)
                    if (
                      old.item.queueItemId === affected &&
                      storedKey.startsWith(`${scope.tenantId}:`)
                    ) {
                      this.writeProjection(this.itemReceipts, storedKey, {
                        ...old,
                        receipt: {
                          ...old.receipt,
                          status: 'conflict',
                          context: evidence,
                          stynx: {
                            ...(old.receipt.stynx ?? { version: 1 }),
                            ...conflictStynx,
                          },
                        },
                      });
                      const affectedQueue = this.readProjection(
                        this.queueItems,
                        this.key(scope.tenantId, affected),
                      );
                      this.writeProjection(this.queueItems, this.key(scope.tenantId, affected), {
                        ...affectedQueue!,
                        status: 'conflict',
                      });
                      this.saveConflict(
                        {
                          conflictId,
                          tenantId: scope.tenantId,
                          queueItemId: affected,
                          localEntityId: old.item.localEntityId,
                          payloadHash: old.item.payloadHash,
                          conflictType: 'concurrency',
                          description: 'Concurrent agent activity',
                          status: 'open',
                        },
                        now,
                        allowedActions,
                        conflictStynx,
                      );
                    }
                  if (affected === queueItemId) {
                    receiptContext = evidence;
                    stynx = conflictStynx;
                    this.saveConflict(
                      {
                        conflictId,
                        tenantId: scope.tenantId,
                        queueItemId: affected,
                        localEntityId: item.localEntityId,
                        payloadHash: item.payloadHash,
                        conflictType: 'concurrency',
                        description: 'Concurrent agent activity',
                        status: 'open',
                      },
                      now,
                      allowedActions,
                      conflictStynx,
                    );
                  }
                }
                if (pair.firstItemId === queueItemId || pair.secondItemId === queueItemId)
                  conflict = true;
              }
              return conflict;
            };
            if (prepared.defer) {
              // Admission guarantees a nonempty pair containing this canonical item.
              await this.checkedAwait(scope, recordPairs(prepared.pairs));
              status = 'conflict';
              stynx = {
                ...executionStynxContext(runtime, {
                  receiptId: key,
                  attempts,
                  concurrencySuspected: itemContext.concurrencySuspected,
                  concurrentPairs: itemContext.concurrentPairs,
                }),
                ...stynx,
              };
            } else {
              const covering =
                item.reservedNumber === undefined
                  ? []
                  : [...this.reservations.entries()].filter(
                      ([reservationKey, reservation]) =>
                        reservationKey.startsWith(`${scope.tenantId}:`) &&
                        reservation.deviceId === input.deviceId &&
                        reservation.orgUnitId === input.orgUnitId &&
                        reservation.entityType === item.entityType &&
                        reservation.startNumber <= item.reservedNumber! &&
                        item.reservedNumber! <= reservation.endNumber &&
                        (!item.reservationId || reservation.reservationId === item.reservationId) &&
                        (reservation.status !== 'cancelled' ||
                          ['applied', 'claimed-locally'].includes(
                            this.consumption.get(reservationKey)?.get(item.reservedNumber!)
                              ?.status ?? '',
                          )),
                    );
              if (item.reservedNumber !== undefined && covering.length === 0)
                throw new OfflineSyncNumberingOutcome(
                  'OFFLINE_SYNC_NUMBERING_NO_COVERAGE',
                  item.reservedNumber,
                  item.reservationId ?? null,
                );
              if (covering.length > 1)
                throw new OfflineSyncNumberingOutcome(
                  'OFFLINE_SYNC_NUMBERING_AMBIGUOUS',
                  item.reservedNumber!,
                  null,
                );
              if (covering[0]) {
                const [reservationKey, reservation] = covering[0];
                coveringReservationKey = reservationKey;
                const entry = this.consumption.get(reservationKey)?.get(item.reservedNumber!);
                if (entry?.status === 'applied')
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',
                    item.reservedNumber!,
                    reservation.reservationId,
                  );
                if (
                  reservation.status !== 'reserved' ||
                  Date.parse(reservation.validUntil) < Date.parse(item.createdLocallyAt)
                )
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_EXPIRED',
                    item.reservedNumber!,
                    reservation.reservationId,
                  );
              }
              if (runtime.ports.itemApplier) {
                const applied = await this.checkedAwait(
                  scope,
                  runtime.ports.itemApplier.apply(trx, portItem, itemContext),
                );
                const consumerAttributes = boundedConsumerAttributes(applied.consumerAttributes);
                serverEntityId = applied.serverEntityId;
                const pairs = [...prepared.pairs];
                if (runtime.policy.concurrencyWindowMinutes && runtime.ports.concurrencyDetector) {
                  const detected = await this.checkedAwait(
                    scope,
                    runtime.ports.concurrencyDetector.detect(trx, portItem, itemContext),
                  );
                  if (detected.suspected)
                    for (const pair of detected.pairs) {
                      if (
                        await this.checkedAwait(
                          scope,
                          runtime.ports.handoffPort?.permits(trx, pair, itemContext),
                        )
                      )
                        continue;
                      if (
                        !pairs.some(
                          (old) =>
                            [old.firstItemId, old.secondItemId].includes(pair.firstItemId) &&
                            [old.firstItemId, old.secondItemId].includes(pair.secondItemId),
                        )
                      )
                        pairs.push(pair);
                    }
                }
                status = (await this.checkedAwait(scope, recordPairs(pairs)))
                  ? 'conflict'
                  : 'applied';
                stynx = {
                  ...(stynx ?? { version: 1 }),
                  ...executionStynxContext(runtime, {
                    concurrencySuspected:
                      itemContext.concurrencySuspected !== undefined ||
                      (runtime.policy.concurrencyWindowMinutes && runtime.ports.concurrencyDetector)
                        ? pairs.length > 0
                        : undefined,
                    concurrentPairs:
                      itemContext.concurrencySuspected !== undefined ||
                      (runtime.policy.concurrencyWindowMinutes && runtime.ports.concurrencyDetector)
                        ? pairs
                        : undefined,
                    receiptId: key,
                    appliedAt: now,
                    serverEntityId,
                    attempts,
                    consumerAttributes,
                  }),
                };
                // D1 item 6: a re-application never reuses the event key of an earlier attempt.
                await this.checkedAwait(
                  scope,
                  runtime.ports.eventPort!.appendInTransaction(trx, {
                    entity: item.entityType,
                    entityId: applied.serverEntityId,
                    idempotencyKey: reapplying ? `${key}:retry:${attempts}` : key,
                    payload: item.payloadJson,
                  }),
                );
              }
            }
          };
          try {
            await this.ownedFrame(scope, apply);
          } catch (error) {
            if (error instanceof OfflineSyncConfigurationError) throw error;
            serverEntityId = undefined;
            coveringReservationKey = undefined;
            receiptContext = undefined;
            const domainContext = domainErrorContext(error);
            const classification = classifyDomainOutcome(
              runtime.ports.domainOutcomeClassifier,
              error,
              domainContext,
              portItem,
              itemContext,
            );
            const outcome = classification.outcome;
            const classified =
              domainContext.valid &&
              classification.valid &&
              error instanceof HttpException &&
              error.getStatus() >= 400 &&
              error.getStatus() < 500 &&
              !(error instanceof OfflineSyncError && error.code === 'OFFLINE_SYNC_BATCH_CONFLICT');
            const numbering = error instanceof OfflineSyncNumberingOutcome ? error : null;
            if ((classified || outcome) && !numbering) receiptContext = domainContext.context;
            status =
              numbering?.receiptStatus ??
              outcome?.status ??
              (classified ? 'rejected' : reapplying ? 'pending' : initialStatus);
            errorCode = !domainContext.valid
              ? 'OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID'
              : !classification.valid
                ? 'OFFLINE_SYNC_DOMAIN_OUTCOME_INVALID'
                : runtime.ports.domainOutcomeClassifier
                  ? (classification.code ?? domainFailureCode(error) ?? 'OFFLINE_SYNC_ITEM_FAILED')
                  : ((error as { code?: string }).code ?? 'OFFLINE_SYNC_ITEM_FAILED');
            stynx = executionStynxContext(runtime, {
              receiptId: key,
              errorCode,
              errorMessage: error instanceof Error ? error.message : String(error),
              attempts,
              reasonCode: numbering?.code ?? (outcome ? errorCode : undefined),
              retryable: outcome ? false : !classified,
              ...(outcome?.status === 'received' ? { terminalReceived: true } : {}),
            });
            if (numbering || outcome?.conflict) {
              const conflictType = numbering ? 'domain' : outcome!.conflict!.type;
              const conflictId = randomUUID();
              const allowedActions =
                (await this.checkedAwait(
                  scope,
                  runtime.ports.conflictResolver?.allowedActions?.(trx, conflictId, itemContext),
                )) ??
                (conflictType === 'concurrency'
                  ? ['manual_review']
                  : ['reject', 'retry_after_correction']);
              if (numbering) receiptContext = { ...numbering.context, conflictId, allowedActions };
              this.saveConflict(
                {
                  conflictId,
                  tenantId: scope.tenantId,
                  queueItemId,
                  localEntityId: item.localEntityId,
                  payloadHash: item.payloadHash,
                  conflictType,
                  description: numbering?.code ?? outcome!.conflict!.description,
                  status: 'open',
                },
                now,
                allowedActions,
                executionStynxContext(runtime, {
                  receiptId: key,
                  reasonCode: errorCode,
                  errorCode,
                  attempts,
                  retryable: allowedActions.includes('retry_after_correction'),
                }),
                numbering ? undefined : domainContext.context,
              );
            }
            if (!classified && !outcome) retryable = true;
          }
        }
        // Host keys of an earlier attempt stay on the stored receipt, as the PostgreSQL merge keeps them (D3.1).
        receiptContext =
          previous?.receipt.context || receiptContext
            ? { ...previous?.receipt.context, ...receiptContext }
            : undefined;
        const resultContext = {
          ...receiptContext,
          ...(reapplying && queueItemId !== item.queueItemId
            ? { originalQueueItemId: queueItemId }
            : {}),
        };
        const saved: CTG9SubmitSyncBatchResult['items'][number] = {
          ...item,
          tenantId: scope.tenantId,
          agentId: runtime.agentId,
          orgUnitId: input.orgUnitId,
          deviceId: input.deviceId,
          status,
          receivedAt: now,
          ...(Object.keys(resultContext).length ? { context: resultContext } : {}),
          ...(stynx ? { stynx } : {}),
        };
        const itemReceipt: SyncItemReceipt = {
          queueItemId: item.queueItemId,
          status,
          ...(errorCode ? { errorCode } : {}),
          ...(Object.keys(resultContext).length ? { context: resultContext } : {}),
          ...(stynx ? { stynx } : {}),
        };
        const storedReceipt: SyncItemReceipt = {
          queueItemId,
          status,
          ...(errorCode ? { errorCode } : {}),
          ...(receiptContext ? { context: receiptContext } : {}),
          ...(stynx ? { stynx } : {}),
        };
        const storedItem = queueItemId === item.queueItemId ? saved : { ...saved, queueItemId };
        this.assertFrameComplete(itemFrame);
        this.writeProjection(this.queueItems, this.key(scope.tenantId, queueItemId), {
          ...storedItem,
          idempotencyKey: key,
        } as StoredSyncQueueItem);
        if (!reapplying)
          this.writeProjection(
            this.queueBatches,
            this.key(scope.tenantId, queueItemId),
            input.deviceBatchId,
          );
        this.writeProjection(this.itemReceipts, itemKey, {
          hash: item.payloadHash,
          batchKey: reapplying ? previous.batchKey : identity,
          receipt: storedReceipt,
          item: storedItem,
          deviceBatchId: reapplying ? previous.deviceBatchId : input.deviceBatchId,
          receivedAt: previous?.receivedAt ?? now,
        });
        if (
          coveringReservationKey &&
          serverEntityId !== undefined &&
          ['applied', 'conflict'].includes(status) &&
          item.reservedNumber !== undefined
        ) {
          const entries = this.consumption.get(coveringReservationKey)!;
          const entry = entries.get(item.reservedNumber)!;
          entries.set(item.reservedNumber, {
            ...entry,
            status: 'applied',
            serverEntityId,
            finalizedAt: now,
          });
        }
        stored.push(saved);
        itemReceipts.push(itemReceipt);
      };
      for (const item of input.items) {
        await this.ownedFrame(scope, (frame) => processItem(item, frame));
        // CTG9 commits each completed item; a later fatal item cannot undo its effects.
        this.mutationContext.getStore()!.changes = [];
      }
      const finalReceipt: SyncBatchReceipt = {
        ...receipt,
        status: retryable ? 'open' : 'closed',
        items: itemReceipts,
        responseStatus: retryable ? null : 201,
        responseBodyBytes: null,
        responseHeaders: captureReplayableHeaders(runtime.transport),
      };
      const result: CTG9SubmitSyncBatchResult = {
        batchId: input.deviceBatchId,
        acceptedItems: input.items.length,
        duplicateItems: duplicates,
        conflicts: stored
          .filter((value) => value.status === 'conflict')
          .map((value) => value.queueItemId),
        items: stored,
        receipt: finalReceipt,
      };
      record.receipt = retryable
        ? finalReceipt
        : { ...finalReceipt, responseBodyBytes: Buffer.from(JSON.stringify(result)) };
      if (!retryable) record.result = result;
      return result;
    };
    record.promise = this.mutateTenant(scope, run, true);
    try {
      return await this.checkedAwait(scope, record.promise);
    } finally {
      delete record.promise;
    }
  }

  async listSyncBatchReceipts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncBatchReceiptsInput,
  ): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
    return pageOf(
      [...this.batches.entries()]
        .filter(
          ([key, { receipt }]) =>
            key.startsWith(`${scope.tenantId}:`) &&
            (input.deviceId === undefined || receipt.deviceId === input.deviceId) &&
            (input.status === undefined || receipt.status === input.status),
        )
        .map(([, { receipt, createdAt }]) => ({
          key: [sortInstantOf(createdAt), receipt.deviceId, receipt.deviceBatchId],
          value: {
            deviceId: receipt.deviceId,
            deviceBatchId: receipt.deviceBatchId,
            batchSequence: receipt.batchSequence,
            status: receipt.status,
            responseStatus: receipt.responseStatus,
            createdAt: new Date(createdAt).toISOString(),
          },
        })),
      3,
      input.cursor,
      input.limit,
    );
  }

  async listSyncItemReceipts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncItemReceiptsInput,
  ): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
    const prefix = `${scope.tenantId}:`;
    return pageOf(
      [...this.itemReceipts.entries()]
        .filter(
          ([key, record]) =>
            key.startsWith(prefix) &&
            (input.deviceId === undefined || record.item.deviceId === input.deviceId) &&
            (input.deviceBatchId === undefined || record.deviceBatchId === input.deviceBatchId) &&
            (input.status === undefined || record.receipt.status === input.status),
        )
        .map(([key, record]) => {
          const receiptId = key.slice(prefix.length);
          return {
            key: [sortInstantOf(record.receivedAt), receiptId],
            value: {
              ...record.receipt,
              queueItemId: record.item.queueItemId,
              receiptId,
              deviceId: record.item.deviceId,
              deviceBatchId: record.deviceBatchId,
              payloadHash: record.hash,
              receivedAt: new Date(record.receivedAt).toISOString(),
            },
          };
        }),
      2,
      input.cursor,
      input.limit,
    );
  }

  async listSyncQueueItems(
    scope: TrustedOfflineSyncScope,
    input: ListSyncQueueItemsInput,
  ): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
    return pageOf(
      [...this.queueItems.entries()]
        .filter(
          ([key, item]) =>
            key.startsWith(`${scope.tenantId}:`) &&
            (input.deviceId === undefined || item.deviceId === input.deviceId) &&
            (input.status === undefined || item.status === input.status) &&
            (input.entityType === undefined || item.entityType === input.entityType),
        )
        .map(([key, item]) => {
          const stynx = this.itemReceipts.get(this.key(scope.tenantId, item.idempotencyKey))
            ?.receipt.stynx;
          return {
            key: [sortInstantOf(item.receivedAt), item.queueItemId],
            value: {
              ...item,
              deviceBatchId: this.queueBatches.get(key)!,
              ...(stynx ? { stynx } : {}),
            },
          };
        }),
      2,
      input.cursor,
      input.limit,
    );
  }

  async listSyncConflictActions(
    scope: TrustedOfflineSyncScope,
    input: ListSyncConflictActionsInput,
  ): Promise<OfflineSyncPage<SyncConflictActionRecord>> {
    return pageOf(
      this.conflictActions
        .filter(
          ({ record }) =>
            record.tenantId === scope.tenantId && record.conflictId === input.conflictId,
        )
        .map(({ record, sequence }) => ({
          key: [sortInstantOf(record.createdAt), sequence],
          value: record,
        })),
      2,
      input.cursor,
      input.limit,
    );
  }

  async listSyncConflicts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncConflictsInput,
  ): Promise<OfflineSyncPage<SyncConflictRecord>> {
    const deviceOf = (conflict: SyncConflict): string =>
      this.queueItems.get(this.key(scope.tenantId, conflict.queueItemId))!.deviceId;
    return pageOf(
      [...this.conflicts.entries()]
        .filter(
          ([key, conflict]) =>
            key.startsWith(`${scope.tenantId}:`) &&
            (input.status === undefined || conflict.status === input.status) &&
            (input.conflictType === undefined || conflict.conflictType === input.conflictType) &&
            (input.queueItemId === undefined || conflict.queueItemId === input.queueItemId) &&
            (input.deviceId === undefined || deviceOf(conflict) === input.deviceId),
        )
        .map(([key, conflict]) => {
          const createdAt = this.conflictCreatedAt.get(key)!;
          const stynx = this.conflictStynx.get(key);
          return {
            key: [sortInstantOf(createdAt), conflict.conflictId],
            value: {
              ...conflict,
              deviceId: deviceOf(conflict),
              createdAt: new Date(createdAt).toISOString(),
              ...(stynx ? { stynx } : {}),
            },
          };
        }),
      2,
      input.cursor,
      input.limit,
    );
  }

  private saveConflict(
    conflict: SyncConflict,
    now: string,
    allowedActions?: readonly string[],
    stynx?: OfflineSyncStynxContext,
    domainContext?: Record<string, unknown>,
  ): void {
    const key = this.key(conflict.tenantId, conflict.conflictId);
    this.writeProjection(this.conflicts, key, conflict);
    this.writeProjection(this.conflictCreatedAt, key, now);
    if (allowedActions) this.writeProjection(this.conflictAllowedActions, key, allowedActions);
    if (stynx) this.writeProjection(this.conflictStynx, key, stynx);
    if (domainContext)
      this.writeProjection(this.conflictDomainContexts, key, structuredClone(domainContext));
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
