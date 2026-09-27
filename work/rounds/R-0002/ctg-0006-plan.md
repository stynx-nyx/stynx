# CTG-0006 — web kit and published test helpers

**Role:** Architect. **Authority:** DETRAN C-0002 §6.3–6.6, §7 and OD-S15-01; `docs/framework/contracts/web-kit-1.5.md`. All 14 requirements here are MUST. DETRAN is read only.

## Topology and scope

This preparation worktree starts from the RC1 main line. Before PR creation, integrate the implemented CTG-0002 SSE/testing export, CTG-0003 auth/session, CTG-0004 jobs, and CTG-0005 transaction heads in topological order; preserve their tests and rerun affected gates. CTG-0006 owns U8–U11 except UPS-TEST-01, already allocated to CTG-0002. One CTG-0006 PR and fixed-group changeset. No candidate UPS-SIG/OBX/OFS enters this CTG absent the §8 adenda.

## Role-separated work and locks

| Task                                         | Exclusive writable paths                                                                                                                                                                                                                             | Checkpoint                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Inspector A — HTTP and Angular error sensors | `packages/backend/test/**/if-match*.spec.ts`, `packages-web/angular/test/*error*.spec.ts`, `packages-web/angular-ui/test/*error*.spec.ts`                                                                                                            | 428/412 schema, successful new ETag, classification table, exclusions, banner |
| Inspector B — shell and test helper sensors  | `packages-web/angular-ui/test/*shell*.spec.ts`, `reference/web/test/e2e/*shell*.spec.ts`, `packages-web/angular-auth/test/*testing*.spec.ts`, `packages-web/angular-i18n/test/*testing*.spec.ts`, `packages/testing/test/*fake-transaction*.spec.ts` | axe and keyboard, persistence, public subpaths, typed fake                    |
| Engineer A — backend and errors              | `packages/backend/src/if-match/**`, `packages/backend/src/index.ts`, `packages-web/angular/src/error*.ts`, `packages-web/angular/src/types.ts`, `packages-web/angular/src/{provide-defaults,stynx-angular.module}.ts`                                | IFM and NGERR runtime; coordinate `angular-ui` banner API with B              |
| Engineer B — shell and test helpers          | `packages-web/angular-ui/src/**`, `packages-web/angular-auth/src/testing/**`, `packages-web/angular-i18n/src/testing/**`, `packages/testing/src/**`                                                                                                  | shell, banner component, testing helpers; do not edit Engineer A files        |
| Maestro by role                              | Architect: contract/plan/prompts, trace, baselines. Inspector: any frozen package hash assertion if manifest changes. Engineer: changeset, package READMEs, catalogs and reference consumer proof.                                                   | Separate commits per role                                                     |

Engineer A and B may proceed in parallel only after Inspector tests are committed and public UI props/error classification types are settled in the contract. Any package manifests/lockfile/build metadata, including the new `@angular/router` peer/dev dependency for `angular-ui`, belong to root Engineer to prevent collision. Actual imported dependency additions require a frozen install and changeset. Generated outputs are written only via supported tooling. Root Engineer owns a small `reference/web` fixture route to render the published shell for real Playwright/axe and external package import proof; it must use only STYNX symbols and no DETRAN code.

## Sequence

1. Cross-family Opus 5.5 prompt-review of this plan, contract and prompts 70–73 before dispatch. Max two cycles. REVIEW means Architect triage and revised prompt; FAIL stops. Check specifically the law error-envelope gap, decorator/filter binding, test helper typing, Angular module/provider parity and axe lane.
2. Inspector A/B write failing tests for every MUST, including positive and negative branches. The tests must compile against the proposed public API after implementation; red failures at the expected absent symbols or behavior are acceptable. Preserve all existing tests; do not weaken unrelated assertions. Root commits F3 separately and Architect rebinds trace from `pnpm check:trace --print`.
3. Engineer A/B implement against those tests with no shims or DETRAN code. Any migration of the global `StynxErrorFilter` beyond the scoped IFM responses requires Architect contract repair and broad compatibility tests first. Root commits F2 separately. Engineer root writes one fixed-group changeset and package READMEs; `pnpm package-readmes:write` owns its generated sections.
4. Architect confirms API diff and runs `pnpm api:baselines:write`, then API baseline check. If a published package manifest moves frozen byte hashes, Inspector rebinds exact hash sensors; no role mixes in one commit. Record actual symbols/tests/deviation in final §7 conformance table.
5. Run all focused tests including real Nest HTTP, Angular TestBed and Playwright axe; `pnpm ci:reference-apps`, `pnpm check:trace --print`, `pnpm package-readmes:check`, `pnpm ci:stynx`, DEVAI forbidden strict, cross-family Opus delivery-review PASS and remote CI green. Merge one CTG PR only after predecessors merge and topological integration gates pass. RC publication needs a separate exact Owner receipt.

## Evidence

For IFM, test the `@RequireIfMatch()` method decorator plus `@IfMatchRevision()` parameter decorator on a real Nest route: missing/malformed/weak/wildcard/duplicate/unsafe tags, 412 on concurrent revision, unchanged body and new ETag on success, law-schema 428/412 with request id including a handler-thrown error, and no ETag on failure. Preferences retains its existing behavior. For NGERR, test 0/401/403/404/409/412/428/422/429/5xx, code vs prefix precedence, old/new envelope parsing, SSE and local-412 exclusion with error rethrow, and both Angular registration paths. For SHELL, test i18n in en and pt-BR, landmark names, aria-current, skip focus, keyboard order, status live region, storage reload/denial/invalid value and axe `serious`/`critical` zero on a real page. For TEST, exercise each published import path from a consuming package/test and migrate applicable STYNX tests to those dublês; retain real PostgreSQL tests for data behavior.

## Triagem

No task or reviewer failure yet. Classify any failure in one line here as `plant-bug|sensor-error|policy-issue|reference-gap`, attempt one repair, then escalate.

## Retomada

Architect draft only. Prompt-review PASS is required before Inspector dispatch. This branch has not integrated the CTG-0002…0005 implementations and is not ready for PR, merge, versioning, or publication.
