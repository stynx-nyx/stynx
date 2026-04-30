# 07 — Lint enforcement for invariants and cycles

**Closes:** FIND-009, FIND-021, FIND-023 (MAJOR).
**Branch:** `audit-remediation/07-lint-invariants`.
**Spec:** I1, §3, §17.
**Depends on:** prompt 06 (post-rationalization layout).

## Why

- No ESLint rule blocks `pg`/`Pool` imports outside `@stynx/data` (I1
  is a runtime-only check today).
- `eslint-plugin-boundaries` is in devDependencies but its rule
  set was not verified to actively reject deep imports.
- No circular-dependency check is wired in CI.

## What to do

1. **I1 enforcement:** in `tools/eslint-config/`, add a
   `no-restricted-imports` (or `boundaries/no-private`) rule that
   forbids `pg`, `pg-pool`, `pg-native`, `node-postgres` outside
   `packages/data/**`, `packages/cli/**` (migration runner), and
   `**/*.{test,spec}.ts`.
2. **I3 enforcement:** add the same pattern for `@aws-sdk/client-s3*`
   outside `packages/storage/**` (and whatever prompt 05 decided for
   privacy — allowlist via comment if Path B was chosen).
3. **Boundaries:** configure `eslint-plugin-boundaries` with element
   types matching the spec §3 layered DAG; reject deep imports
   (`@stynx/x/foo` instead of `@stynx/x`).
4. **Cycles:** add `pnpm lint:cycles` script:
   `madge --circular packages/ packages-web/ apps/ --extensions ts`.
   Wire it into `ci.yml`.
5. Verify each rule fires by adding a deliberately-broken file in a
   throwaway commit, observing the failure, then reverting.

## Acceptance

- `pnpm -w lint` continues to exit 0 (no false positives).
- Adding `import { Pool } from 'pg'` to `packages/auth/src/foo.ts`
  fails lint.
- Adding `import { S3Client } from '@aws-sdk/client-s3'` to
  `packages/audit/src/foo.ts` fails lint.
- Adding `import x from '@stynx/data/src/internal/x'` to a sibling
  package fails lint.
- `pnpm lint:cycles` exits 0; introducing a cycle fails it.
- `lint:cycles` is a required check.

## Verify

```
pnpm -w lint
pnpm lint:cycles
```
