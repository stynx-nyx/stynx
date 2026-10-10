import { createHash } from 'node:crypto';
import { OfflineSyncConfigurationError, OfflineSyncError } from './errors';
import { canonicalPayloadHash } from './listing';
import type {
  CTG9SyncBatchItemInput,
  OfflineSyncItemContext,
  OfflineSyncPayloadHashPort,
} from './types';

function invalid(): never {
  throw new OfflineSyncError(
    'OFFLINE_SYNC_INVALID_INPUT',
    400,
    'Payload must contain only unambiguous JSON values.',
  );
}
function text(value: string): string {
  if (Buffer.from(value, 'utf8').toString('utf8') !== value) invalid();
  return JSON.stringify(value);
}
/** Canonical JSON: UTF-16 sorted object keys, JSON number/string encoding and original array order. */
export function canonicalOfflineSyncPayload(payload: Record<string, unknown>): string {
  const ancestors = new Set<object>();
  const encode = (value: unknown): string => {
    if (value === null) return 'null';
    if (typeof value === 'string') return text(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) invalid();
      return JSON.stringify(value);
    }
    if (typeof value !== 'object') invalid();
    if (ancestors.has(value)) invalid();
    ancestors.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.getOwnPropertySymbols(value).length) invalid();
      if (Array.isArray(value)) {
        if (
          Object.keys(descriptors).some(
            (key) =>
              key !== 'length' &&
              (!/^(0|[1-9][0-9]*)$/u.test(key) ||
                !Number.isSafeInteger(Number(key)) ||
                Number(key) >= value.length),
          )
        )
          invalid();
        const items: string[] = [];
        for (let index = 0; index < value.length; index += 1) {
          const entry = descriptors[String(index)];
          if (!entry?.enumerable || !('value' in entry)) invalid();
          items.push(encode(entry.value));
        }
        return `[${items.join(',')}]`;
      }
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        invalid();
      return `{${Object.keys(descriptors)
        .sort()
        .map((key) => {
          const entry = descriptors[key]!;
          if (!entry.enumerable || !('value' in entry)) invalid();
          return `${text(key)}:${encode(entry.value)}`;
        })
        .join(',')}}`;
    } finally {
      ancestors.delete(value);
    }
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid();
  return encode(payload);
}

/** Producers and the default verifier hash precisely these canonical payload bytes. */
export function canonicalOfflineSyncPayloadHash(payload: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalOfflineSyncPayload(payload), 'utf8').digest('hex')}`;
}

export async function verifyOfflineSyncPayloadHash(
  item: CTG9SyncBatchItemInput,
  context: OfflineSyncItemContext,
  port?: OfflineSyncPayloadHashPort,
): Promise<boolean> {
  if (!canonicalPayloadHash.test(item.payloadHash)) return false;
  const computed = port
    ? await port.hash(item, context)
    : canonicalOfflineSyncPayloadHash(item.payloadJson);
  if (typeof computed !== 'string' || !canonicalPayloadHash.test(computed))
    throw new OfflineSyncConfigurationError('payloadHashPort');
  return computed === item.payloadHash;
}
