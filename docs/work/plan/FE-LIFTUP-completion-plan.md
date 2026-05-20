# FE Lift-Up Completion Plan

**Compiled:** 2026-05-19T21:41:23Z
**Author role:** Auditor
**Input inventory:** `docs/work/inv/FE-LIFTUP-current-inventory.md`
**Input diagnostics:** `docs/work/diag/FE-LIFTUP-current-diagnostics.md`
**Goal:** Complete the interrupted frontend lift-up session from the current live checkpoint without regressing the existing FE-A/FE-B closure or the test-matrix policy.

## Current Boundary

Treat the current boundary as:

- FE-A closed.
- FE-B closed.
- FE-C open after C.5.
- FE-D implemented through D.9 but not promotable until fresh global gates pass.
- FE-E open after E.6 and currently blocking global i18n.
- FE-F open after F.3.
- FE-G started for IAM but missing its report.
- FE-H blocked until FE-G is formalized and C-F are complete enough for docs/reference closure.

## Operating Rules

1. Prefer current files over prior session memory.
2. Do not promote from stale command output.
3. Do not update the closure registry before rerunning the relevant gate set.
4. Keep root lint waived only for FE-B through FE-F implementation rows; require root lint green for FE-G/H promotion.
5. Preserve Article 6 routing:
   - Auditor writes only under `docs/work/`.
   - Engineer writes `packages-web/`, `reference/`, `tools/`, `scripts/`.
   - Inspector writes test-shaped paths.
   - Architect writes `docs/adr/`, `docs/architecture/`, `docs/contracts/`, and threshold policy.
6. Use `gpt-5.5` models for spawned Codex workers unless the operator overrides.

## Phase 0 - Stabilize The Checkout

**Owner:** Auditor coordinates; Engineer/Inspector/Architect own any non-`docs/work` edits.

1. Snapshot `git status --short`.
2. Review non-generated dirty files:
   - `pnpm-lock.yaml`
   - `packages-web/angular-profile/src/routes.ts`
   - `packages-web/angular-storage/test/angular-storage.spec.ts`
   - `docs/adr/ADR-FE-PACKAGING-0001-ng-packagr-adoption.md`
   - `docs/operations/test-result-contract.md`
   - `docs/operations/vitest-parallel-adoption.md`
3. Decide whether `.test-results/**` should be discarded before rerun or intentionally regenerated and committed.
4. Regenerate `coverage/test-evidence.json`.
5. Run the baseline recovery gate:

```sh
node -v
pnpm -v
pnpm i18n:check
pnpm lint
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** The checkout has a known dirty/clean state and current evidence exists.

## Phase 1 - Unblock FE-E Audit

**Owner:** Engineer for package code, Inspector for tests, Auditor for report rows.

Close the remaining FE-E workstreams:

- E.7 `StynxEntityHistoryComponent`.
- E.8 `StynxHashIntegrityBadgeComponent`.
- E.9 `provideStynxAudit(...)` and `auditRoutes()`.
- E.10 audit catalogs and extractor parity.
- E.11 audit tests and mutation readiness.

Minimum validation:

```sh
pnpm -r --filter @stynx-web/angular-audit lint
pnpm -r --filter @stynx-web/angular-audit typecheck
pnpm -r --filter @stynx-web/angular-audit build
pnpm -r --filter @stynx-web/angular-audit test
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-E report has E.7-E.11 rows and global i18n no longer fails on audit catalogs.

## Phase 2 - Finish FE-C Profile And Sessions

**Owner:** Engineer for package code, Inspector for tests.

Close C.6-C.9:

- default SDK sessions adapter,
- sessions UI polish,
- remaining profile/session catalog or route parity,
- tests and mutation closure.

Minimum validation:

```sh
pnpm -r --filter @stynx-web/angular-profile lint
pnpm -r --filter @stynx-web/angular-profile build
pnpm -r --filter @stynx-web/angular-profile test
pnpm -r --filter @stynx-web/angular-sessions lint
pnpm -r --filter @stynx-web/angular-sessions build
pnpm -r --filter @stynx-web/angular-sessions test
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-C report has C.6-C.9 rows and can be audited for promotion.

## Phase 3 - Promote FE-D With Fresh Gates

**Owner:** Auditor, after Engineer/Inspector remediate any failures.

D.1-D.9 are already reported. Do not add feature work unless validation fails. Rerun:

```sh
pnpm -r --filter @stynx-web/angular-storage lint
pnpm -r --filter @stynx-web/angular-storage build
pnpm -r --filter @stynx-web/angular-storage test
pnpm -r --filter @stynx-web/angular-trash lint
pnpm -r --filter @stynx-web/angular-trash build
pnpm -r --filter @stynx-web/angular-trash test
pnpm -r --filter @stynx-web/angular-i18n lint
pnpm -r --filter @stynx-web/angular-i18n build
pnpm -r --filter @stynx-web/angular-i18n test
pnpm i18n:check
pnpm lint
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-D report gets an Auditor promotion paragraph and the registry marks FE-D closed.

## Phase 4 - Finish FE-F Flow 1.0

**Owner:** Engineer for flow code; Inspector for test fan-out.

Close F.4-F.11 from `FE-WAVE-F-flow-installable.md`, including final `@stynx-web/angular-flow` 1.0 readiness.

Minimum validation:

```sh
pnpm -r --filter @stynx-web/angular-flow lint
pnpm -r --filter @stynx-web/angular-flow build
pnpm -r --filter @stynx-web/angular-flow test
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-F report has F.4-F.11 rows and can be audited for promotion.

## Phase 5 - Formalize FE-G Rolling Test Fan-Out

**Owner:** Inspector for tests; Auditor for report and registry.

1. Create `docs/work/plan/FE-WAVE-G-report.md`.
2. Add an IAM row for the already-started FE-G work after rerunning current commands.
3. Add C/D/E/F test fan-out rows as each feature wave closes.
4. Require root lint green before FE-G promotion.

Minimum IAM validation:

```sh
pnpm -r --filter @stynx-web/angular-iam lint
pnpm -r --filter @stynx-web/angular-iam typecheck
pnpm -r --filter @stynx-web/angular-iam build
pnpm -r --filter @stynx-web/angular-iam test
pnpm -r --filter @stynx-web/angular-iam test:mutation
pnpm lint
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-G report exists and includes current, audited validation rows for every closed FE feature surface.

## Phase 6 - FE-H Reference And Documentation

**Owner:** Engineer for `reference/` and `tools/`; Architect for formal docs outside `docs/work`; Auditor for final programme summary.

Close H.1-H.6:

- starter or `create-stynx-app` path,
- reference web docs,
- package READMEs,
- final install flow,
- final before/after FE matrix,
- programme-level closure registry summary.

Minimum validation:

```sh
pnpm -r --filter './packages-web/*' build
pnpm -r --filter './packages-web/*' test
pnpm --filter @stynx/reference-web build
pnpm lint
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

**Exit condition:** FE-H report is closed and `FE-CLOSURE-REGISTRY.md` contains the programme-level summary required by the original orchestrator prompt.

## Stop Conditions

Stop and write `docs/work/plan/FE-QUESTIONS.md` before proceeding if:

- `pnpm-lock.yaml` contains changes that cannot be traced to FE package additions or package-manager normalization.
- A gate failure requires editing outside the current role authority.
- A wave document has ambiguous success criteria.
- A worker needs to choose between changing the backend contract and changing frontend assumptions.

## Final Done Definition

The frontend lift-up session is complete only when:

1. FE-A through FE-H are closed in `FE-CLOSURE-REGISTRY.md`.
2. `coverage/test-evidence.json` exists and records the final web subset.
3. `pnpm lint`, `pnpm i18n:check`, `pnpm test:matrix --no-color --coverage`, and `git diff --check` pass.
4. FE-G contains current test fan-out evidence for IAM, profile/sessions, storage/trash/i18n, audit/tenancy, and flow.
5. FE-H contains reference/starter/docs evidence.
6. The programme summary cites before/after FE expectation matrix movement and the new packages shipped.
