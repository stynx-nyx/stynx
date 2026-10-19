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
import type {
  CancelNumberingReservationInput,
  CTG9NumberingReservation,
  CTG9ReserveNumberingInput,
  NumberingRange,
  TrustedOfflineSyncScope,
} from './types.js';

interface ReservationRow {
  id: string;
  range_id: string;
  tenant_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  agent_id: string;
  device_id: string;
  shift_id: string | null;
  start_number: string | number;
  end_number: string | number;
  next_number: string | number;
  valid_until: Date | string;
  status: CTG9NumberingReservation['status'];
  idempotency_fingerprint?: string;
}
const columns = `id,range_id,tenant_id,org_unit_id,entity_type,series,agent_id,device_id,
  shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin`;

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
    const code = (error as { code?: string }).code;
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
  await trx.query(
    `select pg_advisory_xact_lock(hashtextextended(
    'stynx-offline-active:' || jsonb_build_array($1::uuid::text,$2::text,
      nullif($3::text,'stynx:no-shift'))::text,0))`,
    [scope.tenantId, input.deviceId, input.shiftId],
  );
}

async function replay(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: CTG9ReserveNumberingInput,
  key: string,
): Promise<CTG9NumberingReservation | null> {
  const row = (
    await trx.query<ReservationRow>(
      `select ${columns},idempotency_fingerprint from offline.numbering_reservations
      where tenant_id=$1::uuid and idempotency_key=$2`,
      [scope.tenantId, key],
    )
  ).rows[0];
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
      await trx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${scope.tenantId}:numbering-reserve:${input.idempotencyKey}`,
      ]);
      const prior = await replay(trx, scope, input, input.idempotencyKey);
      if (prior) return prior;
    }
    await lockReservationScope(trx, scope, input);
    const active = await trx.query(
      `select id from offline.numbering_reservations
      where tenant_id=$1::uuid and device_id=$2
        and nullif(shift_id,'stynx:no-shift') is not distinct from nullif($3::text,'stynx:no-shift')
        and status in ('reserved','blocked') and valid_until>clock_timestamp()
        and reservation_origin in ('e6','ctg9') limit 1`,
      [scope.tenantId, input.deviceId, input.shiftId],
    );
    if (active.rows.length) throw activeReservationError();
    const row = (
      await trx.query<{
        id: string;
        tenant_id: string;
        org_unit_id: string;
        entity_type: string;
        series: string;
        start_number: string;
        end_number: string;
        next_number: string;
        status: NumberingRange['status'];
      }>(
        `select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status
      from offline.numbering_ranges where tenant_id=$1::uuid and ($2::uuid is null or id=$2::uuid)
        and ($2::uuid is not null or (org_unit_id=$3 and entity_type=$4
          and ($5::text is null or series=$5) and ($5::text is not null or status<>'cancelled')))
      order by series limit 1 for update`,
        [
          scope.tenantId,
          input.rangeId ?? null,
          input.orgUnitId,
          input.entityType,
          input.series ?? null,
        ],
      )
    ).rows[0];
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
    await trx.query(
      `update offline.numbering_ranges set next_number=$3,
      status=case when $2=end_number then 'exhausted' else status end,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$5::uuid`,
      [scope.tenantId, end, end + 1, now, range.id],
    );
    const inserted = (
      await trx.query<ReservationRow>(
        `insert into offline.numbering_reservations
      (id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,
        start_number,end_number,next_number,reserved_at,valid_until,status,reservation_origin,
        idempotency_key,idempotency_fingerprint,audit_actor_id)
      values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$10,$12::timestamptz,
        $13::timestamptz,'reserved','ctg9',$14,$15,$16) returning ${columns}`,
        [
          randomUUID(),
          scope.tenantId,
          range.id,
          input.orgUnitId,
          input.entityType,
          range.series,
          (scope as TrustedOfflineSyncScope & { agentId?: string }).agentId ?? scope.actorId,
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
      )
    ).rows[0]!;
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
    const row = (
      await trx.query<ReservationRow>(
        `select ${columns} from offline.numbering_reservations
      where tenant_id=$1::uuid and id=$2::uuid for update`,
        [scope.tenantId, id],
      )
    ).rows[0];
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
    const changed = (
      await trx.query<ReservationRow>(
        `update offline.numbering_reservations
      set status='cancelled',cancellation_reason=$3,cancelled_by=$4,audit_actor_id=$4,updated_at=$5::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid returning ${columns}`,
        [scope.tenantId, id, input.reason ?? null, scope.actorId, now],
      )
    ).rows[0]!;
    const highest = (
      await trx.query<{ number: string | null }>(
        `select max(number) as number
      from offline.numbering_consumption where tenant_id=$1::uuid and reservation_id=$2::uuid
        and status in ('applied','claimed-locally')`,
        [scope.tenantId, id],
      )
    ).rows[0]?.number;
    const next = Math.max(
      Number(row.start_number),
      Number(highest ?? Number(row.start_number) - 1) + 1,
    );
    await trx.query(
      `update offline.numbering_ranges set next_number=$3,
      status=case when status='exhausted' then 'active' else status end,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid and next_number=$5 and status<>'cancelled'`,
      [scope.tenantId, row.range_id, next, now, Number(row.end_number) + 1],
    );
    await trx.query(
      `update offline.numbering_consumption set status='expired'
      where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,
      [scope.tenantId, id],
    );
    return mapReservation(changed);
  });
}
