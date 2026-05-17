# PORM-FLOW-00 - Prompt Sequence README

**Run from:** `/Users/aarusso/Development/stech/stynx`
**Source repo:** `/Users/aarusso/Development/stech/porm`
**Planning pack:** `../porting/porm-to-stynx/`
**Target backend package:** `@stynx/flow` in `packages/flow`
**Target frontend package:** `@stynx-web/angular-flow` in `packages-web/angular-flow`
**Out of scope:** CMS. Do not create, edit, move, or delete `cms`, `@stynx/cms`, `angular-cms`, or CMS migration/code/test/docs files.

The user requested `@stynx/angular-flow`; this sequence uses the live STYNX frontend package convention, `@stynx-web/angular-flow`, matching existing packages such as `@stynx-web/angular-storage`.

## Purpose

This prompt chain turns PORM Flow into independent STYNX packages under DEVAI discipline. PORM is evidence, not the target architecture. The final result must satisfy STYNX invariants for tenancy, RLS, soft-delete, route permissions, audit, idempotency, data access, package exports, and Angular package contracts.

## Discipline Rules

- Architect prompts may write specs, architecture docs, contracts, trace, ADRs, README content, and runbooks.
- Engineer prompts may write source code, migrations, package manifests, build config, and implementation docs inside package READMEs.
- Inspector prompts may write tests, fixtures, test helpers, and test-intent config.
- Auditor prompts are read-only except for final assessment/report artifacts.
- Do not mix discipline authorities inside a single prompt unless the prompt explicitly says so.
- Preserve unrelated dirty work. Start every prompt with `git status --short --branch` and review the dirty-tree scope before editing.
- Do not hand-edit `.devai/state/*`.

## Required Reading For Every Prompt

Read these before modifying files:

- `AGENTS.md`
- `CLAUDE.md`
- `GOVERNANCE.md`
- `../devai/CONSTITUTION.md`, especially Articles 4, 6, 8, 10, and 17
- `../porting/porm-to-stynx/agent-plan-flow.md`
- `../porting/porm-to-stynx/feature-matrix-flow.md`
- `../porting/porm-to-stynx/stynx-reuse-map.md`
- `../porting/porm-to-stynx/gap-register.md`
- `../porting/porm-to-stynx/evidence-index.md`

## Source Evidence To Use

PORM Flow evidence:

- `../porm/database/flow/ddl.sql`
- `../porm/database/flow/rls.sql`
- `../porm/database/flow/audit.sql`
- `../porm/backend/src/flow/`
- `../porm/frontend/src/app/flow/`
- `../porm/tests/backend/api/flow/`
- `../porm/tests/backend/unit/flow-*.test.ts`
- `../porm/tests/backend/e2e/flow-tasks.e2e-spec.ts`
- `../porm/tests/frontend/e2e/flow/`
- `../porm/docs/engineering/domains/flow/`
- `../porm/docs/generated/reference/api/openapi.json`

Use PORM domain consumer files only as examples of adapter use, not as target code:

- `../porm/database/porm/flow.sql`
- `../porm/tests/backend/e2e/porm-role-lifecycles.e2e-spec.ts`

## Sequence

| #   | Prompt                                                                                                 | Discipline | Main output                                 | Depends on     |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------- | -------------- |
| 01  | [Write Flow architecture and contracts](PORM-FLOW-01-architect-flow-specs.md)                          | Architect  | STYNX Flow specs/docs/contracts             | none           |
| 02  | [Implement Flow data model and migration](PORM-FLOW-02-engineer-data-model.md)                         | Engineer   | `packages/data` migration/schema            | 01             |
| 03  | [Create backend package shell and design API](PORM-FLOW-03-engineer-backend-design.md)                 | Engineer   | `packages/flow` design services/controllers | 01, 02         |
| 04  | [Implement runtime, tasks, events, and adapters](PORM-FLOW-04-engineer-backend-runtime.md)             | Engineer   | runtime services/controllers                | 02, 03         |
| 05  | [Implement forms, fills, waivers, policy, analytics](PORM-FLOW-05-engineer-backend-forms-analytics.md) | Engineer   | forms and analytics surfaces                | 02, 03, 04     |
| 06  | [Write backend, DB, API, and RLS tests](PORM-FLOW-06-inspector-backend-tests.md)                       | Inspector  | Flow backend test suite                     | 02, 03, 04, 05 |
| 07  | [Create Angular Flow package](PORM-FLOW-07-engineer-angular-flow.md)                                   | Engineer   | `packages-web/angular-flow`                 | 03, 04, 05     |
| 08  | [Write Angular Flow tests](PORM-FLOW-08-inspector-angular-tests.md)                                    | Inspector  | Angular package tests                       | 07             |
| 09  | [Run final audit and closure checks](PORM-FLOW-09-auditor-closure.md)                                  | Auditor    | Closure report and gate evidence            | 01-08          |

## Cross-Prompt Hard Stops

Stop and report instead of continuing if:

- any planned edit touches CMS paths or package names;
- `packages/flow` or `packages-web/angular-flow` already exists with live implementation not covered by this sequence;
- the current branch contains unrelated edits in a file the prompt needs to modify;
- migration numbering has changed and `0014_flow.sql` is no longer the next safe platform migration;
- STYNX package naming conventions have changed away from `@stynx-web/angular-*`;
- `pnpm-workspace.yaml` no longer includes `packages/*` and `packages-web/*`.

## Sequence-Level Definition Of Done

- `@stynx/flow` exists with migration-backed backend behavior and package tests.
- `@stynx-web/angular-flow` exists with host-mountable Angular components and package tests.
- Flow migration/schema is tenant-scoped, RLS-protected, audited, and soft-delete compliant.
- No generic Flow code references PORM or CMS domain scopes.
- All private routes have STYNX permission decorators; all mutations are audited; retryable mutations are idempotent.
- Tests cover tenant isolation, graph design, runtime, task lifecycle, forms/fills/waivers, analytics, and Angular UI behavior.
- Final auditor prompt confirms no CMS files were touched.
