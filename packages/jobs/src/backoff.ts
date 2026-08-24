import type { BackoffPolicy } from './types';

/** Exponential retry delay with full jitter, bounded by the configured ceiling. */
export function computeBackoffMs(policy: BackoffPolicy, attempt: number, random = Math.random): number {
  const exponential = policy.baseMs * policy.multiplier ** Math.max(0, attempt - 1);
  const ceiling = Math.min(policy.maxMs, exponential);
  return Math.floor(random() * (ceiling + 1));
}

export function normalizeBackoff(policy: Partial<BackoffPolicy>, defaults: BackoffPolicy): BackoffPolicy {
  const result = { ...defaults, ...policy };
  if (!Number.isFinite(result.baseMs) || result.baseMs < 0 || !Number.isFinite(result.maxMs) || result.maxMs < result.baseMs || !Number.isFinite(result.multiplier) || result.multiplier < 1) {
    throw new Error('Invalid job backoff policy');
  }
  return result;
}
