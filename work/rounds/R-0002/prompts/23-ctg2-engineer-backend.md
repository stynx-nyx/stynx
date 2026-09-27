# Engineer — CTG-0002 backend SSE

Role: Engineer. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after backend Inspector sensors are
recorded red. Edit only `packages/backend/src/`, its package manifest
if a public export requires it. The maestro creates one CTG changeset
after both implementation blocks. Do not
edit tests, Angular, generated files, law, workflows or DETRAN.

Implement the Architect contract and backend SSE-01…10 through the
structural generic request-context runner port; use current Nest public
APIs. Capture tenant and actor at open and re-enter the port around
every source call, including timer ticks. Validate missing tenant/actor
as 400 SSE_TENANT_REQUIRED and 401 SSE_ACTOR_REQUIRED before headers or
SQL, then apply quota 429, cursor/204 and flush headers in that order.
Send X-Accel-Buffering: no, flushHeaders() when available, and a
connected comment; do not buffer frames. Provide injectable metrics
sink plus queryable counters. Keep the source generic so policy filters
reach SQL. No ambient timer context, no default outbox replay source,
no shim or DETRAN code. E2E remains in reference/api; this worker
edits backend source only, then runs the E2E sensor with
`pnpm --filter @stynx-nyx/reference-api test:int`; root `test:int` and
`ci:stynx` do not include reference/api. Make focused unit/E2E sensors
green, including real PostgreSQL/RLS. Report
API symbols, diffs and gates; do not execute Git, commit, push,
publish or open PR.
