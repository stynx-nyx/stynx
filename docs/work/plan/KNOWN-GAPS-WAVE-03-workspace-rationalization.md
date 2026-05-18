# Wave 03 — Workspace Rationalization

**Role:** Engineer.
**Branch suggestion:** `known-gaps/03-workspace-rationalization`.
**Primary gaps:** P-04, P-05, F-04.

## Purpose

Remove obsolete workspace surfaces after Wave 02 has created replacement
packages. This wave should leave the workspace graph spec-shaped and easier to
reason about.

## Inputs

- `docs/work/rationalization/**`
- `docs/work/prompts/AUDIT-REMEDIATION-06-finish-rationalization.md`
- `packages/stynx-{backend,contracts,frontend-client,frontend-contracts}/**`
- `pnpm-workspace.yaml`
- `apps/reference-frontend/**`
- `reference-web` or `apps/reference-web` package manifests

## Tasks

1. Reconfirm which legacy workspaces still build or are imported.
2. Remove or fold legacy `@stech/*` packages only after replacement imports are
   already live.
3. Remove obsolete workspace globs (`backend`, `bootstrap`, `frontend`,
   `test/*`) or move their live content to supported package/tool paths.
4. Delete or fold `apps/reference-frontend` into the active reference web app.
5. Upgrade vulnerable Bootstrap usage to `5.3.8` or remove Bootstrap if unused.
6. Regenerate lockfile with the repo package manager.
7. Update package topology docs and `KNOWN_GAPS.md`.

## Acceptance

- `pnpm-workspace.yaml` contains only intentional active workspace roots.
- `pnpm -r ls` shows no obsolete `@stech/*` packages unless explicitly
  documented.
- Reference web is the only active reference frontend surface.
- Bootstrap advisory is closed.

## Verification

```sh
pnpm install --ignore-scripts
pnpm lint:deps
pnpm typecheck
pnpm test
pnpm build
pnpm audit
git diff --check
```
