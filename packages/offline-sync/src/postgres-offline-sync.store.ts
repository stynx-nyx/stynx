import { lockResolvableConflict, conflictAllowedActions, appendConflictResolution, resolveConflictState, mergeConflictEvidence, lockConflictReceipt, conflictRetryGuard, retryQueueItem, retryItemReceipt, lockLegacyReservationKey, lockLegacyAllocationRange, advanceLegacyAllocationRange, insertLegacyReservation, legacyReservationByKey, lockLegacyReservation, cancelLegacyReservation, legacyHighestConsumption, reclaimLegacyReservationRange, insertLegacyQueueItem, markLegacyQueueConflict, insertLegacyConflict, lockLegacyConflict, resolveLegacyQueueItem, resolveLegacyConflict, legacyQueueItemByPayload, insertKeyedLegacyReservation, type NumberingRangeRow, type NumberingReservationRow, type QueueItemRow, type ConflictRow } from './legacy-store.repository.js';
import { pgReconcile, pgListReconciliations } from './postgres-reconciliation.js';
import {
  pgCreateNumberingRange,
  pgGetNumberingRange,
  pgListNumberingRanges,
  pgCancelNumberingRange,
} from './postgres-ranges.js';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import {
  OfflineSyncError,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
  OfflineSyncUpgradeRequiredError,
} from './errors.js';
import { rangeUnavailableReason, reservationFingerprint } from './listing.js';
import { activeReservationError, legacyReservation } from './reservation-admission.js';
import {
  lockReservationScope,
  pgReserveDurableNumbering,
  pgReplayDurableReservation,
  pgCancelDurableReservation,
} from './postgres-reservations.js';
import {
  pgListBatches,
  pgListConflictActions,
  pgListConflicts,
  pgListItemReceipts,
  pgListQueueItems,
} from './postgres-listing.js';
import {
  boundedConsumerAttributes,
  splitStynxContext,
  withoutResolution,
} from './stynx-context.js';
import {
  pgGetBatch,
  pgGetItem,
  pgGetIntegrityRejection,
  pgTransition,
  pgConsumption,
  pgSubmit,
} from './postgres-durable.js';
import type {
  CreateNumberingRangeInput,
  CancelNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRangePage,
  CancelNumberingReservationInput,
  NumberingRange,
  NumberingReservation,
  OpenSyncConflictInput,
  ReserveNumberingInput,
  ResolveSyncConflictInput,
  StoredSyncQueueItem,
  SubmitSyncBatchInput,
  SubmitSyncBatchResult,
  SyncConflict,
  TrustedOfflineSyncScope,
  OfflineSyncDurableStore,
  CTG9NumberingReservation,
  CTG9ReserveNumberingInput,
  ListNumberingReconciliationsInput,
  NumberingReconciliationRecord,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  SettleNumberingInput,
  NumberingConsumptionResult,
  CTG9SubmitSyncBatchInput,
  CTG9SubmitSyncBatchResult,
  DurableBatchExecutionOptions,
  SubmitSyncBatchOptions,
  SyncBatchReceipt,
  SyncItemReceipt,
  SyncIntegrityRejection,
  SyncIntegrityRejectionIdentity,
  OfflineSyncConflictResolver,
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

@Injectable()
export class PostgresOfflineSyncStore implements OfflineSyncDurableStore {
  readonly supportsDomainOutcomeClassifier = true as const;
  constructor(private readonly moduleRef: ModuleRef) {}

  blockNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation> {
    return pgTransition(this.database, scope, id, 'blocked', input, now, 'block');
  }
  closeNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation> {
    return pgTransition(this.database, scope, id, 'consumed', input, now, 'close');
  }
  settleNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: SettleNumberingInput,
    now: string,
  ): Promise<CTG9NumberingReservation> {
    return pgTransition(this.database, scope, id, 'consumed', input, now, 'settle');
  }
  reconcileNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ReconcileNumberingInput,
    now: string,
  ): Promise<ReconcileNumberingResult> {
    return pgReconcile(this.database, scope, id, input, now);
  }
  listNumberingReconciliations(
    scope: TrustedOfflineSyncScope,
    input: ListNumberingReconciliationsInput,
  ): Promise<OfflineSyncPage<NumberingReconciliationRecord>> {
    return pgListReconciliations(this.database, scope, input);
  }
  getNumberingConsumption(
    scope: TrustedOfflineSyncScope,
    id: string,
    now?: string,
  ): Promise<NumberingConsumptionResult> {
    return pgConsumption(this.database, scope, id, now);
  }
  submitDurableSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: CTG9SubmitSyncBatchInput,
    options: SubmitSyncBatchOptions,
    now: string,
  ): Promise<CTG9SubmitSyncBatchResult> {
    const supplied = options as Partial<DurableBatchExecutionOptions>;
    return pgSubmit(
      this.database,
      scope,
      input,
      {
        ...options,
        agentId: supplied.agentId ?? scope.actorId,
        policy: supplied.policy ?? {},
        ports: supplied.ports ?? {},
        transport: supplied.transport ?? options,
      },
      now,
    );
  }
  getSyncBatchReceipt(
    scope: TrustedOfflineSyncScope,
    deviceId: string,
    deviceBatchId: string,
  ): Promise<SyncBatchReceipt | null> {
    return pgGetBatch(this.database, scope, deviceId, deviceBatchId);
  }
  getSyncIntegrityRejection(
    scope: TrustedOfflineSyncScope,
    identity: SyncIntegrityRejectionIdentity,
  ): Promise<SyncIntegrityRejection | null> {
    return pgGetIntegrityRejection(this.database, scope, identity);
  }

  getSyncItemReceipt(scope: TrustedOfflineSyncScope, key: string): Promise<SyncItemReceipt | null> {
    return pgGetItem(this.database, scope, key);
  }
  listSyncBatchReceipts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncBatchReceiptsInput,
  ): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
    return pgListBatches(this.database, scope, input);
  }
  listSyncItemReceipts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncItemReceiptsInput,
  ): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
    return pgListItemReceipts(this.database, scope, input);
  }
  listSyncQueueItems(
    scope: TrustedOfflineSyncScope,
    input: ListSyncQueueItemsInput,
  ): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
    return pgListQueueItems(this.database, scope, input);
  }
  listSyncConflicts(
    scope: TrustedOfflineSyncScope,
    input: ListSyncConflictsInput,
  ): Promise<OfflineSyncPage<SyncConflictRecord>> {
    return pgListConflicts(this.database, scope, input);
  }
  listSyncConflictActions(
    scope: TrustedOfflineSyncScope,
    input: ListSyncConflictActionsInput,
  ): Promise<OfflineSyncPage<SyncConflictActionRecord>> {
    return pgListConflictActions(this.database, scope, input);
  }
  /**
   * CTG9 resolution through the host resolver (ADR-MOBILE-OFFLINE-0003 D1 and D2). One transaction: the
   * conflict row is locked, `allowedActions` governs refusal, the resolver returns `open` (recorded, the
   * conflict stays open) or `resolved` (closed as before). `retry_after_correction` additionally moves
   * the queue item and its receipt from `conflict` to `pending` when no effect was committed.
   */
  resolveWithPort(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: ResolveSyncConflictInput,
    now: string,
    port: OfflineSyncConflictResolver,
    eventPort?: import('./types.js').OfflineSyncEventPort,
  ): Promise<SyncConflict> {
    return this.database
      .tx(async (trx) => {
        const result = await trx.run(lockResolvableConflict,
          [scope.tenantId, id],
        );
        const row = result[0];
        if (!row)
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
            404,
            'Conflict was not found.',
          );
        const evidence = await trx.run(conflictAllowedActions,
          [scope.tenantId, id],
        );
        const context = {
          ...scope,
          agentId: row.agent_id,
          orgUnitId: row.org_unit_id,
          deviceId: row.device_id,
          batchId: row.device_batch_id,
          now,
        };
        const allowed =
          (await port.allowedActions?.(trx, id, context)) ?? evidence[0]?.allowed_actions;
        if (allowed !== undefined && !allowed.includes(input.resolution))
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_RESOLUTION',
            409,
            'Resolution action is not allowed.',
          );
        const { consumerAttributes: supplied, ...resolved } = await port.resolve(
          trx,
          id,
          input.resolution,
          context,
        );
        if (resolved.status !== 'resolved' && resolved.status !== 'open')
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_RESOLUTION',
            409,
            'Conflict resolver did not resolve the conflict.',
          );
        const consumerAttributes = boundedConsumerAttributes(supplied);
        if (resolved.status === 'resolved' && input.resolution === 'retry_after_correction')
          await this.returnToPending(trx, scope, id, row, now);
        const actionId = randomUUID();
        await trx.run(appendConflictResolution,
          [
            scope.tenantId,
            id,
            input.resolution,
            input.description ?? null,
            input.userRef ?? null,
            scope.actorId,
            resolved.status,
            actionId,
            now,
          ],
        );
        if (resolved.status === 'resolved')
          await trx.run(resolveConflictState,
            [
              scope.tenantId,
              id,
              input.resolution,
              input.description ?? null,
              input.userRef ?? null,
              scope.actorId,
              now,
            ],
          );
        const stored = await trx.run(mergeConflictEvidence,
          [
            scope.tenantId,
            id,
            resolved.status === 'resolved'
              ? JSON.stringify({
                  resolutionAction: input.resolution,
                  resolutionReason: input.description ?? null,
                  resolutionUserRef: input.userRef ?? null,
                  resolvedBy: scope.actorId,
                  resolvedAt: now,
                  resultingStatus: resolved.status,
                })
              : null,
            JSON.stringify(consumerAttributes === undefined ? {} : { consumerAttributes }),
          ],
        );
        const platform = splitStynxContext(stored[0]?.evidence);
        const canonical = {
          ...resolved,
          conflictId: id,
          tenantId: scope.tenantId,
          queueItemId: row.queue_item_id,
          localEntityId: row.local_entity_id,
          payloadHash: row.payload_hash,
          conflictType: row.conflict_type,
          description: row.description,
        };
        await eventPort?.appendInTransaction(trx, {
          entity: 'offline.sync-conflict',
          entityId: id,
          idempotencyKey: `stynx:offline-sync:resolution:${actionId}`,
          payload: {
            actionId,
            conflictId: id,
            queueItemId: row.queue_item_id,
            action: input.resolution,
            resultingStatus: resolved.status,
            actorId: scope.actorId,
            at: now,
          },
        });
        return resolved.status === 'resolved'
          ? {
              ...canonical,
              resolution: input.resolution,
              resolvedBy: scope.actorId,
              resolvedAt: now,
              ...(platform.stynx ? { stynx: platform.stynx } : {}),
            }
          : {
              ...withoutResolution(canonical),
              ...(platform.stynx ? { stynx: platform.stynx } : {}),
            };
      })
      .catch((error: unknown) => {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : undefined;
        if (code === '23514' || (code === '42P01' && message?.includes('sync_conflict_actions')))
          throw new OfflineSyncUpgradeRequiredError('0004');
        throw error;
      });
  }

  /** D1 items 2 and 3: refused unless the item is `conflict`, has no `appliedAt`, no applied number and no other open conflict. */
  private async returnToPending(
    trx: Transaction,
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    row: {
      queue_item_id: string;
      idempotency_key: string;
      item_status: string;
      reserved_number: string | null;
      device_id: string;
      org_unit_id: string;
      entity_type: string;
    },
    now: string,
  ): Promise<void> {
    const receipt = (
      await trx.run(lockConflictReceipt,
        [scope.tenantId, row.idempotency_key],
      )
    )[0];
    const guard = (
      await trx.run(conflictRetryGuard,
        [
          scope.tenantId,
          row.queue_item_id,
          row.reserved_number,
          row.device_id,
          row.org_unit_id,
          row.entity_type,
          conflictId,
        ],
      )
    )[0]!;
    if (
      row.item_status !== 'conflict' ||
      receipt?.status !== 'conflict' ||
      splitStynxContext(receipt.context_json).stynx?.appliedAt !== undefined ||
      guard.applied_number ||
      guard.other_open
    )
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_RESOLUTION',
        409,
        'The item cannot return to pending.',
      );
    await trx.run(retryQueueItem,
      [scope.tenantId, row.queue_item_id, now],
    );
    await trx.run(retryItemReceipt,
      [scope.tenantId, row.idempotency_key, now],
    );
  }

  async reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation> {
    const key = input.idempotencyKey;
    const fingerprint = key === undefined ? null : reservationFingerprint(scope, input);
    return this.txE6(async (trx) => {
      if (key !== undefined) {
        // Same-key requests serialize here; READ COMMITTED lets the waiter see the committed original.
        await trx.run(lockLegacyReservationKey, [
          `${scope.tenantId}:numbering-reserve:${key}`,
        ]);
        const prior = await this.keyedReservation(trx, scope, key, fingerprint!);
        if (prior) return prior;
      }
      await lockReservationScope(trx, scope, input);
      const result = await trx.run(lockLegacyAllocationRange,
        [
          scope.tenantId,
          input.rangeId ?? null,
          input.orgUnitId,
          input.entityType,
          input.series ?? null,
        ],
      );
      const row = result[0];
      if (!row) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_RANGE_NOT_FOUND',
          404,
          'No tenant-scoped numbering range matches this entity and organizational unit.',
        );
      }
      const range = this.mapRange(row);
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
      await trx.run(advanceLegacyAllocationRange,
        [scope.tenantId, endNumber, endNumber + 1, now, range.id],
      );
      const reservationId = randomUUID();
      const reservationQuery = key === undefined ? insertLegacyReservation : insertKeyedLegacyReservation;
      const inserted = await trx.run(reservationQuery,
        reservationQuery.params.parse(
        [
          reservationId,
          scope.tenantId,
          range.id,
          input.orgUnitId,
          input.entityType,
          range.series,
          'agentId' in scope && typeof scope.agentId === 'string' ? scope.agentId : scope.actorId,
          input.deviceId,
          input.shiftId,
          range.nextNumber,
          endNumber,
          now,
          input.validUntil ?? defaultValidUntil,
          ...(key === undefined ? [] : [key, fingerprint]),
        ]),
      );
      return this.mapReservation(inserted[0]!);
    }).catch((error: unknown) => {
      if (key !== undefined && error instanceof OfflineSyncUpgradeRequiredError)
        throw new OfflineSyncUpgradeRequiredError('0003');
      throw error;
    });
  }

  async replayNumberingReservation(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
  ): Promise<NumberingReservation | null> {
    const key = input.idempotencyKey;
    if (key === undefined) return null;
    return this.txE6((trx) =>
      this.keyedReservation(trx, scope, key, reservationFingerprint(scope, input)),
    ).catch((error: unknown) => {
      if (error instanceof OfflineSyncUpgradeRequiredError)
        throw new OfflineSyncUpgradeRequiredError('0003');
      throw error;
    });
  }

  createNumberingRange(
    scope: TrustedOfflineSyncScope,
    input: CreateNumberingRangeInput,
    now: string,
  ): Promise<NumberingRange> {
    return pgCreateNumberingRange(this.database, scope, input, now);
  }
  getNumberingRange(scope: TrustedOfflineSyncScope, id: string): Promise<NumberingRange | null> {
    return pgGetNumberingRange(this.database, scope, id);
  }
  listNumberingRanges(
    scope: TrustedOfflineSyncScope,
    input: ListNumberingRangesInput,
  ): Promise<NumberingRangePage> {
    return pgListNumberingRanges(this.database, scope, input);
  }
  cancelNumberingRange(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingRangeInput,
    now: string,
  ): Promise<NumberingRange> {
    return pgCancelNumberingRange(this.database, scope, id, input, now);
  }

  reserveDurableNumbering(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<CTG9NumberingReservation> {
    return pgReserveDurableNumbering(this.database, scope, input, now, defaultValidUntil);
  }

  replayDurableNumberingReservation(
    scope: TrustedOfflineSyncScope,
    input: CTG9ReserveNumberingInput,
  ): Promise<CTG9NumberingReservation | null> {
    return pgReplayDurableReservation(this.database, scope, input);
  }

  cancelDurableNumberingReservation(
    scope: TrustedOfflineSyncScope,
    id: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<CTG9NumberingReservation> {
    return pgCancelDurableReservation(this.database, scope, id, input, now);
  }

  private async keyedReservation(
    trx: Transaction,
    scope: TrustedOfflineSyncScope,
    key: string,
    fingerprint: string,
  ): Promise<NumberingReservation | null> {
    const prior = (
      await trx.run(legacyReservationByKey,
        [scope.tenantId, key],
      )
    )[0];
    if (!prior) return null;
    if (prior.idempotency_fingerprint !== fingerprint)
      throw new OfflineSyncReservationReplayError();
    return this.mapReservation(prior);
  }

  async cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<NumberingReservation> {
    const ctg9 = 'ctg9' in scope && scope.ctg9 === true;
    return this.txE6(async (trx) => {
      const existing = await trx.run(lockLegacyReservation,
        [scope.tenantId, reservationId],
      );
      const row = existing[0];
      if (!row) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
          404,
          `Numbering reservation ${reservationId} was not found.`,
        );
      }
      this.mapReservation(row);
      if (ctg9 && row.status === 'cancelled') return this.mapReservation(row);
      if (row.status !== 'reserved') {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_RESERVATION_STATE',
          409,
          `Numbering reservation ${reservationId} is ${row.status}; expected reserved.`,
        );
      }
      const updated = await trx.run(cancelLegacyReservation,
        [scope.tenantId, reservationId, input.reason ?? null, scope.actorId, now],
      );
      if (ctg9) {
        const highest = await trx.run(legacyHighestConsumption,
          [scope.tenantId, reservationId],
        );
        const next = Math.max(
          Number(row.start_number),
          Number(highest[0]?.number ?? Number(row.start_number) - 1) + 1,
        );
        // Returning an unused tail reactivates only an exhausted range; a consumer-cancelled range
        // is never revived or rewound (ADR-MOBILE-OFFLINE-0003 D5).
        await trx.run(reclaimLegacyReservationRange,
          [scope.tenantId, row.range_id, next, now, Number(row.end_number) + 1],
        );
      }
      return this.mapReservation(updated[0]!);
    });
  }

  async submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult> {
    return this.txE6(async (trx) => {
      const items: StoredSyncQueueItem[] = [];
      let duplicateItems = 0;
      for (const item of input.items) {
        const existing = await this.findQueueItemByPayload(trx, scope.tenantId, item.payloadHash);
        if (existing) {
          duplicateItems += 1;
          items.push(existing);
          continue;
        }
        try {
          const inserted = await trx.run(insertLegacyQueueItem,
            [
              item.queueItemId,
              scope.tenantId,
              input.deviceBatchId,
              input.orgUnitId,
              scope.actorId,
              input.deviceId,
              item.entityType,
              item.localEntityId,
              item.idempotencyKey,
              item.payloadHash,
              JSON.stringify(item.payloadJson),
              item.createdLocallyAt,
              item.reservedNumber ?? null,
              now,
            ],
          );
          const insertedRow = inserted[0];
          if (insertedRow) {
            items.push(this.mapQueueItem(insertedRow));
            continue;
          }
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
            throw new OfflineSyncError(
              'OFFLINE_SYNC_QUEUE_ID_REUSED',
              409,
              `Queue item ${item.queueItemId} was already used with another payload hash.`,
            );
          }
          throw error;
        }
        const raced = await this.findQueueItemByPayload(trx, scope.tenantId, item.payloadHash);
        if (!raced) {
          throw new Error('Payload-hash conflict did not resolve to a stored queue item.');
        }
        duplicateItems += 1;
        items.push(raced);
      }
      return {
        batchId: input.deviceBatchId,
        acceptedItems: input.items.length,
        duplicateItems,
        conflicts: items
          .filter((item) => item.status === 'conflict')
          .map((item) => item.queueItemId),
        items,
      };
    });
  }

  async openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    return this.txE6(async (trx) => {
      const queueResult = await trx.run(markLegacyQueueConflict,
        [scope.tenantId, queueItemId, now],
      );
      const queueItem = queueResult[0];
      if (!queueItem) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
          404,
          `Sync queue item ${queueItemId} was not found.`,
        );
      }
      const result = await trx.run(insertLegacyConflict,
        [
          randomUUID(),
          scope.tenantId,
          queueItemId,
          queueItem.local_entity_id,
          queueItem.payload_hash,
          input.conflictType,
          input.description,
          now,
        ],
      );
      return this.mapConflict(result[0]!);
    });
  }

  async resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    return this.txE6(async (trx) => {
      const existing = await trx.run(lockLegacyConflict,
        [scope.tenantId, conflictId],
      );
      const row = existing[0];
      if (!row) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
          404,
          `Sync conflict ${conflictId} was not found.`,
        );
      }
      if (row.status !== 'open') {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_CONFLICT_STATE',
          409,
          `Sync conflict ${conflictId} is ${row.status}; expected open.`,
        );
      }
      await trx.run(resolveLegacyQueueItem,
        [
          scope.tenantId,
          row.sync_queue_item_id,
          input.resolution === 'server-wins' ? 'rejected' : 'applied',
          now,
        ],
      );
      const updated = await trx.run(resolveLegacyConflict,
        [
          scope.tenantId,
          conflictId,
          input.resolution,
          scope.actorId,
          now,
          input.description ?? null,
        ],
      );
      return this.mapConflict(updated[0]!);
    });
  }

  private async txE6<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.tx(fn);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
      if (code === 'STY44') throw activeReservationError();
      if (['42703', '42P01'].includes(code ?? ''))
        throw new OfflineSyncUpgradeRequiredError();
      throw error;
    }
  }

  private async findQueueItemByPayload(
    trx: Transaction,
    tenantId: string,
    payloadHash: string,
  ): Promise<StoredSyncQueueItem | undefined> {
    const result = await trx.run(legacyQueueItemByPayload,
      [tenantId, payloadHash],
    );
    return result[0] ? this.mapQueueItem(result[0]) : undefined;
  }

  private mapRange(row: NumberingRangeRow): NumberingRange {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      entityType: row.entity_type,
      series: row.series,
      startNumber: Number(row.start_number),
      endNumber: Number(row.end_number),
      nextNumber: Number(row.next_number),
      status: row.status,
    };
  }

  private mapReservation(row: NumberingReservationRow): NumberingReservation {
    return legacyReservation({
      reservationId: row.id,
      rangeId: row.range_id,
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      entityType: row.entity_type,
      series: row.series,
      agentId: row.agent_id,
      deviceId: row.device_id,
      shiftId: row.shift_id,
      startNumber: Number(row.start_number),
      endNumber: Number(row.end_number),
      nextNumber: Number(row.next_number),
      validUntil: new Date(row.valid_until).toISOString(),
      status: row.status,
    });
  }

  private mapQueueItem(row: QueueItemRow): StoredSyncQueueItem {
    return {
      queueItemId: row.id,
      tenantId: row.tenant_id,
      orgUnitId: row.org_unit_id,
      agentId: row.agent_id,
      deviceId: row.device_id,
      entityType: row.entity_type,
      localEntityId: row.local_entity_id,
      idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash,
      payloadJson: row.payload_json,
      createdLocallyAt: new Date(row.created_locally_at).toISOString(),
      ...(row.reserved_number === null ? {} : { reservedNumber: Number(row.reserved_number) }),
      status: row.status,
      receivedAt: new Date(row.received_at).toISOString(),
    };
  }

  private mapConflict(row: ConflictRow): SyncConflict {
    return {
      conflictId: row.id,
      tenantId: row.tenant_id,
      queueItemId: row.sync_queue_item_id,
      localEntityId: row.local_entity_id,
      payloadHash: row.payload_hash,
      conflictType: row.conflict_type,
      description: row.description,
      status: row.status,
      ...(row.resolution === null ? {} : { resolution: row.resolution }),
      ...(row.resolved_by === null ? {} : { resolvedBy: row.resolved_by }),
      ...(row.resolved_at === null ? {} : { resolvedAt: new Date(row.resolved_at).toISOString() }),
    };
  }

  private get database(): Database {
    return this.moduleRef.get(Database, { strict: false });
  }
}
