import { randomUUID } from 'node:crypto';
import type { Database, Transaction } from '@stynx-nyx/data';
import { consumptionReadInstant, projectNumberingConsumption } from './consumption-projection.js';
import { OfflineSyncError, OfflineSyncUpgradeRequiredError } from './errors.js';
import { decodeCursor, finishPage, pgSortInstant } from './listing.js';
import {
  reconciliationConflict,
  reconciliationList,
  reconciliationRequest,
  reconciliationResult,
} from './reconciliation.js';
import type {
  CTG9NumberingReservation,
  ListNumberingReconciliationsInput,
  NumberingConsumptionEntry,
  NumberingReconciliationRecord,
  OfflineSyncPage,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  TrustedOfflineSyncScope,
} from './types.js';

type HistoryRow = {
  id: string;
  tenant_id: string;
  reservation_id: string;
  actor_id: string;
  created_at: string;
  claimed_numbers: string[];
  user_ref: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  result_json: ReconcileNumberingResult;
};

async function transaction<T>(
  database: Database,
  action: (trx: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await database.tx(action);
  } catch (error) {
    if (['42P01', '42703'].includes((error as { code?: string }).code ?? ''))
      throw new OfflineSyncUpgradeRequiredError('0009');
    throw error;
  }
}

/** Read, claim, snapshot and append are serialized by the same reservation lock. */
export async function pgReconcile(
  database: Database,
  scope: TrustedOfflineSyncScope,
  id: string,
  input: ReconcileNumberingInput,
  now: string,
): Promise<ReconcileNumberingResult> {
  const observedAt = consumptionReadInstant(now);
  const request = reconciliationRequest(scope, input);
  return transaction(database, async (trx) => {
    const reservation = (
      await trx.query<{
        start_number: string;
        end_number: string;
        status: CTG9NumberingReservation['status'];
        valid_until: string;
      }>(
        `select start_number,end_number,status,${pgSortInstant('valid_until')} as valid_until
      from offline.numbering_reservations where tenant_id=$1::uuid and id=$2::uuid for update`,
        [scope.tenantId, id],
      )
    ).rows[0];
    if (!reservation)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    if (input.idempotencyKey !== undefined) {
      const replay = (
        await trx.query<Pick<HistoryRow, 'request_fingerprint' | 'result_json'>>(
          `select request_fingerprint,result_json from offline.numbering_reconciliations
         where tenant_id=$1::uuid and reservation_id=$2::uuid and idempotency_key=$3`,
          [scope.tenantId, id, input.idempotencyKey],
        )
      ).rows[0];
      if (replay) {
        if (replay.request_fingerprint !== request.fingerprint) reconciliationConflict();
        return replay.result_json;
      }
    }
    if (
      request.claimedNumbers.some(
        (number) =>
          number < Number(reservation.start_number) || number > Number(reservation.end_number),
      )
    )
      throw new OfflineSyncError(
        'OFFLINE_SYNC_INVALID_INPUT',
        400,
        'Claim is outside reservation.',
      );
    if (reservation.status === 'reserved') {
      for (const number of request.claimedNumbers)
        await trx.query(
          `insert into offline.numbering_consumption (tenant_id,reservation_id,number,status)
          values ($1::uuid,$2::uuid,$3,'claimed-locally') on conflict (tenant_id,reservation_id,number) do update
          set status=case when offline.numbering_consumption.status='available' then 'claimed-locally' else offline.numbering_consumption.status end`,
          [scope.tenantId, id, number],
        );
      await trx.query(
        `update offline.numbering_reservations set audit_actor_id=$3,updated_at=$4::timestamptz
        where tenant_id=$1::uuid and id=$2::uuid`,
        [scope.tenantId, id, scope.actorId, now],
      );
    }
    const rows = await trx.query<{
      number: string;
      status: NumberingConsumptionEntry['status'];
      server_entity_id: string | null;
      finalized_at: string | null;
    }>(
      `select number,status,server_entity_id,${pgSortInstant('finalized_at')} as finalized_at from offline.numbering_consumption
       where tenant_id=$1::uuid and reservation_id=$2::uuid`,
      [scope.tenantId, id],
    );
    const overrides = new Map(rows.rows.map((entry) => [Number(entry.number), entry]));
    const entries: NumberingConsumptionEntry[] = [];
    for (
      let number = Number(reservation.start_number);
      number <= Number(reservation.end_number);
      number += 1
    ) {
      const entry = overrides.get(number);
      entries.push({
        number,
        status: entry?.status ?? 'available',
        serverEntityId: entry?.server_entity_id ?? null,
        finalizedAt: entry?.finalized_at?.replace(/0{1,3}Z$/u, 'Z') ?? null,
      });
    }
    const reconciliationId = randomUUID();
    const result = reconciliationResult(
      {
        reservationId: id,
        status: reservation.status,
        consumption: projectNumberingConsumption(
          { status: reservation.status, validUntil: reservation.valid_until },
          entries,
          observedAt,
        ),
      },
      request.claimedNumbers,
      reconciliationId,
    );
    await trx.query(
      `insert into offline.numbering_reconciliations
      (id,tenant_id,reservation_id,actor_id,created_at,claimed_numbers,user_ref,idempotency_key,request_fingerprint,result_json)
      values ($1::uuid,$2::uuid,$3::uuid,$4,$5::timestamptz,$6::bigint[],$7,$8,$9,$10::jsonb)`,
      [
        reconciliationId,
        scope.tenantId,
        id,
        scope.actorId,
        now,
        request.claimedNumbers,
        input.userRef ?? null,
        input.idempotencyKey ?? null,
        input.idempotencyKey === undefined ? null : request.fingerprint,
        JSON.stringify(result),
      ],
    );
    return result;
  });
}

export async function pgListReconciliations(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListNumberingReconciliationsInput,
): Promise<OfflineSyncPage<NumberingReconciliationRecord>> {
  const limit = reconciliationList(input);
  const after = decodeCursor(input.cursor, 2);
  return transaction(database, async (trx) => {
    const rows = (
      await trx.query<HistoryRow>(
        `select id,tenant_id,reservation_id,actor_id,${pgSortInstant('created_at')} as created_at,
      claimed_numbers,user_ref,idempotency_key,request_fingerprint,result_json from offline.numbering_reconciliations
      where tenant_id=$1::uuid and reservation_id=$2::uuid
        and ($3::timestamptz is null or (created_at,id) < ($3::timestamptz,$4::uuid))
      order by created_at desc,id desc limit $5`,
        [scope.tenantId, input.reservationId, after?.[0] ?? null, after?.[1] ?? null, limit + 1],
      )
    ).rows;
    return finishPage(
      rows.map((row) => ({
        key: [row.created_at, row.id],
        value: {
          reconciliationId: row.id,
          tenantId: row.tenant_id,
          reservationId: row.reservation_id,
          actorId: row.actor_id,
          createdAt: row.created_at.replace(/000Z$/u, 'Z'),
          claimedNumbers: row.claimed_numbers.map(Number),
          ...(row.user_ref === null ? {} : { userRef: row.user_ref }),
          ...(row.idempotency_key === null ? {} : { idempotencyKey: row.idempotency_key }),
          result: row.result_json,
        },
      })),
      limit,
    );
  });
}
