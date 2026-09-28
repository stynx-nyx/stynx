---
'@stynx-nyx/jobs': minor
'@stynx-nyx/data': minor
---

Require an active tenant actor for one-shot and recurring jobs, authorize technical actor assignment, and execute handlers with tenant RLS rather than system authority. Persist the schedule actor and canonical IANA timezone, define deterministic DST handling for cron schedules, and dead-letter jobs whose actor is missing or inactive. The fixed STYNX package group advances together.

Existing enabled schedules without an actor are disabled by the migration and must be assigned an active technical actor before resuming. Configure `StynxJobsModule.forRoot({ authorizeTechnicalActor })` to permit assignment of a technical actor distinct from the caller.

Materialization isolates invalid persisted cron schedules: it disables the affected row with `disabledReason: 'invalid_schedule'`, leaves its due timestamps unchanged, and continues other tenants' schedules in the same batch. Tenant callers can read the reason through `getSchedule`; repair requires a valid authorized `upsertSchedule` for the same tenant and name, which clears the reason. `resumeSchedule` rejects an unrepaired row with `SCHEDULE_INVALID`.
