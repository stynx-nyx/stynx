# FE Lift-Up Current Inventory

**Compiled:** 2026-05-19T21:41:23Z
**Author role:** Auditor
**Workspace:** `/Users/aarusso/Development/stech/stynx`
**Branch / HEAD:** `main` at `9bc9f4f8bcf4ad427c4891c2e70d2363658a0a17`
**Purpose:** Capture the live post-interruption state of the frontend completeness work so the next execution pass starts from repository facts, not prior session memory.

## Runtime Baseline

| Item | Current value | Assessment |
| ---- | ------------- | ---------- |
| Node | `v24.15.0` | Matches root engine `>=24 <25`. |
| pnpm | `9.15.0` | Matches root engine `>=9 <10` and `packageManager: pnpm@9.15.0`. |
| `coverage/test-evidence.json` | Missing | Must be regenerated before any wave boundary promotion. |
| `scripts/test-matrix.config.json` | Present | Threshold policy remains available and must not be regressed. |
| FE worker reports | A-F exist; G-H missing | FE-G and FE-H cannot be promoted yet. |

## Worktree Inventory

The worktree is not pristine. Generated test artifacts are dirty, and six non-generated files have uncommitted diffs.

| Category | Paths | Notes |
| -------- | ----- | ----- |
| Generated evidence residue | Many `**/.test-results/**` files under `packages-web/`, `packages/`, `test/`, and `tools/` | These appear to be local run output after the checkpoint. Decide whether to preserve, regenerate, or discard before continuing orchestration. |
| Lockfile | `pnpm-lock.yaml` | Large diff. Treat as high-risk until reviewed against package changes and install command history. |
| Source residue | `packages-web/angular-profile/src/routes.ts`; `packages-web/angular-storage/test/angular-storage.spec.ts` | Small type-safety cleanup diffs. They may be legitimate follow-up fixes but are not yet documented in a closure row. |
| Documentation residue | `docs/adr/ADR-FE-PACKAGING-0001-ng-packagr-adoption.md`; `docs/operations/test-result-contract.md`; `docs/operations/vitest-parallel-adoption.md` | Markdown link style churn outside the FE work directory. Do not fold into FE promotion without owner review. |

## Closure Artifacts On Disk

| Artifact | State | Notes |
| -------- | ----- | ----- |
| `docs/work/plan/FE-CLOSURE-REGISTRY.md` | Present but stale | Lists FE-A and FE-B closed; C-F in progress; FE-G ready for B; FE-H blocked. It does not reflect later rows added to C-F reports. |
| `docs/work/plan/FE-WAVE-A-report.md` | Present | Contains A.1-A.9 and promotion summary. |
| `docs/work/plan/FE-WAVE-B-report.md` | Present | Contains B.1-B.9, IAM reference-web mount, typecheck repair, and promotion summary. |
| `docs/work/plan/FE-WAVE-C-report.md` | Present | Contains C.1-C.5. |
| `docs/work/plan/FE-WAVE-D-report.md` | Present | Contains D.1-D.9 and reported D.9 blockers. |
| `docs/work/plan/FE-WAVE-E-report.md` | Present | Contains E.1-E.6. |
| `docs/work/plan/FE-WAVE-F-report.md` | Present | Contains F.1-F.3. |
| `docs/work/plan/FE-WAVE-G-report.md` | Missing | FE-G has no formal report. |
| `docs/work/plan/FE-WAVE-H-report.md` | Missing | FE-H has no formal report. |

## Wave Inventory

| Wave | Current status | Implemented / reported | Open work |
| ---- | -------------- | ---------------------- | --------- |
| FE-A | Closed | A.1-A.9 promoted in the registry and report. | None known, but promotion evidence is historical and should not be reused for later waves. |
| FE-B | Closed | B.1-B.9 and `reference/web` IAM mount promoted. | IAM mutation intentionally deferred to FE-G. |
| FE-C | In progress | C.1-C.5 reported: profile service, profile form, preferences form, hosted auth handoff, routes/provider/unsaved guard. | C.6-C.9 remain: sessions adapter/polish, remaining profile/session catalog or route polish if required by the wave, and test/mutation closure. |
| FE-D | Implemented but not promotable | D.1-D.9 reported, including storage/trash/i18n tests and mutation evidence. | Needs fresh global i18n, lint, matrix, evidence regeneration, registry update, and promotion audit. |
| FE-E | In progress | E.1-E.6 reported: tenancy change event, tenant picker, error decoration, audit scaffold, audit API service, audit log/detail components. | E.7-E.11 remain: entity history, hash integrity badge, routes/provider, catalogs, tests/mutation. Audit catalogs currently block `pnpm i18n:check`. |
| FE-F | In progress | F.1-F.3 reported: empty states, publish/draft contract and implementation, my-tasks inbox. | F.4-F.11 remain, including final package polish and `@stynx-web/angular-flow` 1.0 readiness. |
| FE-G | Started, not formalized | IAM test fan-out and Stryker config are committed at HEAD. | Create FE-G report, rerun IAM mutation and gates, then fan out tests for C/D/E/F as each closes. |
| FE-H | Blocked | No report. | Last wave only: reference app, starter, package docs, final programme summary. |

## Package Snapshot

| Package | Version | Mutation configured | Notes |
| ------- | ------- | ------------------- | ----- |
| `@stynx-web/angular-iam` | `0.1.0` | Yes | FE-B feature work is closed; FE-G IAM mutation/test fan-out is partially committed but unreported. |
| `@stynx-web/angular-audit` | `0.1.0` | No | FE-E scaffold and first components exist; routes, catalogs, tests/mutation remain. |
| `@stynx-web/angular-flow` | `0.1.0` | Yes | FE-F has not completed the 1.0 lift-up. |
| `@stynx-web/angular-profile` | `1.0.0` | Yes | C.1-C.5 implemented; sessions/profile remaining work is still open. |

## Inventory Conclusion

The checkpoint preserved substantial FE work in `HEAD`, but formal programme state is only closed through FE-B. FE-C through FE-F have useful completed slices, FE-D may be closest to promotable after global blockers clear, FE-G needs formalization, and FE-H has not begun.
