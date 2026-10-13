import { consumptionReadInstant } from './consumption-projection';
import { OfflineSyncError } from './errors';
import { importDigest } from './import-validation';
import { decodeCursor, listDefaultLimit, listMaxLimit } from './listing';
import { rangeText } from './range-administration';
import type {
  ListNumberingReconciliationsInput,
  NumberingConsumptionResult,
  ReconcileNumberingInput,
  ReconcileNumberingResult,
  TrustedOfflineSyncScope,
} from './types';

/** Canonical request identity is shared with the lossless import validator. */
export function reconciliationRequest(
  scope: TrustedOfflineSyncScope,
  input: ReconcileNumberingInput,
) {
  rangeText(scope.actorId, 255);
  rangeText(scope.tenantId, 255);
  if (input.idempotencyKey !== undefined) rangeText(input.idempotencyKey, 255);
  if (
    input.userRef !== undefined &&
    (typeof input.userRef !== 'string' ||
      input.userRef.includes('\0') ||
      Buffer.byteLength(input.userRef) > 255 ||
      Buffer.from(input.userRef).toString('utf8') !== input.userRef)
  )
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'userRef is invalid.');
  if (
    input.claimedNumbers !== undefined &&
    (!Array.isArray(input.claimedNumbers) || !input.claimedNumbers.every(Number.isSafeInteger))
  )
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'claimedNumbers is invalid.');
  const claimedNumbers = [...new Set(input.claimedNumbers ?? [])].sort((a, b) => a - b);
  return {
    claimedNumbers,
    fingerprint: importDigest({ claimedNumbers, userRef: input.userRef ?? null }),
  };
}

export function reconciliationConflict(): never {
  throw new OfflineSyncError(
    'OFFLINE_SYNC_RECONCILIATION_IDEMPOTENCY_CONFLICT',
    409,
    'Reconciliation idempotency key was already used with a different request.',
  );
}

export function reconciliationResult(
  current: NumberingConsumptionResult,
  claimedNumbers: readonly number[],
  reconciliationId: string,
): ReconcileNumberingResult {
  const claims = new Set(claimedNumbers);
  return {
    ...current,
    reconciliationId,
    missingOnServer: current.consumption
      .filter((e) => claims.has(e.number) && e.status !== 'applied')
      .map((e) => e.number),
    unexpectedOnServer: current.consumption
      .filter((e) => !claims.has(e.number) && e.status === 'applied')
      .map((e) => e.number),
  };
}

export function reconciliationList(input: ListNumberingReconciliationsInput): number {
  rangeText(input.reservationId, 255);
  const limit = input.limit ?? listDefaultLimit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > listMaxLimit)
    throw new OfflineSyncError(
      'OFFLINE_SYNC_INVALID_INPUT',
      400,
      `limit must be an integer between 1 and ${listMaxLimit}.`,
    );
  decodeCursor(input.cursor, 2);
  return limit;
}

/** Retain injected microseconds while producing the established keyset cursor instant. */
export function reconciliationSortInstant(value: string): string {
  const micros = consumptionReadInstant(value);
  const remainder = ((micros % 1000n) + 1000n) % 1000n;
  return new Date(Number((micros - remainder) / 1000n))
    .toISOString()
    .replace('Z', `${remainder.toString().padStart(3, '0')}Z`);
}
