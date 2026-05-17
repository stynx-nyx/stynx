# PORM-FLOW-GAP-01 - Inspector: Fix Migration Count Gate

**Discipline:** Inspector
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Depends on:** none
**Scope:** Data integration tests only. No production code. No CMS.

## Goal

Fix the stale `@stynx/data` integration test failure identified in `docs/work/diag/porm-flow-reassessment.md`:

```text
Expected: "13"
Received: "15"
```

The test must remain meaningful after future platform migrations. Prefer deriving the expected migration count from the actual platform migration file set or from the migration runner's discovered list rather than hard-coding `15`.

## Required Reading

Read:

- `docs/work/diag/porm-flow-reassessment.md`
- `packages/data/test/integration/migrations.spec.ts`
- `packages/data/src/migration-runner.ts`
- `packages/data/migrations/platform/`
- `packages/data/jest.integration.config.cjs`
- `packages/data/test/support/postgres.ts`

## Write Scope

Allowed:

- `packages/data/test/integration/migrations.spec.ts`
- test helpers under `packages/data/test/**` if needed

Do not edit:

- `packages/data/migrations/platform/**`
- production source under `packages/data/src/**`
- Flow backend or Angular packages
- `.devai/state/**`
- CMS files

## Required Work

1. Replace the stale fixed migration-count assertion with a resilient assertion.
2. Keep the idempotency assertion: rerunning migrations must not change `core.schema_migrations`.
3. Ensure the test still fails if a migration file exists but does not get recorded.
4. Preserve the existing RLS, schema, table, and soft-delete helper checks.

## Verification

Run:

```sh
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int
pnpm --filter @stynx/data typecheck
pnpm lint:migrations
git diff --check
git status --short --branch
```

If PostgreSQL is unavailable, stop and report the exact failure. Do not mark the gate closed without a real PostgreSQL run.

## Acceptance Criteria

- `@stynx/data test:int` passes against localhost PostgreSQL.
- The migration-count assertion is no longer stale when platform migrations are added.
- No production code or CMS files are changed.
