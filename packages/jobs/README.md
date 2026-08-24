# @stynx-nyx/jobs

Postgres-backed recurring scheduler and background-worker runtime (E2). Jobs
are always tenant-owned, claimed atomically with `FOR UPDATE SKIP LOCKED`, and
run under STYNX system context. Consumers enqueue one-shot work through
`JobsPort`, or register a handler with `JobsRegistry`.

Apply the platform migrations before enabling workers. This package deliberately
does not expose a controller: applications retain their own authorization and
domain APIs.
