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

## Closeout (final, 2026-06-11)

The caveat below was written by the W08 executor before the closure session; it is superseded by the following final record and kept for history.

R17 closed with every binding gate green. `pnpm ci:stynx` exited 0 against the committed tree once the Docker daemon was up (the pdf veraPDF conformance pair passes in ~67s each; the earlier timeouts were a daemon-down environment issue, and the sessions failure was a one-off Vitest worker RPC flake that passed focused and in the full rerun). Six role-prefixed wave commits plus thirteen closure commits were pushed (`51fb7206b..98663cfc3`). `module-demo-bookmark.yml` went green for the first time in its existence (run 27371069142), `reference-apps.yml` went fully green for the first time since R15 (run 27371818093, including the 33-spec Playwright lane and Trivy), and hardening attempt 6 (run 27377373835) finished with **all 31 mutation lanes green**; its only red job is the pre-existing k6 `crud` threshold breach, escalated as ledger row R17-K6.

The dominant closeout lesson: **the round's gates had never been exercised end-to-end before, and closing them surfaced eight latent, pre-existing CI breaks** — a fabricated `helmet` lockfile integrity hash (package content verified byte-identical to the npm registry before correcting); the module workflow invoking a local composite action before checkout (red in 8s since birth) plus a node-20-vs-engines-24 pin; `reusable-typecheck.yml` never having run green for the same checkout reason; the `setup-stynx` cache post-step failing `install: 'false'` jobs; the reference-api Dockerfile copying `docs/api`, deleted by R15's docs-IA move (reference-apps red since R15); the scheduled hardening workflow failing every Monday since at least 2026-05-11 because mutation lanes never built workspace dists; tenancy specs importing `packages/testing/src` helpers via relative cross-package paths (undeclared dep); and the data module-integration spec being pathological under Stryker perTest instrumentation (timeout at both 30s and 120s; excluded from the mutation harness only, with an R18 profiling follow-up). A mis-scoped root eslint config applying Angular rules to NestJS packages was also fixed, with the obsolete `prefer-inject` disable comments swept.

Additional R18 candidates from closeout: test-import hygiene (export the `@stynx/testing` helpers properly, declare devDeps, extend boundaries lint to test files); k6 `crud` scenario triage against the now-bootable reference stack; profiling the instrumented data fixture.
