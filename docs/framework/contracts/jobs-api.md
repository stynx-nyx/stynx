# Jobs API contract

For 1.5.0, [jobs-actor-timezone-1.5.md](jobs-actor-timezone-1.5.md) and
[ADR-JOBS-0002](/docs/adr/ADR-JOBS-0002-actor-tenant-local-clock)
govern actor assignment, execution context, local cron, and timer behavior.

`@stynx-nyx/jobs` is the E2 background-work contract. It stores tenant-owned
one-shot and recurring jobs in Postgres; it is not an HTTP API.

- `JobsPort.enqueue()` schedules a one-shot job, optionally delayed, under the
  caller's tenant RequestContext. `tenantId` must match that context. An
  optional idempotency key deduplicates `(tenant, type, key)`.
- `JobsPort.upsertSchedule()` manages named tenant schedules with a required
  technical actor, using a 5-field cron expression in a canonical IANA zone
  (default UTC) or a positive fixed interval. `JobsRegistry.register()` binds
  one handler to a job type.
- Workers claim due rows in short `FOR UPDATE SKIP LOCKED` transactions, then
  execute handlers outside the claim transaction. A visibility timeout permits
  crash recovery. Failure retries use bounded exponential full jitter; the last
  failed attempt becomes `dead_letter` with its safe error text retained.
- Queue materialization, claim, and status transitions use owner role in
  `withSystemContext()`. Tenant CRUD uses the caller's RequestContext on the
  app role. Handlers run outside system context under the persisted tenant and
  active technical actor on the app role with FORCE RLS; actorless jobs dead-letter.

`@stynx-nyx/worklist` consumes only `JobsPort` for SLA/prazo checks and never
queries `jobs.*` directly.
