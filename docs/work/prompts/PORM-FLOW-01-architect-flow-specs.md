# PORM-FLOW-01 - Architect: Write Flow Architecture And Contracts

**Discipline:** Architect
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/01-architect-specs`
**Scope:** Flow docs/spec/contracts only. No implementation code and no tests.
**Out of scope:** CMS. Do not touch `cms`, `@stynx/cms`, `angular-cms`, or CMS files.

## Goal

Create the authoritative STYNX reference for the new independent Flow module before any code is written. The docs must translate PORM Flow behavior into STYNX architecture, invariants, permissions, package boundaries, adapter contracts, and verification requirements.

## Required Reading

Read:

- `PORM-FLOW-00-README.md`
- `../porting/porm-to-stynx/agent-plan-flow.md`
- `../porting/porm-to-stynx/feature-matrix-flow.md`
- `../porting/porm-to-stynx/stynx-reuse-map.md`
- `docs/stynx/porting-pack/04-INVARIANTS-AND-CONTRACTS.md`
- `docs/stynx/porting-pack/05-PACKAGE-CATALOG.md`
- `docs/stynx/porting-pack/06-DATA-LAYER-PATTERNS.md`
- `docs/stynx/porting-pack/07-AUTH-AND-TENANCY-PATTERNS.md`
- `docs/stynx/porting-pack/09-FRONTEND-PATTERNS.md`
- `../porm/docs/engineering/domains/flow/*.md`
- `../porm/database/flow/ddl.sql`
- `../porm/backend/src/flow/flow.module.ts`
- `../porm/frontend/src/app/flow/flow.module.ts`

## Write Scope

Create or update only Architect-authority docs:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `docs/operations/runbooks/flow.md`
- `docs/architecture/invariants/INV-FLOW-001.json`
- `docs/architecture/invariants/INV-FLOW-002.json`
- `docs/architecture/invariants/INV-FLOW-003.json`
- `docs/architecture/trace.json`

If a path does not match the live docs layout, inspect adjacent docs and choose the closest existing Architect-authority path. Do not write to `.devai/state`.

## Required Content

`docs/architecture/flow.md` must define:

- package boundary: `@stynx/flow` and `@stynx-web/angular-flow`;
- source evidence from PORM, including DB, backend, frontend, docs, and tests;
- Flow concepts: scope, graph, node, edge, agent rule, transition effect, run, node run, task, event, form, question, score, fill, answer, waiver;
- domain adapter contract for facts, effects, can-view, can-manage, and optional agent resolution;
- explicit rule: generic Flow code must not reference CMS, PORM opportunity, proposal, engagement, or any host domain;
- tenant and RLS model;
- soft-delete model and no-soft-delete rationale for `flow.events`;
- event ledger versus platform audit distinction;
- frontend package boundary and host-mounting model.

`docs/contracts/flow-api.md` must define:

- canonical endpoint groups for design, runtime, tasks, forms, analytics, and signal;
- permission names:
  - `flow:read:design`
  - `flow:write:design`
  - `flow:read:runtime`
  - `flow:execute:task`
  - `flow:assign:task`
  - `flow:read:analytics`
  - `flow:admin:*`
- which routes are read-only, audited, idempotent, rate-limited, or system-only;
- DTO/schema principles, not every field in full detail.

`docs/operations/runbooks/flow.md` must define:

- migration deployment checks;
- how to inspect stuck runs and open tasks;
- how to re-signal facts for a target;
- how to diagnose adapter errors;
- how to verify no cross-tenant leakage.

Invariants:

- `INV-FLOW-001`: every Flow row that belongs to a tenant is tenant-scoped and RLS-protected.
- `INV-FLOW-002`: generic Flow has no hard-coded domain behavior.
- `INV-FLOW-003`: workflow events are append-only domain ledger rows, not a replacement for platform audit.

Update `docs/architecture/trace.json` to include the new invariants and expected implementation/test path globs.

## Verification

Run:

```sh
git diff --name-only
LC_ALL=C grep -RIn '[^ -~]' docs/architecture/flow.md docs/contracts/flow-api.md docs/operations/runbooks/flow.md docs/architecture/invariants/INV-FLOW-001.json docs/architecture/invariants/INV-FLOW-002.json docs/architecture/invariants/INV-FLOW-003.json || true
pnpm typecheck
```

If `pnpm typecheck` is blocked by unrelated dirty-tree or pre-existing failures, capture the exact failure and continue only if the changed docs are not implicated.

## Acceptance Criteria

- The docs are sufficient for Engineer and Inspector prompts to implement without guessing architecture.
- `trace.json` references the new invariants.
- No source code, tests, migrations, package manifests, or CMS files are changed.
