# 06 — Finish the rationalization

**Closes:** FIND-003, FIND-006, FIND-007, FIND-008, FIND-018 (MAJOR).
**Branch:** `audit-remediation/06-finish-rationalization`.
**Spec:** §3.
**Depends on:** prompt 03 (contracts must absorb shared types first).

## Why

The migration from `@stech/*` → `@stynx/*` finished structurally but
left:

- Four legacy packages: `packages/stynx-{backend,contracts,frontend-client,frontend-contracts}` (`@stech/*` scope).
- Three legacy top-level workspaces: `backend/`, `bootstrap/`, `frontend/`.
- One non-spec workspace glob: `test/*`.
- One legacy app: `apps/reference-frontend` (`@stech/reference-frontend`).

The workspace is double-coded; `pnpm-workspace.yaml` declares globs
outside spec §3 (`packages/*`, `packages-web/*`, `apps/*`, `tools/*`).

## What to do

1. **Inventory** every `@stech/*` consumer across the repo:
   `grep -rE '@stech/(reference-frontend|stynx-(backend|contracts|frontend-client|frontend-contracts))' --include='*.ts' --include='*.json'`.
2. **Migrate** any remaining live functionality:
   - `packages/stynx-backend` → into the rationalized `@stynx/*`
     packages or `apps/reference-api`.
   - `packages/stynx-frontend-client` / `…-contracts` → `@stynx-web/sdk`
     or `@stynx/contracts`.
   - `apps/reference-frontend` → fold into `apps/reference-web` or
     delete if redundant.
   - `backend/`, `bootstrap/`, `frontend/` → move what survives
     under spec-shaped locations; document deletions in
     `docs/work/rationalization/`.
   - `test/*` → move shared test utilities into `@stynx/testing` or
     `tools/test-utils/`.
3. **Delete** the legacy directories.
4. **Update `pnpm-workspace.yaml`** to:
   ```yaml
   packages:
     - 'packages/*'
     - 'packages-web/*'
     - 'apps/*'
     - 'tools/*'
     - 'docs'
   ```
5. **Re-resolve lockfile** (`pnpm install`).
6. Update `CODEOWNERS` for now-deleted paths (full pass in prompt 08).

## Acceptance

- `pnpm -r ls --depth -1 | grep -c '@stech/'` returns 0.
- `pnpm-workspace.yaml` matches spec §3 exactly.
- `ls backend bootstrap frontend test 2>&1` reports "No such file" or
  the dirs no longer contain workspace packages.
- `pnpm -w typecheck` and `pnpm -w lint` exit 0.
- `pnpm -w test` exits 0 (after migrating tests in step 2).

## Verify

```
pnpm -r ls --depth -1
cat pnpm-workspace.yaml
pnpm -w typecheck && pnpm -w lint && pnpm -w test
```
