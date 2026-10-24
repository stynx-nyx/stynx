import { randomUUID } from 'node:crypto';
import { Database, type Transaction } from '@stynx-nyx/data';
import {
  OfflineSyncError,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
  OfflineSyncUpgradeRequiredError,
} from './errors.js';
import { rangeUnavailableReason, reservationFingerprint } from './listing.js';
import { activeReservationError } from './reservation-admission.js';
import {
  lockReservationScopeQuery, reservationByIdempotencyKey, lockReservationKey, activeReservation, lockAllocationRange, advanceAllocationRange, insertReservation, lockReservationById, cancelReservation, highestReservationConsumption, reclaimReservationRange, expireReservationConsumption,
  type ReservationRow,
} from './reservations.repository.js';
import type {
  CancelNumberingReservationInput,
  CTG9NumberingReservation,
  CTG9ReserveNumberingInput,
  NumberingRange,
  TrustedOfflineSyncScope,
} from './types.js';


function mapReservation(row: ReservationRow): CTG9NumberingReservation {
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

async function durableTransaction<T>(
  database: Database,
  run: (trx: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await database.tx(run, {
      isolation: 'read committed',
      requireActor: true,
      retry: false,
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError('0006');
    if (code === 'STY44') throw activeReservationError();
    throw error;
  }
}

/** Every allocating writer takes this lock before a range row lock, including E6 writers. */
export async function lockReservationScope(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: Pick<CTG9ReserveNumberingInput, 'deviceId' | 'shiftId'>,
): Promise<void> {
  await trx.run(lockReservationScopeQuery,
    [scope.tenantId, input.deviceId, input.shiftId],
  );
}

async function replay(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: CTG9ReserveNumberingInput,
  key: string,
): Promise<CTG9NumberingReservation | null> {
  const row = await trx.run(reservationByIdempotencyKey,
      [scope.tenantId, key],
    );
  if (!row) return null;
  if (row.idempotency_fingerprint !== reservationFingerprint(scope, input))
    throw new OfflineSyncReservationReplayError();
  return mapReservation(row);
}

export async function pgReplayDurableReservation(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: CTG9ReserveNumberingInput,
): Promise<CTG9NumberingReservation | null> {
  const key = input.idempotencyKey;
  if (key === undefined) return null;
  return durableTransaction(database, (trx) => replay(trx, scope, input, key));
}

export async function pgReserveDurableNumbering(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: CTG9ReserveNumberingInput,
  now: string,
  defaultValidUntil: string,
): Promise<CTG9NumberingReservation> {
  return durableTransaction(database, async (trx) => {
    if (input.idempotencyKey !== undefined) {
      await trx.run(lockReservationKey, [
        `${scope.tenantId}:numbering-reserve:${input.idempotencyKey}`,
      ]);
      const prior = await replay(trx, scope, input, input.idempotencyKey);
      if (prior) return prior;
    }
    await lockReservationScope(trx, scope, input);
    const active = await trx.run(activeReservation,
      [scope.tenantId, input.deviceId, input.shiftId],
    );
    if (active) throw activeReservationError();
    const row = await trx.run(lockAllocationRange,
        [
          scope.tenantId,
          input.rangeId ?? null,
          input.orgUnitId,
          input.entityType,
          input.series ?? null,
        ],
      );
    if (!row)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_NOT_FOUND',
        404,
        'No tenant-scoped numbering range matches this entity and organizational unit.',
      );
    const range: NumberingRange = {
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
    if (
      range.status !== 'active' ||
      range.orgUnitId !== input.orgUnitId ||
      range.entityType !== input.entityType
    )
      throw new OfflineSyncRangeUnavailableError(
        rangeUnavailableReason(range, input),
        'The selected numbering range is not active for this entity and organizational unit.',
      );
    const end = range.nextNumber + input.requestedSize - 1;
    if (end > range.endNumber)
      throw new OfflineSyncRangeUnavailableError(
        'insufficient_capacity',
        'The selected numbering range has insufficient capacity.',
      );
    await trx.run(advanceAllocationRange,
      [scope.tenantId, end, end + 1, now, range.id],
    );
    const inserted = await trx.run(insertReservation,
        [
          randomUUID(),
          scope.tenantId,
          range.id,
          input.orgUnitId,
          input.entityType,
          range.series,
          'agentId' in scope && typeof scope.agentId === 'string' ? scope.agentId : scope.actorId,
          input.deviceId,
          input.shiftId,
          range.nextNumber,
          end,
          now,
          input.validUntil ?? defaultValidUntil,
          input.idempotencyKey ?? null,
          input.idempotencyKey === undefined ? null : reservationFingerprint(scope, input),
          scope.actorId,
        ],
      );
    return mapReservation(inserted);
  });
}

export async function pgCancelDurableReservation(
  database: Database,
  scope: TrustedOfflineSyncScope,
  id: string,
  input: CancelNumberingReservationInput,
  now: string,
): Promise<CTG9NumberingReservation> {
  return durableTransaction(database, async (trx) => {
    const row = await trx.run(lockReservationById,
        [scope.tenantId, id],
      );
    if (!row)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    if (row.status === 'cancelled') return mapReservation(row);
    if (row.status !== 'reserved')
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        'Reservation cannot transition from its current state.',
      );
    const changed = await trx.run(cancelReservation,
        [scope.tenantId, id, input.reason ?? null, scope.actorId, now],
      );
    const highest = (
      await trx.run(highestReservationConsumption,
        [scope.tenantId, id],
      )
    )?.number;
    const next = Math.max(
      Number(row.start_number),
      Number(highest ?? Number(row.start_number) - 1) + 1,
    );
    await trx.run(reclaimReservationRange,
      [scope.tenantId, row.range_id, next, now, Number(row.end_number) + 1],
    );
    await trx.run(expireReservationConsumption,
      [scope.tenantId, id],
    );
    return mapReservation(changed);
  });
}
