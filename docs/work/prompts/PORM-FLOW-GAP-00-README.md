# PORM-FLOW-GAP-00 - Flow Gap Closure Prompt Sequence

**Run from:** `/Users/aarusso/Development/stech/stynx`
**Source reassessment:** `docs/work/diag/porm-flow-reassessment.md`
**Target backend package:** `@stynx/flow` in `packages/flow`
**Target frontend package:** `@stynx-web/angular-flow` in `packages-web/angular-flow`
**Out of scope:** CMS. Do not create, edit, move, or delete CMS files or package names.

## Purpose

This prompt chain closes the gaps detected after the first PORM Flow transposition pass. It assumes `PORM-FLOW-01` through `PORM-FLOW-07` have landed, `PORM-FLOW-08` has not produced real Angular tests yet, and `PORM-FLOW-09` must not run until this chain is complete.

The goal is not to copy PORM. PORM remains evidence. The target is a STYNX-native Flow module with explicit contracts, real database-backed verification, tested Angular package behavior, and a final closure report.

## Required Reading For Every Prompt

Read before editing:

- `AGENTS.md`
- `CLAUDE.md`
- `GOVERNANCE.md`
- `../devai/CONSTITUTION.md`, especially Articles 6, 10, 13, 17, 22, 24, 30, and 33
- `docs/work/diag/porm-flow-reassessment.md`
- `docs/work/prompts/PORM-FLOW-00-README.md`
- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `docs/operations/runbooks/flow.md`
- `packages/data/migrations/platform/0014_flow.sql`
- `packages/flow/src/**`
- `packages/flow/test/**`
- `packages-web/angular-flow/src/**`
- `../porm/backend/src/flow/**`
- `../porm/frontend/src/app/flow/**`
- `../porm/tests/backend/api/flow/**`
- `../porm/tests/backend/e2e/flow-*.e2e-spec.ts`
- `../porm/tests/frontend/e2e/flow/**`

## Sequence

| #   | Prompt                                                                                | Discipline | Main output                                                          | Depends on |
| --- | ------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- | ---------- |
| 01  | [Fix the migration-count integration gate](PORM-FLOW-GAP-01-inspector-data-gate.md)   | Inspector  | `@stynx/data test:int` no longer fails on stale migration count      | none       |
| 02  | [Set Flow gap-closure contracts](PORM-FLOW-GAP-02-architect-contract-decisions.md)    | Architect  | Runtime/API/UI contract decisions for high-risk gaps                 | 01         |
| 03  | [Write backend gap tests](PORM-FLOW-GAP-03-inspector-backend-gap-tests.md)            | Inspector  | Tests for backend parity, runtime semantics, and HTTP behavior       | 02         |
| 04  | [Implement backend gap closure](PORM-FLOW-GAP-04-engineer-backend-gap-closure.md)     | Engineer   | Backend/database implementation satisfying 03                        | 03         |
| 05  | [Write Angular Flow tests](PORM-FLOW-GAP-05-inspector-angular-tests.md)               | Inspector  | Real Angular package tests, no `passWithNoTests` crutch              | 04         |
| 06  | [Implement Angular Flow parity](PORM-FLOW-GAP-06-engineer-angular-parity.md)          | Engineer   | Angular API facade and UI behavior satisfying 05                     | 05         |
| 07  | [Wire reference and release surfaces](PORM-FLOW-GAP-07-engineer-reference-release.md) | Engineer   | Reference app integration, package metadata, release readiness hooks | 06         |
| 08  | [Run closure audit](PORM-FLOW-GAP-08-auditor-closure.md)                              | Auditor    | Final evidence-backed closure report                                 | 01-07      |

## Cross-Prompt Hard Stops

Stop and report instead of continuing if:

- a planned edit touches CMS paths or package names;
- the current branch contains unrelated edits in a file the prompt needs to modify;
- a prompt needs to weaken or delete tests without a matching Architect contract change;
- a database change would mutate already-published migration behavior without a new migration;
- a command needs a database and `DATABASE_URL` is not shaped as `postgresql://${USER}@localhost:5432/<database>`;
- `@stynx/flow` or `@stynx-web/angular-flow` has been materially rewritten since `docs/work/diag/porm-flow-reassessment.md`.

## Sequence-Level Definition Of Done

- `STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int` passes.
- `@stynx/flow` has tests and implementation for effect dispatch, resolver functions, node form rule gating, PORM-compatible aliases or explicit contract breaks, analytics paging/filtering, task privilege semantics, and policy evaluation.
- `@stynx-web/angular-flow` has real tests and a complete API facade for the backend contract.
- Angular components expose route-bound, permission-aware graph, form, fill, waiver, analytics, and task workflows sufficient for a host shell.
- Reference integration and release readiness surfaces are updated.
- Final Auditor report states whether Flow is ready, ready with caveats, or not ready.
- Static CMS guard remains clean.
