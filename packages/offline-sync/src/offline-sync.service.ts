import { consumptionReadInstant } from './consumption-projection.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OfflineSyncConfigurationError, OfflineSyncError } from './errors.js';
import {
  STYNX_OFFLINE_SYNC_CONTEXT,
  STYNX_OFFLINE_SYNC_OPTIONS,
  STYNX_OFFLINE_SYNC_STORE,
} from './tokens.js';
import type {
  NumberingRange,
  CreateNumberingRangeInput,
  CancelNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRangePage,
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
  CTG9ReserveNumberingInput,
  ListNumberingReconciliationsInput,
  NumberingReconciliationRecord,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  SettleNumberingInput,
  NumberingConsumptionResult,
  SyncBatchReceipt,
  SyncItemReceipt,
  SyncIntegrityRejection,
  SyncIntegrityRejectionIdentity,
  TrustedOfflineSyncScope,
  DurableBatchExecutionOptions,
  ListSyncBatchReceiptsInput,
  ListSyncConflictActionsInput,
  ListSyncConflictsInput,
  ListSyncItemReceiptsInput,
  ListSyncQueueItemsInput,
  OfflineSyncListInput,
  OfflineSyncPage,
  SyncBatchReceiptSummary,
  SyncConflictActionRecord,
  SyncConflictRecord,
  SyncItemReceiptRecord,
  SyncQueueItemRecord,
} from './types.js';
import { canonicalPayloadHash, listDefaultLimit, listMaxLimit } from './listing.js';
import { OFFLINE_SYNC_NO_SHIFT } from './numbering.js';
import {
  rangeCreation,
  rangeIdentity,
  rangeList,
  rangeCancellation,
  rangeNotFound,
} from './range-administration.js';

const queueStatuses = ['received', 'applied', 'conflict', 'rejected', 'pending'];

// Keep the declared element type while retaining the runtime array check.
function isArrayValue(value: unknown): boolean {
  return Array.isArray(value);
}

// Preserve one ordinary property Get, including primitive boxing and the original receiver.
function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function')
    return Reflect.get(target, key, value);
  throw new TypeError('Property receiver is unavailable');
}

@Injectable()
export class OfflineSyncService {
  constructor(
    @Inject(STYNX_OFFLINE_SYNC_STORE) private readonly store: OfflineSyncStore,
    @Inject(STYNX_OFFLINE_SYNC_CONTEXT) private readonly context: OfflineSyncContextPort,
    @Inject(STYNX_OFFLINE_SYNC_OPTIONS)
    private readonly options: StynxOfflineSyncModuleOptions,
  ) {}

  async createNumberingRange(input: CreateNumberingRangeInput): Promise<NumberingRange> {
    const scope = this.context.current();
    const request = rangeCreation(scope, input).input;
    const operation = this.durable.createNumberingRange;
    if (typeof operation !== 'function')
      throw new OfflineSyncConfigurationError('createNumberingRange');
    return operation.call(this.store, scope, request, this.now());
  }

  async getNumberingRange(id: string): Promise<NumberingRange> {
    const scope = this.context.current();
    const key = rangeIdentity(id);
    const operation = this.durable.getNumberingRange;
    if (typeof operation !== 'function')
      throw new OfflineSyncConfigurationError('getNumberingRange');
    const range = await operation.call(this.store, scope, key);
    if (!range) throw rangeNotFound();
    return range;
  }

  async listNumberingRanges(input: ListNumberingRangesInput = {}): Promise<NumberingRangePage> {
    const scope = this.context.current();
    const request = rangeList(input);
    const operation = this.durable.listNumberingRanges;
    if (typeof operation !== 'function')
      throw new OfflineSyncConfigurationError('listNumberingRanges');
    return operation.call(this.store, scope, request);
  }

  async cancelNumberingRange(
    id: string,
    input: CancelNumberingRangeInput = {},
  ): Promise<NumberingRange> {
    const scope = this.context.current();
    const key = rangeIdentity(id);
    const request = rangeCancellation(input);
    const operation = this.durable.cancelNumberingRange;
    if (typeof operation !== 'function')
      throw new OfflineSyncConfigurationError('cancelNumberingRange');
    return operation.call(this.store, scope, key, request, this.now());
  }

  async reserveNumbering(input: ReserveNumberingInput): Promise<NumberingReservation> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.shiftId, 'shiftId');
    if (input.shiftId.startsWith('stynx:') && input.shiftId !== OFFLINE_SYNC_NO_SHIFT)
      this.invalid('shiftId uses a reserved namespace.');
    this.assertEntityType(input.entityType);
    if (input.idempotencyKey !== undefined) {
      this.assertText(input.idempotencyKey, 'idempotencyKey');
      if (Buffer.byteLength(input.idempotencyKey) > 255)
        this.invalid('idempotencyKey must not exceed 255 bytes.');
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
    const policy = this.options.policyResolver
      ? await this.options.policyResolver.resolve({
          tenantId: scope.tenantId,
          orgUnitId: input.orgUnitId,
          operation: 'reserve-numbering',
          at: now,
        })
      : undefined;
    const ttl = this.options.policyResolver
      ? policy?.reservationTtlMs
      : (this.options.reservationTtlMs ?? 86_400_000);
    if (ttl === undefined || !Number.isFinite(ttl) || ttl <= 0)
      this.invalid('reservation policy is missing.');
    const validUntil = new Date(Date.parse(now) + ttl).toISOString();
    if (input.validUntil && Date.parse(input.validUntil) <= Date.parse(now)) {
      this.invalid('validUntil must be later than the current time.');
    }
    return this.store.reserveNumbering(
      keyed ?? (await this.reservationScope()),
      input,
      now,
      validUntil,
    );
  }

  private async reservationScope(agentId?: string): Promise<TrustedOfflineSyncScope> {
    const scope = this.context.current();
    const resolvedAgentId = await this.businessAgent(scope, 'reserve-numbering', agentId);
    return this.options.policyResolver
      ? ({ ...scope, agentId: resolvedAgentId } as TrustedOfflineSyncScope)
      : scope;
  }

  private async businessAgent(
    scope: TrustedOfflineSyncScope,
    operation: string,
    candidate?: string,
  ): Promise<string> {
    if (candidate !== undefined) {
      this.assertText(candidate, 'agentId');
      if (Buffer.byteLength(candidate) > 255) this.invalid('agentId must not exceed 255 bytes.');
      if (!this.options.agentResolver) throw new OfflineSyncConfigurationError('agentResolver');
    }
    const resolver = this.options.agentResolver;
    const agentId = resolver
      ? candidate === undefined
        ? await resolver.resolve(scope, operation)
        : await resolver.resolve(scope, operation, { agentId: candidate })
      : scope.actorId;
    this.assertText(agentId, 'resolved agentId');
    if (Buffer.byteLength(agentId) > 255)
      this.invalid('resolved agentId must not exceed 255 bytes.');
    return agentId;
  }

  async reserveDurableNumbering(
    input: CTG9ReserveNumberingInput,
  ): Promise<CTG9NumberingReservation> {
    if (!this.options.policyResolver) throw new OfflineSyncConfigurationError('policyResolver');
    const reserve = this.durable.reserveDurableNumbering;
    if (typeof reserve !== 'function')
      throw new OfflineSyncConfigurationError('reserveDurableNumbering');
    this.validateDurableReservationInput(input);
    const scope = await this.reservationScope(input.agentId);
    if (input.idempotencyKey !== undefined) {
      const replay = this.durable.replayDurableNumberingReservation;
      if (typeof replay !== 'function')
        throw new OfflineSyncConfigurationError('replayDurableNumberingReservation');
      const prior = await replay.call(this.store, scope, input);
      if (prior) return prior;
    }
    const now = this.now();
    const at = Date.parse(now);
    if (!Number.isFinite(at)) throw new OfflineSyncConfigurationError('now');
    const policy = await this.options.policyResolver.resolve({
      tenantId: scope.tenantId,
      orgUnitId: input.orgUnitId,
      operation: 'reserve-numbering',
      at: now,
    });
    const until = at + (policy.reservationTtlMs ?? Number.NaN);
    if (!Number.isFinite(until) || until <= at || Math.abs(until) > 8.64e15)
      this.invalid('reservation policy is missing.');
    if (
      input.validUntil !== undefined &&
      (!Number.isFinite(Date.parse(input.validUntil)) || Date.parse(input.validUntil) <= at)
    )
      this.invalid('validUntil must be later than the current time.');
    return reserve.call(this.store, scope, input, now, new Date(until).toISOString());
  }

  async replayDurableNumberingReservation(
    input: CTG9ReserveNumberingInput,
  ): Promise<CTG9NumberingReservation | null> {
    if (!this.options.policyResolver) throw new OfflineSyncConfigurationError('policyResolver');
    this.validateDurableReservationInput(input);
    const replay = this.durable.replayDurableNumberingReservation;
    if (typeof replay !== 'function')
      throw new OfflineSyncConfigurationError('replayDurableNumberingReservation');
    return replay.call(this.store, await this.reservationScope(), input);
  }

  private validateDurableReservationInput(input: CTG9ReserveNumberingInput): void {
    const text = (value: string, field: string, maximum = 255): void => {
      this.assertText(value, field);
      if (
        Buffer.byteLength(value) > maximum ||
        value.includes('\0') ||
        Buffer.from(value).toString('utf8') !== value
      )
        this.invalid(`${field} is invalid.`);
    };
    text(input.orgUnitId, 'orgUnitId');
    text(input.deviceId, 'deviceId');
    if (input.shiftId !== null) {
      text(input.shiftId, 'shiftId');
      if (input.shiftId.startsWith('stynx:') && input.shiftId !== OFFLINE_SYNC_NO_SHIFT)
        this.invalid('shiftId uses a reserved namespace.');
    }
    text(input.entityType, 'entityType', 100);
    if (input.idempotencyKey !== undefined) text(input.idempotencyKey, 'idempotencyKey');
    if (input.series !== undefined) text(input.series, 'series', 80);
    if (
      input.rangeId !== undefined &&
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(input.rangeId)
    )
      this.invalid('rangeId must be a UUID.');
    if (
      !Number.isSafeInteger(input.requestedSize) ||
      input.requestedSize < 1 ||
      input.requestedSize > 100
    )
      this.invalid('requestedSize must be an integer between 1 and 100.');
  }

  async cancelDurableNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput = {},
  ): Promise<CTG9NumberingReservation> {
    this.assertText(id, 'reservationId');
    if (
      input.reason !== undefined &&
      (typeof input.reason !== 'string' ||
        Buffer.byteLength(input.reason) > 500 ||
        input.reason.includes('\0') ||
        Buffer.from(input.reason).toString('utf8') !== input.reason)
    )
      this.invalid('reason must be valid text of at most 500 bytes.');
    const cancel = this.durable.cancelDurableNumberingReservation;
    if (typeof cancel !== 'function')
      throw new OfflineSyncConfigurationError('cancelDurableNumberingReservation');
    return cancel.call(this.store, this.context.current(), id, input, this.now());
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
    return this.store.cancelNumberingReservation(cancelScope, reservationId, input, this.now());
  }

  async blockNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput = {},
  ): Promise<CTG9NumberingReservation> {
    return this.durable.blockNumberingReservation(this.context.current(), id, input, this.now());
  }
  async closeNumberingReservation(
    id: string,
    input: CancelNumberingReservationInput = {},
  ): Promise<CTG9NumberingReservation> {
    return this.durable.closeNumberingReservation(this.context.current(), id, input, this.now());
  }
  async reconcileNumberingReservation(
    id: string,
    input: ReconcileNumberingInput,
  ): Promise<ReconcileNumberingResult> {
    return this.durable.reconcileNumberingReservation(
      this.context.current(),
      id,
      input,
      this.now(),
    );
  }
  async listNumberingReconciliations(
    input: ListNumberingReconciliationsInput,
  ): Promise<OfflineSyncPage<NumberingReconciliationRecord>> {
    this.assertText(input.reservationId, 'reservationId');
    const operation = this.durable.listNumberingReconciliations;
    if (typeof operation !== 'function')
      throw new OfflineSyncConfigurationError('listNumberingReconciliations');
    return operation.call(this.store, this.context.current(), this.page(input));
  }
  async settleNumberingReservation(
    id: string,
    input: SettleNumberingInput = {},
  ): Promise<CTG9NumberingReservation> {
    return this.durable.settleNumberingReservation(this.context.current(), id, input, this.now());
  }
  async getNumberingConsumption(id: string): Promise<NumberingConsumptionResult> {
    const now = this.now();
    if (typeof now !== 'string') this.invalid('Invalid consumption read instant.');
    consumptionReadInstant(now);
    return this.durable.getNumberingConsumption(this.context.current(), id, now);
  }
  async getSyncBatchReceipt(deviceId: string, deviceBatchId: string): Promise<SyncBatchReceipt> {
    const receipt = await this.durable.getSyncBatchReceipt(
      this.context.current(),
      deviceId,
      deviceBatchId,
    );
    if (!receipt)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_BATCH_CONFLICT',
        404,
        'Batch receipt was not found.',
      );
    return receipt;
  }
  /** Read raw rejection provenance by its tenant-scoped attempt address, without applying anything. */
  async getSyncIntegrityRejection(
    identity: SyncIntegrityRejectionIdentity,
  ): Promise<SyncIntegrityRejection> {
    this.assertText(identity.deviceId, 'deviceId');
    this.assertText(identity.deviceBatchId, 'deviceBatchId');
    this.assertText(identity.queueItemId, 'queueItemId');
    const method = this.durable.getSyncIntegrityRejection;
    if (!method) throw new OfflineSyncConfigurationError('getSyncIntegrityRejection');
    const record = await method.call(this.durable, this.context.current(), identity);
    if (!record)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_INTEGRITY_REJECTION_NOT_FOUND',
        404,
        'Integrity rejection was not found.',
      );
    return record;
  }

  async getSyncItemReceipt(idempotencyKey: string): Promise<SyncItemReceipt> {
    const receipt = await this.durable.getSyncItemReceipt(this.context.current(), idempotencyKey);
    if (!receipt)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
        404,
        'Item receipt was not found.',
      );
    return receipt;
  }

  /** Tenant batch receipts, newest first (UPS-OFS-11). */
  async listSyncBatchReceipts(
    input: ListSyncBatchReceiptsInput = {},
  ): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
    this.assertFilters(input, ['deviceId']);
    if (
      input.status !== undefined &&
      !['open', 'closed', 'legacy_closed_unverified'].includes(input.status)
    )
      this.invalid('status is invalid.');
    return this.listing('listSyncBatchReceipts').call(
      this.durable,
      this.context.current(),
      this.page(input),
    );
  }
  /** Tenant item receipts, newest first (UPS-OFS-11). */
  async listSyncItemReceipts(
    input: ListSyncItemReceiptsInput = {},
  ): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
    this.assertFilters(input, ['deviceId', 'deviceBatchId']);
    if (input.status !== undefined && !queueStatuses.includes(input.status))
      this.invalid('status is invalid.');
    return this.listing('listSyncItemReceipts').call(
      this.durable,
      this.context.current(),
      this.page(input),
    );
  }
  /** Tenant queue items, newest first (UPS-OFS-11). */
  async listSyncQueueItems(
    input: ListSyncQueueItemsInput = {},
  ): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
    this.assertFilters(input, ['deviceId', 'entityType']);
    if (input.status !== undefined && !queueStatuses.includes(input.status))
      this.invalid('status is invalid.');
    return this.listing('listSyncQueueItems').call(
      this.durable,
      this.context.current(),
      this.page(input),
    );
  }
  /** Tenant conflicts, newest first (UPS-OFS-11). */
  async listSyncConflicts(
    input: ListSyncConflictsInput = {},
  ): Promise<OfflineSyncPage<SyncConflictRecord>> {
    this.assertFilters(input, ['deviceId', 'conflictType', 'queueItemId']);
    if (input.status !== undefined && !['open', 'resolved'].includes(input.status))
      this.invalid('status is invalid.');
    return this.listing('listSyncConflicts').call(
      this.durable,
      this.context.current(),
      this.page(input),
    );
  }
  /** Action history of one tenant conflict, newest first (UPS-OFS-07, ADR-MOBILE-OFFLINE-0003 D2.6). */
  async listSyncConflictActions(
    input: ListSyncConflictActionsInput,
  ): Promise<OfflineSyncPage<SyncConflictActionRecord>> {
    this.assertText(input.conflictId, 'conflictId');
    return this.listing('listSyncConflictActions').call(
      this.durable,
      this.context.current(),
      this.page(input),
    );
  }

  async submitSyncBatch(input: SubmitSyncBatchInput): Promise<SubmitSyncBatchResult>;
  async submitSyncBatch(
    input: CTG9SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
  ): Promise<CTG9SubmitSyncBatchResult>;
  async submitSyncBatch(
    input: SubmitSyncBatchInput | CTG9SubmitSyncBatchInput,
    options?: SubmitSyncBatchOptions,
  ): Promise<SubmitSyncBatchResult | CTG9SubmitSyncBatchResult> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.deviceBatchId, 'deviceBatchId');
    const scope = this.context.current();
    const now = this.now();
    const policy = this.options.policyResolver
      ? await this.options.policyResolver.resolve({
          tenantId: scope.tenantId,
          orgUnitId: input.orgUnitId,
          operation: 'submit-sync-batch',
          at: now,
        })
      : undefined;
    if (
      this.options.policyResolver &&
      this.options.concurrencyDetector &&
      !policy?.concurrencyWindowMinutes
    ) {
      Logger.warn(
        'Offline sync concurrency window is unavailable; host detection policy must review this batch.',
        'OfflineSyncService',
      );
    }
    const maximum = this.options.policyResolver ? policy?.maxBatchItems : 100;
    if (
      !isArrayValue(input.items) ||
      input.items.length < 1 ||
      (maximum != null && input.items.length > maximum)
    ) {
      this.invalid(
        maximum == null
          ? 'items must contain at least 1 queue item.'
          : `items must contain between 1 and ${maximum} queue items.`,
      );
    }
    const queueIds = new Set<string>();
    const itemKeys = new Set<string>();
    for (const item of input.items) {
      this.assertText(item.queueItemId, 'queueItemId');
      this.assertEntityType(item.entityType);
      this.assertText(item.localEntityId, 'localEntityId');
      if (!this.options.policyResolver || item.idempotencyKey !== undefined)
        this.assertText(item.idempotencyKey, 'idempotencyKey');
      if (item.idempotencyKey?.startsWith('stynx:legacy:'))
        this.invalid('idempotencyKey uses a reserved namespace.');
      if (
        this.options.policyResolver &&
        'reservationId' in item &&
        item.reservationId !== undefined &&
        (typeof item.reservationId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            item.reservationId,
          ))
      ) {
        this.invalid('reservationId must be a UUID.');
      }
      if (
        this.options.policyResolver &&
        item.reservedNumber !== undefined &&
        !Number.isSafeInteger(item.reservedNumber)
      ) {
        this.invalid('reservedNumber must be a safe integer.');
      }
      // ADR-MOBILE-OFFLINE-0003 D4: in CTG9 mode only the structure is a batch-wide 400; a non-canonical
      // value within bounds becomes a per-item integrity rejection in the durable store. E6 keeps the 400.
      if (this.options.policyResolver) {
        if (
          typeof item.payloadHash !== 'string' ||
          item.payloadHash.length === 0 ||
          Buffer.byteLength(item.payloadHash) > 255
        )
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
        if (itemKeys.has(item.idempotencyKey))
          this.invalid(
            `idempotencyKey ${item.idempotencyKey} appears more than once in the batch.`,
          );
        itemKeys.add(item.idempotencyKey);
      }
    }
    if (
      this.options.domainOutcomeClassifier &&
      (!this.options.policyResolver || this.durable.supportsDomainOutcomeClassifier !== true)
    )
      throw new OfflineSyncConfigurationError('domainOutcomeClassifier');
    if (!this.options.policyResolver)
      return this.store.submitSyncBatch(scope, input as SubmitSyncBatchInput, now);
    if (
      !this.options.itemApplier &&
      input.items.some((item) => item.idempotencyKey && item.reservedNumber !== undefined)
    )
      throw new OfflineSyncConfigurationError('itemApplier');
    const agentId = await this.businessAgent(
      scope,
      'submit-sync-batch',
      'agentId' in input ? (input.agentId as string | undefined) : undefined,
    );
    const transport = options ?? {
      transportIdempotencyKey: `service:${input.deviceId}:${input.deviceBatchId}`,
      method: 'POST' as const,
      path: '/offline-sync/sync-batches',
    };
    const execution: DurableBatchExecutionOptions = {
      ...transport,
      agentId,
      policy: policy ?? {},
      ports: this.options,
      transport,
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
    if (
      !this.options.conflictResolver &&
      !['device-wins', 'server-wins', 'manual-review'].includes(input.resolution)
    ) {
      this.invalid('resolution must be device-wins, server-wins or manual-review.');
    }
    if (this.options.conflictResolver) {
      const scope = this.context.current();
      const specialized = this.store as OfflineSyncStore & {
        resolveWithPort?: (
          scope: TrustedOfflineSyncScope,
          id: string,
          input: ResolveSyncConflictInput,
          now: string,
          port: NonNullable<StynxOfflineSyncModuleOptions['conflictResolver']>,
          eventPort?: StynxOfflineSyncModuleOptions['resolutionEventPort'],
        ) => Promise<SyncConflict>;
      };
      if (specialized.resolveWithPort)
        return specialized.resolveWithPort(
          scope,
          conflictId,
          input,
          this.now(),
          this.options.conflictResolver,
          ...(this.options.resolutionEventPort ? [this.options.resolutionEventPort] : []),
        );
      if (this.options.resolutionEventPort)
        throw new OfflineSyncConfigurationError('resolveWithPort');
      return this.options.conflictResolver.resolve(
        {},
        conflictId,
        input.resolution,
        {
          ...scope,
          agentId: scope.actorId,
          orgUnitId: '',
          deviceId: '',
          batchId: '',
          now: this.now(),
        },
      );
    }
    return this.store.resolveConflict(this.context.current(), conflictId, input, this.now());
  }

  private get durable(): OfflineSyncDurableStore {
    return this.store as OfflineSyncDurableStore;
  }

  private listing<
    K extends
      | 'listSyncBatchReceipts'
      | 'listSyncItemReceipts'
      | 'listSyncQueueItems'
      | 'listSyncConflicts'
      | 'listSyncConflictActions',
  >(name: K): NonNullable<OfflineSyncDurableStore[K]> {
    const operation = this.durable[name];
    if (typeof operation !== 'function') throw new OfflineSyncConfigurationError(name);
    return operation as NonNullable<OfflineSyncDurableStore[K]>;
  }

  private assertFilters(input: object, fields: readonly string[]): void {
    for (const field of fields) {
      const value = readProperty(input, field);
      if (value !== undefined) this.assertText(value, field);
    }
  }

  private page<T extends OfflineSyncListInput>(input: T): T & { limit: number } {
    const limit = input.limit ?? listDefaultLimit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > listMaxLimit)
      this.invalid(`limit must be an integer between 1 and ${listMaxLimit}.`);
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

  private assertText(value: unknown, field: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.invalid(`${field} is required.`);
    }
  }

  private invalid(message: string): never {
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, message);
  }
}
