# 03 — Create `@stynx/contracts`

**Closes:** FIND-001 (BLOCKER).
**Branch:** `audit-remediation/03-stynx-contracts`.
**Spec:** §3 (monorepo layout).

## Why

Spec §3 lists `packages/contracts` in the backend family. It does not
exist. The legacy `packages/stynx-contracts` (`@stech/stynx-contracts`)
occupies the same niche but under the wrong scope and outside the
rationalized layout.

## What to do

1. Scaffold `packages/contracts/`:
   - `package.json` with `"name": "@stynx/contracts"`, `peerDependencies`
     for any framework deps used by the types.
   - `tsconfig.json` extending `tools/tsconfig`.
   - `src/index.ts` single barrel; matches the other `@stynx/*`
     packages' conventions.
   - `README.md` describing scope.
2. Move shared types/interfaces/DTOs from `packages/stynx-contracts`
   into `packages/contracts`. Audit each export to ensure it belongs in
   shared contracts (not implementation detail).
3. Update every consumer import (`@stech/stynx-contracts` →
   `@stynx/contracts`). Use a workspace-wide codemod or
   `find ... | xargs sed -i ...` then commit the diff.
4. Leave `packages/stynx-contracts` in place but as a thin re-export
   (or empty); prompt 06 deletes it.

## Acceptance

- `pnpm --filter @stynx/contracts build` exits 0.
- `pnpm --filter @stynx/contracts test` exits 0 (smoke test that
  imports the barrel).
- No remaining imports from `@stech/stynx-contracts` outside that
  package itself.
- `pnpm -w typecheck` and `pnpm -w lint` exit 0.

## Verify

```
grep -r "@stech/stynx-contracts" --include='*.ts' packages/ packages-web/ apps/
pnpm -w typecheck
```
