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
is reference/api, whose test:int already includes backend, data, pg,
supertest and Nest HTTP; do not add manifests or lockfile. Assert
current_user `stynx_app` has rolsuper=false and rolbypassrls=false;
fixture table has FORCE RLS and different owner; source SQL has no
tenant WHERE. Run fake ticks with ambient ALS cleared or changed to B
and include a negative source-without-context-port proof. Mount the
real CTG-0001 middleware/guard. Prove preflight order,
flushed/no-buffer frames and structural assignment of data.Database
to the port. Use test doubles only for scheduler
and unrelated boundary dependencies, not for RLS proof.

Preserve existing assertions. Run focused red tests, lint, RLS negative
and integration gates as feasible. Report red failures and fixture
limitations; do not run Git, commit, push, publish or open PR.
