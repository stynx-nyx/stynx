import { instantMicroseconds } from './instant-microseconds';
import { OfflineSyncError } from './errors';
import type { CTG9NumberingReservation, NumberingConsumptionEntry } from './types';

/** Capture one observation instant; this does not authorize reservation admission. */
export function consumptionReadInstant(now?: string): bigint {
  return instantMicroseconds(now === undefined ? new Date().toISOString() : now, () => {
    throw new OfflineSyncError(
      'OFFLINE_SYNC_INVALID_INPUT',
      400,
      'Invalid consumption read instant.',
    );
  });
}

/** Derive unused-number expiry without mutating reservation or consumption history. */
export function projectNumberingConsumption(
  reservation: Pick<CTG9NumberingReservation, 'status' | 'validUntil'>,
  entries: readonly NumberingConsumptionEntry[],
  observedAt: bigint,
): NumberingConsumptionEntry[] {
  const fallback: NumberingConsumptionEntry['status'] =
    reservation.status === 'blocked'
      ? 'blocked'
      : reservation.status === 'expired' ||
          reservation.status === 'cancelled' ||
          reservation.status === 'consumed' ||
          consumptionReadInstant(reservation.validUntil) <= observedAt
        ? 'expired'
        : 'available';
  return entries.map((entry) => ({
    ...entry,
    status: entry.status === 'available' ? fallback : entry.status,
  }));
}
