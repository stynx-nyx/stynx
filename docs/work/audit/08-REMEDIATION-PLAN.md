# 08 — Remediation Plan

A sequence, not a schedule. Owner-area suggestions reflect the package /
team that should drive each fix.

## BLOCKERS — must close before v1.0

Resolution order chosen so each step unblocks subsequent verification.

### 1. FIND-004 — Restore migration linter green (S→M, owner: tools/migration-linter)

Fix the 4 parser errors in repo migrations. Re-enable the linter test as a
required CI gate. **Until this is green, I5/I6/I8 cannot be claimed
enforced** — every other migration-touching fix downstream depends on
this gate working.
_Acceptance:_ `pnpm --filter migration-linter test` exits 0; CI fails on
new parser errors.

### 2. FIND-010 — Resolve the I3 violation in `@stynx/privacy` (M, owner: @stynx/privacy + platform-architects)

Two acceptable resolutions:

- (A) Route privacy's S3 access through `@stynx/storage` (preferred per
  the spec's letter).
- (B) Amend §9 / §21 in a follow-up spec patch granting privacy a
  documented exception, and add an ESLint allowlist comment with the
  ADR reference.
  _Acceptance:_ either `grep '@aws-sdk/client-s3' packages/privacy/src` is
  empty, or a committed ADR-003 documents the exception.

### 3. FIND-001 — Create `@stynx/contracts` (L, owner: platform-architects)

Scaffold `packages/contracts/` per the spec. Migrate any shared types
currently in `packages/stynx-contracts` (`@stech/*` legacy). Update all
consumer imports. Sequenced before FIND-006 because the latter cannot
fully delete the legacy package until contracts has somewhere to land.
_Acceptance:_ package builds, exports the spec'd surface, all consumers
import from `@stynx/contracts`.

### 4. FIND-002 — Create `@stynx-web/angular-tenancy` (M, owner: platform-frontend)

Scaffold the package. Move tenant-context Angular plumbing out of
`apps/reference-web` (and any `frontend/` legacy code) into the package.
_Acceptance:_ package builds; reference-web imports from it; tenant
switch UI demonstrably works in dev.

## MAJOR themes

Themes group related findings; each theme is one focused workstream.

### Theme M1 — "Finish the rationalization" (covers FIND-006, FIND-007, FIND-003, FIND-008, FIND-018)

Approach: with FIND-001 closed, delete `packages/stynx-{backend,
contracts,frontend-client,frontend-contracts}`, the `backend/`,
`bootstrap/`, `frontend/` top-level workspaces, the `test/*` workspace
glob (or move the cross-cutting tests under `tools/test-utils/`), and
`apps/reference-frontend`. Update `pnpm-workspace.yaml`. One coordinated
PR to keep the dep graph consistent.
_Acceptance:_ `pnpm-workspace.yaml` matches spec §3 exactly; `pnpm -r ls`
shows only spec-shaped names.
_Size:_ L.

### Theme M2 — "Fix the doctor and the engine" (covers FIND-011, FIND-013)

Investigate `scripts/stynx-doctor.mjs` — confirm whether it actually
checks I4 coverage; if not, port the check from `tools/migration-linter`
into doctor. Pin Node 24 via `volta`/`asdf`/`mise` config plus a
`scripts/check-engines.mjs` CI gate.
_Acceptance:_ `pnpm doctor` produces a structured report; CI fails if
Node version drifts.
_Size:_ S.

### Theme M3 — "Operability docs" (covers FIND-031, FIND-014, FIND-027)

Create `docs/operations/runbooks/` with the five runbooks (tenant
suspension, LGPD erasure, session revocation, role rotation, federation
onboarding) plus backup/restore procedures for PG, KMS, Cognito. Create
`docs/rfcs/` with the §17.4 template; backfill the GAP-00x docs as
RFC-shaped. Add per-package READMEs from a shared template.
_Acceptance:_ every spec'd runbook present; every `@stynx/*` package
ships a README; `docs/rfcs/0001-...` exists.
_Size:_ L.

### Theme M4 — "Restore the gates" (covers FIND-024, FIND-025, FIND-026, FIND-021, FIND-023, FIND-009)

Expand CODEOWNERS to all roots. Commit a declarative branch-protection
config (or `repository-settings`-action workflow). Tighten commitlint
to fail on any non-conforming subject and add a PR-title check action.
Verify `eslint-plugin-boundaries` rules are active (or add them) and add
a `madge --circular` job.
_Acceptance:_ CODEOWNERS covers 100 % of paths; branch protection is in
the repo; conventional-commits compliance ≥ 95 % on next 100 commits;
`pnpm lint:cycles` runs in CI.
_Size:_ M.

### Theme M5 — "Privacy & audit coverage" (covers FIND-015, FIND-016)

Build a reusable LGPD fixture (live + archive + audit trail) and assert
each erasure strategy from the PII map. Implement or close out
`specs/GAP-001-audit-hash-chain.md`; add a hash-chain integrity test.
_Acceptance:_ `@stynx/privacy` coverage ≥ 85 %; audit hash-chain test
green.
_Size:_ L.

### Theme M6 — "Add EdgeStack" (covers FIND-005)

Implement EdgeStack per `STYNX-CDK-SKELETON.md`. Wire CloudFront, WAF,
ACM. Verify `cdk synth` clean for dev/stage/prod.
_Acceptance:_ `cdk synth` lists EdgeStack with the expected resources
in all three envs.
_Size:_ M.

## MINOR — single bundled "Cleanup PR"

Bundle: FIND-019 (frontend test count audit), FIND-020 (bootstrap
upgrade), FIND-022 (auth/idempotency layering note), FIND-028
(Dockerfile HEALTHCHECK), FIND-029 (cognito-local in compose),
FIND-030 (metrics-emission integration test), FIND-032 (k6 SLO
thresholds), FIND-033 (`pnpm smoke:local`), FIND-012 (`pnpm db:verify`),
FIND-017 (resolved by FIND-010).

One PR per fix is fine; logically they are one cleanup sweep.

## NIT

FIND-NITS noted; nothing planned.

## Ship / no-ship recommendation

**DELAY v1.0 PENDING REWORK.**

The architecture is sound and the core implementation is closer to spec
than the surface suggests — adherence runs at ~90 % and code-quality
fundamentals (strict TS, no `any`, clean logging, security clean) are
genuinely strong. But three things keep this from being a "BLOCKERS
exist but are discrete" situation:

1. The migration linter is broken on its own repo's migrations
   (FIND-004). This is the spec's I5/I6/I8 enforcement gate. Until it's
   green, the invariants are claim-only.
2. An invariant (I3) is actively violated by a first-party package
   (FIND-010). One violation by a _first-party_ module isn't a discrete
   bug — it's an architectural decision waiting to be made.
3. Two spec'd packages are entirely missing (FIND-001, FIND-002), and
   four legacy `@stech/*` packages are still in the workspace
   (FIND-006). The rationalization is half-complete.

These are not "fix four bugs and ship" issues; they are "decide what the
shape is, finish the migration, restore the gates." That work is
discrete and bounded — probably 2–4 weeks of focused execution — but
it's coordinated work, not a checklist.

Once FIND-001/002/004/010 are closed and Themes M1, M2, M4 land, the
remaining MAJORs (M3 docs, M5 privacy/audit, M6 EdgeStack) can ship
behind v1.0 if the team accepts the operational risk; the audit's stance
is that M3 and M5 should also clear before public 1.0. M6 (EdgeStack) is
deferrable if the first deploy uses an external CDN/WAF.

A SHIP-AFTER-FIXING-BLOCKERS verdict would be defensible if the team
chooses to live with the M-tier debt explicitly. The audit's
recommendation is the more conservative DELAY because the gate
breakage (FIND-004) means we can't independently verify that the
invariant-level adherence numbers in this audit will hold under the
next month of feature work.
