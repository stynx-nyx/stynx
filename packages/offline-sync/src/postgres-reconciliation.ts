import { lockReconciliationReservation, replayReconciliation, claimReconciliationNumber, touchReconciliationReservation, reconciliationConsumption, appendReconciliation, listReconciliations } from './reconciliation.repository.js';
import { randomUUID } from 'node:crypto';
import type { Database, Transaction } from '@stynx-nyx/data';
import { consumptionReadInstant, projectNumberingConsumption } from './consumption-projection.js';
import { OfflineSyncError, OfflineSyncUpgradeRequiredError } from './errors.js';
import { decodeCursor, finishPage } from './listing.js';
import {
  reconciliationConflict,
  reconciliationList,
  reconciliationRequest,
  reconciliationResult,
} from './reconciliation.js';
import type {
  ListNumberingReconciliationsInput,
  NumberingConsumptionEntry,
  NumberingReconciliationRecord,
  OfflineSyncPage,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  TrustedOfflineSyncScope,
} from './types.js';



async function transaction<T>(
  database: Database,
  action: (trx: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await database.tx(action);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error.code === '42P01' || error.code === '42703'))
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
      await trx.run(lockReconciliationReservation,
        [scope.tenantId, id],
      )
    );
    if (!reservation)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    if (input.idempotencyKey !== undefined) {
      const replay = (
        await trx.run(replayReconciliation,
          [scope.tenantId, id, input.idempotencyKey],
        )
      );
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
        await trx.run(claimReconciliationNumber,
          [scope.tenantId, id, number],
        );
      await trx.run(touchReconciliationReservation,
        [scope.tenantId, id, scope.actorId, now],
      );
    }
    const rows = await trx.run(reconciliationConsumption,
      [scope.tenantId, id],
    );
    const overrides = new Map(rows.map((entry) => [Number(entry.number), entry]));
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
    await trx.run(appendReconciliation,
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
      await trx.run(listReconciliations,
        [scope.tenantId, input.reservationId, after?.[0] ?? null, after?.[1] ?? null, limit + 1],
      )
    );
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
