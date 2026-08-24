---
adr_id: ADR-JOBS-0001
title: Postgres-backed scheduler and worker runtime for @stynx-nyx/jobs
status: accepted
date: 2026-08-24
authors: ['Architect']
tags: [stynx, jobs, background-work, data-layer, e2]
---

# ADR-JOBS-0001 — Postgres-backed scheduler and worker runtime for `@stynx-nyx/jobs`

**Status:** Accepted architecture decision.
**Contract:** [`docs/framework/contracts/jobs-api.md`](../../docs/framework/contracts/jobs-api.md).
**Round:** Phase 1 W1.1 (stynx platform round), delivering deferred extension E2.

## Status

Accepted on 2026-08-24, closing porting-pack gap
[G-013 — Background-job patterns](../../docs/adopters/stynx/porting-pack/18-GAPS-AND-OPEN-QUESTIONS.md).

## Context

Spec §1.2 and §24 declare "no event bus, no background jobs, no webhooks in
v1.0" as an explicit non-goal, deferring background jobs to E2 (target v1.1)
with a provisional note: "BullMQ; jobs carry `TenantContext` +
`ActorContext`." The porting pack's G-013 records this as a MAJOR gap:
adopters bring their own job runner (Bull, BullMQ, Agenda, cron) and must
wrap each handler in `withSystemContext('job-name', fn)` themselves, but
stynx ships no job-runner integration pattern.

Two consuming domains need this now: pec's `transmissions-detran-transmissions`
outbox dispatcher already hand-rolls a Postgres `FOR UPDATE SKIP LOCKED`
poll-and-claim loop with `next_attempt_at` backoff
(`pec/domain/transmissions-detran-transmissions/api/src/transmissions/transmissions.service.ts`),
duplicated per adopter. `@stynx-nyx/worklist` (built in parallel on
`feat/p1-worklist`) needs to schedule SLA/prazo-clock checks without owning
a scheduler itself.

## Decision

Build `@stynx-nyx/jobs` as a **Postgres-backed** scheduler and worker
runtime — no new infrastructure dependency (no Redis, no BullMQ, no
external queue). Two schema-`jobs` tables carry the state:

- `jobs.schedules` — recurring definitions (`cron` 5-field expressions or
  fixed `interval`), each tracking `next_run_at`.
- `jobs.jobs` — the claimable queue: one row per scheduled or one-shot
  delayed execution, with `status`, `attempts`, `run_at`, a
  `locked_by`/`locked_until` visibility timeout, and `last_error`.

A `JobsScheduler` materializes due `jobs.schedules` rows into `jobs.jobs`
rows (idempotently, keyed by `(tenant_id, job_type, idempotency_key)`) and
advances `next_run_at`. A `JobsWorker` polls `jobs.jobs` with
`SELECT ... FOR UPDATE SKIP LOCKED` (pec's proven pattern, generalized to
run cross-tenant under the `owner` role rather than a single
`auth.current_tenant()`), executes the registered handler, and on failure
recomputes `run_at` via exponential backoff with full jitter, moving the row
to `dead_letter` once `attempts >= max_attempts`. A reaper query reclaims
rows whose `locked_until` has expired without a terminal status update
(crash recovery), matching the pattern used by SQS-style visibility
timeouts rather than a held-open transaction for the run duration.

Every worker and scheduler database access — the cross-tenant claim, the
schedule materialization, and each handler invocation — runs inside
`Database.withSystemContext(reason, fn)` per invariant I2. Handler
invocations for a job carrying both `tenantId` and `actorId` additionally
nest `Database.withRequestContext({ tenantId, actorId }, fn)` so the
handler's own writes are tenant-scoped under the normal `app` role and RLS
policies (I5) instead of inheriting the worker's system-wide visibility.
Handlers without an `actorId` run under system context only; the package
does not fabricate a synthetic actor, since `created_by`/`updated_by`
columns are FK-constrained to `auth.users(id)`.

### Alternatives considered

1. **BullMQ + Redis (spec §24's provisional note).** Rejected for this
   round: it adds a new infrastructure dependency every consuming app must
   provision, sized, and operate, for a MAJOR-severity gap that pec and
   teat already solve without it. Redis is already optional platform
   infrastructure (idempotency, rate-limit), but making it _mandatory_ for
   background work contradicts the "one Postgres, schema-per-domain"
   consolidation direction the wider DETRAN program is taking. Revisit if
   throughput or fan-out requirements outgrow Postgres polling.
2. **A dedicated `jobs.dead_letters` table.** Rejected in favor of a
   `dead_letter` status value on `jobs.jobs` (mirroring
   `flow.tasks`/`renach_outbox`'s single-table status-enum convention) to
   avoid a second table and a migration step per terminal state; dead
   rows stay queryable and requeueable in place.
3. **A held-open transaction for the whole handler execution
   (pec's original `dispatchDue`-and-process-inline shape).** Rejected: a
   long-running handler would hold a `FOR UPDATE` row lock (and a pool
   connection) for its full duration. The claim transaction is short (sets
   `status = 'running'`, `locked_until = now() + visibilityTimeout`) and
   commits before the handler runs; a reaper requeues rows whose lock
   expired without a terminal update.

## Affected rules

- `INV-RBAC-001` / tenancy invariant I5 — `jobs.schedules` and `jobs.jobs`
  are tenant-scoped (nullable `tenant_id`, mirroring `core.config`'s
  system-row convention) with forced RLS and a tenant-isolation policy.
- Invariant I2 — every background query is wrapped in
  `withSystemContext`; see `packages/jobs/src/jobs.repository.ts`.
- `tools/migration-linter` — `jobs.jobs` and `jobs.schedules` are annotated
  `@no_soft_delete` (operational execution/definition records that retire
  by status or `is_enabled` transition, not by soft delete), following the
  precedent set by `flow.runs`/`flow.tasks`/`core.idempotency_keys`.

## Consequences

- Throughput is bounded by Postgres polling (default 2s worker interval,
  configurable), not by a dedicated queue's push semantics. This is
  adequate for the DETRAN program's known E2 consumers (outbox dispatch,
  worklist SLA checks, retention sweeps) — none of which are
  latency-sensitive at sub-second scale.
- `@stynx-nyx/worklist` (and future consumers) depend on `@stynx-nyx/jobs`
  through the narrow `JobsPort` surface (`enqueue`, `cancel`, `getJob`,
  `upsertSchedule`, `pauseSchedule`/`resumeSchedule`/`deleteSchedule`) and
  register handlers through `JobsRegistry.register(jobType, handler)`;
  neither needs to reach into `jobs.jobs`/`jobs.schedules` directly.
- If a future round needs push-based fan-out or cross-process pub/sub
  invalidation at a scale Postgres polling cannot sustain, that is a new
  ADR superseding this one — not a silent change to this package's
  storage engine.
