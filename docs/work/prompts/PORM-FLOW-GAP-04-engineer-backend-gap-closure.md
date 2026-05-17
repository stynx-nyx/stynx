# PORM-FLOW-GAP-04 - Engineer: Implement Backend Gap Closure

**Discipline:** Engineer
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-03`
**Scope:** Backend/database implementation. No Angular production changes. No CMS.

## Goal

Implement the backend/database behavior required by `PORM-FLOW-GAP-02` and tested by `PORM-FLOW-GAP-03`.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- updated `docs/architecture/flow.md`
- updated `docs/contracts/flow-api.md`
- `packages/flow/test/**`
- `packages/flow/src/**`
- `packages/data/migrations/platform/0014_flow.sql`
- `packages/data/src/schema/flow.ts`
- PORM backend evidence under `../porm/backend/src/flow/**`

## Write Scope

Allowed:

- `packages/flow/src/**`
- `packages/flow/package.json` only if implementation requires a package dependency
- `packages/data/migrations/platform/0015_flow_gap_closure.sql` or the next available migration number
- `packages/data/src/schema/flow.ts`
- `packages/data/src/schema/index.ts`
- package README or CHANGELOG files if implementation behavior changes public usage

Do not edit:

- `packages-web/angular-flow/**`
- tests, unless production implementation exposes a legitimate compile-time test fixture mismatch that must be adjusted by Inspector follow-up
- `.devai/state/**`
- CMS files

## Required Implementation

Implement the contract from `PORM-FLOW-GAP-02`, including:

1. Effect dispatch service/API that calls `FlowDomainAdapter.applyEffect` and records delivery success/failure in Flow events or a dedicated delivery table.
2. Resolver-function expansion through `FlowDomainAdapter.resolveAgents` or the exact documented deferred shape.
3. Node form rule gating for the documented gating modes.
4. PORM-compatible fill and answer aliases selected by the Architect contract.
5. Bulk answer upsert with idempotent fill/question behavior.
6. Analytics paging/filtering for open tasks and run summary.
7. Task privilege enforcement for assignee, manager, adapter `canManage`, adapter `canView`, and route permissions.
8. Policy evaluation behavior if required by the Architect contract.
9. Stable errors for unsupported operations if any PORM route is intentionally not supported.

## Database Rules

- Do not rewrite already-published migration history.
- Use a new migration with the next safe platform migration number.
- Every new table must be tenant-scoped, RLS-protected, and compatible with STYNX soft-delete/audit expectations unless it is an explicitly append-only ledger.
- Update schema exports in `packages/data/src/schema/flow.ts`.

## Verification

Run:

```sh
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int
pnpm lint:migrations
pnpm lint:deps
pnpm lint:cycles
git diff --check
git status --short --branch
```

For disposable full-DB verification, use:

```sh
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "drop database if exists stynx_flow_gap_backend"
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "create database stynx_flow_gap_backend"
pnpm --filter @stynx/cli build
node packages/cli/dist/cli/src/main.js migrate up --database-url "postgresql://${USER}@localhost:5432/stynx_flow_gap_backend"
DATABASE_URL="postgresql://${USER}@localhost:5432/stynx_flow_gap_backend" pnpm db:verify
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "drop database stynx_flow_gap_backend"
```

## Acceptance Criteria

- Backend tests from `PORM-FLOW-GAP-03` pass without weakening.
- Data integration gate remains green.
- No generic Flow code references CMS or PORM domain tables.
- No CMS files are changed.
