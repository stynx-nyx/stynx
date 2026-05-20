# Test Framework Lift-Up Completion Plan

**Captured:** 2026-05-19
**Author role:** Auditor
**Inventory:** `docs/work/inv/TEST-LIFT-current-inventory.md`
**Diagnostics:** `docs/work/diag/TEST-LIFT-current-diagnostics.md`

## Objective

Complete the interrupted test-framework lift-up session from the current calm checkout, producing fresh evidence, closing remaining FE/test-framework gaps, and restoring enough confidence to run `pnpm ci:stynx` and `pnpm ci:stynx:full` without waivers.

## Non-Negotiables

- Do not close any wave from stale `.test-results` or fallback `coverage/coverage-final.json`.
- Do not edit non-`docs/work` files from the orchestrator. Use Engineer, Inspector, or Architect workers for code/test/config changes.
- Do not mark a matrix `!` as not applicable without an explicit Architect policy row or question.
- Do not run final full gates while background workers are active.

## Phase 0 - Freeze And Classify The Workspace

Goal: establish a clean execution boundary.

Required actions:

1. Verify no active workers or test processes.
2. Review dirty state and classify each path as one of:
   - intended source/config change,
   - generated evidence to regenerate,
   - stale generated artifact to drop,
   - unknown/question.
3. Decide how to handle `pnpm-lock.yaml` drift.
4. Preserve the dirty `packages-web/angular-profile/src/routes.ts` fix unless the owning FE-C worker provides a replacement.

Exit criteria:

- `git status --short` is understood and classified.
- No process-level test/worker activity.
- Operator has accepted the evidence cleanup policy.

## Phase 1 - Evidence Bootstrap

Goal: recreate canonical evidence from the calm state.

Required commands:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm install --offline --frozen-lockfile
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:evidence
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --coverage
```

Exit criteria:

- `coverage/test-evidence.json` exists and is current.
- Matrix output is saved into the worker closure row.
- Any generated evidence churn is expected.

## Phase 2 - Close Immediate Red Gates

Goal: repair known focused failures before broad fan-out.

Workstreams:

| ID | Owner role | Scope | Exit criteria |
| -- | ---------- | ----- | ------------- |
| TL-2.1 | Engineer | `@stynx-web/angular-profile` route clone fix and package validation | `pnpm --filter @stynx-web/angular-profile typecheck`, build, test pass. |
| TL-2.2 | Engineer | `@stynx-web/angular-audit` i18n catalogs | `pnpm i18n:check` passes. |
| TL-2.3 | Architect | Decide whether `@stynx-domain/demo-bookmark-api` API matrix is applicable | Either route tests are required, or policy explicitly records not-applicable status. |

Exit criteria:

- `pnpm i18n:check` passes.
- `@stynx-web/angular-profile` typecheck remains green.
- Demo API route policy is no longer ambiguous.

## Phase 3 - Finish FE-C Through FE-F

Goal: complete the FE waves already in progress.

Workstreams:

| Wave | Remaining scope |
| ---- | --------------- |
| FE-C | C.6-C.9 unless live code/report audit proves them already landed. |
| FE-D | D.9 test/mutation closure. |
| FE-E | E.7-E.11 audit entity history, integrity badge, routes/provider, catalog, tests. |
| FE-F | F.4-F.11 flow run activity, question breadth, dashboard, OnPush audit, translation, router tests, ergonomics, tests, version bump readiness. |

Exit criteria:

- FE-C/FE-D/FE-E/FE-F reports contain closure rows for every success criterion.
- Orchestrator reruns each wave's validation and updates `FE-CLOSURE-REGISTRY.md`.

## Phase 4 - FE-G Test Fan-Out And Mutation

Goal: convert FE evidence from feature-complete to test-framework-complete.

Required scope:

- TestBed helper and behavior specs for remaining web components.
- Router specs for every package shipping routes.
- IAM/profile mutation treatment.
- Playwright and a11y routing only after package unit/build/i18n gates are green.

Exit criteria:

- `FE-WAVE-G-report.md` exists.
- `@stynx-web/angular-iam` and `@stynx-web/angular-profile` no longer show mutation `!`, or a documented Architect threshold/policy decision exists.
- Coverage matrix uses fresh `coverage/test-evidence.json`, not fallback.

## Phase 5 - Backend Mutation And API Matrix Closure

Goal: remove non-FE compact-matrix blockers that keep W1/W2 open.

Workstreams:

| Area | Packages |
| ---- | -------- |
| Mutation | `@stynx/audit`, `@stynx/cli`, `@stynx/data`, `@stynx/flow`, `@stynx/i18n`, `@stynx/privacy`, `@stynx/tenancy`, `@stynx/testing` |
| API matrix | `@stynx-domain/demo-bookmark-api` and any controller rows missing from current route inventory |

Exit criteria:

- Compact matrix has no unexpected `!` cells.
- Any remaining `!` is tied to a documented open question or accepted policy decision.

## Phase 6 - Full Gate Closure

Goal: restore no-waiver closure.

Commands:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm ci:stynx
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm ci:stynx:full
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --coverage
```

Additional checks:

```bash
find packages packages-web -path '*/.stryker-tmp/backup-*' -type d -print
git diff --check
```

Exit criteria:

- `ci:stynx` exits 0.
- `ci:stynx:full` exits 0.
- No stale Stryker backup directories.
- Closure registry and reports cite fresh commands and outputs.

## Questions To Resolve Before Final Promotion

1. Should the old W0-W7 plan docs be restored/recreated, or superseded by this `TEST-LIFT-*` pack?
2. Should `.test-results` artifacts be committed as evidence, regenerated only locally, or ignored from final publication?
3. Is broad `pnpm-lock.yaml` drift intentional after the reboot/deep-clean, or should it be narrowed before final gates?
4. What is the intended status of `@stynx-domain/demo-bookmark-api` API matrix applicability?
