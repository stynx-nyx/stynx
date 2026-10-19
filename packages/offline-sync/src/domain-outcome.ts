import { HttpException } from '@nestjs/common';
import {
  OfflineSyncConfigurationError,
  OfflineSyncError,
  OfflineSyncUpgradeRequiredError,
} from './errors.js';
import { canonicalOfflineSyncPayload } from './payload-integrity.js';
import type {
  CTG9SyncBatchItemInput,
  OfflineSyncDomainOutcome,
  OfflineSyncDomainOutcomeClassifier,
  OfflineSyncItemContext,
} from './types.js';

function closedData(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === 'string' &&
      names.includes(key) &&
      descriptor?.enumerable &&
      'value' in descriptor
    );
  });
}

/** Only an original legal data property can supply a domain code; getters never run. */
export function domainFailureCode(error: unknown): string | undefined {
  try {
    if (!error || typeof error !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    const code: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 255) return undefined;
    canonicalOfflineSyncPayload({ code });
    return code;
  } catch {
    return undefined;
  }
}

/** D1.1: no transaction or raw exception crosses this detached, synchronous boundary. */
export function classifyDomainOutcome(
  classifier: OfflineSyncDomainOutcomeClassifier | undefined,
  error: unknown,
  domainContext: { valid: boolean; context?: Record<string, unknown> },
  item: CTG9SyncBatchItemInput,
  context: OfflineSyncItemContext,
): { valid: boolean; outcome?: OfflineSyncDomainOutcome; code?: string } {
  if (
    !classifier ||
    !domainContext.valid ||
    error instanceof OfflineSyncError ||
    error instanceof OfflineSyncConfigurationError ||
    error instanceof OfflineSyncUpgradeRequiredError ||
    !error ||
    typeof error !== 'object'
  )
    return { valid: true };
  const code = domainFailureCode(error);
  if (code === undefined || code.startsWith('OFFLINE_SYNC')) return { valid: true };
  try {
    const result: unknown = classifier.classify(
      structuredClone({
        code,
        ...(error instanceof HttpException ? { httpStatus: error.getStatus() } : {}),
        ...(domainContext.context ? { context: domainContext.context } : {}),
      }),
      structuredClone(item),
      structuredClone(context),
    );
    if (result === undefined) return { valid: true, code };
    // Consume a genuine rejected async return without invoking an untrusted thenable.
    if (
      result &&
      typeof result === 'object' &&
      Object.getPrototypeOf(result) === Promise.prototype &&
      !Object.hasOwn(result, 'constructor')
    )
      void Promise.prototype.then.call(
        result,
        () => undefined,
        () => undefined,
      );
    if (!closedData(result, ['status', 'conflict'])) return { valid: false };
    const status = result.status;
    if (!['received', 'rejected', 'conflict'].includes(status as string)) return { valid: false };
    const conflict = result.conflict;
    if (conflict !== undefined) {
      if (
        status === 'received' ||
        !closedData(conflict, ['type', 'description']) ||
        !['domain', 'concurrency'].includes(conflict.type as string) ||
        typeof conflict.description !== 'string' ||
        !conflict.description.trim() ||
        Buffer.byteLength(conflict.description) > 4000
      )
        return { valid: false };
      canonicalOfflineSyncPayload({ description: conflict.description });
    }
    return {
      valid: true,
      code,
      outcome: structuredClone(result) as unknown as OfflineSyncDomainOutcome,
    };
  } catch {
    return { valid: false };
  }
}
