# CTG-0001 Architect worker — tenancy contract

Role: **Architect** (Constitution Art. 6). Model: `gpt-6-sol`. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.

Read `AGENTS.md`, `README.md`, `law/constitution.md`, the pinned constitution,
the relevant tenancy/core ADRs and `docs/meta/development-contract.md`. Read
`work/rounds/R-0002/plan.md` §CTG-0001 and the DETRAN specification §§3 and 8
at `/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`
**read-only**. The Owner's OD-S15-01 is decided: U1–U15 all MUST, TEN-01 uses
core middleware before guards/interceptors, Host/header conflict rejects.

Task: confirm proposed public symbols against current source in `packages/core`,
`packages/tenancy`, `packages/contracts`, `packages/auth`, and
`packages/backend`. Write an Architect-owned API contract at
`docs/framework/contracts/tenancy-context-1.5.md` covering UPS-TEN-01…06:
middleware order and seed, enrichment, public tenant metadata/options, trusted
actor and token branches, conflict status/code, backward compatibility,
negative cases, and removal of the DETRAN prototype patch. Name the concrete
singleton mechanism (`ClsModule.forRoot` shared descriptor, `middleware.mount`
and `setup`), Nest 11 Express route mount point (Fastify is unverified), response header, guard-time context,
post-guard `RequestContextMutator.patch`, and how auth-only apps retain
actor/tenant/session without tenancy. Preserve direct use of the exported
interceptor without re-opening an already active scope. Define Host from the
raw HTTP Host header, with no implicit forwarded-host trust; Host alone chooses
the public tenant, and the configured tenant header and verified token claim
are compared fail-closed. Cover tenant active-state without membership, the
nominal actor with zero inherited permissions, forged token isolation, and
the behavior of both `StynxAuthGuard` and `AuthContextGuard`.
`StynxTenancyModule.forRoot({ publicTenant: { resolveHost, actorId } })` owns
the public options. Require a valid RFC UUID for `actorId` (v4 and v7 accepted),
reject invalid or absent public options at module initialization, and explain
why PostgreSQL audit, flow and worklist cast `app.actor_id` to `uuid`. A
`@PublicTenantRoute` requires that module; an app with the marker but no module
must fail initialization with a clear error. On that route, `AuthContextGuard`
must leave tenant selection to tenancy rather than use its hard-coded
`x-tenant-id` resolver; protected routes keep their existing behavior.
Define a public-tenancy options token in `contracts` so `auth` or `core`, and
`backend`, can detect the route marker at bootstrap and fail if the token is
missing, including an app using only `AuthContextGuard`. Avoid adding package
dependencies.
State that a verified token without Host-tenant membership gets 403
`TENANT_ACCESS_DENIED` and cannot fall back to public. State that the legacy
unverified-claim fallback on plain `@Public()` routes is outside this CTG.

Place `@PublicTenantRoute` in `auth` and its shared metadata in `contracts`.
Compose it with `STYNX_PUBLIC_ROUTE` but require both auth guards to check
public-tenant metadata before the generic public early return. Extend the
explicit-public route marker language in `INV-RBAC-001` to include this marker
without weakening deny-default. Name the hand-written route scripts that must
recognize `@PublicTenantRoute`: `scripts/list-routes.mjs` and
`scripts/verify-api-coverage.mjs` (Engineer-owned implementation).

Pin literal runtime JSON bodies and exception classes for existing missing
tenant (`BadRequestException`), existing `TENANT_ACCESS_DENIED`
(`ForbiddenException`), and new `TENANCY:CONFLICT:host-header` and
`TENANCY:CONFLICT:host-claim` (`@stynx-nyx/core` `StynxError` with
`status: 400` and no context, thrown from tenancy), as stated in
`plan.md`. Preserve the existing filter behavior. Do not modify `law/schemas`
without an ADR. Pinned English messages apply without a registered
`STYNX_ERROR_TRANSLATOR`; with one, status and code remain stable while the
message can be localized. Record in the later CTG-2 contract that SSE-06's filter
callback must be independent of AUTHZ-07 until CTG-3 lands.

Create Architect-owned `law/invariants/INV-TENANCY-001.json` (or a small set
if atomicity requires it), with severity, `scope.code_areas[]`, verification,
authority anchor to this contract and coverage of UPS-TEN-01…06. Follow the
existing invariant schema. Register conflict code(s) and the preserved
`TENANT_ACCESS_DENIED` meaning in `docs/framework/contracts/errors.json`,
reconciling that catalog's format with actual STYNX runtime error bodies.
Include a backend migration note under `docs/`; the Engineer's changeset will
be the package CHANGELOG source. If a durable ADR is needed for a genuinely
new architectural choice, add one under `law/adr/`; do not reopen OD-S15-01.
Identify any incompatibility with the STYNX development contract in a short
note to the maestro; do not decide it silently. F1 here means Architect-owned
`law/` and `docs/`.

Do not edit code, tests, generated files, baselines, trace, changesets, or the
DETRAN repository. Do not run Git, commit, push, open a PR, or publish. Report
the exact files changed, selected symbols, contract decisions and open risks.
The maestro will bind Inspector tests to the new invariant in a later Architect
trace commit.
