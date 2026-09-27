# Inspector — CTG-0002 Angular SSE sensors

Role: Inspector. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after the Architect contract is
recorded. Edit only `packages-web/angular/test/`,
`packages-web/angular/vitest.config.ts`, `tsconfig.spec.json` if
needed, and tests for the
published `angular/testing` secondary entry in that package; do not
edit backend files, source, generated files, law, workflows or DETRAN.

Encode UPS-NGSSE-01…10 and UPS-TEST-01: configured HttpClient progress
transport (never native EventSource), bearer/X-Tenant-Id/X-Request-Id
with HttpTestingController, arbitrary SSE fragments/CRLF/comments/
multiline data, typed events and type/prefix filtering; fake clock for
idle/live/reconnecting/polling/stopped, backoff 1→30 s and fixed mode,
2 failures/60 s, required app polling interval, first-frame recovery,
dedup/Last-Event-ID, 204 reset, stale 20 s×2, 401/403 stop, 429
Retry-After, 0/5xx count, tenant switch without cursor and logout stop.
Test the public `@stynx-nyx/angular/testing` fake transport for frame,
HTTP error, close and controlled time.
Put the testing alias before the root package alias and point it to
`packages-web/angular/testing/index.ts`. Use app-supplied
`sessionActive: Signal<boolean>` for logout; no angular-auth import.
Through real interceptors, prove 429 Retry-After survives, SSE errors
create no banner, and 401 refresh/replay precedes terminal stop.
Assert the SSE HttpContextToken survives the replayed request and that
its failure still preserves Retry-After without a banner. Treat XHR
`partialText` as cumulative and assert only new suffix is parsed;
fake-clock sensors cover byte and age ceilings that close/reopen with
Last-Event-ID. Assert `globalThis.EventSource` is never constructed.

Preserve existing assertions. Run focused red tests and lint. Do not
run Git, commit, push, publish or open PR.
