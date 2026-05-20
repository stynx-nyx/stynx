# Test Framework Lift-Up Inventory

**Captured:** 2026-05-19
**Author role:** Auditor
**Purpose:** Current-state inventory for resuming the interrupted test-framework lift-up session after reboot and cleanup.

## Repository State

| Item | Current value |
| ---- | ------------- |
| Branch | `main` tracking `origin/main` |
| HEAD | `9bc9f4f Engineer + Inspector + Auditor: checkpoint PORM-FLOW WIP + vitest migration of u.13-u.21 specs` |
| Worker processes | None found for `codex exec`, Claude worker CLI, `pnpm`, `turbo`, `vitest`, `stryker`, or Playwright test-server in the stynx process scan after shutdown. |
| Canonical test evidence | `coverage/test-evidence.json` is absent. |
| Coverage fallback artifact | `coverage/coverage-final.json` exists and is used by `pnpm test:matrix --no-color --coverage` as fallback. |
| Generated package evidence | 208 files exist under package/tool/test `.test-results/` directories. |

## Dirty Worktree Surface

The worktree is calm but not clean. The current dirty surface is concentrated in:

| Surface | Status |
| ------- | ------ |
| `packages-web/angular-profile/src/routes.ts` | Modified. The `canDeactivate` optional-property issue is fixed locally by only assigning the property when present. |
| `pnpm-lock.yaml` | Modified. Broad dependency resolution churn is present, not just a single package link. |
| `.test-results/*` | Many generated unit/integration artifacts are modified. |
| `coverage/coverage-final.json` | Present, but `coverage/test-evidence.json` is absent. |

## Current Matrix Snapshot

Command: `pnpm test:matrix --no-color --compact`

Open non-green cells:

| Package | Level | Status |
| ------- | ----- | ------ |
| `@stynx-domain/demo-bookmark-api` | API | `!` |
| `@stynx-web/angular-iam` | Mutation | `!` |
| `@stynx-web/angular-profile` | Mutation | `!` |
| `@stynx/audit` | Mutation | `!` |
| `@stynx/cli` | Mutation | `!` |
| `@stynx/data` | Mutation | `!` |
| `@stynx/flow` | Mutation | `!` |
| `@stynx/i18n` | Mutation | `!` |
| `@stynx/privacy` | Mutation | `!` |
| `@stynx/tenancy` | Mutation | `!` |
| `@stynx/testing` | Mutation | `!` |

Command: `pnpm test:matrix --no-color --coverage`

Observed caveats:

| Package | Coverage status |
| ------- | --------------- |
| `@stynx-web/angular-iam` | `0` for lines/statements/branches/functions because canonical evidence is missing. |
| `@stynx-web/angular-audit` | Lines/statements show green, but branch/function cells are blank in fallback mode. |
| Most other listed packages | Green in fallback coverage view. |

## Current FE Programme Registry

Source: `docs/work/plan/FE-CLOSURE-REGISTRY.md`

| Wave | Registry status | Report status |
| ---- | --------------- | ------------- |
| FE-A | `CLOSED` | Report has A.1-A.9 and promotion summary. |
| FE-B | `CLOSED` | Report has B.1-B.9, reference-web mount, and typecheck repair. |
| FE-C | `IN_PROGRESS` | Report has rows through C.5; C.6-C.9 are not closed in registry. |
| FE-D | `IN_PROGRESS` | Report has D.1-D.8 and D.7 follow-ups; D.9 remains open. |
| FE-E | `IN_PROGRESS` | Report has E.1-E.6; E.7-E.11 remain open. |
| FE-F | `IN_PROGRESS` | Report has F.1-F.3; F.4-F.11 remain open. |
| FE-G | `READY_FOR_FE_B` | No `FE-WAVE-G-report.md` exists. |
| FE-H | `BLOCKED` | No report exists; blocked on FE-G. |

## Current Blocking Checks

| Check | Current result |
| ----- | -------------- |
| `pnpm --filter @stynx-web/angular-profile typecheck` | Passes after the dirty `routes.ts` fix. |
| `pnpm i18n:check` | Fails for `@stynx-web/angular-audit`: `keys.json` missing/out of date and `en.json` / `pt-BR.json` missing for 39 keys. |
| `pnpm ci:stynx` | Not rerun in the current calm state. Last interrupted session did not close it. |
| `pnpm ci:stynx:full` | Not rerun in the current calm state. Must wait until `ci:stynx` and evidence bootstrap are stable. |

## Existing Execution Artifacts

| Path family | Notes |
| ----------- | ----- |
| `docs/work/prompts/00-ORCHESTRATOR.md` and `01`-`09` workers | Original W0-W7 testing-remediation prompt pack still exists. |
| `docs/work/plan/WAVE-*` | Original W0-W7 plan/report files are absent from the current `docs/work/plan` directory. |
| `docs/work/plan/FE-*` | FE programme docs are present and are the only current wave docs on disk. |
| `docs/work/inv/FE-*`, `docs/work/diag/FE-*`, `docs/work/prompts/FE-*` | FE audit/inventory/diagnostic/prompt pack remains present. |
