import { OfflineSyncError } from './errors.js';
import { canonicalOfflineSyncPayload, canonicalOfflineSyncPayloadHash } from './payload-integrity.js';
import { boundedConsumerAttributes } from './stynx-context.js';
import type {
  CancelNumberingRangeInput,
  CreateNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRange,
  TrustedOfflineSyncScope,
} from './types.js';

const invalid = (): never => {
  throw new OfflineSyncError(
    'OFFLINE_SYNC_INVALID_INPUT',
    400,
    'Numbering range input is invalid.',
  );
};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

function shape(input: object, allowed: readonly string[]): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Object.getOwnPropertySymbols(input).length
  )
    invalid();
  for (const key of Object.getOwnPropertyNames(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!allowed.includes(key) || !descriptor.enumerable || !('value' in descriptor)) invalid();
  }
}

export function rangeText(value: string, maximum: number): void {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0') ||
    Buffer.byteLength(value) > maximum ||
    Buffer.from(value).toString('utf8') !== value
  )
    invalid();
}

export function rangeIdentity(value: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) invalid();
  return value.toLowerCase();
}

export function rangeCreation(
  scope: TrustedOfflineSyncScope,
  input: CreateNumberingRangeInput,
): { input: CreateNumberingRangeInput; fingerprint: string } {
  shape(input, [
    'orgUnitId',
    'entityType',
    'series',
    'startNumber',
    'endNumber',
    'idempotencyKey',
    'consumerAttributes',
  ]);
  rangeText(input.orgUnitId, 255);
  rangeText(input.entityType, 100);
  rangeText(input.series, 80);
  if (input.idempotencyKey !== undefined) rangeText(input.idempotencyKey, 255);
  if (
    !Number.isSafeInteger(input.startNumber) ||
    !Number.isSafeInteger(input.endNumber) ||
    !Number.isSafeInteger(input.endNumber + 1) ||
    input.startNumber > input.endNumber
  )
    invalid();
  let attributes: Record<string, unknown> | undefined;
  if (input.consumerAttributes !== undefined) {
    try {
      attributes = boundedConsumerAttributes(
        JSON.parse(canonicalOfflineSyncPayload(input.consumerAttributes)),
      );
    } catch {
      invalid();
    }
  }
  const request = {
    orgUnitId: input.orgUnitId,
    entityType: input.entityType,
    series: input.series,
    startNumber: input.startNumber,
    endNumber: input.endNumber,
    ...(attributes === undefined ? {} : { consumerAttributes: attributes }),
  };
  return {
    input: {
      ...request,
      ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    },
    fingerprint: canonicalOfflineSyncPayloadHash({ tenantId: scope.tenantId, ...request }),
  };
}

export function rangeCancellation(input: CancelNumberingRangeInput): CancelNumberingRangeInput {
  shape(input, ['reason']);
  if (input.reason === undefined) return {};
  rangeText(input.reason, 500);
  return { reason: input.reason };
}

export function rangeList(
  input: ListNumberingRangesInput,
): ListNumberingRangesInput & { limit: number } {
  shape(input, ['orgUnitId', 'entityType', 'series', 'status', 'limit', 'cursor']);
  if (input.orgUnitId !== undefined) rangeText(input.orgUnitId, 255);
  if (input.entityType !== undefined) rangeText(input.entityType, 100);
  if (input.series !== undefined) rangeText(input.series, 80);
  if (input.status !== undefined && !['active', 'exhausted', 'cancelled'].includes(input.status))
    invalid();
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) invalid();
  return {
    ...input,
    limit,
    ...(input.cursor === undefined ? {} : { cursor: rangeIdentity(input.cursor) }),
  };
}

export function rangeConflict(kind: 'key' | 'scope' | 'state'): OfflineSyncError {
  if (kind === 'key')
    return new OfflineSyncError(
      'OFFLINE_SYNC_RANGE_IDEMPOTENCY_CONFLICT',
      409,
      'Range creation key was already used with a different request.',
    );
  if (kind === 'scope')
    return new OfflineSyncError(
      'OFFLINE_SYNC_RANGE_CONFLICT',
      409,
      'A numbering range already exists for this organizational unit, entity and series.',
    );
  return new OfflineSyncError(
    'OFFLINE_SYNC_RANGE_STATE',
    409,
    'Only an active numbering range can be cancelled.',
  );
}

export const rangeNotFound = (): OfflineSyncError =>
  new OfflineSyncError('OFFLINE_SYNC_RANGE_NOT_FOUND', 404, 'Numbering range was not found.');

/** Detach mutable opaque attributes and immutable receipt snapshots from caller-owned objects. */
export const cloneRange = (range: NumberingRange): NumberingRange =>
  JSON.parse(JSON.stringify(range)) as NumberingRange;
