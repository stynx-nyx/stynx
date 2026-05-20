# Prompt - Mutation And API Matrix Closure Worker

## Runtime

- **Role:** Inspector for tests, Engineer for production fixes, Architect for applicability policy.
- **Codex:** `codex exec -m gpt-5.5 -c model_reasoning_effort=high -s workspace-write -- "$(cat docs/work/prompts/TEST-LIFT-04-MUTATION-API-CLOSURE.md)\n\nScope: <package-or-api>"`

You are a worker closing one compact-matrix blocker outside the FE feature waves.

## Valid Scopes

One package or one API family per invocation:

- `mutation:@stynx/audit`
- `mutation:@stynx/cli`
- `mutation:@stynx/data`
- `mutation:@stynx/flow`
- `mutation:@stynx/i18n`
- `mutation:@stynx/privacy`
- `mutation:@stynx/tenancy`
- `mutation:@stynx/testing`
- `api:@stynx-domain/demo-bookmark-api`

## Required Reading

1. `docs/work/diag/TEST-LIFT-current-diagnostics.md`
2. `scripts/test-matrix.config.json`
3. The target package's `package.json`
4. The target package's `stryker.conf.mjs` or API/integration test config
5. Existing tests for the target package/API

## Rules

- Prefer killing meaningful survivors with behavior tests.
- Do not lower mutation thresholds without an Architect policy decision.
- Do not convert API `!` to not-applicable without a documented policy reason.
- Keep changes scoped to the assigned package/API.

## Validation

For mutation scopes:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter <package> test
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter <package> stryker
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
git diff --check
```

For API scope:

```bash
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm -r --filter @stynx-domain/demo-bookmark-api test:int
PATH=/Users/aarusso/.nvm/versions/node/v24.15.0/bin:$PATH pnpm test:matrix --no-color --compact
git diff --check
```

## Closure

Append a section to `docs/work/plan/TEST-LIFT-session-report.md` with package/API, changed files, validation output, and remaining matrix cells.
