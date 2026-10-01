import { createHash } from 'node:crypto';
import { OfflineSyncError } from './errors';
import { stableStringify } from './transport';
import type { NumberingRange, OfflineSyncPage, ReserveNumberingInput, TrustedOfflineSyncScope } from './types';

export const listDefaultLimit = 50;
export const listMaxLimit = 200;
const sortInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
/** Keyset ordering key: UTC instant with microseconds, then tie-break identifiers. */
export type SortKey = readonly string[];

const validInstant = (value: string): boolean => {
  if (!sortInstant.test(value)) return false;
  const millis = value.replace(/(\.\d{3})\d{3}Z$/u, '$1Z');
  const parsed = new Date(millis);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === millis;
};

export const sortInstantOf = (value: string | Date): string => new Date(value).toISOString().replace('Z', '000Z');
export const pgSortInstant = (column: string): string => `to_char(${column} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function encodeCursor(key: SortKey): string { return Buffer.from(JSON.stringify(key)).toString('base64url'); }

export function decodeCursor(cursor: string | undefined, arity: number): SortKey | null {
  if (cursor === undefined) return null;
  let values: unknown = null;
  try { values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { /* invalid below */ }
  if (!Array.isArray(values) || values.length !== arity || !values.every(value => typeof value === 'string') || !validInstant(values[0] as string))
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'cursor is invalid.');
  return values as string[];
}

const compare = (a: SortKey, b: SortKey): number => {
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  return 0;
};

/** Builds a page from rows already ordered newest first and fetched with `limit + 1`. */
export function finishPage<T>(rows: readonly { key: SortKey; value: T }[], limit: number): OfflineSyncPage<T> {
  const items = rows.slice(0, limit);
  return { items: items.map(row => row.value), nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]!.key) : null };
}

/** In-memory keyset paging with the same ordering and cursor as PostgreSQL. */
export function pageOf<T>(rows: readonly { key: SortKey; value: T }[], arity: number, cursor: string | undefined, limit: number | undefined): OfflineSyncPage<T> {
  const after = decodeCursor(cursor, arity);
  const ordered = [...rows].sort((a, b) => compare(b.key, a.key)).filter(row => !after || compare(row.key, after) < 0);
  const size = limit ?? listDefaultLimit;
  return finishPage(ordered.slice(0, size + 1), size);
}

const normalInstant = (value: string | undefined): string | undefined => {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
};

/** Stable digest of a reservation request; the computed default `validUntil` is excluded. */
export function reservationFingerprint(scope: TrustedOfflineSyncScope, input: ReserveNumberingInput): string {
  const agentId = (scope as TrustedOfflineSyncScope & { agentId?: string }).agentId ?? scope.actorId;
  return `sha256:${createHash('sha256').update(stableStringify({ agentId, orgUnitId: input.orgUnitId, deviceId: input.deviceId,
    shiftId: input.shiftId, entityType: input.entityType, requestedSize: input.requestedSize, rangeId: input.rangeId,
    series: input.series, validUntil: normalInstant(input.validUntil) })).digest('hex')}`;
}

/** A range for another unit/entity, or a cancelled range, is inactive; a fully consumed one is exhausted. */
export function rangeUnavailableReason(range: NumberingRange, input: ReserveNumberingInput): 'inactive' | 'exhausted' {
  return range.status === 'exhausted' && range.orgUnitId === input.orgUnitId && range.entityType === input.entityType ? 'exhausted' : 'inactive';
}
