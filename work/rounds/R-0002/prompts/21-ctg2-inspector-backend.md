# Inspector — CTG-0002 backend SSE sensors

Role: Inspector. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after the Architect contract is
recorded. Edit only `packages/backend/test/` for units and
`reference/api/test/integration/` for HTTP/PostgreSQL E2E. Coordinate
file ownership with the Angular Inspector; do not edit source,
generated files, law, work records, workflows or DETRAN.

Encode every backend criterion in `ctg-0002-plan.md` and
`docs/framework/contracts/sse-1.5.md`: HTTP headers and frames,
connected/retry/heartbeat with fake scheduler, cursor/resume/204,
captured scope and explicit `withRequestContext` on opening and each
tick, filter/project, serialized ticks, read error resilience, close
cleanup, 429/Retry-After, payload drop marker, metrics and wire
contract. E2E Nest uses PostgreSQL FORCE RLS with two tenants and
non-superuser role; prove B event/ID never leaks into A, unknown B ID
starts at DB now, visible expired A ID returns 204 empty, and missing
tenant 400 and missing actor 401 fail before source/headers. The host
is reference/api, whose own test:int has backend, data, pg, supertest
and Nest HTTP; root `pnpm test:int` and `ci:stynx` exclude this host.
Do not add manifests or lockfile. Create the `stynx_app` role
idempotently as NOLOGIN, NOINHERIT, NOBYPASSRLS and grant membership to
the connecting user plus SELECT/INSERT on the fixture table. Run
source reads in `data.Database.tx(..., { role: 'app' })` with `SET LOCAL
ROLE stynx_app` in that same transaction. Assert current_user is
`stynx_app`, rolsuper=false and rolbypassrls=false. Fixture table has
FORCE RLS, different owner and USING/WITH CHECK policy on
`current_setting('app.tenant_id', true)`; source SQL has no tenant
WHERE. Put positive A-visible resume/tick assertions in the same spec
as negative assertions. Run fake ticks with both core RequestContext
and data CLS transaction context cleared or changed to B, and include
a negative source-without-context-port proof. Mount the
real CTG-0001 middleware/guard. Prove preflight order,
flushed/no-buffer frames and structural assignment of data.Database
to the port. Use test doubles only for scheduler
and unrelated boundary dependencies, not for RLS proof.

Preserve existing assertions. Run focused red tests via
`pnpm --filter @stynx-nyx/reference-api test:int`, with output naming
the new spec, plus lint and RLS negative as feasible. `ci:reference-apps`
is the full host gate. Report red failures and fixture
limitations; do not run Git, commit, push, publish or open PR.
