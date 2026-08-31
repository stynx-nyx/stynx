# Known Gaps — stynx

**Compiled:** 2026-08-31 (live re-triage; closed rows removed)
**Author role (Constitution Article 6):** Architect.
**Scope:** `./docs/` only. This file tracks **live, unresolved** gaps. Closed gaps and their evidence ledgers have been removed; recover prior history from git if needed.

When a previously-listed gap is verified closed, delete its row from this file rather than annotating it as "(CLOSED)". The git log is the audit trail.

---

## 1. PORM Flow transposition — outstanding work

| #     | Gap / capability                   | Status                                                       | Detail                                                                                                                                                                                                                                    |
| ----- | ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-06 | **Original PORM consumer cutover** | Open; blocked on explicit consuming-repository authorization | STYNX publishes `@stynx-nyx/flow` and `@stynx-nyx/angular-flow`, but replacing PORM's in-repository Flow module is a separate sibling-repository migration. STYNX package readiness does not authorize or complete that consumer cutover. |

## 2. Closed during the 31 Aug re-triage

R17-K6 is no longer an open gap. Hardening run `33372924153` executed `scenario=all`
against isolated owned stacks and passed the unchanged `auth`, `crud`, `upload`,
and `cascade-delete` thresholds. Scheduled run `33382745035` then passed on the
merged `1.1.1` candidate. The historical failing measurements remain available in
Git and Actions history; they do not describe current readiness.

---

## Notes

- **Working directory:** `./docs/work/` was wiped on 2026-05-18 to start fresh. Future audit/remediation artifacts (plans, prompts, inventories, diagnostics, specs, rationalizations) go under the existing `docs/work/{audit,diag,inv,plan,prompts,rationalization,specs}/` skeleton.
- **Schema-bound architect substrates that ARE populated** (so a future session doesn't mistakenly file them as gaps): [Flow architecture](/docs/framework/arch/flow), [invariants](/docs/framework/arch/invariants/), [ADRs](/docs/meta/adr/), [Flow API contract](/docs/framework/contracts/flow-api), [operations runbooks](/docs/meta/ops/runbooks/), [operations recovery](/docs/meta/ops/recovery/).
- **Most-current per-cell state lives in code, not in this file.** Re-verify before re-opening anything: a row's absence here is a claim, not proof. If a check fails today, add the row back with current evidence.
