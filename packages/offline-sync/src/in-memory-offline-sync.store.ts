import { createHash, randomUUID } from 'node:crypto';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { OfflineSyncConfigurationError, OfflineSyncError, OfflineSyncNumberingOutcome } from './errors';
import { applyReplayResponse, batchContextFingerprint, captureReplayableHeaders, transportCompositeKey, transportFingerprint } from './transport';
import type {
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
  OfflineSyncDurableStore, CTG9NumberingReservation, ReconcileNumberingInput,
  ReconcileNumberingResult, SettleNumberingInput, NumberingConsumptionResult,
  NumberingConsumptionEntry, CTG9SubmitSyncBatchInput, CTG9SubmitSyncBatchResult,
  DurableBatchExecutionOptions, SubmitSyncBatchOptions, SyncBatchReceipt, SyncItemReceipt,
  OfflineSyncConflictResolver,
} from './types';

/** Deterministic process-local store for tests and sandbox wiring. */
export class InMemoryOfflineSyncStore implements OfflineSyncDurableStore {
  private readonly ranges = new Map<string, NumberingRange>();
  private readonly reservations = new Map<string, NumberingReservation>();
  private readonly queueItems = new Map<string, StoredSyncQueueItem>();
  private readonly payloadIndex = new Map<string, string>();
  private readonly e6Items = new Map<string, {item:StoredSyncQueueItem;batchKey:string}>();
  private readonly conflicts = new Map<string, SyncConflict>();
  private readonly consumption = new Map<string, Map<number, NumberingConsumptionEntry>>();
  private readonly itemReceipts = new Map<string, { hash: string; batchKey: string; receipt: SyncItemReceipt; item: CTG9SubmitSyncBatchResult['items'][number] }>();
  private readonly batches = new Map<string, { contextHash: string; receipt: SyncBatchReceipt; result?: CTG9SubmitSyncBatchResult; promise?: Promise<CTG9SubmitSyncBatchResult>; transportKey: string; fingerprint: string }>();
  private readonly transport = new Map<string, { batchIdentity: string; fingerprint: string }>();

  seedNumberingRange(range: NumberingRange): void {
    this.ranges.set(this.key(range.tenantId, range.id), { ...range });
  }

  async reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    _now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation> {
    const range = [...this.ranges.values()].find(
      (candidate) =>
        candidate.tenantId === scope.tenantId &&
        (input.rangeId
          ? candidate.id === input.rangeId
          : candidate.orgUnitId === input.orgUnitId &&
            candidate.entityType === input.entityType &&
            (!input.series || candidate.series === input.series)),
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
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_UNAVAILABLE',
        409,
        'The selected numbering range is not active for this entity and organizational unit.',
      );
    }
    const endNumber = range.nextNumber + input.requestedSize - 1;
    if (endNumber > range.endNumber) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_UNAVAILABLE',
        409,
        'The selected numbering range has insufficient capacity.',
      );
    }
    this.ranges.set(this.key(scope.tenantId, range.id), {
      ...range,
      nextNumber: endNumber + 1,
      status: endNumber === range.endNumber ? 'exhausted' : 'active',
    });
    const reservation: NumberingReservation = {
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
    const entries = new Map<number, NumberingConsumptionEntry>();
    for (let number = reservation.startNumber; number <= reservation.endNumber; number += 1) entries.set(number, { number, status: 'available', serverEntityId: null, finalizedAt: null });
    this.consumption.set(this.key(scope.tenantId, reservation.reservationId), entries);
    return reservation;
  }

  async cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    _input: CancelNumberingReservationInput,
    _now: string,
  ): Promise<NumberingReservation> {
    const key = this.key(scope.tenantId, reservationId);
    const reservation = this.reservations.get(key);
    if (!reservation) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        `Numbering reservation ${reservationId} was not found.`,
      );
    }
    if (reservation.status === 'cancelled' && (scope as TrustedOfflineSyncScope & { ctg9?: boolean }).ctg9) return reservation;
    if (reservation.status !== 'reserved') {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        `Numbering reservation ${reservationId} is ${reservation.status}; expected reserved.`,
      );
    }
    const cancelled: NumberingReservation = { ...reservation, status: 'cancelled' };
    this.reservations.set(key, cancelled);
    if ((scope as TrustedOfflineSyncScope & { ctg9?: boolean }).ctg9) {
      const rangeKey = this.key(scope.tenantId, reservation.rangeId);
      const range = this.ranges.get(rangeKey);
      const entries = this.consumption.get(key)!;
      const highestApplied = Math.max(reservation.startNumber - 1, ...[...entries.values()].filter(entry => ['applied','claimed-locally'].includes(entry.status)).map(entry => entry.number));
      if (range && range.nextNumber === reservation.endNumber + 1) this.ranges.set(rangeKey, { ...range, nextNumber: highestApplied + 1, status: 'active' });
      for (const [number,entry] of entries) if (entry.status === 'available') entries.set(number,{...entry,status:'expired'});
    }
    return cancelled;
  }

  async submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult> {
    const stored: StoredSyncQueueItem[] = [];
    let duplicateItems = 0;
    for (const item of input.items) {
      const payloadKey = this.key(scope.tenantId, item.payloadHash);
      const existingId = this.payloadIndex.get(payloadKey);
      if (existingId) {
        const existing = this.queueItems.get(this.key(scope.tenantId, existingId));
        if (existing) {
          duplicateItems += 1;
          stored.push(existing);
          continue;
        }
      }
      const itemKey = this.key(scope.tenantId, item.queueItemId);
      const reused = this.queueItems.get(itemKey);
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
      this.queueItems.set(itemKey, queueItem);
      this.e6Items.set(this.key(scope.tenantId,item.idempotencyKey),{
        item:queueItem,batchKey:this.key(scope.tenantId,`${input.deviceId}:${input.deviceBatchId}`)});
      this.payloadIndex.set(payloadKey, item.queueItemId);
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
  }

  async openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    _now: string,
  ): Promise<SyncConflict> {
    const queueKey = this.key(scope.tenantId, queueItemId);
    const item = this.queueItems.get(queueKey);
    if (!item) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
        404,
        `Sync queue item ${queueItemId} was not found.`,
      );
    }
    this.queueItems.set(queueKey, { ...item, status: 'conflict' });
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
    this.conflicts.set(this.key(scope.tenantId, conflict.conflictId), conflict);
    return conflict;
  }

  async resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    const conflictKey = this.key(scope.tenantId, conflictId);
    const conflict = this.conflicts.get(conflictKey);
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
    this.conflicts.set(conflictKey, resolved);
    const queueKey = this.key(scope.tenantId, conflict.queueItemId);
    const queueItem = this.queueItems.get(queueKey);
    if (queueItem) {
      this.queueItems.set(queueKey, {
        ...queueItem,
        status: input.resolution === 'server-wins' ? 'rejected' : 'applied',
      });
    }
    return resolved;
  }

  async resolveWithPort(scope: TrustedOfflineSyncScope, id: string, input: ResolveSyncConflictInput, now: string, port: OfflineSyncConflictResolver): Promise<SyncConflict> {
    const key = this.key(scope.tenantId,id);
    const conflict = this.conflicts.get(key);
    if (!conflict) throw new OfflineSyncError('OFFLINE_SYNC_CONFLICT_NOT_FOUND',404,'Conflict was not found.');
    if (conflict.status !== 'open') throw new OfflineSyncError('OFFLINE_SYNC_CONFLICT_STATE',409,'Conflict is already resolved.');
    const item = this.queueItems.get(this.key(scope.tenantId,conflict.queueItemId))!;
    const context = {...scope,agentId:item.agentId,orgUnitId:item.orgUnitId,
      deviceId:item.deviceId,batchId:'',now};
    const trx = {token:randomUUID()} as unknown as import('@stynx-nyx/data').Transaction;
    const receipt = [...this.itemReceipts.values()].find(value => value.item.queueItemId === conflict.queueItemId)?.receipt;
    const allowed = receipt?.context?.allowedActions as readonly string[] | undefined ??
      await port.allowedActions?.(trx,id,context) ?? ['device-wins','server-wins','manual-review'];
    if (!allowed.includes(input.resolution)) throw new OfflineSyncError('OFFLINE_SYNC_CONFLICT_RESOLUTION',409,'Resolution action is not allowed.');
    const resolved = await port.resolve(trx,id,input.resolution,context);
    if (resolved.status !== 'resolved') throw new OfflineSyncError('OFFLINE_SYNC_CONFLICT_RESOLUTION',409,'Conflict resolver did not resolve the conflict.');
    const saved = {...resolved,resolution:input.resolution,resolvedBy:scope.actorId,resolvedAt:now};
    this.conflicts.set(key,saved);
    return saved;
  }

  getQueueItem(tenantId: string, queueItemId: string): StoredSyncQueueItem | undefined {
    return this.queueItems.get(this.key(tenantId, queueItemId));
  }

  async blockNumberingReservation(scope: TrustedOfflineSyncScope, id: string, _input: CancelNumberingReservationInput, _now: string): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'blocked');
  }

  async closeNumberingReservation(scope: TrustedOfflineSyncScope, id: string, _input: CancelNumberingReservationInput, _now: string): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'consumed');
  }

  async settleNumberingReservation(scope: TrustedOfflineSyncScope, id: string, _input: SettleNumberingInput, _now: string): Promise<CTG9NumberingReservation> {
    return this.transitionReservation(scope, id, 'consumed');
  }

  private transitionReservation(scope: TrustedOfflineSyncScope, id: string, status: 'blocked' | 'consumed'): CTG9NumberingReservation {
    const key = this.key(scope.tenantId, id);
    const current = this.reservations.get(key);
    if (!current) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND', 404, 'Reservation was not found.');
    if (current.status === status) return current;
    if (!['reserved', 'expired'].includes(current.status)) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_STATE', 409, 'Reservation cannot transition from its current state.');
    const changed = { ...current, status };
    this.reservations.set(key, changed as NumberingReservation);
    const entries = this.consumption.get(key)!;
    for (const [number, entry] of entries) if (entry.status === 'available') entries.set(number, { ...entry, status: status === 'blocked' ? 'blocked' : 'expired' });
    return changed;
  }

  async reconcileNumberingReservation(scope: TrustedOfflineSyncScope, id: string, input: ReconcileNumberingInput, _now: string): Promise<ReconcileNumberingResult> {
    const key = this.key(scope.tenantId, id);
    const reservation = this.reservations.get(key);
    const entries = this.consumption.get(key);
    if (!reservation || !entries) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND', 404, 'Reservation was not found.');
    for (const number of input.claimedNumbers ?? []) {
      if (!entries.has(number)) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'Claimed number is outside the reservation.');
    }
    const claims = new Set(input.claimedNumbers ?? []);
    for (const [number, entry] of entries) if (claims.has(number) && entry.status === 'available') entries.set(number, { ...entry, status: 'claimed-locally' });
    const consumption = [...entries.values()];
    return { reservationId: id, status: reservation.status, consumption,
      missingOnServer: consumption.filter(entry => claims.has(entry.number) && entry.status !== 'applied').map(entry => entry.number),
      unexpectedOnServer: consumption.filter(entry => !claims.has(entry.number) && entry.status === 'applied').map(entry => entry.number) };
  }

  async getNumberingConsumption(scope: TrustedOfflineSyncScope, id: string): Promise<NumberingConsumptionResult> {
    const key = this.key(scope.tenantId, id);
    const reservation = this.reservations.get(key);
    if (!reservation) throw new OfflineSyncError('OFFLINE_SYNC_RESERVATION_NOT_FOUND', 404, 'Reservation was not found.');
    return { reservationId: id, status: reservation.status, consumption: [...this.consumption.get(key)!.values()] };
  }

  async getSyncBatchReceipt(scope: TrustedOfflineSyncScope, deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt | null> {
    return this.batches.get(this.key(scope.tenantId, `${deviceId}:${deviceBatchId}`))?.receipt ?? null;
  }

  async getSyncItemReceipt(scope: TrustedOfflineSyncScope, idempotencyKey: string): Promise<SyncItemReceipt | null> {
    return this.itemReceipts.get(this.key(scope.tenantId, idempotencyKey))?.receipt ?? null;
  }

  async submitDurableSyncBatch(scope: TrustedOfflineSyncScope, input: CTG9SubmitSyncBatchInput, options: SubmitSyncBatchOptions, now: string): Promise<CTG9SubmitSyncBatchResult> {
    const supplied = options as Partial<DurableBatchExecutionOptions>;
    const runtime: DurableBatchExecutionOptions = {
      ...options, agentId: supplied.agentId ?? scope.actorId,
      policy: supplied.policy ?? {}, ports: supplied.ports ?? {},
      transport: supplied.transport ?? options,
    };
    const itemKeys = new Map<string,string>();
    const declaredKeys = new Set<string>();
    for (const item of input.items) {
      if (item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber))
        throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'reservedNumber must be a safe integer.');
      if (item.idempotencyKey?.startsWith('stynx:legacy:')) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Reserved item namespace.');
      let key = item.idempotencyKey;
      if (!key) {
        const identityText = runtime.ports.legacyItemIdentityResolver ? await runtime.ports.legacyItemIdentityResolver.resolve({ tenantId: scope.tenantId, deviceId: input.deviceId, deviceBatchId: input.deviceBatchId, queueItemId: item.queueItemId, localEntityId: item.localEntityId, entityType: item.entityType }) : [input.deviceId, input.deviceBatchId, item.queueItemId].join('\0');
        if (!identityText) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Legacy identity is empty.');
        key = `stynx:legacy:v1:${createHash('sha256').update(`${scope.tenantId}\0${identityText}`).digest('hex')}`;
      }
      if (declaredKeys.has(key)) throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT',400,'Item identity appears more than once in the batch.');
      declaredKeys.add(key);
      itemKeys.set(item.queueItemId,key);
    }
    if (!runtime.ports.itemApplier && input.items.some(item => item.idempotencyKey && item.reservedNumber !== undefined))
      throw new OfflineSyncConfigurationError('itemApplier');
    if (runtime.ports.itemApplier && !runtime.ports.eventPort)
      throw new OfflineSyncConfigurationError('eventPort');
    const identity = this.key(scope.tenantId, `${input.deviceId}:${input.deviceBatchId}`);
    const contextHash = batchContextFingerprint(input,runtime.agentId);
    const fingerprint = transportFingerprint(runtime.transport, input);
    const transportKey = transportCompositeKey(scope, runtime.transport);
    const prior = this.batches.get(identity);
    if (prior) {
      if (prior.contextHash !== contextHash) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch context differs from the original.');
      const bound = this.transport.get(transportKey);
      if (bound && bound.fingerprint !== fingerprint)
        throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
      if (bound && bound.batchIdentity !== identity)
        throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT',409,'Transport key belongs to another batch.');
      this.transport.set(transportKey,{batchIdentity:identity,fingerprint});
      if (prior.result) { applyReplayResponse(runtime.transport,runtime.ports,prior.receipt.responseStatus!,prior.receipt.responseHeaders); return prior.result; }
      if (prior.promise) {
        const waited = await Promise.race([prior.promise.then(value => ({ value })), new Promise<{ value?: CTG9SubmitSyncBatchResult }>(resolve => setTimeout(() => resolve({}), runtime.ports.leaseWaitMs ?? 750))]);
        if (waited.value) { applyReplayResponse(runtime.transport,runtime.ports,prior.receipt.responseStatus!,prior.receipt.responseHeaders); return waited.value; }
        throw new OfflineSyncError('OFFLINE_SYNC:BATCH:in-progress', 503, 'Batch is in progress.', true);
      }
    }
    if (!prior && input.batchSequence != null) {
      const siblings = [...this.batches.entries()].filter(([key]) => key.startsWith(`${scope.tenantId}:`)).map(([,value]) => value.receipt).filter(receipt => receipt.deviceId === input.deviceId);
      if (siblings.some(receipt => receipt.batchSequence === input.batchSequence)) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch sequence is already used.');
      const expected = Math.max(0, ...siblings.map(receipt => receipt.batchSequence ?? 0)) + 1;
      if (input.batchSequence !== expected) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_SEQUENCE', 422, `Expected batch sequence ${expected}; received ${input.batchSequence}.`);
    }
    const bound = this.transport.get(transportKey);
    if (!prior && bound?.fingerprint !== undefined && bound.fingerprint !== fingerprint) throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
    if (!prior && bound && bound.batchIdentity !== identity) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT',409,'Transport key belongs to another batch.');
    const receipt: SyncBatchReceipt = prior?.receipt ?? { deviceId: input.deviceId, deviceBatchId: input.deviceBatchId, batchSequence: input.batchSequence ?? null, status: 'open', items: [], responseStatus: null, responseBodyBytes: null, responseHeaders: {} };
    const record = (prior ?? { contextHash, receipt, transportKey, fingerprint }) as { contextHash: string; receipt: SyncBatchReceipt; result?: CTG9SubmitSyncBatchResult; promise?: Promise<CTG9SubmitSyncBatchResult>; transportKey: string; fingerprint: string };
    this.batches.set(identity, record);
    this.transport.set(transportKey,{batchIdentity:identity,fingerprint});
    const run = async (): Promise<CTG9SubmitSyncBatchResult> => {
      const stored: CTG9SubmitSyncBatchResult['items'][number][] = [];
      const itemReceipts: SyncItemReceipt[] = [];
      let duplicates = 0;
      let retryable = false;
      for (const item of input.items) {
        const key = itemKeys.get(item.queueItemId)!;
        const previousQueue = this.queueItems.get(this.key(scope.tenantId,item.queueItemId));
        if (previousQueue && previousQueue.idempotencyKey !== key) {
          const rejected = { ...item, tenantId:scope.tenantId,agentId:runtime.agentId,orgUnitId:input.orgUnitId,
            deviceId:input.deviceId,status:'rejected' as const,receivedAt:now,errorCode:'OFFLINE_SYNC_QUEUE_ID_REUSED' };
          stored.push(rejected);
          itemReceipts.push({queueItemId:item.queueItemId,status:'rejected',errorCode:'OFFLINE_SYNC_QUEUE_ID_REUSED'});
          continue;
        }
        const itemKey = this.key(scope.tenantId, key);
        const e6 = this.e6Items.get(itemKey);
        if (e6) {
          const legacy = this.queueItems.get(this.key(scope.tenantId,e6.item.queueItemId))!;
          const sameHash = legacy.payloadHash === item.payloadHash;
          if (sameHash && e6.batchKey !== identity) duplicates += 1;
          const legacyReceived = sameHash && legacy.status === 'received';
          const status: SyncItemReceipt['status'] = !sameHash || legacyReceived ? 'rejected' : legacy.status;
          const errorCode = !sameHash ? 'OFFLINE_SYNC_ITEM_INTEGRITY' : legacyReceived ? 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' : undefined;
          const context = legacy.queueItemId !== item.queueItemId ? {originalQueueItemId:legacy.queueItemId} : undefined;
          const originalReceipt: SyncItemReceipt={queueItemId:legacy.queueItemId,status:legacy.status};
          this.itemReceipts.set(itemKey,{hash:legacy.payloadHash,batchKey:e6.batchKey,receipt:originalReceipt,item:legacy});
          stored.push({...item,tenantId:scope.tenantId,agentId:runtime.agentId,orgUnitId:input.orgUnitId,
            deviceId:input.deviceId,status,receivedAt:now,...(errorCode ? {errorCode} : {}),...(context ? {context} : {})});
          itemReceipts.push({queueItemId:item.queueItemId,status,...(errorCode ? {errorCode} : {}),...(context ? {context} : {})});
          continue;
        }
        const previous = this.itemReceipts.get(itemKey);
        if (previous) {
          if (previous.batchKey !== identity && previous.hash === item.payloadHash) duplicates += 1;
          if (previous.hash === item.payloadHash && (previous.batchKey !== identity || previous.receipt.status !== 'received' || !item.idempotencyKey)) {
            if (previous.receipt.status === 'received' && item.idempotencyKey && runtime.ports.itemApplier) retryable = true;
            stored.push({ ...previous.item, queueItemId:item.queueItemId }); itemReceipts.push({ ...previous.receipt, queueItemId:item.queueItemId,
              ...(previous.item.queueItemId !== item.queueItemId ? {context:{originalQueueItemId:previous.item.queueItemId}} : {}) }); continue;
          }
          if (previous.hash !== item.payloadHash) {
          const rejected = { ...previous.item, queueItemId: item.queueItemId, status: 'rejected' as const, errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' };
          stored.push(rejected);
          itemReceipts.push({ queueItemId: item.queueItemId, status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' });
          continue;
          }
        }
        let status: SyncItemReceipt['status'] = 'received';
        let errorCode: string | undefined;
        let serverEntityId: string | undefined;
        let receiptContext: Record<string,unknown> | undefined;
        let coveringReservationKey: string | undefined;
        const itemContext = { ...scope, agentId: runtime.agentId, orgUnitId: input.orgUnitId, deviceId: input.deviceId, batchId: input.deviceBatchId, now };
        if (!item.idempotencyKey) errorCode = 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED';
        else {
          const trx = { token: randomUUID() } as unknown as import('@stynx-nyx/data').Transaction;
          try {
            const covering = item.reservedNumber === undefined ? [] : [...this.reservations.entries()].filter(([reservationKey,reservation]) => reservationKey.startsWith(`${scope.tenantId}:`) && reservation.deviceId === input.deviceId && reservation.orgUnitId === input.orgUnitId && reservation.entityType === item.entityType && reservation.startNumber <= item.reservedNumber! && item.reservedNumber! <= reservation.endNumber && (!item.reservationId || reservation.reservationId === item.reservationId) && (reservation.status !== 'cancelled' || ['applied','claimed-locally'].includes(this.consumption.get(reservationKey)?.get(item.reservedNumber!)?.status ?? '')));
            if (item.reservedNumber !== undefined && covering.length === 0) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_NO_COVERAGE',item.reservedNumber,item.reservationId ?? null);
            if (covering.length > 1) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_AMBIGUOUS',item.reservedNumber!,null);
            if (covering[0]) {
              const [reservationKey,reservation] = covering[0];
              coveringReservationKey = reservationKey;
              const entry = this.consumption.get(reservationKey)?.get(item.reservedNumber!);
              if (entry?.status === 'applied') throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',item.reservedNumber!,reservation.reservationId);
              if (reservation.status !== 'reserved' || Date.parse(reservation.validUntil) < Date.parse(item.createdLocallyAt)) throw new OfflineSyncNumberingOutcome('OFFLINE_SYNC_NUMBERING_EXPIRED',item.reservedNumber!,reservation.reservationId);
            }
            if (runtime.ports.itemApplier) {
            const applied = await runtime.ports.itemApplier.apply(trx, item, itemContext);
            serverEntityId = applied.serverEntityId;
            if (runtime.policy.concurrencyWindowMinutes && runtime.ports.concurrencyDetector) {
              const detected = await runtime.ports.concurrencyDetector.detect(trx, item, itemContext);
              if (detected.suspected) for (const pair of detected.pairs) {
                if (await runtime.ports.handoffPort?.permits(trx, pair, itemContext)) continue;
                for (const affected of [pair.firstItemId, pair.secondItemId]) {
                  const conflictId = randomUUID();
                  const relatedQueueItemId = affected === pair.firstItemId ? pair.secondItemId : pair.firstItemId;
                  const allowedActions = await runtime.ports.conflictResolver?.allowedActions?.(trx,conflictId,itemContext) ?? ['manual-review'];
                  const evidence = {conflictId,relatedQueueItemId,allowedActions};
                  for (const [storedKey, old] of this.itemReceipts) if (old.item.queueItemId === affected && storedKey.startsWith(`${scope.tenantId}:`)) {
                    this.itemReceipts.set(storedKey, { ...old, receipt: { ...old.receipt, status: 'conflict', context:evidence } });
                    const affectedQueue = this.queueItems.get(this.key(scope.tenantId,affected));
                    this.queueItems.set(this.key(scope.tenantId,affected),{...affectedQueue!,status:'conflict'});
                    this.conflicts.set(this.key(scope.tenantId,conflictId),{conflictId,tenantId:scope.tenantId,
                      queueItemId:affected,localEntityId:old.item.localEntityId,payloadHash:old.item.payloadHash,
                      conflictType:'concurrency',description:'Concurrent agent activity',status:'open'});
                  }
                  if (affected === item.queueItemId) {
                    receiptContext=evidence;
                    this.conflicts.set(this.key(scope.tenantId,conflictId),{conflictId,tenantId:scope.tenantId,
                      queueItemId:affected,localEntityId:item.localEntityId,payloadHash:item.payloadHash,
                      conflictType:'concurrency',description:'Concurrent agent activity',status:'open'});
                  }
                }
                if (pair.firstItemId === item.queueItemId || pair.secondItemId === item.queueItemId) status = 'conflict';
              }
            }
            if (status !== 'conflict') status = 'applied';
            await runtime.ports.eventPort!.appendInTransaction(trx, { entity: item.entityType, entityId: applied.serverEntityId, idempotencyKey: key, payload: item.payloadJson });
            }
          } catch (error) {
            const classified = error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500 &&
              !(error instanceof OfflineSyncError && error.code === 'OFFLINE_SYNC_BATCH_CONFLICT');
            const numbering = error instanceof OfflineSyncNumberingOutcome ? error : null;
            status = numbering?.receiptStatus ?? (classified ? 'rejected' : 'received');
            errorCode = (error as { code?: string }).code ?? 'OFFLINE_SYNC_ITEM_FAILED';
            if (numbering) {
              const conflictId = randomUUID();
              const allowedActions = await runtime.ports.conflictResolver?.allowedActions?.(trx,conflictId,itemContext) ?? ['reject','retry_after_correction'];
              receiptContext={...numbering.context,conflictId,allowedActions};
              this.conflicts.set(this.key(scope.tenantId,conflictId),{conflictId,tenantId:scope.tenantId,
                queueItemId:item.queueItemId,localEntityId:item.localEntityId,payloadHash:item.payloadHash,
                conflictType:'domain',description:numbering.code,status:'open'});
            }
            if (!classified) retryable = true;
          }
        }
        const saved: CTG9SubmitSyncBatchResult['items'][number] = { ...item, tenantId: scope.tenantId, agentId: runtime.agentId, orgUnitId: input.orgUnitId, deviceId: input.deviceId, status, receivedAt: now };
        const itemReceipt: SyncItemReceipt = { queueItemId: item.queueItemId, status, ...(errorCode ? { errorCode } : {}),...(receiptContext ? {context:receiptContext} : {}) };
        this.queueItems.set(this.key(scope.tenantId, item.queueItemId), { ...saved, idempotencyKey: key } as StoredSyncQueueItem);
        this.itemReceipts.set(itemKey, { hash: item.payloadHash, batchKey: identity, receipt: itemReceipt, item: saved });
        if (coveringReservationKey && serverEntityId !== undefined && ['applied','conflict'].includes(status) && item.reservedNumber !== undefined) {
          const entries = this.consumption.get(coveringReservationKey)!;
          const entry = entries.get(item.reservedNumber)!;
          entries.set(item.reservedNumber, { ...entry, status: 'applied', serverEntityId, finalizedAt: now });
        }
        stored.push(saved);
        itemReceipts.push(itemReceipt);
      }
      const finalReceipt: SyncBatchReceipt = { ...receipt, status: retryable ? 'open' : 'closed', items: itemReceipts, responseStatus: retryable ? null : 201, responseBodyBytes: null, responseHeaders: captureReplayableHeaders(runtime.transport) };
      const result: CTG9SubmitSyncBatchResult = { batchId: input.deviceBatchId, acceptedItems: input.items.length, duplicateItems: duplicates, conflicts: stored.filter(value => value.status === 'conflict').map(value => value.queueItemId), items: stored, receipt: finalReceipt };
      record.receipt = retryable ? finalReceipt : { ...finalReceipt, responseBodyBytes: Buffer.from(JSON.stringify(result)) };
      if (!retryable) record.result = result;
      return result;
    };
    record.promise = run();
    try { return await record.promise; } finally { delete record.promise; }
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
