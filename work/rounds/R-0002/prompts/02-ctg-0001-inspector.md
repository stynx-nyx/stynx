# CTG-0001 Inspector worker — tenancy sensors

Role: **Inspector** (Constitution Art. 6). Model: `gpt-5.6-terra` (Codex medium).
Worktree: `/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.

Read the approved `docs/framework/contracts/tenancy-context-1.5.md`,
`work/rounds/R-0002/plan.md` §CTG-0001, and the DETRAN specification §3
read-only. Read existing tests before adding or changing assertions. Encode
UPS-TEN-01…06 as tests **before** the Engineer implementation. Include a real
Nest app with core/tenancy module registration in both orders and a guard that
reads `RequestContext` before interceptors. Include public tenant Host A,
Host A plus header B rejecting with documented code, no resolvable host,
optional auth with valid/invalid/absent token, unchanged protected membership
checks (A membership with B header, header/claim mismatch, UUID not v7),
resolver host/path, and a real PostgreSQL/RLS two-tenant negative that never
returns B's row to A. Add Host A plus a **verified** token for B: 400 with
the documented host/claim conflict code, never context B. A forged/unsigned
token carrying a member's `sub` and tenant on an `optionalAuth` route must be
treated as public: no token-derived actor, tenant, roles or permissions; the
Host-selected tenant and nominal actor apply. Assert the nominal actor in
`RequestContext`, `request.tenantId`, empty role/permission grants and a
denied `PermissionGuard`. Assert public access rejects a suspended tenant.
Assert public missing-tenant 400 uses the same existing missing-tenant status
and code/message, and Host A plus configured header B returns the exact
documented conflict body. Assert protected membership denial has the exact
`TENANT_ACCESS_DENIED` body. Assert a verified valid token for actor B without
membership in Host tenant A returns that exact 403 body, never the nominal
public actor. Assert a non-UUID `publicTenant.actorId` fails module
initialization; accept valid v4 and v7 UUIDs. Assert `@PublicTenantRoute`
without `StynxTenancyModule` fails initialization. With real PostgreSQL,
perform an audited write under Host tenant A from a public tenant route and
assert the audit row records the configured nominal UUID actor under A's RLS;
tenant B cannot read A's row. Verify `@PublicTenantRoute` counts as an explicit
public marker in both route scripts without creating an unbound route loophole.

Cover auth-only and backend-`AuthContextGuard` apps **without** tenancy:
post-guard actorId and tenantId reach the handler, and sessionId does so when
the verified identity includes a session claim. With several
transitive core imports, one request has exactly one requestId. Assert
`X-Request-Id` response equals `RequestContext.requestId`, caller's valid
UUIDv7 is echoed, and invalid UUIDv7 yields 400 through `StynxErrorFilter`.
Update `packages/core/test/unit/core.module.spec.ts` to assert middleware
registration and retained post-guard enrichment; do not delete its existing
provider or shared-descriptor coverage. Preserve legacy optional-path,
header, subdomain, cache and error-message tests. Use the existing test
taxonomy and PostgreSQL helper.

Run focused tests to show failures attributable to the missing new behavior;
record exact commands/results. Include `pnpm check:rls-negative` and
`pnpm check:rls-smoke` as required TEN-05 proof, with PostgreSQL configured by
`STYNX_TEST_PG_HOST=127.0.0.1`, `STYNX_TEST_PG_PORT=55432`,
`STYNX_TEST_PG_USER=postgres`, `STYNX_TEST_PG_PASSWORD=postgres`. Do not
weaken, delete, skip or dilute existing
tests. Do not edit F1, implementation, generated files, baselines, trace or
DETRAN. Do not run Git, commit, push, open a PR, or publish. Report files
changed, test count, expected failures, and any reference gap. The maestro
will run `pnpm check:trace --print` and bind these tests to
`INV-TENANCY-001` (and any sibling invariant) in an Architect trace commit.
