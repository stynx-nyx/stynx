# Cross-family delivery-review, cycle 4 — STYNX 1.5 CTG-0001

You are **Claude Code Opus 5.5**, an independent read-only reviewer. Review
the complete STYNX diff from `75b9966a887192121a3904fef7cfd211f8e94465`
to `3314eb69a8781e6994e264724784d4a523cbadf4`. The prior verdicts are
in `work/rounds/R-0002/reviews/ctg-0001-delivery-review-{1,2,3}.json`.
Resolve every cycle-3 finding individually against the current contract,
tests, source, trace, and API baseline. The read-only DETRAN specification is
`/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`
§§3, 7, 8. OD-S15-01 makes UPS-TEN-01…06 MUST, requires middleware option
(b), and rejects Host/header conflicts. Do not edit files, mutate Git,
publish packages, or write in DETRAN.

Key cycle-3 repairs to verify:

1. `tenancy-context-order.integration.spec.ts` now reorders actual Nest
   `APP_INTERCEPTOR` instances **before** `app.init()`, wraps their real
   `intercept` methods, and asserts per-request execution order for protected
   and public routes in both variants. Each request lacks `X-Request-Id` and
   asserts one generated UUIDv7 in the pre-interceptor guard, handler, and
   response header.
2. `StynxJwtValidator` parses JWT syntax independently, rejects missing,
   non-array, empty, or unusable RSA JWKS as a non-`InvalidCredentialError`,
   and distinguishes all-key signature misses from issuer/audience/time claim
   failures. A signature miss forces one fresh signing-service or `jwksUri`
   resolution; concurrent refreshes coalesce by source and starts are limited
   to one per source in 30 seconds. A suppressed ambiguous miss or refresh
   failure propagates instead of making the optional route nominal. A usable
   refreshed set that still rejects is a definitive invalid credential.
   Inspect real signed RSA/JWK tests for rotation, bad signature, source
   failures, coalescing, 30-second limit, and optional guard failure.
3. HTTP and unit sensors now exercise `AuthContextGuard` typed rejection to
   nominal, generic JWKS failure to non-200, revoked optional STYNX session
   to nominal without principal/session, Cognito JOSE error-code distinction,
   seeded shared/private provenance clearing, unmarked tenant-B claim under
   Host A, and backend-only permission guard denial.
4. The incidental backend `data/src/schema/flow.d.ts` baseline digest was
   explained in `work/rounds/R-0002/record.md`: TypeScript changed union
   emission order after the backend program changed; no data/flow source or
   public semantics changed. Confirm the new validator declaration rebind.

Re-check all earlier delivery-review findings and any new trust-boundary or
regression issue. Confirm role-separated commits, the fixed-group minor
changeset, trace and generated baselines, two-tenant real PostgreSQL RLS,
no weakened tests, and no DETRAN code copy. A green gate alone is not proof.

Evidence at reviewed HEAD: full local
`STYNX_TEST_PG_HOST=127.0.0.1 STYNX_TEST_PG_PORT=55432
STYNX_TEST_PG_USER=postgres STYNX_TEST_PG_PASSWORD=postgres pnpm ci:stynx`
passed, log `/private/tmp/stynx-s15-ctg1-ci-review4.log`: trace 393/393,
RLS negative 7 tables and smoke, API baseline 44/44, auth 232/232,
tenancy PostgreSQL 39/39, 97/97 test tasks, 51/51 integration tasks, 48/48
build tasks. `pnpm package-readmes:write` changed zero files;
`pnpm release:preview` projects 1.4.0→1.5.0 minor;
`pnpm exec devai check --only forbidden-actions --strict --since-ref
75b9966a887192121a3904fef7cfd211f8e94465 --format json` returned
zero findings.

Return **only one valid JSON object**:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS means CTG-0001 can open a PR and merge after remote CI. REVIEW means
specific repairable gaps remain. FAIL means an irreconcilable policy or
contract issue. Cite file paths and source facts. No Markdown fences.
