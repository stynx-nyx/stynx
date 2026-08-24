import type { OutboxBackoffPolicy } from './types';

/**
 * Fixed-interval backoff — every retry waits the same duration regardless of
 * attempt count. Matches pec's hardcoded `now() + interval '15 minutes'`
 * exactly (default `intervalMs` is 15 minutes) and is the module's default
 * policy, so a straight port of pec's outbox behavior needs no configuration.
 */
export class FixedIntervalBackoffPolicy implements OutboxBackoffPolicy {
  constructor(private readonly intervalMs = 15 * 60_000) {}

  nextAttemptAt(_attempt: number, now: Date = new Date()): Date {
    return new Date(now.getTime() + this.intervalMs);
  }
}

export interface ExponentialBackoffOptions {
  /** Delay before the first retry. Default 30s. */
  baseMs?: number;
  /** Multiplier applied per additional attempt. Default 2. */
  factor?: number;
  /** Upper bound on the computed delay, before jitter. Default 1 hour. */
  maxMs?: number;
  /** Uniform random jitter added on top of the capped delay, in [0, jitterMs). Default 5s. */
  jitterMs?: number;
}

/**
 * Exponential backoff with a cap and uniform jitter:
 * `delay = min(baseMs * factor^(attempt-1), maxMs) + random(0, jitterMs)`.
 * `attempt` is 1-indexed (the value already persisted on the row after a
 * claim/retry increments it).
 */
export class ExponentialBackoffPolicy implements OutboxBackoffPolicy {
  private readonly baseMs: number;
  private readonly factor: number;
  private readonly maxMs: number;
  private readonly jitterMs: number;

  constructor(options: ExponentialBackoffOptions = {}) {
    this.baseMs = options.baseMs ?? 30_000;
    this.factor = options.factor ?? 2;
    this.maxMs = options.maxMs ?? 60 * 60_000;
    this.jitterMs = options.jitterMs ?? 5_000;
  }

  nextAttemptAt(attempt: number, now: Date = new Date()): Date {
    const exponent = Math.max(0, attempt - 1);
    const uncapped = this.baseMs * this.factor ** exponent;
    const capped = Math.min(uncapped, this.maxMs);
    const jitter = this.jitterMs > 0 ? Math.floor(Math.random() * this.jitterMs) : 0;
    return new Date(now.getTime() + capped + jitter);
  }
}
