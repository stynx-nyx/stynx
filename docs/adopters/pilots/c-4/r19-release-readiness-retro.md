# R19 Release Readiness Retro

**Date:** 2026-06-12
**Round:** R19 release-readiness hardening and closeout
**Author role:** Auditor
**Evidence roots:** `docs/work/round-19/`, `docs/meta/known-gaps.md`, `docs/meta/ops/release-dry-run-2026-06.md`

## Framing Lesson

R19 was release-chain archaeology first and feature work second. R17 exposed 8 latent breaks when "passing" gates were finally exercised end to end. R19 found a smaller but still real reservoir: 5 actionable local release-chain break classes in W03, plus a W09 stale-SBOM recurrence caught by the release lane after later waves changed the package graph.

The trend is positive: the release chain now has a green local script path, green consumer fixtures, green dry-publish evidence, and fewer hidden failures than R17. The remaining blocker is not packaging readiness; it is the R17-K6 E3 performance/capacity issue.

## Before And After

| Signal                               |                                                                          Before R19 |                                                                   After R19 |
| ------------------------------------ | ----------------------------------------------------------------------------------: | --------------------------------------------------------------------------: |
| Release-chain latent break classes   |                                                  5 local break classes found in W03 |                       0 local release-chain blockers after W09 SBOM refresh |
| `packages/data/src/transaction.ts`   |                                                                           843 lines |                                                                   433 lines |
| `@stynx/data` mutation scope         |                                 `database.ts`, `query-helpers.ts`, `transaction.ts` | adds `archive-relations.ts`, `archive-restore.ts`, `soft-delete-cascade.ts` |
| `@stynx/data` mutation score         | 96.59 from prior hardening artifact, with timeout inflation risk and narrower scope |                             93.22 non-incremental, break 90, six-file scope |
| Data mutation harness                |                                                      `data.module.spec.ts` excluded |                       exclusion removed; `data.module.spec.ts` participated |
| Testing package imports              |                                           8 relative `packages/testing/src` imports |                                0; package consumers import `@stynx/testing` |
| Hardening workaround                 |                                           `@stynx/testing` build workaround present |                                                          workaround removed |
| k6 reference scenarios               |                                      failing in CI without current root-cause class |    E3 capacity/latency blocker; route drift and `http_req_failed` ruled out |
| Docs broken-link references          |                                                                                4368 |                                                        87 in W09 full build |
| Current-doc broken-link source pages |                                         non-zero, dominated by stale current routes |                                                                           0 |

## Outcomes

- W02 executed the decision register: deleted F-03, removed Stryker Dashboard publication wiring, and guarded DEVAI gates behind an explicit opt-in.
- W03 made the release chain green locally, refreshed SBOM and API baselines, fixed production audit advisories, and corrected publish-build hygiene for `@stynx/data` and `@stynx/testing`.
- W04 split data transaction internals without changing the public export surface and kept every data source file below 500 lines.
- W05 repaid the `data.module.spec.ts` mutation-harness exclusion.
- W06 forced package consumers to use `@stynx/testing` rather than relative package internals and removed the hardening workaround.
- W07 classified the k6 failure as capacity/latency: auth passed; CRUD, upload, and cascade-delete had `http_req_failed=0` and 100% checks but breached latency or dropped-iteration thresholds.
- W08 removed current-doc link drift and left only historical Docusaurus version-snapshot warnings.
- W09 re-ran the local closeout gates, caught and fixed a stale SBOM recurrence, and verified the release lane after all other waves.

## E1-E3

- E1: No release-policy weakening was required. W03 used dry-publish only, targeted GitHub Packages with `--registry https://npm.pkg.github.com`, and did not publish, tag, or mint credentials.
- E2: The cross-repo adoption pack at `../align/stynx/round-19-adoption/` has only a plan and prompts. R10-01 and PF-06 therefore stay open in `docs/meta/known-gaps.md`; there is no completion log or sibling-repo SHA to reconcile yet.
- E3: R17-K6 remains a release blocker. W07 proved the scenarios are functionally correct but exceed the current capacity/latency envelope. Thresholds were not loosened.

## Operator Follow-Ups

- Real registry publication remains CI-owned. W03 proved dry-publish packaging and target parity, but actual GitHub Packages publication still depends on the repository/organization package settings and release workflow credentials being configured for a real publish run.
- The DEVAI gates workflow is now opt-in by `DEVAI_GATES_ENABLED`; operators should enable it only when the private DEVAI checkout/token policy is ready for the repository.
- The cross-repo adoption pack still needs execution in `../pec` and `../porm` before R10-01 or PF-06 can be deleted.

## Gate Evidence

- `pnpm ci:stynx` exit 0 after W09: lint, typecheck, unit tests, integration tests, build, and doctor passed.
- `pnpm ci:stynx:release` exit 0 after W09 SBOM refresh: SBOM, license policy, secret scan, production audit, provenance, release policy, API baselines, consumer fixtures, and release drafts passed.
- `STRYKER_INCREMENTAL=false pnpm --filter @stynx/data stryker` exit 0: final score 93.22, break 90.
- Docs build exit 0 in the full CI gate; current-doc broken-link source pages were 0.

## R20 Candidates

- Profile and optimize the reference API/probe hot paths behind R17-K6 before changing any k6 threshold.
- Execute the `../align/stynx/round-19-adoption/` PEC recipe fix and PORM Flow cutover pack, then reconcile R10-01 and PF-06 with real sibling-repo evidence.
- Decide whether historical Docusaurus version snapshots should be frozen with known broken links or regenerated/sanitized as part of a versioned-docs maintenance round.
- Add a pre-commit or CI freshness check that catches SBOM drift immediately after lockfile/package changes, not only during release closeout.
