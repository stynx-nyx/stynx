/** Recurring schedule cadence. Cron uses a 5-field UTC expression; interval is a fixed period. */
export type ScheduleKind = 'cron' | 'interval';

/** Lifecycle status of a claimable `jobs.jobs` row. */
export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead_letter' | 'canceled';

/** Exponential-backoff-with-full-jitter policy for retrying a failed job. */
export interface BackoffPolicy {
  /** Delay before the first retry, in milliseconds. */
  baseMs: number;
  /** Ceiling on the computed delay, in milliseconds. */
  maxMs: number;
  /** Multiplier applied per additional attempt. Must be >= 1. */
  multiplier: number;
}

/** A materialized or one-shot background job row. */
export interface JobRecord {
  id: string;
  tenantId: string | null;
  scheduleId: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedBy: string | null;
  lockedUntil: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  deadLetterReason: string | null;
  idempotencyKey: string | null;
  actorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A recurring schedule definition. */
export interface ScheduleRecord {
  id: string;
  tenantId: string | null;
  name: string;
  jobType: string;
  kind: ScheduleKind;
  cronExpression: string | null;
  intervalSeconds: number | null;
  payload: Record<string, unknown>;
  priority: number;
  maxAttempts: number;
  backoff: BackoffPolicy;
  isEnabled: boolean;
  nextRunAt: Date;
  lastEnqueuedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for `JobsService.enqueue()` — a one-shot, optionally delayed job. */
export interface EnqueueJobInput {
  jobType: string;
  payload?: Record<string, unknown>;
  /** Required: jobs are always tenant-owned and protected by RLS (I5). */
  tenantId: string;
  /**
   * Required for the handler to run under tenant `RequestContext` (see
   * `JobHandlerContext`). Without it the handler still runs, but only under
   * `withSystemContext` — it must scope its own writes explicitly.
   */
  actorId?: string;
  /** Absolute execution time. Mutually exclusive with `delayMs`. */
  runAt?: Date;
  /** Execute after this many milliseconds from now. Mutually exclusive with `runAt`. */
  delayMs?: number;
  priority?: number;
  maxAttempts?: number;
  /** Dedupes on `(tenantId, jobType, idempotencyKey)`; a repeat call returns the existing row. */
  idempotencyKey?: string;
}

/** Input for `JobsService.upsertSchedule()` — a recurring definition. */
export interface UpsertScheduleInput {
  name: string;
  jobType: string;
  tenantId: string;
  kind: ScheduleKind;
  /** Required when `kind === 'cron'`. 5-field UTC expression: minute hour day-of-month month day-of-week. */
  cronExpression?: string;
  /** Required when `kind === 'interval'`. Must be a positive integer. */
  intervalSeconds?: number;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  backoff?: Partial<BackoffPolicy>;
  isEnabled?: boolean;
  createdBy?: string;
}

/** Context passed to a `JobHandler` alongside its payload. */
export interface JobHandlerContext {
  jobId: string;
  jobType: string;
  tenantId: string | null;
  actorId: string | null;
  attempt: number;
  maxAttempts: number;
  scheduleId: string | null;
}

/** A registered handler for one `jobType`. Throwing triggers the retry/backoff/dead-letter path. */
export type JobHandler<TPayload = Record<string, unknown>> = (
  payload: TPayload,
  context: JobHandlerContext,
) => Promise<void>;

/**
 * The narrow port other packages depend on to schedule work through
 * `@stynx-nyx/jobs` without reaching into its storage. `@stynx-nyx/worklist`
 * schedules SLA/prazo-clock checks through this surface.
 */
export interface JobsPort {
  enqueue(input: EnqueueJobInput): Promise<JobRecord>;
  cancel(jobId: string, tenantId?: string): Promise<boolean>;
  getJob(jobId: string, tenantId?: string): Promise<JobRecord | null>;
  upsertSchedule(input: UpsertScheduleInput): Promise<ScheduleRecord>;
  getSchedule(scheduleId: string, tenantId?: string): Promise<ScheduleRecord | null>;
  pauseSchedule(scheduleId: string, tenantId?: string): Promise<void>;
  resumeSchedule(scheduleId: string, tenantId?: string): Promise<void>;
  deleteSchedule(scheduleId: string, tenantId?: string): Promise<void>;
}

export interface WorkerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  batchSize?: number;
  visibilityTimeoutMs?: number;
  /** Identifies this process in `jobs.jobs.locked_by`. Defaults to a random id per instance. */
  workerId?: string;
}

export interface SchedulerOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
  batchSize?: number;
}

export interface StynxJobsModuleOptions {
  worker?: WorkerOptions;
  scheduler?: SchedulerOptions;
  /**
   * Handlers registered at module setup time. Handlers registered later via
   * `JobsRegistry.register()` (e.g. from another module's `onModuleInit`,
   * with its own dependencies injected) are equally valid and more common
   * for cross-package consumers such as `@stynx-nyx/worklist`.
   */
  handlers?: Record<string, JobHandler>;
}
