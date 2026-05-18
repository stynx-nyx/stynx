# Known Gaps Wave Plan

**Source:** `docs/KNOWN_GAPS.md` compiled on 2026-05-17.
**Mode:** orchestrated prompt sequence for Codex/agent execution.
**Scope:** stynx repo unless a wave explicitly says to work in `../devai`.
**Discipline:** DEVAI Article 6 role must be declared in any commit subject.

## Operating Rules

1. Start every wave by inspecting the live repo state. Do not trust this prompt
   pack if files have moved.
2. Keep `docs/work/**` as scratch unless a human explicitly asks to commit it.
   Durable state belongs in `docs/KNOWN_GAPS.md`, `docs/stynx/*`, package
   READMEs, contracts, ADRs, invariants, tests, or source.
3. Use focused branches/commits by wave. Do not mix unrelated DEVAI generated
   state with source/doc changes.
4. Run the smallest meaningful verification for each wave before broader gates.
5. If a gap is stale, close it with evidence rather than implementing a duplicate
   mechanism.
6. Keep Flow and CMS boundaries explicit. Flow follow-up work is Wave 09; CMS is
   not pulled into this sequence.

## Wave Order

| Wave | Prompt | Primary role | Main gaps |
| --- | --- | --- | --- |
| 00 | `KNOWN-GAPS-WAVE-00-rebaseline.md` | Auditor | stale status, evidence baseline |
| 01 | `KNOWN-GAPS-WAVE-01-trustworthy-gates.md` | Engineer/Inspector | T-01..T-06, G-03, D-04 |
| 02 | `KNOWN-GAPS-WAVE-02-package-topology-blockers.md` | Architect/Engineer | P-01, P-02, P-03, P-06, Q-01 |
| 03 | `KNOWN-GAPS-WAVE-03-workspace-rationalization.md` | Engineer | P-04, P-05, F-04 |
| 04 | `KNOWN-GAPS-WAVE-04-reference-data-rbac.md` | Architect/Engineer | D-01..D-03, R-01..R-05 |
| 05 | `KNOWN-GAPS-WAVE-05-audit-privacy-proof.md` | Inspector/Engineer | A-01..A-03 |
| 06 | `KNOWN-GAPS-WAVE-06-operability.md` | Engineer/Architect | O-01, O-03..O-07, Doc-05 |
| 07 | `KNOWN-GAPS-WAVE-07-edge-infrastructure.md` | Engineer | O-02 |
| 08 | `KNOWN-GAPS-WAVE-08-developer-docs.md` | Architect/Engineer | Doc-01..Doc-04, Doc-06 residue |
| 09 | `KNOWN-GAPS-WAVE-09-flow-deprecation-readiness.md` | Engineer/Inspector | PF-04, PF-05, PF-06, PF-10, PF-12 |
| 10 | `KNOWN-GAPS-WAVE-10-devai-upstream.md` | Architect/Engineer | DV-01..DV-04 |
| 99 | `KNOWN-GAPS-WAVE-99-final-closure.md` | Auditor | full closure proof |

## Existing Prompt Inputs

The existing `docs/work/prompts/AUDIT-REMEDIATION-*` files remain useful
implementation-level prompts. This wave pack intentionally gives broader
ordering across `KNOWN_GAPS.md`, then points at the lower-level prompts where
they match the current gap.

## Sequence Exit

The sequence is complete only when:

- `docs/KNOWN_GAPS.md` no longer lists stale open items;
- blocker/major gaps either have implementation evidence or an explicit ADR
  deferral;
- CI/local gates prove migration, dependency, boundary, type, test, DB, release,
  and smoke behavior;
- consumer-facing package/readme/docs state matches the implemented code.
