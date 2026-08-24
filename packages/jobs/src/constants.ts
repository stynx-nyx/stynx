export const STYNX_JOBS_OPTIONS = Symbol('STYNX_JOBS_OPTIONS');
export const STYNX_JOBS_REGISTRY = Symbol('STYNX_JOBS_REGISTRY');
export const STYNX_JOBS_METRICS = Symbol('STYNX_JOBS_METRICS');

/** Default poll cadence for `JobsWorker` when `worker.pollIntervalMs` is omitted. */
export const DEFAULT_WORKER_POLL_INTERVAL_MS = 2_000;
/** Default poll cadence for `JobsScheduler` when `scheduler.pollIntervalMs` is omitted. */
export const DEFAULT_SCHEDULER_POLL_INTERVAL_MS = 5_000;
/** Default number of jobs a single worker tick claims. */
export const DEFAULT_WORKER_BATCH_SIZE = 10;
/** Default number of schedules a single scheduler tick materializes. */
export const DEFAULT_SCHEDULER_BATCH_SIZE = 25;
/** Default visibility timeout: how long a claimed row stays invisible before the reaper reclaims it. */
export const DEFAULT_VISIBILITY_TIMEOUT_MS = 60_000;
/** Default retry ceiling for jobs enqueued or scheduled without an explicit override. */
export const DEFAULT_MAX_ATTEMPTS = 5;
/** Default exponential backoff policy: 1s base, 5min ceiling, x2 multiplier, full jitter. */
export const DEFAULT_BACKOFF_POLICY = {
  baseMs: 1_000,
  maxMs: 300_000,
  multiplier: 2,
} as const;
