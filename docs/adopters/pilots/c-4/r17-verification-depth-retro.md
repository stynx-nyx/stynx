# R17 Verification-Depth Retro

**Date:** 2026-06-11  
**Round:** R17 verification-depth and confidence closure  
**Author role:** Auditor  
**Evidence roots:** `docs/work/round-17/`, `docs/meta/known-gaps.md`

## What The Audit Found

The 2026-06-10 audit found that stynx had strong verification machinery, but some of it was not yet enforcing the surfaces it claimed to cover. The weekly mutation workflow ran 11 of 31 configured packages, several web packages still relied on export-existence tests, the reference API lacked the security-header pattern adopters copy, key-rotation operations were underdocumented, `headerToString()` had six local implementations, and `domain/demo-bookmark` was still at F-9 step 1/N.

R17 also confirmed the WAVE-05A lesson: audits go stale in weeks. Several mutation and assertion findings from the older report were already fixed before this round started, so W01 re-baselined before any executor changed code.

## Before And After

| Signal                          |  Before R17 |               After R17 | Evidence                                                                                                            |
| ------------------------------- | ----------: | ----------------------: | ------------------------------------------------------------------------------------------------------------------- |
| Weekly mutation matrix coverage | 11 packages |             31 packages | `.github/workflows/hardening.yml`; `docs/work/round-17/inv-after/mutation-scores.json`                              |
| Web package spec files          |          35 |                      46 | `docs/work/round-17/inv-before/web-spec-counts.json`; `docs/work/round-17/inv-after/web-spec-counts.json`           |
| Web package `it()` blocks       |         389 |                     413 | Same snapshots                                                                                                      |
| `headerToString()` definitions  |           6 |                       1 | `docs/work/round-17/inv-before/headerToString-sites.json`; `docs/work/round-17/inv-after/headerToString-sites.json` |
| Reference API security headers  |      absent |                 present | `reference/api/src/security-headers.ts`; W05 live `/readyz` header capture                                          |
| Key-rotation runbook            |      absent |                 present | `docs/meta/security/key-rotation-runbook.md`                                                                        |
| demo-bookmark F-9 status        |    step 1/N | step 2 complete locally | `domain/demo-bookmark/docs/README.md`; W07 API/web local gates                                                      |

## E2 Outcomes

No mutation tier was lowered in R17.

Available local evidence keeps the E2 watchlist above its configured breaks:

| Package                      | Tier break | Available score | Source                                                        |
| ---------------------------- | ---------: | --------------: | ------------------------------------------------------------- |
| `@stynx-web/angular-auth`    |         90 |           90.79 | W04 local full-mode Stryker, `reports/mutation/mutation.json` |
| `@stynx-web/angular-profile` |         85 |           89.69 | W04 local full-mode Stryker, `reports/mutation/mutation.json` |
| `@stynx/health`              |         90 |          100.00 | W02 local full-mode Stryker                                   |
| `@stynx-web/angular-trash`   |         90 |           95.45 | W02 local full-mode Stryker                                   |

The full 31-package GitHub Actions mutation dispatch was not validly reverified for this exact patch because the working tree is uncommitted. Dispatching `hardening.yml` now would run a branch ref that does not contain these local edits. The after-baseline records available local artifacts and W02/W04 evidence without changing any tiers.

## What Remains

R17 narrowed F-03 instead of deleting it. The stale "uniformly 1 per package" frontend coverage claim is no longer true, but two residuals remain: no browser-driven e2e harness has been adopted, and backend `*.e2e-spec.ts` names still overstate the scope of mostly controller-wiring smoke tests.

R10-01 remains open because the recommended fix belongs in the sibling `pec` repo: use `pnpm install --frozen-lockfile --dir stynx` in the sibling-checkout recipe. That is an operator decision outside stynx authority.

PF-06 was intentionally untouched.

## R18 Candidates

- Browser-driven e2e decision and ADR for reference/web and package workflows.
- Backend pseudo-e2e rename or reclassification.
- Reference-web deepening beyond the current skeleton.
- JSDoc enforcement extension beyond the current nine-package list.
- `flow-runtime.service.ts` and `flow-design.service.ts` internal-module split.
- Stryker Dashboard reporter and concurrency tuning.

## Closeout Caveat

W08 local closeout did not produce a green `pnpm ci:stynx` run. Full-run attempts exposed and fixed several web-test TypeScript issues, then reached package tests. `@stynx/sessions` hit a Vitest worker RPC timeout after all 59 tests passed; the focused sessions retry exited 0. `@stynx/pdf` then timed out a local renderer test at 30 seconds under concurrent Turbo execution, and a focused package retry did not exit 0 in the current environment because Docker-backed veraPDF conformance files ran and timed out at 80 seconds each. Module GitHub Actions evidence is also blocked until this local patch is pushed to a branch or PR ref.
