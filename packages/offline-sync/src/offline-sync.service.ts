import { Inject, Injectable, Logger } from '@nestjs/common';
import { OfflineSyncConfigurationError, OfflineSyncError } from './errors';
import {
  STYNX_OFFLINE_SYNC_CONTEXT,
  STYNX_OFFLINE_SYNC_OPTIONS,
  STYNX_OFFLINE_SYNC_STORE,
} from './tokens';
import type {
  CancelNumberingReservationInput,
  NumberingReservation,
  OfflineSyncContextPort,
  OfflineSyncStore,
  OpenSyncConflictInput,
  ReserveNumberingInput,
  ResolveSyncConflictInput,
  StynxOfflineSyncModuleOptions,
  SubmitSyncBatchInput,
  SubmitSyncBatchResult,
  SyncConflict,
  CTG9SubmitSyncBatchInput,
  CTG9SubmitSyncBatchResult,
  SubmitSyncBatchOptions,
  OfflineSyncDurableStore,
  CTG9NumberingReservation,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  SettleNumberingInput,
  NumberingConsumptionResult,
  SyncBatchReceipt,
  SyncItemReceipt,
  TrustedOfflineSyncScope,
  DurableBatchExecutionOptions,
  ListSyncBatchReceiptsInput, ListSyncConflictsInput, ListSyncItemReceiptsInput, ListSyncQueueItemsInput,
  OfflineSyncListInput, OfflineSyncPage, SyncBatchReceiptSummary, SyncConflictRecord, SyncItemReceiptRecord, SyncQueueItemRecord,
} from './types';
import { canonicalPayloadHash, listDefaultLimit, listMaxLimit } from './listing';
import { OFFLINE_SYNC_NO_SHIFT } from './numbering';

const queueStatuses = ['received', 'applied', 'conflict', 'rejected'];

@Injectable()
export class OfflineSyncService {
  constructor(
    @Inject(STYNX_OFFLINE_SYNC_STORE) private readonly store: OfflineSyncStore,
    @Inject(STYNX_OFFLINE_SYNC_CONTEXT) private readonly context: OfflineSyncContextPort,
    @Inject(STYNX_OFFLINE_SYNC_OPTIONS)
    private readonly options: StynxOfflineSyncModuleOptions,
  ) {}

  async reserveNumbering(input: ReserveNumberingInput): Promise<NumberingReservation> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.shiftId, 'shiftId');
    if (input.shiftId.startsWith('stynx:') && input.shiftId !== OFFLINE_SYNC_NO_SHIFT) this.invalid('shiftId uses a reserved namespace.');
    this.assertEntityType(input.entityType);
    if (input.idempotencyKey !== undefined) {
      this.assertText(input.idempotencyKey, 'idempotencyKey');
      if (Buffer.byteLength(input.idempotencyKey) > 255) this.invalid('idempotencyKey must not exceed 255 bytes.');
    }
    if (
      !Number.isSafeInteger(input.requestedSize) ||
      input.requestedSize < 1 ||
      input.requestedSize > 100
    ) {
      this.invalid('requestedSize must be an integer between 1 and 100.');
    }
    // A keyed retry is answered from the stored reservation before time- or policy-dependent checks.
    const keyed = input.idempotencyKey === undefined ? undefined : await this.reservationScope();
    if (keyed && this.store.replayNumberingReservation) {
      const replay = await this.store.replayNumberingReservation(keyed, input);
      if (replay) return replay;
    }
    const now = this.now();
    const scope = this.context.current();
    const policy = this.options.policyResolver ? await this.options.policyResolver.resolve({
      tenantId: scope.tenantId, orgUnitId: input.orgUnitId, operation: 'reserve-numbering', at: now,
    }) : undefined;
    const ttl = this.options.policyResolver ? policy?.reservationTtlMs : (this.options.reservationTtlMs ?? 86_400_000);
    if (ttl === undefined || !Number.isFinite(ttl) || ttl <= 0) this.invalid('reservation policy is missing.');
    const validUntil = new Date(Date.parse(now) + ttl).toISOString();
    if (input.validUntil && Date.parse(input.validUntil) <= Date.parse(now)) {
      this.invalid('validUntil must be later than the current time.');
    }
    return this.store.reserveNumbering(keyed ?? await this.reservationScope(), input, now, validUntil);
  }

  private async reservationScope(): Promise<TrustedOfflineSyncScope> {
    const scope = this.context.current();
    const agentId = this.options.agentResolver ? await this.options.agentResolver.resolve(scope, 'reserve-numbering') : scope.actorId;
    return this.options.policyResolver ? { ...scope, agentId } as TrustedOfflineSyncScope : scope;
  }

  async cancelNumberingReservation(
    reservationId: string,
    input: CancelNumberingReservationInput = {},
  ): Promise<NumberingReservation> {
    this.assertText(reservationId, 'reservationId');
    if (input.reason !== undefined && input.reason.length > 500) {
      this.invalid('reason must not exceed 500 characters.');
    }
    const scope = this.context.current();
    const cancelScope = this.options.policyResolver ? { ...scope, ctg9: true } : scope;
    return this.store.cancelNumberingReservation(
      cancelScope,
      reservationId,
      input,
      this.now(),
    );
  }

  async blockNumberingReservation(id: string, input: CancelNumberingReservationInput = {}): Promise<CTG9NumberingReservation> {
    return this.durable.blockNumberingReservation(this.context.current(), id, input, this.now());
  }
  async closeNumberingReservation(id: string, input: CancelNumberingReservationInput = {}): Promise<CTG9NumberingReservation> {
    return this.durable.closeNumberingReservation(this.context.current(), id, input, this.now());
  }
  async reconcileNumberingReservation(id: string, input: ReconcileNumberingInput): Promise<ReconcileNumberingResult> {
    return this.durable.reconcileNumberingReservation(this.context.current(), id, input, this.now());
  }
  async settleNumberingReservation(id: string, input: SettleNumberingInput = {}): Promise<CTG9NumberingReservation> {
    return this.durable.settleNumberingReservation(this.context.current(), id, input, this.now());
  }
  async getNumberingConsumption(id: string): Promise<NumberingConsumptionResult> {
    return this.durable.getNumberingConsumption(this.context.current(), id);
  }
  async getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt> {
    const receipt = await this.durable.getSyncBatchReceipt(this.context.current(), deviceId, deviceBatchId);
    if (!receipt) throw new OfflineSyncError('OFFLINE_SYNC_BATCH_CONFLICT', 404, 'Batch receipt was not found.');
    return receipt;
  }
  async getSyncItemReceipt(idempotencyKey: string): Promise<SyncItemReceipt> {
    const receipt = await this.durable.getSyncItemReceipt(this.context.current(), idempotencyKey);
    if (!receipt) throw new OfflineSyncError('OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND', 404, 'Item receipt was not found.');
    return receipt;
  }

  /** Tenant batch receipts, newest first (UPS-OFS-11). */
  async listSyncBatchReceipts(input: ListSyncBatchReceiptsInput = {}): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
    this.assertFilters(input, ['deviceId']);
    if (input.status !== undefined && !['open', 'closed', 'legacy_closed_unverified'].includes(input.status)) this.invalid('status is invalid.');
    return this.listing('listSyncBatchReceipts').call(this.durable, this.context.current(), this.page(input));
  }
  /** Tenant item receipts, newest first (UPS-OFS-11). */
  async listSyncItemReceipts(input: ListSyncItemReceiptsInput = {}): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
    this.assertFilters(input, ['deviceId', 'deviceBatchId']);
    if (input.status !== undefined && !queueStatuses.includes(input.status)) this.invalid('status is invalid.');
    return this.listing('listSyncItemReceipts').call(this.durable, this.context.current(), this.page(input));
  }
  /** Tenant queue items, newest first (UPS-OFS-11). */
  async listSyncQueueItems(input: ListSyncQueueItemsInput = {}): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
    this.assertFilters(input, ['deviceId', 'entityType']);
    if (input.status !== undefined && !queueStatuses.includes(input.status)) this.invalid('status is invalid.');
    return this.listing('listSyncQueueItems').call(this.durable, this.context.current(), this.page(input));
  }
  /** Tenant conflicts, newest first (UPS-OFS-11). */
  async listSyncConflicts(input: ListSyncConflictsInput = {}): Promise<OfflineSyncPage<SyncConflictRecord>> {
    this.assertFilters(input, ['deviceId', 'conflictType', 'queueItemId']);
    if (input.status !== undefined && !['open', 'resolved'].includes(input.status)) this.invalid('status is invalid.');
    return this.listing('listSyncConflicts').call(this.durable, this.context.current(), this.page(input));
  }

  async submitSyncBatch(input: SubmitSyncBatchInput): Promise<SubmitSyncBatchResult>;
  async submitSyncBatch(input: CTG9SubmitSyncBatchInput, options: SubmitSyncBatchOptions): Promise<CTG9SubmitSyncBatchResult>;
  async submitSyncBatch(input: SubmitSyncBatchInput | CTG9SubmitSyncBatchInput, options?: SubmitSyncBatchOptions): Promise<SubmitSyncBatchResult | CTG9SubmitSyncBatchResult> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.deviceBatchId, 'deviceBatchId');
    const scope = this.context.current();
    const now = this.now();
    const policy = this.options.policyResolver ? await this.options.policyResolver.resolve({
      tenantId: scope.tenantId, orgUnitId: input.orgUnitId, operation: 'submit-sync-batch', at: now,
    }) : undefined;
    if (this.options.policyResolver && this.options.concurrencyDetector && !policy?.concurrencyWindowMinutes) {
      Logger.warn('Offline sync concurrency window is unavailable; host detection policy must review this batch.', 'OfflineSyncService');
    }
    const maximum = this.options.policyResolver ? policy?.maxBatchItems : 100;
    if (!Array.isArray(input.items) || input.items.length < 1 || (maximum != null && input.items.length > maximum)) {
      this.invalid(maximum == null ? 'items must contain at least 1 queue item.' : `items must contain between 1 and ${maximum} queue items.`);
    }
    const queueIds = new Set<string>();
    const itemKeys = new Set<string>();
    for (const item of input.items) {
      this.assertText(item.queueItemId, 'queueItemId');
      this.assertEntityType(item.entityType);
      this.assertText(item.localEntityId, 'localEntityId');
      if (!this.options.policyResolver || item.idempotencyKey !== undefined) this.assertText(item.idempotencyKey as string, 'idempotencyKey');
      if (item.idempotencyKey?.startsWith('stynx:legacy:')) this.invalid('idempotencyKey uses a reserved namespace.');
      if (this.options.policyResolver && 'reservationId' in item && item.reservationId !== undefined &&
          (typeof item.reservationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.reservationId))) {
        this.invalid('reservationId must be a UUID.');
      }
      if (this.options.policyResolver && item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber)) {
        this.invalid('reservedNumber must be a safe integer.');
      }
      // ADR-MOBILE-OFFLINE-0003 D4: in CTG9 mode only the structure is a batch-wide 400; a non-canonical
      // value within bounds becomes a per-item integrity rejection in the durable store. E6 keeps the 400.
      if (this.options.policyResolver) {
        if (typeof item.payloadHash !== 'string' || item.payloadHash.length === 0 || Buffer.byteLength(item.payloadHash) > 255)
          this.invalid('payloadHash must be a string of 1 to 255 bytes.');
      } else if (!canonicalPayloadHash.test(item.payloadHash)) {
        this.invalid('payloadHash must be a canonical sha256-prefixed hexadecimal digest.');
      }
      if (!Number.isFinite(Date.parse(item.createdLocallyAt))) {
        this.invalid('createdLocallyAt must be an ISO-8601 timestamp.');
      }
      if (
        !item.payloadJson ||
        typeof item.payloadJson !== 'object' ||
        Array.isArray(item.payloadJson)
      ) {
        this.invalid('payloadJson must be an object.');
      }
      if (queueIds.has(item.queueItemId)) {
        this.invalid(`queueItemId ${item.queueItemId} appears more than once in the batch.`);
      }
      queueIds.add(item.queueItemId);
      if (this.options.policyResolver && item.idempotencyKey) {
        if (itemKeys.has(item.idempotencyKey)) this.invalid(`idempotencyKey ${item.idempotencyKey} appears more than once in the batch.`);
        itemKeys.add(item.idempotencyKey);
      }
    }
    if (!this.options.policyResolver) return this.store.submitSyncBatch(scope, input as SubmitSyncBatchInput, now);
    if (!this.options.itemApplier && input.items.some(item => item.idempotencyKey && item.reservedNumber !== undefined))
      throw new OfflineSyncConfigurationError('itemApplier');
    const agentId = this.options.agentResolver ? await this.options.agentResolver.resolve(scope, 'submit-sync-batch') : scope.actorId;
    const transport = options ?? { transportIdempotencyKey: `service:${input.deviceId}:${input.deviceBatchId}`, method: 'POST' as const, path: '/offline-sync/sync-batches' };
    const execution: DurableBatchExecutionOptions = {
      ...transport, agentId, policy: policy ?? {}, ports: this.options, transport,
    };
    return this.durable.submitDurableSyncBatch(scope, input, execution, now);
  }

  async openConflict(queueItemId: string, input: OpenSyncConflictInput): Promise<SyncConflict> {
    this.assertText(queueItemId, 'queueItemId');
    this.assertText(input.conflictType, 'conflictType');
    this.assertText(input.description, 'description');
    return this.store.openConflict(this.context.current(), queueItemId, input, this.now());
  }

  async resolveConflict(
    conflictId: string,
    input: ResolveSyncConflictInput,
  ): Promise<SyncConflict> {
    this.assertText(conflictId, 'conflictId');
    if (!this.options.conflictResolver && !['device-wins', 'server-wins', 'manual-review'].includes(input.resolution)) {
      this.invalid('resolution must be device-wins, server-wins or manual-review.');
    }
    if (this.options.conflictResolver) {
      const scope = this.context.current();
      const specialized = this.store as OfflineSyncStore & { resolveWithPort?: (scope: TrustedOfflineSyncScope, id: string, input: ResolveSyncConflictInput, now: string, port: NonNullable<StynxOfflineSyncModuleOptions['conflictResolver']>) => Promise<SyncConflict> };
      if (specialized.resolveWithPort) return specialized.resolveWithPort(scope,conflictId,input,this.now(),this.options.conflictResolver);
      return this.options.conflictResolver.resolve({} as import('@stynx-nyx/data').Transaction, conflictId, input.resolution, { ...scope, agentId: scope.actorId, orgUnitId: '', deviceId: '', batchId: '', now: this.now() });
    }
    return this.store.resolveConflict(this.context.current(), conflictId, input, this.now());
  }

  private get durable(): OfflineSyncDurableStore { return this.store as OfflineSyncDurableStore; }

  private listing<K extends 'listSyncBatchReceipts' | 'listSyncItemReceipts' | 'listSyncQueueItems' | 'listSyncConflicts'>(name: K): NonNullable<OfflineSyncDurableStore[K]> {
    const operation = this.durable[name];
    if (typeof operation !== 'function') throw new OfflineSyncConfigurationError(name);
    return operation as NonNullable<OfflineSyncDurableStore[K]>;
  }

  private assertFilters(input: object, fields: readonly string[]): void {
    for (const field of fields) {
      const value = (input as Record<string, unknown>)[field];
      if (value !== undefined) this.assertText(value as string, field);
    }
  }

  private page<T extends OfflineSyncListInput>(input: T): T & { limit: number } {
    const limit = input.limit ?? listDefaultLimit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > listMaxLimit) this.invalid(`limit must be an integer between 1 and ${listMaxLimit}.`);
    if (input.cursor !== undefined) this.assertText(input.cursor, 'cursor');
    return { ...input, limit };
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }

  private assertEntityType(value: string): void {
    this.assertText(value, 'entityType');
    if (value.length > 100) this.invalid('entityType must not exceed 100 characters.');
  }

  private assertText(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.invalid(`${field} is required.`);
    }
  }

  private invalid(message: string): never {
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, message);
  }
}
