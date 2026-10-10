import { OfflineSyncError } from './errors';
import type { OfflineSyncConsumerAttributes, OfflineSyncStynxContext, SyncConflict } from './types';

/** Upper bound, in UTF-8 bytes of the JSON serialization, of `consumerAttributes` (ADR-MOBILE-OFFLINE-0003 D3.3). */
export const OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES = 4096;

/** Reserved top-level key of `context_json` and `evidence` that carries the versioned platform object (D3.1). */
export const stynxKey = 'stynx';

/** Builds the versioned object, dropping members the writing path did not produce. */
export type StynxContextFields = {
  readonly [K in keyof Omit<OfflineSyncStynxContext, 'version'>]?:
    OfflineSyncStynxContext[K] | undefined;
};
export function stynxContextOf(fields: StynxContextFields): OfflineSyncStynxContext {
  const context: Record<string, unknown> = { version: 1 };
  for (const [name, value] of Object.entries(fields))
    if (value !== undefined) context[name] = value;
  return context as unknown as OfflineSyncStynxContext;
}

/** Returns the attributes unchanged, or throws 400 when they are not a JSON object within the byte bound. */
export function boundedConsumerAttributes(
  value: unknown,
): OfflineSyncConsumerAttributes | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES
  )
    throw new OfflineSyncError(
      'OFFLINE_SYNC_INVALID_INPUT',
      400,
      `consumerAttributes must be a JSON object of at most ${OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES} bytes.`,
    );
  return value as OfflineSyncConsumerAttributes;
}

/** Splits a stored `context_json`/`evidence` object into the host-visible context and the platform object (D3.5). */
export function splitStynxContext(stored: Record<string, unknown> | null | undefined): {
  context?: Record<string, unknown>;
  stynx?: OfflineSyncStynxContext;
} {
  if (!stored) return {};
  const { [stynxKey]: platform, ...context } = stored;
  return {
    ...(Object.keys(context).length ? { context } : {}),
    ...(platform && typeof platform === 'object' && !Array.isArray(platform)
      ? { stynx: platform as OfflineSyncStynxContext }
      : {}),
  };
}

/** Attempt count already recorded under the platform object of a stored `context_json`. */
export function recordedAttempts(stored: Record<string, unknown> | null | undefined): number {
  const attempts = (stored?.[stynxKey] as { attempts?: unknown } | undefined)?.attempts;
  return typeof attempts === 'number' && Number.isSafeInteger(attempts) && attempts > 0
    ? attempts
    : 0;
}

/** SQL expression merging `$context` (host keys) and `$stynx` (platform members) into `column` without dropping existing keys. */
export function mergeStynxSql(column: string, contextParam: string, stynxParam: string): string {
  return `coalesce(${column},'{}'::jsonb) || coalesce(${contextParam}::jsonb,'{}'::jsonb) || jsonb_build_object('${stynxKey}',coalesce(${column}->'${stynxKey}','{}'::jsonb) || ${stynxParam}::jsonb)`;
}

/** D2 item 3: an open resolver result is returned without resolution, resolver and instant. */
export function withoutResolution(conflict: SyncConflict): SyncConflict {
  const {
    conflictId,
    tenantId,
    queueItemId,
    localEntityId,
    payloadHash,
    conflictType,
    description,
  } = conflict;
  return {
    conflictId,
    tenantId,
    queueItemId,
    localEntityId,
    payloadHash,
    conflictType,
    description,
    status: 'open',
  };
}
