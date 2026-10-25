import { OfflineSyncError } from './errors.js';
import type {
  DurableBatchExecutionOptions,
  OfflineSyncConsumerAttributes,
  OfflineSyncStynxContext,
  SyncConflict,
} from './types.js';

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

/** Signals are facts about the configured policy, never inferred concurrency pairs. */
export function executionStynxContext(
  options: DurableBatchExecutionOptions,
  fields: StynxContextFields,
): OfflineSyncStynxContext {
  return stynxContextOf({
    ...fields,
    ...(options.ports.policyResolver &&
    options.ports.concurrencyDetector &&
    options.policy.concurrencyWindowMinutes == null
      ? { signals: [{ code: 'SYNC_CONCURRENCY_WINDOW_SOURCE_PENDING' as const }] }
      : {}),
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function')
    return Reflect.get(target, key, value);
  throw new TypeError('Property receiver is unavailable');
}

function optionalProperty(value: unknown, key: string): unknown {
  return value === null || value === undefined ? undefined : readProperty(value, key);
}

/** Returns the attributes unchanged, or throws 400 when they are not a JSON object within the byte bound. */
export function boundedConsumerAttributes(
  value: unknown,
): OfflineSyncConsumerAttributes | undefined {
  if (value === undefined) return undefined;
  if (
    !isObjectRecord(value) ||
    Buffer.byteLength(JSON.stringify(value)) > OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES
  )
    throw new OfflineSyncError(
      'OFFLINE_SYNC_INVALID_INPUT',
      400,
      `consumerAttributes must be a JSON object of at most ${OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES} bytes.`,
    );
  return value;
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
  const attempts = optionalProperty(stored?.[stynxKey], 'attempts');
  return typeof attempts === 'number' && Number.isSafeInteger(attempts) && attempts > 0
    ? attempts
    : 0;
}

/** SQL expression merging `$context` (host keys) and `$stynx` (platform members) into `column` without dropping existing keys. */
export function mergeStynxSql(column: string, contextParam: string, stynxParam: string): string {
  return `coalesce(${column},'{}'::jsonb) || coalesce(${contextParam}::jsonb,'{}'::jsonb) ||
    case when ${column} ? '${stynxKey}' or coalesce(${stynxParam}::jsonb,'{}'::jsonb) <> '{}'::jsonb
      then jsonb_build_object('${stynxKey}',jsonb_build_object('version',1) || coalesce(${column}->'${stynxKey}','{}'::jsonb) || coalesce(${stynxParam}::jsonb,'{}'::jsonb))
      else '{}'::jsonb end`;
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
