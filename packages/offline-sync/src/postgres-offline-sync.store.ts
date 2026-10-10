import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import {
  OfflineSyncError,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
  OfflineSyncUpgradeRequiredError,
} from './errors';
import { rangeUnavailableReason, reservationFingerprint } from './listing';
import {
  pgListBatches,
  pgListConflictActions,
  pgListConflicts,
  pgListItemReceipts,
  pgListQueueItems,
} from './postgres-listing';
import {
  boundedConsumerAttributes,
  mergeStynxSql,
  splitStynxContext,
  withoutResolution,
} from './stynx-context';
import {
  pgGetBatch,
  pgGetItem,
  pgTransition,
  pgConsumption,
  pgReconcile,
  pgSubmit,
} from './postgres-durable';
import type {
  CancelNumberingReservationInput,
  NumberingRange,
  NumberingReservation,
  OfflineSyncConflictResolutionStrategy,
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
} from './types';

interface NumberingRangeRow {
  id: string;
  tenant_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  start_number: string | number;
  end_number: string | number;
  next_number: string | number;
  status: NumberingRange['status'];
}

interface NumberingReservationRow {
  id: string;
  tenant_id: string;
  range_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  agent_id: string;
  device_id: string;
  shift_id: string;
  start_number: string | number;
  end_number: string | number;
  next_number: string | number;
  valid_until: string | Date;
  status: NumberingReservation['status'];
}

interface QueueItemRow {
  id: string;
  tenant_id: string;
  org_unit_id: string;
  agent_id: string;
  device_id: string;
  entity_type: string;
  local_entity_id: string;
  idempotency_key: string;
  payload_hash: string;
  payload_json: Record<string, unknown>;
  created_locally_at: string | Date;
  reserved_number: string | number | null;
  status: StoredSyncQueueItem['status'];
  received_at: string | Date;
}

interface ConflictRow {
  id: string;
  tenant_id: string;
  sync_queue_item_id: string;
  local_entity_id: string;
  payload_hash: string;
  conflict_type: string;
  description: string;
  status: SyncConflict['status'];
  resolution: OfflineSyncConflictResolutionStrategy | null;
  resolved_by: string | null;
  resolved_at: string | Date | null;
}

@Injectable()
export class PostgresOfflineSyncStore implements OfflineSyncDurableStore {
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
  getNumberingConsumption(
    scope: TrustedOfflineSyncScope,
    id: string,
  ): Promise<NumberingConsumptionResult> {
    return pgConsumption(this.database, scope, id);
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
  ): Promise<SyncConflict> {
    return this.database
      .tx(async (trx) => {
        const result = await trx.query<{
          org_unit_id: string;
          device_id: string;
          agent_id: string;
          device_batch_id: string;
          queue_item_id: string;
          idempotency_key: string;
          item_status: string;
          reserved_number: string | null;
          entity_type: string;
        }>(
          `select q.org_unit_id,q.device_id,q.agent_id,q.device_batch_id,q.id as queue_item_id,q.idempotency_key,q.status as item_status,q.reserved_number,q.entity_type
          from offline.sync_conflicts c
          join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
          where c.tenant_id=$1::uuid and c.id=$2::uuid and c.status='open' for update of c`,
          [scope.tenantId, id],
        );
        const row = result.rows[0];
        if (!row)
          throw new OfflineSyncError(
            'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
            404,
            'Conflict was not found.',
          );
        const evidence = await trx.query<{ allowed_actions: string[] }>(
          `select allowed_actions from offline.sync_conflict_evidence where tenant_id=$1::uuid and conflict_id=$2::uuid limit 1`,
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
          (await port.allowedActions?.(trx, id, context)) ?? evidence.rows[0]?.allowed_actions;
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
        await trx.query(
          `insert into offline.sync_conflict_actions (tenant_id,conflict_id,action,reason,user_ref,actor_id,resulting_status)
        values ($1::uuid,$2::uuid,$3,$4,$5,$6,$7)`,
          [
            scope.tenantId,
            id,
            input.resolution,
            input.description ?? null,
            input.userRef ?? null,
            scope.actorId,
            resolved.status,
          ],
        );
        if (resolved.status === 'resolved')
          await trx.query(
            `update offline.sync_conflicts set status='resolved',resolution=$3,
        resolution_reason=$4,resolution_user_ref=$5,resolved_by=$6,resolved_at=$7::timestamptz,
        updated_at=$7::timestamptz where tenant_id=$1::uuid and id=$2::uuid`,
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
        const stored = await trx.query<{ evidence: Record<string, unknown> }>(
          `update offline.sync_conflict_evidence set evidence=${mergeStynxSql('evidence', '$3', '$4')}
        where tenant_id=$1::uuid and conflict_id=$2::uuid returning evidence`,
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
        const platform = splitStynxContext(stored.rows[0]?.evidence);
        return resolved.status === 'resolved'
          ? {
              ...resolved,
              resolution: input.resolution,
              resolvedBy: scope.actorId,
              resolvedAt: now,
              ...(platform.stynx ? { stynx: platform.stynx } : {}),
            }
          : {
              ...withoutResolution(resolved),
              ...(platform.stynx ? { stynx: platform.stynx } : {}),
            };
      })
      .catch((error: unknown) => {
        const { code, message } = error as { code?: string; message?: string };
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
      await trx.query<{ status: string; context_json: Record<string, unknown> | null }>(
        `select status,context_json from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
        [scope.tenantId, row.idempotency_key],
      )
    ).rows[0];
    const guard = (
      await trx.query<{ applied_number: boolean; other_open: boolean }>(
        `select exists (select 1 from offline.numbering_consumption n
          join offline.numbering_reservations r on r.tenant_id=n.tenant_id and r.id=n.reservation_id
          where n.tenant_id=$1::uuid and $3::bigint is not null and n.number=$3::bigint and n.status='applied'
            and r.device_id=$4 and r.org_unit_id=$5 and r.entity_type=$6) as applied_number,
        exists (select 1 from offline.sync_conflicts where tenant_id=$1::uuid and sync_queue_item_id=$2 and status='open' and id<>$7::uuid) as other_open`,
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
    ).rows[0]!;
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
    await trx.query(
      `update offline.sync_queue_items set status='pending',updated_at=$3::timestamptz where tenant_id=$1::uuid and id=$2`,
      [scope.tenantId, row.queue_item_id, now],
    );
    await trx.query(
      `update offline.sync_item_receipts set status='pending',error_code=null,updated_at=$3::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,
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
        await trx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${scope.tenantId}:numbering-reserve:${key}`,
        ]);
        const prior = await this.keyedReservation(trx, scope, key, fingerprint!);
        if (prior) return prior;
      }
      const result = await trx.query<NumberingRangeRow>(
        `select id, tenant_id, org_unit_id, entity_type, series, start_number,
                end_number, next_number, status,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.numbering_ranges
          where tenant_id = $1::uuid
            and ($2::uuid is null or id = $2::uuid)
            and ($2::uuid is not null or (
              org_unit_id = $3
              and entity_type = $4
              and ($5::text is null or series = $5)
              and ($5::text is not null or status <> 'cancelled')
            ))
          order by series
          limit 1
          for update`,
        [
          scope.tenantId,
          input.rangeId ?? null,
          input.orgUnitId,
          input.entityType,
          input.series ?? null,
        ],
      );
      const row = result.rows[0];
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
      await trx.query(
        `update offline.numbering_ranges
            set next_number = $3,
                status = case when $2 = end_number then 'exhausted' else status end,
                updated_at = $4::timestamptz
          where tenant_id = $1::uuid and id = $5::uuid`,
        [scope.tenantId, endNumber, endNumber + 1, now, range.id],
      );
      const reservationId = randomUUID();
      const inserted = await trx.query<NumberingReservationRow>(
        `insert into offline.numbering_reservations (
           id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id,
           device_id, shift_id, start_number, end_number, next_number,
           reserved_at, valid_until, status${key === undefined ? '' : ', idempotency_key, idempotency_fingerprint'}
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
           $10, $11, $10, $12::timestamptz, $13::timestamptz, 'reserved'${key === undefined ? '' : ', $14, $15'}
         )
         returning id, tenant_id, range_id, org_unit_id, entity_type, series,
                   agent_id, device_id, shift_id, start_number, end_number,
                   next_number, valid_until, status`,
        [
          reservationId,
          scope.tenantId,
          range.id,
          input.orgUnitId,
          input.entityType,
          range.series,
          (scope as TrustedOfflineSyncScope & { agentId?: string }).agentId ?? scope.actorId,
          input.deviceId,
          input.shiftId,
          range.nextNumber,
          endNumber,
          now,
          input.validUntil ?? defaultValidUntil,
          ...(key === undefined ? [] : [key, fingerprint]),
        ],
      );
      return this.mapReservation(inserted.rows[0]!);
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

  private async keyedReservation(
    trx: Transaction,
    scope: TrustedOfflineSyncScope,
    key: string,
    fingerprint: string,
  ): Promise<NumberingReservation | null> {
    const prior = (
      await trx.query<NumberingReservationRow & { idempotency_fingerprint: string }>(
        `select id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id, device_id, shift_id,
              start_number, end_number, next_number, valid_until, status, idempotency_fingerprint
         from offline.numbering_reservations where tenant_id = $1::uuid and idempotency_key = $2`,
        [scope.tenantId, key],
      )
    ).rows[0];
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
    const ctg9 = (scope as TrustedOfflineSyncScope & { ctg9?: boolean }).ctg9 === true;
    return this.txE6(async (trx) => {
      const existing = await trx.query<NumberingReservationRow>(
        `select id, tenant_id, range_id, org_unit_id, entity_type, series,
                agent_id, device_id, shift_id, start_number, end_number,
                next_number, valid_until, status,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.numbering_reservations
          where tenant_id = $1::uuid and id = $2::uuid
          for update`,
        [scope.tenantId, reservationId],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
          404,
          `Numbering reservation ${reservationId} was not found.`,
        );
      }
      if (ctg9 && row.status === 'cancelled') return this.mapReservation(row);
      if (row.status !== 'reserved') {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_RESERVATION_STATE',
          409,
          `Numbering reservation ${reservationId} is ${row.status}; expected reserved.`,
        );
      }
      const updated = await trx.query<NumberingReservationRow>(
        `update offline.numbering_reservations
            set status = 'cancelled', cancellation_reason = $3,
                cancelled_by = $4, updated_at = $5::timestamptz,
                audit_actor_id = $4
          where tenant_id = $1::uuid and id = $2::uuid
          returning id, tenant_id, range_id, org_unit_id, entity_type, series,
                    agent_id, device_id, shift_id, start_number, end_number,
                    next_number, valid_until, status`,
        [scope.tenantId, reservationId, input.reason ?? null, scope.actorId, now],
      );
      if (ctg9) {
        const highest = await trx.query<{ number: string | null }>(
          `select max(number) as number from offline.numbering_consumption
            where tenant_id=$1::uuid and reservation_id=$2::uuid and status in ('applied','claimed-locally')`,
          [scope.tenantId, reservationId],
        );
        const next = Math.max(
          Number(row.start_number),
          Number(highest.rows[0]?.number ?? Number(row.start_number) - 1) + 1,
        );
        // Returning an unused tail reactivates only an exhausted range; a consumer-cancelled range
        // is never revived or rewound (ADR-MOBILE-OFFLINE-0003 D5).
        await trx.query(
          `update offline.numbering_ranges set next_number=$3,
             status=case when status='exhausted' then 'active' else status end,
             updated_at=$4::timestamptz
           where tenant_id=$1::uuid and id=$2::uuid and next_number=$5 and status<>'cancelled'`,
          [scope.tenantId, row.range_id, next, now, Number(row.end_number) + 1],
        );
      }
      return this.mapReservation(updated.rows[0]!);
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
          const inserted = await trx.query<QueueItemRow>(
            `insert into offline.sync_queue_items (
               id, tenant_id, device_batch_id, org_unit_id, agent_id, device_id,
               entity_type, local_entity_id, idempotency_key, payload_hash,
               payload_json, created_locally_at, reserved_number, status, received_at
             ) values (
               $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
               $11::jsonb, $12::timestamptz, $13, 'received', $14::timestamptz
             )
             on conflict (tenant_id, payload_hash) where identity_mode = 'e6' do nothing
             returning id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
                       local_entity_id, idempotency_key, payload_hash, payload_json,
                       created_locally_at, reserved_number, status, received_at`,
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
          const insertedRow = inserted.rows[0];
          if (insertedRow) {
            items.push(this.mapQueueItem(insertedRow));
            continue;
          }
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
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
      const queueResult = await trx.query<QueueItemRow>(
        `update offline.sync_queue_items
            set status = 'conflict', updated_at = $3::timestamptz
          where tenant_id = $1::uuid and id = $2 and identity_mode = 'e6'
          returning id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
                    local_entity_id, idempotency_key, payload_hash, payload_json,
                    created_locally_at, reserved_number, status, received_at`,
        [scope.tenantId, queueItemId, now],
      );
      const queueItem = queueResult.rows[0];
      if (!queueItem) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
          404,
          `Sync queue item ${queueItemId} was not found.`,
        );
      }
      const result = await trx.query<ConflictRow>(
        `insert into offline.sync_conflicts (
           id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
           conflict_type, description, status, created_at
         ) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'open', $8::timestamptz)
         returning id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                   conflict_type, description, status, resolution, resolved_by, resolved_at`,
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
      return this.mapConflict(result.rows[0]!);
    });
  }

  async resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    return this.txE6(async (trx) => {
      const existing = await trx.query<ConflictRow>(
        `select id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                conflict_type, description, status, resolution, resolved_by, resolved_at,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.sync_conflicts
          where tenant_id = $1::uuid and id = $2::uuid
          for update`,
        [scope.tenantId, conflictId],
      );
      const row = existing.rows[0];
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
      await trx.query(
        `update offline.sync_queue_items
            set status = $3, updated_at = $4::timestamptz
          where tenant_id = $1::uuid and id = $2`,
        [
          scope.tenantId,
          row.sync_queue_item_id,
          input.resolution === 'server-wins' ? 'rejected' : 'applied',
          now,
        ],
      );
      const updated = await trx.query<ConflictRow>(
        `update offline.sync_conflicts
            set status = 'resolved', resolution = $3, resolved_by = $4,
                resolved_at = $5::timestamptz,
                description = coalesce($6, description), updated_at = $5::timestamptz
          where tenant_id = $1::uuid and id = $2::uuid
          returning id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                    conflict_type, description, status, resolution, resolved_by, resolved_at`,
        [
          scope.tenantId,
          conflictId,
          input.resolution,
          scope.actorId,
          now,
          input.description ?? null,
        ],
      );
      return this.mapConflict(updated.rows[0]!);
    });
  }

  private async txE6<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.tx(fn);
    } catch (error) {
      if (['42703', '42P01'].includes((error as { code?: string }).code ?? ''))
        throw new OfflineSyncUpgradeRequiredError();
      throw error;
    }
  }

  private async findQueueItemByPayload(
    trx: Transaction,
    tenantId: string,
    payloadHash: string,
  ): Promise<StoredSyncQueueItem | undefined> {
    const result = await trx.query<QueueItemRow>(
      `select id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
              local_entity_id, idempotency_key, payload_hash, payload_json,
              created_locally_at, reserved_number, status, received_at
         from offline.sync_queue_items
        where tenant_id = $1::uuid and payload_hash = $2 and identity_mode = 'e6'
        limit 1`,
      [tenantId, payloadHash],
    );
    return result.rows[0] ? this.mapQueueItem(result.rows[0]) : undefined;
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
    return {
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
    };
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
