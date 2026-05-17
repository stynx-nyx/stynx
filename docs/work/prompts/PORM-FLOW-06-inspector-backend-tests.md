# PORM-FLOW-06 - Inspector: Write Backend, DB, API, And RLS Tests

**Discipline:** Inspector
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/06-backend-tests`
**Depends on:** `PORM-FLOW-02`, `PORM-FLOW-03`, `PORM-FLOW-04`, `PORM-FLOW-05`
**Scope:** Tests only. No production code unless the test harness cannot compile due to an obvious missing export introduced by previous prompts. No CMS.

## Goal

Create the backend and database test suite for `@stynx/flow`, converting PORM Flow tests into STYNX package-level tests with tenant isolation and STYNX route-contract coverage.

## Required Reading

Read:

- `docs/architecture/flow.md`
- `docs/contracts/flow-api.md`
- `packages/flow/src/**`
- `packages/data/test/support/postgres.ts`
- `packages/data/test/integration/*.spec.ts`
- `packages/storage/test/integration/storage.module.spec.ts`
- `../porm/tests/backend/api/flow/*.test.ts`
- `../porm/tests/backend/unit/flow-*.test.ts`
- `../porm/tests/backend/e2e/flow-tasks.e2e-spec.ts`
- `../porm/scripts/lib/tests/backend/api/flow/helpers.ts`

## Write Scope

Allowed:

- `packages/flow/test/**`
- `packages/flow/jest.config.cjs`
- `packages/flow/jest.integration.config.cjs`
- test fixtures/helpers under `packages/flow/test`
- test-intent config if needed

Do not edit production code. If a production bug blocks the tests, document the failing behavior, command, and suspected file in the final response so an Engineer prompt can fix it.

Do not edit CMS files.

## Required Test Coverage

Database and migration:

- migration applies from empty database;
- migration linter accepts Flow DDL;
- all tenant-scoped tables enforce tenant isolation;
- mutable tables have archive mirrors;
- `flow.events` is append-only/no-soft-delete as documented.

Design API:

- scopes CRUD;
- graphs CRUD;
- nodes and edges CRUD;
- agent rules;
- node form rules;
- transition effects;
- graph import/export round trip;
- invalid graph import rejects duplicate/missing references.

Runtime:

- ensure run;
- open start node;
- create task;
- act task and traverse edge;
- complete end node and run;
- assign/unassign;
- accept/decline/unaccept/withdraw;
- signal changed recomputes facts;
- event log records lifecycle actions.

Forms:

- forms/questions/scores CRUD;
- fills and answer upsert;
- answer update/delete;
- waiver create/update/delete;
- form facts include answers/waivers as expected.

Security and route contracts:

- private routes require permissions;
- read routes use read-only behavior;
- mutation routes are audited;
- retryable mutations honor idempotency;
- no route is accidentally public.

Regression guard:

- assert no generic Flow source references `cms.content`, `porm.opportunity`, `porm.proposal`, or `porm.engagement`.

## Verification

Run:

```sh
pnpm --filter @stynx/flow test
pnpm --filter @stynx/flow test:int
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm lint:migrations
git diff --name-only
git diff --check
```

If PostgreSQL/Testcontainers is unavailable, capture the exact failure and still run unit/static tests.

## Acceptance Criteria

- Test suite covers PORM Flow feature classes in STYNX form.
- Tests prove tenant isolation and route contracts.
- Tests do not depend on CMS or PORM domain modules.
- No CMS files are changed.
