# Migrate jobs consumers to STYNX 1.5

OD-S15-01 accepts the breaking jobs change for the coordinated 1.5.0 line.
DETRAN may develop and test against a `1.5.0-rc.N` that includes CTG-0004.
A DETRAN merge requires the final `1.5.0` pin and the completed §7
conformance row after all CTGs merge in topological order.

Call `JobsPort` methods inside an active tenant and actor `RequestContext`.
Pass the same `tenantId` as that context. Supply `UpsertScheduleInput.actorId`
for every new or updated schedule. That user must have active membership in
the tenant. To assign an actor other than the caller, configure the
`jobs.assignTechnicalActor` authorization callback; denial fails before SQL.
One-shot `enqueue` may omit `actorId` only to capture the active caller actor.
Calls from unauthenticated maintenance code must first establish a legitimate
tenant/actor context; system context alone no longer authorizes tenant CRUD or
handler execution.

Cron schedules default to UTC for unchanged callers. Pass `timezone` as an
IANA name for local wall-clock scheduling; test DST behavior before migrating
time-sensitive schedules. The migration reserves
`packages/data/migrations/platform/0019_jobs_actor_timezone.sql`: it backfills
UTC and disables legacy schedules lacking a technical actor. Re-enable them
only by upserting an authorized actor. Historical queued actorless jobs
dead-letter without running. Deploy the migrated `@stynx-nyx/data` and
`@stynx-nyx/jobs` fixed group together, then inspect disabled schedules and
dead letters. Existing handlers must use app-role tenant SQL and enforce any
domain permissions their work requires.

Persisted cron rows containing an invalid expression, impossible recurrence,
or invalid timezone are disabled during scheduler materialization. The owning
tenant sees `disabledReason: 'invalid_schedule'` through `getSchedule`; other
due schedules continue to materialize. The invalid occurrence creates no job,
and its `nextRunAt` and `lastEnqueuedAt` stay unchanged. To repair it, call
`upsertSchedule` with the same tenant and name, a valid recurrence, and an
active-member actor from an authorized tenant/actor context. A valid upsert
clears the reason and can re-enable it. `resumeSchedule` returns
`SCHEDULE_INVALID` until that repair; retrying resume alone cannot repair it.

The platform migration has an explicit seed at
`database/seed/platform/0019-jobs-actor-timezone.sql`. It is loaded by the
new `test/db/platform-jobs-migration.spec.ts`, which exercises the active
platform schema. Legacy root `database/ddl` and its automatic seed loader do
not contain the jobs schema. The packages/jobs PostgreSQL integration suite
provides the two-tenant FORCE RLS execution proof.
