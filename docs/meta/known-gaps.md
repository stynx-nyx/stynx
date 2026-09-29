# Known Gaps — stynx

**Compiled:** 2026-05-18 (rebaselined; closed rows removed)
**Author role (Constitution Article 6):** Auditor (analysis-only synthesis).
**Scope:** `./docs/` only. This file tracks **live, unresolved** gaps. Closed gaps and their evidence ledgers have been removed; recover prior history from git if needed.

When a previously-listed gap is verified closed, delete its row from this file rather than annotating it as "(CLOSED)". The git log is the audit trail.

---

## 1. PORM Flow transposition — outstanding work

| #     | Gap / capability                   | Status                                              | Detail                                                                                                                                                                                                                                              |
| ----- | ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-06 | **Original PORM consumer cutover** | Planned, awaiting explicit consuming-repo execution | The STYNX packages are ready for adoption, but replacing `../porm`'s in-repo Flow module with `@stynx-nyx/flow` + `@stynx-nyx/angular-flow` is a sibling-repo migration that has not been executed. Run only when explicitly requested by the user. |

## Notes

- **Working directory:** `./docs/work/` was wiped on 2026-05-18 to start fresh. Future audit/remediation artifacts (plans, prompts, inventories, diagnostics, specs, rationalizations) go under the existing `docs/work/{audit,diag,inv,plan,prompts,rationalization,specs}/` skeleton.
- **Schema-bound architect substrates that ARE populated** (so a future session doesn't mistakenly file them as gaps): [Flow architecture](/docs/framework/arch/flow), [invariants](/docs/framework/arch/invariants/), [ADRs](/docs/meta/adr/), [Flow API contract](/docs/framework/contracts/flow-api), [operations runbooks](/docs/meta/ops/runbooks/), [operations recovery](/docs/meta/ops/recovery/).
- **Most-current per-cell state lives in code, not in this file.** Re-verify before re-opening anything: a row's absence here is a claim, not proof. If a check fails today, add the row back with current evidence.
