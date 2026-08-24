# Jobs API contract

`@stynx-nyx/jobs` is the E2 background-work contract. It stores tenant-owned
one-shot and recurring jobs in Postgres; it is not an HTTP API.

- `JobsPort.enqueue()` schedules a one-shot job, optionally delayed. `tenantId`
  is mandatory. An optional idempotency key deduplicates `(tenant, type, key)`.
- `JobsPort.upsertSchedule()` manages named tenant schedules using a 5-field UTC
  cron expression or a positive fixed interval. `JobsRegistry.register()` binds
  one handler to a job type.
- Workers claim due rows in short `FOR UPDATE SKIP LOCKED` transactions, then
  execute handlers outside the claim transaction. A visibility timeout permits
  crash recovery. Failure retries use bounded exponential full jitter; the last
  failed attempt becomes `dead_letter` with its safe error text retained.
- All scheduler/worker storage operations run in `withSystemContext()`. Handler
  business writes must continue to use the supplied tenant and actor context;
  the jobs table has forced RLS and non-null `tenant_id` (I2/I5).

`@stynx-nyx/worklist` consumes only `JobsPort` for SLA/prazo checks and never
queries `jobs.*` directly.
