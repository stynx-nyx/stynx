# Wave 03 Workspace Rationalization Report

**Date:** 2026-05-17
**Role:** Engineer
**Scope:** P-04, P-05, F-04.

## Changes Made

- Removed stale Dependabot entries for deleted legacy roots:
  - `/backend`
  - `/bootstrap`
  - `/frontend`
  - `/test/backend`
- Added active reference roots to Dependabot:
  - `/reference/api`
  - `/reference/web`
- Updated `docs/KNOWN_GAPS.md` to close stale `@stech/*`,
  `apps/reference-frontend`, and Bootstrap findings with current evidence.

## Verification Evidence

| Command | Result | Notes |
| --- | ---: | --- |
| `find packages -maxdepth 2 -name package.json ... @stech` | pass | No active `@stech/*` workspace packages found. |
| `find . -maxdepth 2 ... backend/bootstrap/frontend/apps/test` | observed | Only `./test` exists; `backend`, `bootstrap`, `frontend`, and `apps` roots are absent. |
| `pnpm -r list --depth -1 --json` | observed | Active workspaces are `@stynx/*`, `@stynx-web/*`, reference apps, domain demo, tools, docs, and internal test workspaces. |
| `rg -n '"bootstrap"\|bootstrap@|bootstrap ' ... package manifests/lockfile` | pass | No Bootstrap dependency found. |
| `find test -maxdepth 2 -name package.json` | observed | `test/db`, `test/packages`, and `test/scripts` are active internal test workspaces. |

## Closed Rows

- F-04: Bootstrap advisory is stale; no Bootstrap dependency exists.
- P-04: legacy `@stech/*` package portion is stale/closed. `test/*` remains by
  design as internal test workspaces, so it is not treated as a legacy app root.
- P-05: `apps/reference-frontend` is absent; `reference/web` is active.

## Remaining Route

Continue with Wave 04 for reference-app DB/RBAC/PII/auth gaps. That wave is
larger and should start with an explicit reference schema/API inventory before
mutating DDL or seeds.
