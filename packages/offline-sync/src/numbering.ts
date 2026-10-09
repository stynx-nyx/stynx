/**
 * Documented "no shift" sentinel for `ReserveNumberingInput.shiftId`
 * (ADR-MOBILE-OFFLINE-0003 D5, UPS-OFS-12). A host without a shift sends this value and maps it
 * back on output. It is an ordinary `shiftId` to the store and to the reservation idempotency
 * fingerprint. Every other `stynx:`-prefixed shift identifier is reserved and rejected as invalid
 * input.
 */
export const OFFLINE_SYNC_NO_SHIFT = 'stynx:no-shift';
