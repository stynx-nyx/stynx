# Audit Remediation Prompt Sequence

Source: [docs/work/audit/](../audit/) (commit `457da90`, 2026-04-27).

This is a prompt-by-prompt playbook to close every finding in
[07-FINDINGS-REGISTER.md](../audit/07-FINDINGS-REGISTER.md).

## Conventions

- One prompt per file, numbered `AUDIT-REMEDIATION-NN-<slug>.md`.
- Each prompt is **self-contained**: cite the finding ID(s),
  spec sections, file paths, acceptance criteria, and verification
  commands. The implementer should be able to act on it cold.
- Each prompt expects work on its own branch
  `audit-remediation/NN-<slug>` and a single PR.
- Prompts are ordered by dependency. Do not parallelize across
  numbered prompts unless the dependency line says you can.

## Sequence

| #   | Prompt                                                                                                | Closes                                           | Severity | Size |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- | ---- |
| 01  | [Restore migration linter green](AUDIT-REMEDIATION-01-restore-migration-linter.md)                    | FIND-004                                         | BLOCKER  | M    |
| 02  | [Pin Node 24 + fix doctor](AUDIT-REMEDIATION-02-fix-doctor-and-engine.md)                             | FIND-011, FIND-013                               | MAJOR    | S    |
| 03  | [Create @stynx/contracts package](AUDIT-REMEDIATION-03-create-contracts-package.md)                   | FIND-001                                         | BLOCKER  | L    |
| 04  | [Create @stynx-web/angular-tenancy package](AUDIT-REMEDIATION-04-create-angular-tenancy.md)           | FIND-002                                         | BLOCKER  | M    |
| 05  | [Resolve @stynx/privacy I3 violation](AUDIT-REMEDIATION-05-privacy-i3.md)                             | FIND-010, FIND-017                               | BLOCKER  | M    |
| 06  | [Finish the rationalization](AUDIT-REMEDIATION-06-finish-rationalization.md)                          | FIND-003, FIND-006, FIND-007, FIND-008, FIND-018 | MAJOR    | L    |
| 07  | [Add lint enforcement for invariants & cycles](AUDIT-REMEDIATION-07-lint-invariants-cycles.md)        | FIND-009, FIND-021, FIND-023                     | MAJOR    | S    |
| 08  | [Restore the gates: CODEOWNERS, branch protection, commitlint](AUDIT-REMEDIATION-08-restore-gates.md) | FIND-024, FIND-025, FIND-026                     | MAJOR    | M    |
| 09  | [Operability docs & runbooks](AUDIT-REMEDIATION-09-operability-docs.md)                               | FIND-031, FIND-014, FIND-027                     | MAJOR    | L    |
| 10  | [LGPD & audit hash-chain coverage](AUDIT-REMEDIATION-10-privacy-audit-coverage.md)                    | FIND-015, FIND-016                               | MAJOR    | L    |
| 11  | [Add EdgeStack](AUDIT-REMEDIATION-11-edge-stack.md)                                                   | FIND-005                                         | MAJOR    | M    |
| 12  | [Verify DB structure, metrics, k6 SLOs, smoke](AUDIT-REMEDIATION-12-runtime-verification.md)          | FIND-012, FIND-030, FIND-032, FIND-033           | MINOR    | M    |
| 13  | [Cleanup PR — bundled minors](AUDIT-REMEDIATION-13-cleanup-pr.md)                                     | FIND-019, FIND-020, FIND-022, FIND-028, FIND-029 | MINOR    | M    |

## Dependency notes

- **01 must land first.** Every migration-touching prompt downstream
  depends on the linter being green to verify its work.
- **03 must land before 06.** Deleting the `@stech/stynx-contracts`
  legacy needs `@stynx/contracts` to absorb the shared types.
- **02 can run in parallel with 03–05** (independent toolchain work).
- **07 should run after 06** so the boundary rules don't fight the
  rationalization.
- **09–13 can run in parallel after 08.**

## Definition of done (sequence-level)

- Every finding ID in [07](../audit/07-FINDINGS-REGISTER.md) appears in the
  closed-by column of one of these prompts (NIT cluster excepted).
- Re-running the audit at the end yields BLOCKER count = 0 and a
  SHIP-AS-IS or SHIP-AFTER-FIXING-BLOCKERS recommendation in
  `docs/work/audit/08-REMEDIATION-PLAN.md`.
