# Engineer — CTG-0002 Angular SSE and testing entry

Role: Engineer. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after Angular Inspector sensors are
recorded red. Edit only `packages-web/angular/src/`,
`packages-web/angular/testing/`, Angular package metadata if required,
but no changeset; the maestro creates one CTG changeset after both
blocks. Do not edit tests, backend, generated
files, law, workflows or DETRAN.

Implement the Architect contract and NGSSE-01…10/TEST-01 using the
configured Angular HttpClient transport, injected clock/transport,
TenantContextService and required app-supplied
`sessionActive: Signal<boolean>`. Do not import angular-auth from
angular: it would create a dependency cycle. Add the SSE HttpContextToken
so ErrorInterceptor preserves raw HttpErrorResponse, status and
Retry-After and suppresses the ordinary banner; AuthInterceptor still
refreshes/replays 401 before terminal stop. Implement the incremental
parser and published testing secondary entry from the canonical
`testing/index.ts`, with `src/testing/index.ts` reexport only. Never use
native EventSource. Keep payload as data, not presentation. Make
focused tests green, including real interceptors. Report public
symbols, diffs and gates; do not execute Git, commit, push, publish or
open PR.
