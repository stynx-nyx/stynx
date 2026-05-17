# PORM-FLOW-GAP-08 - Auditor: Final Flow Gap Closure Audit

**Discipline:** Auditor
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** `PORM-FLOW-GAP-01` through `PORM-FLOW-GAP-07`
**Scope:** Read-only verification plus a report. No implementation. No CMS.

## Goal

Audit whether Flow is now ready for closure after the gap chain. This prompt supersedes the earlier `PORM-FLOW-09` closure attempt only if every prerequisite gap prompt has run.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- all `docs/work/prompts/PORM-FLOW-GAP-*.md`
- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `docs/operations/runbooks/flow.md`
- `docs/architecture/trace.json`
- `packages/flow/**`
- `packages-web/angular-flow/**`
- `packages/data/migrations/platform/*flow*.sql`
- `packages/data/src/schema/flow.ts`
- reference integration files touched by `PORM-FLOW-GAP-07`

## Write Scope

Allowed:

- `docs/work/diag/porm-flow-gap-closure.md`

Do not edit:

- source code
- tests
- package manifests
- migrations
- `.devai/state/**`
- CMS files

## Required Audit Commands

Run and record exact status:

```sh
git status --short --branch
git diff --name-only
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow build
pnpm --filter @stynx/reference-api build
pnpm --filter @stynx/reference-api test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/reference-api test:int
pnpm --filter @stynx/reference-web build
pnpm --filter @stynx/reference-web build:web
pnpm lint:migrations
pnpm lint:deps
pnpm lint:cycles
pnpm doctor
pnpm release:policy
pnpm release:status
git diff --check
```

Run disposable DB verification:

```sh
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "drop database if exists stynx_flow_gap_closure"
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "create database stynx_flow_gap_closure"
pnpm --filter @stynx/cli build
node packages/cli/dist/cli/src/main.js migrate up --database-url "postgresql://${USER}@localhost:5432/stynx_flow_gap_closure"
DATABASE_URL="postgresql://${USER}@localhost:5432/stynx_flow_gap_closure" pnpm db:verify
psql "postgresql://${USER}@localhost:5432/postgres" -v ON_ERROR_STOP=1 -c "drop database stynx_flow_gap_closure"
```

Run static guards:

```sh
rg -n "cms\\.content|porm\\.opportunity|porm\\.proposal|porm\\.engagement|@backend/flow|DatabaseService|JwtAuthGuard|RoleGuard" packages/flow packages-web/angular-flow packages/data/src/schema/flow.ts packages/data/migrations/platform
git diff --name-only | rg '(^|/)cms|angular-cms|@stynx/cms'
```

The first static guard must return no forbidden generic-domain coupling. The second must return no CMS files.

## Closure Report

Create `docs/work/diag/porm-flow-gap-closure.md` with:

- date and scope;
- git branch/head;
- prompt completion matrix for `PORM-FLOW-GAP-01` through `08`;
- command evidence table;
- before/after gap matrix against `docs/work/diag/porm-flow-reassessment.md`;
- backend readiness assessment;
- Angular readiness assessment;
- reference/release readiness assessment;
- CMS guard result;
- residual risks;
- final recommendation: ready, ready with caveats, or not ready.

## Acceptance Criteria

- Report is evidence-backed and specific.
- Every blocker/high/medium gap from the reassessment is closed, explicitly deferred by contract, or still listed as residual risk.
- No implementation changes are made by this Auditor prompt.
- CMS remains untouched.
