# Cross-family delivery-review, cycle 3 — STYNX 1.5 CTG-0001

You are **Claude Code Opus 5.5**, an independent read-only reviewer. Review
the complete STYNX diff from `75b9966a887192121a3904fef7cfd211f8e94465`
to `086c3f7c137fd215798e2b6235394f1f7fcdaf85`. The first two
delivery-review verdicts are
`work/rounds/R-0002/reviews/ctg-0001-delivery-review-1.json` and
`work/rounds/R-0002/reviews/ctg-0001-delivery-review-2.json`. Confirm each
blocking and nonblocking observation against the current contract, tests,
code, trace, and API baseline. The read-only source specification is
`/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`
§§3, 7, and 8. OD-S15-01 makes UPS-TEN-01…06 MUST, selects middleware option
(b), and requires Host/header conflict rejection. Do not edit files, mutate
Git, publish packages, or write in DETRAN.

Focus on the cycle-2 findings: optional `StynxAuthGuard` and
`AuthContextGuard` must downgrade only definitive invalid credentials or
explicit `null` adapter results, not generic JWKS/configuration/unknown
errors; built-in JWT validators must preserve that distinction. Public
tenant auth must clear prior identity and session fields, set shared
verification provenance only after successful verification, and tenancy must
ignore unmarked upstream identity/claims. Check revoked optional sessions,
verified `@Permission` grants and nominal denials over real HTTP. Check
Host conflict against Cognito-shaped claims and the sole distinct tenant in
`principal.tenants`, with no conflict inferred from a multi-tenant list.
Verify that the two real APP_INTERCEPTOR orders are actually forced and
observed, and that a generated UUIDv7 is the same before the guard, in the
handler, and in the response header. Re-check prior cycle-1 findings and
negative tenant A/B RLS. Check public API symbols, changeset fixed-group
minor bump, role-separated commits, generated baseline, trace binding, no
test weakening, and no copied DETRAN code. Call out any incidental API
baseline drift if it is not explained by the source diff.

Evidence at reviewed HEAD: `pnpm check:trace --print` passes 393/393;
`pnpm api:baselines:write` re-bound public declarations;
`pnpm package-readmes:write` changed zero files;
`pnpm release:preview` projects fixed-group minor 1.5.0;
`pnpm exec devai check --only forbidden-actions --strict --since-ref
75b9966a887192121a3904fef7cfd211f8e94465 --format json` passed
without findings. Full local
`STYNX_TEST_PG_HOST=127.0.0.1 STYNX_TEST_PG_PORT=55432
STYNX_TEST_PG_USER=postgres STYNX_TEST_PG_PASSWORD=postgres pnpm ci:stynx`
passed, including 97/97 test tasks, 51/51 integration tasks, 48/48 build
tasks, tenancy PostgreSQL 38/38, RLS negative/smoke, and public API
baseline 44/44. Log:
`/private/tmp/stynx-s15-ctg1-ci-review3.log`. Green gates alone do not
prove behavior.

Return **only one valid JSON object**:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS means CTG-0001 can open a PR and merge after remote CI. REVIEW means
specific repairable gaps remain. FAIL means an irreconcilable policy or
contract issue. Cite file paths and source facts. No Markdown fences.
