# Known Gaps — stynx

**Compiled:** 2026-05-18 (rebaselined; closed rows removed)
**Author role (Constitution Article 6):** Auditor (analysis-only synthesis).
**Scope:** `./docs/` only. This file tracks **live, unresolved** gaps. Closed gaps and their evidence ledgers have been removed; recover prior history from git if needed.

When a previously-listed gap is verified closed, delete its row from this file rather than annotating it as "(CLOSED)". The git log is the audit trail.

---

## 1. Frontend coverage

| #    | Gap                                             | Source                            | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-03 | **Frontend test count uniformly 1 per package** | E2E audit 2026-05-18, direct grep | All 11 `packages-web/*` packages have exactly one `*.e2e-spec.ts` file containing a single `expect(Foo).toBeDefined()` export-existence assertion (8–18 lines each). No component rendering, router exercise, HTTP simulation, or user-interaction test exists. No Playwright/Cypress/Nightwatch config is present anywhere in the repo. The backend `test/e2e/*.e2e-spec.ts` files are also misnamed: they are NestJS controller-wiring smoke tests with services mocked and guards bypassed. Real e2e (testcontainer-backed) only exists for `idempotency` and `ratelimit`. |

## 2. PORM Flow transposition — outstanding work

| #     | Gap / capability                   | Status                                              | Detail                                                                                                                                                                                                                                          |
| ----- | ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-06 | **Original PORM consumer cutover** | Planned, awaiting explicit consuming-repo execution | The STYNX packages are ready for adoption, but replacing `../porm`'s in-repo Flow module with `@stynx/flow` + `@stynx-web/angular-flow` is a sibling-repo migration that has not been executed. Run only when explicitly requested by the user. |

## 3. Sibling-checkout CI verification

| #      | Gap / capability                                      | Status              | Detail                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10-01 | **PEC sibling-checkout CI script uses npm for stynx** | Verification failed | R10 reproduced the proposed `/tmp/ci-spike` sibling-checkout sequence on 2026-05-24. Cloning `devai`, `stynx`, and `pec` from local checkouts succeeded, but `npm ci --prefix stynx` failed because stynx is a pnpm workspace with `pnpm-lock.yaml` and no `package-lock.json`. Decide whether the PEC CI recipe should use `pnpm install --frozen-lockfile --dir stynx` before treating this verification as green. |

---

## Notes

- **Working directory:** `./docs/work/` was wiped on 2026-05-18 to start fresh. Future audit/remediation artifacts (plans, prompts, inventories, diagnostics, specs, rationalizations) go under the existing `docs/work/{audit,diag,inv,plan,prompts,rationalization,specs}/` skeleton.
- **Schema-bound architect substrates that ARE populated** (so a future session doesn't mistakenly file them as gaps): [architecture/flow.md](architecture/flow.md), [architecture/invariants/](architecture/invariants/), [adr/](adr/), [contracts/flow-api.md](contracts/flow-api.md), [operations/runbooks/](operations/runbooks/), [operations/recovery/](operations/recovery/).
- **Most-current per-cell state lives in code, not in this file.** Re-verify before re-opening anything: a row's absence here is a claim, not proof. If a check fails today, add the row back with current evidence.
