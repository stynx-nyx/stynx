import { is } from 'drizzle-orm';
import {
  PgBigInt53, PgBigInt64, PgBigSerial53, PgBigSerial64,
  PgDate, PgDateString, PgTimestamp, PgTimestampString,
  PgNumeric, PgNumericNumber, PgNumericBigInt,
  PgInterval, PgPointTuple, PgLineTuple, PgVector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// Raw PoolClient representations, not Drizzle application-mode decoding.
// Deliberately does not invoke custom column mappers or normalize a value.
// These are representation classes, not SQL lexical-validity or precision claims.

export function isRawArchiveTemporal(value: unknown): boolean {
  return value instanceof Date || value === Infinity || value === -Infinity ||
    typeof value === 'string';
}

function isRawInterval(value: unknown): boolean {
  // Preserve the prior string-mode acceptance and add stock pg interval objects.
  if (typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const units = new Set(['years', 'months', 'days', 'hours', 'minutes', 'seconds', 'milliseconds']);
  return Object.entries(value).every(([key, field]: [string, unknown]) =>
    units.has(key) && typeof field === 'number');
}

function isRawPoint(value: unknown): boolean {
  // Existing tuple-mode array inputs remain accepted; stock pg returns {x,y}.
  return Array.isArray(value) ||
    (typeof value === 'object' && value !== null && 'x' in value && 'y' in value &&
      typeof value.x === 'number' && typeof value.y === 'number');
}

/** Undefined leaves the existing generic gate and its custom-type limit intact. */
export function knownArchiveDriverValue(column: AnyPgColumn, value: unknown): boolean | undefined {
  if (is(column, PgDate) || is(column, PgDateString) ||
      is(column, PgTimestamp) || is(column, PgTimestampString)) {
    return isRawArchiveTemporal(value);
  }
  if (is(column, PgNumeric) || is(column, PgNumericNumber) || is(column, PgNumericBigInt)) {
    return typeof value === 'number' || typeof value === 'bigint' ||
      typeof value === 'string';
  }
  if (is(column, PgBigInt53) || is(column, PgBigInt64) ||
      is(column, PgBigSerial53) || is(column, PgBigSerial64)) {
    return typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string';
  }
  if (is(column, PgInterval)) return isRawInterval(value);
  if (is(column, PgPointTuple)) return isRawPoint(value);
  if (is(column, PgLineTuple) || is(column, PgVector)) {
    // These installed classes advertise arrays, while an unregistered pg OID
    // returns raw text. No extension installation or application decoding is claimed.
    return typeof value === 'string' || Array.isArray(value);
  }
  return undefined;
}
