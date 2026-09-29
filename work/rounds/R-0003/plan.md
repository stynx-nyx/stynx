# R-0003 — post-1.5.0 debt closure

**Current role:** Architect. **Status:** active. **Base:**
`64d7906682d00ea929e1b48cb7b67e477a46766a` (published STYNX 1.5.0
plus postrelease evidence). The root checkout is preserved; work proceeds in
the existing clean Codex worktree on `codex/post-1-5-0-debt`.

## Scope

1. Reconcile all 76 C-0002 requirement IDs against the published 1.5.0
   receipts and close GitHub issues #289–307 only after each checklist has
   evidence. Remove stale prepublication language from the ledger.
2. Close nonblocking CTG5 documentation and CTG9 OFS/SIG sensor gaps without
   weakening tests. Rebind `law/trace.json` after Inspector changes.
3. Triage and remediate the five open Dependabot alerts under the repository
   security-auditor procedure; preserve the fixed package group and release
   policy.
4. Complete or explicitly retire R-0001's queued TASK-0003/0004 and reconcile
   the pilot's active marker through supported DEVAI actions. Revalidate the
   historical k6 known gap; improve the one-run comparison only under an ADR
   and the exact workflow-edit receipt.
5. Resolve Owner issues #222–225: a coherent visibility decision, reconciled
   ref protection, exact legacy deprecation approval/action, and positive
   credential governance verification. Do not disclose token material.
6. Plan and execute PF-06 PORM Flow consumer cutover in the PORM repository,
   including Angular compatibility and a data-preserving schema transition.
   Preserve PORM's own authority and user data.
7. Close the DEVAI 100% coverage and signed local-RC evidence debt with
   meaningful tests and an exact candidate observation.

DETRAN R-0022…R-0024 packed-consumer and domain-equivalence proofs are
explicitly out of scope. No writes to DETRAN.

## Sequence and roles

Architect records contracts and documentation; Inspector strengthens sensors;
Engineer changes implementation and dependency graph. Commits remain
role-separated. Only the maestro runs Git and operates GitHub. No test or gate
may be weakened to make work pass. Each external setting/deprecation/workflow
mutation is reviewed against the exact Owner receipt rule before execution.

## Checkpoints

- Capture current state and evidence for each debt before mutation.
- Run focused checks after each change and the applicable full gates before PR.
- Reconcile generated API/trace/package files with supported generators.
- Do not close an issue until its acceptance evidence is attached.
- Record blockers and exact next action in `record.md` if a dependency requires
  Owner-only information or an action-specific receipt.
