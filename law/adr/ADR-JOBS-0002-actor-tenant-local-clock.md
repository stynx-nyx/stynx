---
adr_id: ADR-JOBS-0002
title: Tenant actor execution and local scheduling for jobs 1.5
status: accepted
date: 2026-09-27
authors: ['Architect']
tags: [stynx, jobs, tenancy, rls, scheduling]
supersedes: ADR-JOBS-0001 handler-context and UTC-cron decisions
---

# ADR-JOBS-0002 — Tenant actor execution and local scheduling

**Status:** Accepted. This decision supersedes the handler-context, actorless
execution, and UTC-cron portions of ADR-JOBS-0001. Its Postgres queue, short
claims, retry, and visibility-timeout decisions remain accepted. The detailed
interface is [the jobs 1.5 contract](../../docs/framework/contracts/jobs-actor-timezone-1.5.md).

## Decision

Tenant-facing `JobsPort` operations execute under the caller's active tenant
`RequestContext` through the `stynx_app` role and FORCE RLS. An input tenant
must match that context; the service cannot create tenant authority from the
input or wrap tenant CRUD in `withSystemContext`. Explicit schedule and one-shot
technical actors must have active membership in that tenant. Assigning an actor
other than the caller requires the application's `jobs.assignTechnicalActor`
permission decision. The active membership is checked again at execution.

Only queue control — schedule materialization, claim, succeed, fail, and
dead-letter transitions — enters system context and uses the owner role.
`JobsWorker` leaves system context before `JobsRepository.executeHandler`
establishes a tenant and actor `RequestContext` from the persisted job. Handler
SQL uses the application role and tenant RLS. An actorless or revoked-actor job
goes directly to `dead_letter` without handler invocation or retry. Existing
actorless schedules are disabled by a forward migration and cannot be resumed
until updated with a valid actor. No handler ever runs in system context.

Cron is interpreted in the schedule's canonical IANA timezone. An ambiguous
wall-clock minute runs only at its later UTC occurrence; a missing minute runs
once at the first valid minute after the gap. The worker and scheduler receive
an injectable scheduling port and clock so polling can be verified without
sleep. The contract defines the edge cases and source compatibility policy.

## Consequences and evidence

`UpsertScheduleInput.actorId` and tenant context are new requirements and can
break 1.4 callers. OD-S15-01 accepts these as part of the coordinated 1.5.0
line; consumers migrate at the final pin. `0019_jobs_actor_timezone.sql` is
reserved for this change. Inspector evidence must use the platform migration
and real PostgreSQL connections as distinct owner/app/reader roles, including
a positive handler write under FORCE RLS with the persisted technical actor.
The Architect rebinds `law/trace.json` to the new contract and test references
after Inspector tests land; generated API baselines follow the actual public
types. Neither `pnpm check:rls-negative` nor root `test/db` alone proves the
jobs platform migration.
Development-contract DDL obligations bind an explicit platform seed under
`database/seed/platform/` and a new platform-migrated `test/db/` spec in
addition to the packages/jobs two-tenant execution proof.
