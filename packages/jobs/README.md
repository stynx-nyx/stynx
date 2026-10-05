# `@stynx-nyx/jobs` — Postgres-backed recurring scheduler and background-worker runtime

`@stynx-nyx/jobs` is the STYNX background-work package (spec extension E2). It stores one-shot jobs and recurring schedules in Postgres, materializes due schedules into job rows, claims due jobs atomically with `FOR UPDATE SKIP LOCKED`, and runs registered handlers under the persisted tenant and actor. Jobs are always tenant-owned. Consumers enqueue one-shot work through `JobsPort`, or register a handler with `JobsRegistry`.

## Purpose

A multi-tenant application needs delayed and recurring work that survives restarts, is not executed twice by concurrent workers, and still runs under tenant row-level security. This package provides that with three cooperating providers:

- `JobsService` validates and persists one-shot jobs and named schedules under the caller's request context.
- `JobsScheduler` polls for due schedules and inserts one job row per due occurrence.
- `JobsWorker` polls for due jobs, claims a batch, runs the handler registered for each `jobType`, and records success, retry or dead-letter.

Queue materialization, claiming and status transitions run in STYNX system context. Handlers do not: each handler runs inside a request context built from the job's persisted `tenantId` and `actorId`, after the worker has confirmed that the actor still has an active membership in that tenant.

What it does not do: this package deliberately does not expose a controller, so applications retain their own authorization and domain APIs. It does not create its own tables; the platform migrations do. It is not a general cron implementation: the cron grammar is a 5-field subset (see [Common pitfalls](#common-pitfalls)).

## Audience

Backend developers who need delayed, retried or recurring tenant-scoped work in a STYNX NestJS application, and package authors who want to schedule work through the narrow `JobsPort` interface without reading job storage directly.

## Install

```bash
pnpm add @stynx-nyx/jobs
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

**Node:** 24.x.

Apply the platform migrations before enabling workers. The job tables are created by `packages/data/migrations/platform/0018_jobs.sql` and extended by `packages/data/migrations/platform/0019_jobs_actor_timezone.sql`.

## Quick start

Register the module and at least one handler. `StynxJobsModule` injects `RequestContext` from `@stynx-nyx/core` and `Database` from `@stynx-nyx/data`, so the host application must already provide both.

```ts
import { Module } from '@nestjs/common';
import { StynxJobsModule } from '@stynx-nyx/jobs';

@Module({
  imports: [
    StynxJobsModule.forRoot({
      handlers: {
        'worklist.sla-check': async (payload, context) => {
          // runs with context.tenantId / context.actorId as the request context
        },
      },
    }),
  ],
})
export class AppModule {}
```

Enqueue a one-shot job from request-scoped code. `tenantId` must equal the tenant of the active request context.

```ts
import { Injectable } from '@nestjs/common';
import { JobsService } from '@stynx-nyx/jobs';

@Injectable()
export class SlaChecks {
  constructor(private readonly jobs: JobsService) {}

  schedule(tenantId: string, itemId: string) {
    return this.jobs.enqueue({
      tenantId,
      jobType: 'worklist.sla-check',
      payload: { itemId },
      delayMs: 60_000,
      idempotencyKey: `sla:${itemId}`,
    });
  }
}
```

## Public API surface

### Modules

| Export            | Signature                                    | Description                                                                                                                                                |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxJobsModule` | `.forRoot(options?: StynxJobsModuleOptions)` | Registers the service, registry, worker and scheduler, and exports `JobsService`, `JobsRegistry`, `JobsWorker`, `JobsScheduler` and `STYNX_JOBS_REGISTRY`. |

### Services

| Export          | Description                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JobsService`   | Implements `JobsPort`: `enqueue`, `getJob`, `cancel`, `upsertSchedule`, `getSchedule`, `pauseSchedule`, `resumeSchedule`, `deleteSchedule`. Also exposes `defaultBackoff` (`DEFAULT_BACKOFF_POLICY`). |
| `JobsRegistry`  | `register(jobType, handler)` binds exactly one handler to a job type; `get(jobType)` returns it or throws `UnknownJobTypeError`.                                                                      |
| `JobsWorker`    | Polls and executes due jobs. `start()` and `stop()` are called from the Nest lifecycle hooks; `tick()` claims and runs one batch and resolves to the number of jobs claimed.                          |
| `JobsScheduler` | Polls due schedules. `start()`, `stop()`, and `tick()`, which resolves to the number of schedules materialized.                                                                                       |

### Functions

| Export                | Signature                                                   | Description                                                                                             |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `parseCronExpression` | `(expression: string): ParsedCron`                          | Parses a 5-field expression; throws `InvalidCronExpressionError` when malformed.                        |
| `nextCronRunAt`       | `(expression: string, after: Date, timezone = 'UTC'): Date` | Next matching minute boundary strictly after `after`, evaluated in `timezone`.                          |
| `computeBackoffMs`    | `(policy: BackoffPolicy, attempt: number, random?): number` | Exponential delay with full jitter, bounded by `policy.maxMs`.                                          |
| `normalizeBackoff`    | `(policy: Partial<BackoffPolicy>, defaults): BackoffPolicy` | Merges a partial policy over defaults and throws a plain `Error` when the result is not a valid policy. |

### Constants and tokens

| Export                               | Value                                              | Description                                                              |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `DEFAULT_WORKER_POLL_INTERVAL_MS`    | `2_000`                                            | Worker poll cadence when `worker.pollIntervalMs` is omitted.             |
| `DEFAULT_SCHEDULER_POLL_INTERVAL_MS` | `5_000`                                            | Scheduler poll cadence when `scheduler.pollIntervalMs` is omitted.       |
| `DEFAULT_WORKER_BATCH_SIZE`          | `10`                                               | Jobs claimed per worker tick.                                            |
| `DEFAULT_SCHEDULER_BATCH_SIZE`       | `25`                                               | Schedules materialized per scheduler tick.                               |
| `DEFAULT_VISIBILITY_TIMEOUT_MS`      | `60_000`                                           | How long a claimed row stays invisible before another claim can take it. |
| `DEFAULT_MAX_ATTEMPTS`               | `5`                                                | Retry ceiling when a job or schedule gives no `maxAttempts`.             |
| `DEFAULT_BACKOFF_POLICY`             | `{ baseMs: 1_000, maxMs: 300_000, multiplier: 2 }` | Default exponential backoff policy.                                      |
| `STYNX_JOBS_OPTIONS`                 | injection token                                    | The options object passed to `forRoot()`.                                |
| `STYNX_JOBS_REGISTRY`                | injection token                                    | Alias of the `JobsRegistry` provider.                                    |
| `STYNX_JOBS_METRICS`                 | injection token                                    | Exported symbol; no provider in this package binds or reads it.          |

### Errors

Every error extends `StynxJobsError`, which extends `StynxError` from `@stynx-nyx/core`.

| Export                          | Code                          | Status | Raised when                                                                                      |
| ------------------------------- | ----------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `InvalidJobInputError`          | `JOB_INPUT_INVALID`           | 400    | `enqueue`, `getJob` or `cancel` receives missing or contradictory input.                         |
| `InvalidScheduleError`          | `SCHEDULE_INVALID`            | 400    | A schedule input is incomplete, has a non-canonical timezone, or mixes cron and interval fields. |
| `InvalidCronExpressionError`    | `CRON_EXPRESSION_INVALID`     | 400    | A cron expression is malformed or matches nothing within the search window.                      |
| `ScheduleActorRequiredError`    | `SCHEDULE_ACTOR_REQUIRED`     | 400    | A schedule is upserted without `actorId`, or an actorless schedule is resumed.                   |
| `JobTenantMismatchError`        | `JOB_TENANT_MISMATCH`         | 403    | The `tenantId` argument differs from the tenant of the active request context.                   |
| `JobActorMembershipError`       | `JOB_ACTOR_MEMBERSHIP`        | 403    | The job or schedule actor has no active membership in the tenant.                                |
| `JobActorAssignmentDeniedError` | `JOB_ACTOR_ASSIGNMENT_DENIED` | 403    | The actor differs from the caller and `authorizeTechnicalActor` did not return `true`.           |
| `JobNotFoundError`              | `JOB_NOT_FOUND`               | 404    | Exported for consumers; `getJob` itself resolves to `null` for an unknown id.                    |
| `ScheduleNotFoundError`         | `SCHEDULE_NOT_FOUND`          | 404    | Exported for consumers; `getSchedule` itself resolves to `null` for an unknown id.               |
| `UnknownJobTypeError`           | `JOB_TYPE_UNKNOWN`            | 500    | `JobsRegistry.get()` finds no handler, or `register()` receives a blank job type.                |
| `DuplicateJobTypeHandlerError`  | `JOB_TYPE_HANDLER_DUPLICATE`  | 500    | A second handler is registered for the same job type.                                            |

`JobsService` also throws `TenantContextMissingError` and `ActorContextMissingError` from `@stynx-nyx/data` when the request context carries no tenant or actor.

### Types

| Export                                                        | Description                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JobsPort`                                                    | The narrow interface other packages depend on to schedule work; `JobsService` implements it.                                                                                                                                   |
| `EnqueueJobInput`                                             | Input of `enqueue()`: `jobType`, `tenantId`, optional `payload`, `actorId`, `runAt` or `delayMs`, `priority`, `maxAttempts`, `idempotencyKey`.                                                                                 |
| `UpsertScheduleInput`                                         | Input of `upsertSchedule()`: `name`, `jobType`, `tenantId`, `actorId`, `kind`, plus `cronExpression` or `intervalSeconds`, and optional `timezone`, `payload`, `priority`, `maxAttempts`, `backoff`, `isEnabled`, `createdBy`. |
| `JobRecord`, `ScheduleRecord`                                 | Stored job and schedule rows as returned by the service.                                                                                                                                                                       |
| `JobStatus`                                                   | `'pending' \| 'running' \| 'succeeded' \| 'failed' \| 'dead_letter' \| 'canceled'`.                                                                                                                                            |
| `ScheduleKind`                                                | `'cron' \| 'interval'`.                                                                                                                                                                                                        |
| `JobHandler`, `JobHandlerContext`                             | Handler signature `(payload, context) => Promise<void>` and its context (`jobId`, `jobType`, `tenantId`, `actorId`, `attempt`, `maxAttempts`, `scheduleId`).                                                                   |
| `JobExecutionResult`                                          | `executed`, or `not_executable` with reason `missing_actor` or `inactive_actor_membership`.                                                                                                                                    |
| `BackoffPolicy`                                               | `{ baseMs, maxMs, multiplier }`.                                                                                                                                                                                               |
| `ParsedCron`                                                  | Parsed field sets returned by `parseCronExpression`.                                                                                                                                                                           |
| `StynxJobsModuleOptions`, `WorkerOptions`, `SchedulerOptions` | Module options; see [Configuration](#configuration).                                                                                                                                                                           |
| `TimerPort`, `TimerHandle`, `ClockPort`                       | Injectable timer and clock seams used by the worker and scheduler, mainly for tests.                                                                                                                                           |

## Configuration

All options are optional; `StynxJobsModule.forRoot()` with no argument starts a worker and a scheduler with the defaults below.

| Option                       | Type                            | Default                  | Description                                                                                                                                                                            |
| ---------------------------- | ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handlers`                   | `Record<string, JobHandler>`    | none                     | Handlers registered at module setup. Handlers can also be registered later with `JobsRegistry.register()`.                                                                             |
| `authorizeTechnicalActor`    | `(request) => Promise<boolean>` | none (assignment denied) | Called when a job or schedule names an actor other than the caller. The request carries `tenantId`, `callerActorId`, `technicalActorId` and `permission: 'jobs.assignTechnicalActor'`. |
| `worker.enabled`             | `boolean`                       | `true`                   | `false` prevents the worker timer from starting; `tick()` can still be called directly.                                                                                                |
| `worker.pollIntervalMs`      | `number`                        | `2_000`                  | Worker poll cadence.                                                                                                                                                                   |
| `worker.batchSize`           | `number`                        | `10`                     | Jobs claimed per tick.                                                                                                                                                                 |
| `worker.visibilityTimeoutMs` | `number`                        | `60_000`                 | Lock duration of a claimed job.                                                                                                                                                        |
| `worker.workerId`            | `string`                        | `jobs-<random UUID>`     | Identifies this process as the lock holder of the jobs it claims.                                                                                                                      |
| `worker.timer`               | `TimerPort`                     | Node `setInterval`       | Timer seam.                                                                                                                                                                            |
| `worker.clock`               | `ClockPort`                     | `Date.now()`             | Clock used to compute retry times.                                                                                                                                                     |
| `scheduler.enabled`          | `boolean`                       | `true`                   | `false` prevents the scheduler timer from starting.                                                                                                                                    |
| `scheduler.pollIntervalMs`   | `number`                        | `5_000`                  | Scheduler poll cadence.                                                                                                                                                                |
| `scheduler.batchSize`        | `number`                        | `25`                     | Schedules materialized per tick.                                                                                                                                                       |
| `scheduler.timer`            | `TimerPort`                     | Node `setInterval`       | Timer seam.                                                                                                                                                                            |

The package reads no environment variables.

## Examples

### Example 1 — register a handler from another module

Handlers registered from a consuming module's `onModuleInit` can use that module's own injected dependencies.

```ts
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobsRegistry } from '@stynx-nyx/jobs';

@Injectable()
export class ReportJobs implements OnModuleInit {
  constructor(private readonly registry: JobsRegistry) {}

  onModuleInit(): void {
    this.registry.register('reports.daily', async (payload, context) => {
      // context.attempt starts at 1; throwing triggers retry or dead-letter
    });
  }
}
```

### Example 2 — a cron schedule in a local timezone

`upsertSchedule` is keyed by tenant and `name`: calling it again with the same name updates the schedule. `actorId` is required and must be a UUID with an active membership in the tenant.

```ts
await jobs.upsertSchedule({
  tenantId,
  actorId: technicalActorId,
  name: 'daily-report',
  jobType: 'reports.daily',
  kind: 'cron',
  cronExpression: '30 6 * * 1-5',
  timezone: 'America/Manaus',
});
```

### Example 3 — a fixed interval, then pause and resume

```ts
const schedule = await jobs.upsertSchedule({
  tenantId,
  actorId: technicalActorId,
  name: 'sla-sweep',
  jobType: 'worklist.sla-check',
  kind: 'interval',
  intervalSeconds: 300,
});

await jobs.pauseSchedule(schedule.id, tenantId);
await jobs.resumeSchedule(schedule.id, tenantId);
```

### Example 4 — drive the worker manually

With the timers disabled, a test or a host-owned poller can run one batch at a time.

```ts
StynxJobsModule.forRoot({ worker: { enabled: false }, scheduler: { enabled: false } });

const materialized = await scheduler.tick();
const claimed = await worker.tick();
```

## Common pitfalls

- **`tenantId` is required at runtime on every `JobsPort` method.** The `JobsPort` signatures mark it optional on `getJob`, `cancel` and the schedule methods, but `JobsService` throws `InvalidJobInputError` or `InvalidScheduleError` when it is missing, and `JobTenantMismatchError` when it differs from the request context tenant.
- **`runAt` and `delayMs` are mutually exclusive**, and `delayMs` must not be negative. Without either, the job is due immediately.
- **A repeated `idempotencyKey` returns the existing row.** Deduplication is per tenant, job type and key; the second call does not replace the payload.
- **Naming a different actor is denied by default.** Without `authorizeTechnicalActor`, `enqueue` and `upsertSchedule` throw `JobActorAssignmentDeniedError` whenever `actorId` differs from the calling actor.
- **Handlers must tolerate re-execution.** A job whose lock outlives `visibilityTimeoutMs` becomes claimable again while still marked running, so a slow or crashed handler can be run a second time.
- **A job with no registered handler is treated as a failure**, retried, and dead-lettered once `attempts` reaches `maxAttempts`. Jobs with no tenant or actor, or whose actor has lost its membership, are dead-lettered without running the handler.
- **Worker retry delays use `DEFAULT_BACKOFF_POLICY`.** A schedule stores its own `backoff`, but `JobsWorker` computes the delay of a failed job from the default policy.
- **Cron is a subset.** Five fields (minute, hour, day-of-month, month, day-of-week with 0 as Sunday), supporting `*`, single values, comma lists, `a-b` ranges and `/n` steps. Names, `L`, `W` and `#` are not supported. When both day fields are restricted they combine with OR.
- **Timezones must be canonical IANA names.** `UTC` or a name containing `/` is accepted; bare abbreviations and `Etc/GMT` offsets are rejected. During a daylight-saving fold only the later occurrence runs; a local time skipped by a forward jump runs at the first valid minute after the jump.
- **An invalid persisted cron expression disables its schedule.** The scheduler sets `isEnabled` to `false` and `disabledReason` to `invalid_schedule`; `resumeSchedule` then throws until the schedule is repaired with `upsertSchedule`.
- **Timer errors are swallowed.** A failing `tick()` inside the polling loop does not crash the process and is not logged by this package; overlapping ticks are skipped.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` and the `StynxError` base class.
- [`@stynx-nyx/data`](/docs/packages/data/) — provides `Database`, the system and request context wrappers the repository uses, and the platform migrations that create the job tables.
- [`@stynx-nyx/notifications`](/docs/packages/notifications/) — exposes a dispatch port that a host poller or job handler can invoke; it does not depend on this package.

Contracts and decisions: `docs/framework/contracts/jobs-api.md`, `docs/framework/contracts/jobs-actor-timezone-1.5.md`, `docs/framework/contracts/jobs-ctg4-sparse-and-poison-schedules.md`, `law/adr/ADR-JOBS-0001-postgres-scheduler-worker.md` and `law/adr/ADR-JOBS-0002-actor-tenant-local-clock.md`.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
