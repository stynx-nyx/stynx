# CTG-0001 Engineer worker — tenancy implementation

Role: **Engineer** (Constitution Art. 6). Model: `gpt-6-sol`. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.

Read approved `docs/framework/contracts/tenancy-context-1.5.md`,
`work/rounds/R-0002/plan.md` §CTG-0001, the Inspector tests, and the DETRAN
specification §3 read-only. Implement UPS-TEN-01…06 in the existing package
boundaries. The core must initialize the request context in middleware before
guards/interceptors; tenancy only enriches it. Preserve the module's
compatibility behaviors. Add declarative public-tenant route support,
opportunistic auth, Host/header conflict rejection, and resolver Host/path.
Fail closed for conflicts and missing tenant. The core's shared CLS middleware
opens the request context once before guards; the retained core interceptor
only patches trusted post-guard identity in an active context. The public
tenant resolver chooses from raw Host alone; configured header and verified
token claims are compared before domain access. Validate the public tenant's
active state without requiring membership; validate membership normally for
a verified token on an `optionalAuth` route. No shim or copied DETRAN code.
Never trust unverified JWT payloads as actor identity on public routes.
Validate `publicTenant.actorId` as a UUID during module initialization so
PostgreSQL `app.actor_id::uuid` writes are safe. Implement the approved
explicit-public marker in `scripts/list-routes.mjs` and
`scripts/verify-api-coverage.mjs`; preserve deny-default. On a public tenant
route, make `AuthContextGuard` defer tenant selection to tenancy's configured
header and Host resolver. A valid token without Host-tenant membership must
return 403 with no public downgrade. Do not alter the legacy plain `@Public()`
claim path in this CTG.

Run focused tests, typecheck, `pnpm check:rls-negative`, `pnpm check:rls-smoke`
and database integration with the four `STYNX_TEST_PG_*` variables from the
Inspector prompt; fix implementation until Inspector tests pass. Create a
fixed-group changeset with the backend migration note as the CHANGELOG
source. Do not edit `packages-web/MIGRATING.md` (Angular-only). Report changed
files and commands/results. F1 means Architect-owned `law/` and `docs/`.
Do not edit Inspector tests, F1, generated tooling, API baselines, trace, or
DETRAN. Do not touch root `package.json`, `reference/api/package.json` or
`reference/web/package.json` without the maestro's explicit approval: their
bytes are frozen by `local-rc-blocker-contract.test.mjs`. Do not run Git,
commit, push, open a PR, or publish. The maestro will perform baseline/trace
rebinds, package README generation, full gates, delivery review and PR
handling.
