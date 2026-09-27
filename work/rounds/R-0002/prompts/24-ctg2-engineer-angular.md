# Engineer — CTG-0002 Angular SSE and testing entry

Role: Engineer. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after Angular Inspector sensors are
recorded red. Edit only `packages-web/angular/src/`,
`packages-web/angular/testing/`, `packages-web/angular/README.md`
outside its generated section, and Angular package metadata if required,
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
`testing/index.ts`; import primary symbols only through
`@stynx-nyx/angular`. Keep `src/testing/index.ts` out of the primary
barrel. Consume cumulative XHR partialText by offset; close/reopen
with Last-Event-ID at configurable byte/age ceiling. Preserve the SSE
HttpContextToken on refresh replay. Document a concrete app-provided
`StynxSessionService.active` wiring snippet in the Angular README,
outside its generated dependency section. Never use native EventSource.
Keep payload as data, not presentation. Make focused tests green,
including real interceptors. Run Angular build and verify both FESM
bundles before baseline rebind. Report public
symbols, diffs and gates; do not execute Git, commit, push, publish or
open PR.
