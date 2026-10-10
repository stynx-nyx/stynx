import { OfflineSyncError } from './errors';
import { OFFLINE_SYNC_NO_SHIFT } from './numbering';
import type { CTG9NumberingReservation, NumberingReservation } from './types';

/** Normalize only the admission scope; never normalize stored values or replay fingerprints. */
export const reservationShiftScope = (shift: string | null): string | null =>
  shift === OFFLINE_SYNC_NO_SHIFT ? null : shift;

export function activeReservationError(): OfflineSyncError {
  return new OfflineSyncError(
    'OFFLINE_SYNC_ACTIVE_RESERVATION',
    409,
    'An active numbering reservation already exists for this device and shift.',
  );
}

/** Fail before a legacy path can return a nullable shift or a durable-only state. */
export function legacyReservation(value: CTG9NumberingReservation): NumberingReservation {
  if (value.shiftId === null || value.status === 'blocked')
    throw new OfflineSyncError(
      'OFFLINE_SYNC_RESERVATION_STATE',
      409,
      'This numbering reservation requires a durable operation.',
    );
  return { ...value, shiftId: value.shiftId, status: value.status };
}
