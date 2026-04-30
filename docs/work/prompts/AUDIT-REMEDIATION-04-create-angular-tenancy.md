# 04 — Create `@stynx-web/angular-tenancy`

**Closes:** FIND-002 (BLOCKER).
**Branch:** `audit-remediation/04-angular-tenancy`.
**Spec:** §3, §4.2 (tenant resolution).

## Why

Spec §3 lists `packages-web/angular-tenancy` in the frontend family. It
does not exist. Tenant-switching UI and `X-Tenant-Id` plumbing for
Angular consumers has no canonical home.

## What to do

1. Scaffold `packages-web/angular-tenancy/` mirroring sibling
   `packages-web/angular-auth/`:
   - `package.json` with `"name": "@stynx-web/angular-tenancy"`,
     `@angular/*` peers per the other angular packages.
   - `tsconfig.json` extending `tools/tsconfig`.
   - `src/index.ts` single barrel.
   - `README.md`.
2. Implement minimum surface:
   - `TenantContextService` exposing `currentTenantId$` observable.
   - `TenantInterceptor` adding `X-Tenant-Id` header.
   - `TenantSwitcherComponent` (or directive) consuming the service.
   - `provideTenancy()` standalone provider per Angular conventions.
3. Move tenant-related code out of `apps/reference-web` and any
   `frontend/` legacy code into the new package.
4. Update `apps/reference-web` to consume from
   `@stynx-web/angular-tenancy`.

## Acceptance

- `pnpm --filter @stynx-web/angular-tenancy build` exits 0.
- `pnpm --filter @stynx-web/angular-tenancy test` exits 0 (at least
  one test covering `TenantInterceptor` adding the header).
- `apps/reference-web` runs locally; switching tenant in the UI
  changes the `X-Tenant-Id` header on subsequent requests.

## Verify

```
pnpm --filter @stynx-web/angular-tenancy build
pnpm --filter @stynx-web/angular-tenancy test
```
