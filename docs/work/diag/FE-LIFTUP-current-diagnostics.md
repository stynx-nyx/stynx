# FE Lift-Up Current Diagnostics

**Compiled:** 2026-05-19T21:41:23Z
**Author role:** Auditor
**Reads:** `docs/work/inv/FE-LIFTUP-current-inventory.md`, FE closure reports, live git status.
**Purpose:** Explain why the current FE programme cannot simply resume at FE-G/H despite committed work through `HEAD`.

## Headline Findings

| Severity | Finding | Impact |
| -------- | ------- | ------ |
| High | `coverage/test-evidence.json` is missing | The orchestrator cannot promote any wave boundary under the FE cadence until evidence is regenerated and re-read. |
| High | FE closure registry is stale | It reports C-F progress from an earlier point and does not reflect later report rows C.5, D.9, E.6, and F.3. |
| High | FE-G work exists without a report | IAM mutation/test fan-out appears partly committed, but FE-G has no `FE-WAVE-G-report.md`, so there is no promotable audit trail. |
| High | Root i18n is blocked by audit catalogs | D.9 and C.5 report `pnpm i18n:check` blocked by `@stynx-web/angular-audit` missing or stale catalogs. |
| Medium | Root lint blockers require fresh verification | Older report rows mention Stryker instrumentation in source; current source search does not show active `stryCov_*`, but only a clean root `pnpm lint` can close the condition. |
| Medium | Worktree contains non-FE residue | Docs under `docs/adr` and `docs/operations` are dirty. They are outside Auditor FE authority and should not be silently absorbed into FE closure. |
| Medium | `pnpm-lock.yaml` is dirty and large | It may be legitimate after package additions, but it must be reviewed before any "commit all" or promotion. |

## Diagnostic Detail

### 1. Evidence Is Not Recoverable From Memory

The original FE cadence requires re-reading `coverage/test-evidence.json` at every wave boundary. That file is not present in the live checkout. Generated `.test-results/**` files are dirty, but they are not a substitute for the aggregate evidence file until `pnpm test:evidence` or the matrix pipeline regenerates it.

### 2. Reports And Registry Disagree

The registry still marks:

- FE-C as C.1-C.4 complete, but the report contains C.5.
- FE-D as D.1-D.8 complete, but the report contains D.9.
- FE-E as E.1-E.5 complete, but the report contains E.6.
- FE-F as F.1-F.2 complete, but the report contains F.3.

This is not a code blocker, but it is a governance blocker. Promotion should update the registry only after fresh validation, not merely because report rows exist.

### 3. FE-D Is Implemented But Still Blocked By Cross-Wave Work

D.9 reports passing storage/trash/i18n scoped builds, tests, lint, Stryker, matrix, and diff-check. It also reports:

- `pnpm i18n:check` blocked by `@stynx-web/angular-audit`.
- Root `pnpm lint` blocked at that time by FE-G-owned IAM Stryker instrumentation.

The source instrumentation appears cleaned now, but FE-D cannot be promoted from stale output. It needs a fresh clean pass.

### 4. FE-E Is The Current Cross-Cutting Blocker

Audit is now a real package with initial components, but it lacks the remaining FE-E surfaces:

- entity history component,
- hash integrity badge,
- routes/provider API,
- `en` and `pt-BR` catalogs plus generated keys,
- tests and mutation closure.

Because audit catalogs block the global i18n gate, FE-E should be prioritized before trying to promote FE-D or FE-G/H.

### 5. FE-G Must Be Rebuilt As A Rolling Report

The IAM package now has Stryker config and expanded tests, which matches the intended FE-G start. But without `FE-WAVE-G-report.md`, the programme has no row-level closure proof for:

- the exact IAM validation commands,
- mutation score and threshold,
- matrix/evidence update,
- root lint and i18n state,
- whether test artifacts are generated or committed intentionally.

## Promotion Conditions

No additional FE wave should be marked closed until all of the following are true:

1. The working tree is intentionally scoped: generated residue is either removed or regenerated, and non-generated dirty files are reviewed.
2. `coverage/test-evidence.json` is regenerated.
3. `pnpm lint` exits 0.
4. `pnpm i18n:check` exits 0.
5. `pnpm test:matrix --no-color --coverage` exits 0 against the regenerated evidence.
6. `git diff --check` exits 0.
7. The relevant `FE-WAVE-<X>-report.md` contains closure rows with current command output.
8. `FE-CLOSURE-REGISTRY.md` is updated only after the report is audited.

## Diagnostic Conclusion

The correct recovery path is not "restart from FE-A" and not "jump to FE-H." FE-A and FE-B are closed. The right path is a controlled lift-up recovery: stabilize evidence, unblock audit i18n, finish remaining C/E/F feature slices, promote D with fresh gates, formalize FE-G, then run FE-H.
