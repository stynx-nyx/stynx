# Inspector — CTG-0002 Angular SSE sensors

Role: Inspector. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after the Architect contract is
recorded. Edit only `packages-web/angular/test/` and tests for the
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

Preserve existing assertions. Run focused red tests and lint. Do not
run Git, commit, push, publish or open PR.
