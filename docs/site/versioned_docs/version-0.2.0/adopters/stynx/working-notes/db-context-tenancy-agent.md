# DB Context + Tenancy Agent Notes

## Scope

Inspection focused on real source code for RLS/session context propagation, `set_config` usage, tenant resolution, and tenant entitlement checks across:

- `stynx`
- `porm`
- `pec`
- `sgp`

Contract baseline for shared abstractions is defined in `stynx/packages/stynx-contracts`.

## Files Inspected (source-of-truth)

- `stynx/packages/stynx-contracts/src/db-context.ts` (`DbSessionContext`, `DbContextApplier`)
- `stynx/packages/stynx-contracts/src/tenancy.ts` (`TenantResolver`, `TenantEntitlementPolicy`)
- `stynx/packages/stynx-contracts/src/auth.ts` (`Principal`, tenant-capable principal contract)
- `stynx/backend/src/shared/database/database.service.ts` (`DatabaseService.applyContext`)
- `stynx/backend/src/core/auth/auth.service.ts` (`resolveTenants`)
- `stynx/backend/src/core/auth/guards/jwt-auth.guard.ts` (`JwtAuthGuard.canActivate`)
- `stynx/backend/src/core/auth/guards/tenancy.guard.ts` (`TenancyGuard.canActivate`)
- `stynx/database/ddl/01-auth.sql` (`auth.current_tenant`, `auth.set_tenant`, `auth.set_user_context`, `auth.apply_tenant`, RLS policies)
- `stynx/database/ddl/02-audit.sql` (`audit.write`, `audit.fn_log_dml`, audit tenant policy)
- `stynx/database/ddl/03-storage.sql` (storage tenant trigger + policy)
- `porm/backend/src/database/database.service.ts` (`withTransaction`, `query`)
- `porm/backend/src/core/auth/auth.service.ts` (`readOrgCnpjClaim`, `resolveOrgCnpjFallback`)
- `porm/backend/src/core/auth/jwt-auth.guard.ts` (`JwtAuthGuard.canActivate`)
- `porm/backend/src/common/services/context-aware.service.ts` (`withUserTransaction`)
- `porm/database/auth/ddl.sql` (`auth.context_user_id`, `auth.context_roles`, `auth.context_org_cnpj`)
- `porm/database/porm/rls.sql` (`porm.context_org_cnpj`, policy helpers)
- `pec/src/@core/db/db.service.ts` (`connectWithTenant`, `run`)
- `pec/src/@core/services/tenant-session.service.ts` (`isTenantEntitled`, `findTenantClaim`)
- `pec/src/@core/security/jwt-auth.guard.ts` (`getRequestedTenant`, tenant entitlement gate)
- `pec/src/@core/middleware/tenant.middleware.ts` (`TenantMiddleware.use`)
- `pec/database/ddl/11-auth-functions.sql` (`auth.current_tenant`, `auth.set_tenant`, `auth.enforce_tenant`)
- `pec/database/ddl/21-auth-policies.sql` (`auth.create_rls_policy`)
- `pec/database/ddl/22-pec-policies.sql` (tenant policy application)
- `pec/database/ddl/24-audit-policies.sql` (audit tenant policy)
- `sgp/source/backend/src/database/database.service.ts` (`applySessionContext`)
- `sgp/source/backend/src/common/request-id/request-id.middleware.ts` (`RequestContextStore.run` seed)
- `sgp/source/backend/src/common/request-context/request-context.store.ts` (`RequestContextStore`)
- `sgp/source/backend/src/auth/cognito-jwt.guard.ts` (`CognitoJwtGuard`)
- `sgp/source/backend/src/auth/cognito-jwt.service.ts` (`toActor`, claims-&gt;groups/permissions)
- `sgp/source/backend/src/auth/permissions.guard.ts` (`PermissionsGuard`)
- `sgp/source/backend/src/iam/permissions/permissions.service.ts` (`permissionsForGroups`)
- `sgp/source/database/sql/11-rls-context.sql` (`sgp_current_permissions`, `sgp_has_permission`, `sgp_bypass_rls`)
- `sgp/source/database/sql/12-rls-policies.sql` (permission-driven RLS)
- `sgp/source/backend/prisma/seed.mjs` (seed-only `app.bypass_rls`)

## Shared Abstractions: Contract vs Current Implementations

### 1) `DbContextApplier`

- Contract symbol: `DbContextApplier.apply(client, context)` in `stynx/packages/stynx-contracts/src/db-context.ts`.
- `stynx` implementation analogue: `DatabaseService.applyContext` in `stynx/backend/src/shared/database/database.service.ts`.
- `porm` analogue: `DatabaseService.withTransaction` + per-session `set_config` in `porm/backend/src/database/database.service.ts`.
- `pec` analogue: `DbService.connectWithTenant`/`run` in `pec/src/@core/db/db.service.ts`.
- `sgp` analogue: `DatabaseService.applySessionContext` in `sgp/source/backend/src/database/database.service.ts`.
- Gap: no class currently `implements DbContextApplier`; usage is convergent-by-pattern, not shared-by-contract.

### 2) `TenantResolver`

- Contract symbol: `TenantResolver.resolve(context)` in `stynx/packages/stynx-contracts/src/tenancy.ts`.
- `stynx` resolver chain:
  - `AuthService.resolveTenants` reads claims in `stynx/backend/src/core/auth/auth.service.ts`.
  - `JwtAuthGuard.canActivate` resolves request tenant (`x-tenant-id` override or single claim tenant) in `stynx/backend/src/core/auth/guards/jwt-auth.guard.ts`.
  - `TenancyGuard.canActivate` enforces presence in `stynx/backend/src/core/auth/guards/tenancy.guard.ts`.
- `pec` resolver chain:
  - `TenantMiddleware.use` requires/validates `x-tenant-id` UUID in `pec/src/@core/middleware/tenant.middleware.ts`.
  - `JwtAuthGuard.getRequestedTenant` consumes `req.tenantId` or header in `pec/src/@core/security/jwt-auth.guard.ts`.
- `porm`: no tenant-id resolver; org scope is resolved in `AuthService.readOrgCnpjClaim`/`resolveOrgCnpjFallback` (`porm/backend/src/core/auth/auth.service.ts`).
- `sgp`: no tenant resolver; request context is actor + request id (`RequestContextStore`).

### 3) `TenantEntitlementPolicy`

- Contract symbol: `TenantEntitlementPolicy.isEntitled(context)` in `stynx/packages/stynx-contracts/src/tenancy.ts`.
- `pec` concrete analogue: `TenantSessionService.isTenantEntitled` in `pec/src/@core/services/tenant-session.service.ts`; invoked by `JwtAuthGuard.canActivate` before `connectWithTenant` in `pec/src/@core/security/jwt-auth.guard.ts`.
- `stynx`: no explicit entitlement policy check symbol; requested header tenant is assigned without membership check in `stynx/backend/src/core/auth/guards/jwt-auth.guard.ts`.
- `porm`: no tenant entitlement policy (org-scoped roles/RLS model).
- `sgp`: entitlement is permission-based (`PermissionsGuard` + `sgp_has_permission`) rather than tenant membership.

## App-Specific SQL Context Key Mappings (must stay configurable)

### Current concrete mappings by app

- `stynx`
  - Set in app code: `auth.set_tenant`, `auth.set_user_context`, `stynx.correlation_id` (`stynx/backend/src/shared/database/database.service.ts`).
  - Read in SQL: `auth.current_tenant`, `auth.app_user_id`, `auth.roles`, `auth.lang` with fallback to `stynx.current_tenant`, `stynx.app_user_id`, `stynx.roles` (`stynx/database/ddl/01-auth.sql`).
- `porm`
  - Set in app code: `auth.app_user_id`, `auth.roles`, `auth.org_cnpj`, `auth.lang` (`porm/backend/src/database/database.service.ts`).
  - Read in SQL: `auth.context_user_id`, `auth.context_roles`, `auth.context_org_cnpj`; domain helper `porm.context_org_cnpj` (`porm/database/auth/ddl.sql`, `porm/database/porm/rls.sql`).
- `pec`
  - Set in app code: `auth.set_tenant($1)` (`pec/src/@core/db/db.service.ts`).
  - Read in SQL: `app.current_tenant` via `auth.current_tenant()` (`pec/database/ddl/11-auth-functions.sql`).
- `sgp`
  - Set in app code: `app.request_id`, `app.current_user_sub`, `app.current_login`, `app.current_permissions`, `app.current_groups`, `app.authenticated` (`sgp/source/backend/src/database/database.service.ts`).
  - Read in SQL: `sgp_current_setting_text(...)`, `sgp_current_permissions()`, `sgp_has_permission()`, `sgp_bypass_rls()` (`sgp/source/database/sql/11-rls-context.sql`).

### Configurability requirement

Do not hardcode shared key names in a cross-app adapter. Keep per-app key maps externalized (e.g., app config/provider), because key families differ (`auth.*`, `app.*`, `stynx.*`) and value encodings differ (comma roles vs newline permissions).

## Tenant Resolution + Entitlement by App

- `stynx`
  - Resolution: JWT claims (`https://stynx.dev/tenant`, `tenants`) + `x-tenant-id` header override.
  - Entitlement check: none explicit before assigning `request.tenantId`.
- `pec`
  - Resolution: required UUID `x-tenant-id`.
  - Entitlement check: explicit `TenantSessionService.isTenantEntitled` claim-first, DB fallback.
  - Claim keys (hardcoded list): `custom:tenant_id`, `tenant_id`, `tenantId`, `custom:tenant_ids`, `tenant_ids`, `tenants`, `custom:org_id`, `org_id`, `orgId`.
- `porm`
  - Resolution: no tenant id; org scope from JWT claim (`custom:org_cnpj`, `org_cnpj`, `orgCnpj`) or DB fallback affiliation.
  - Entitlement check: role/org-based via RLS helpers and context GUCs.
- `sgp`
  - Resolution: no tenant id; actor permissions derived from Cognito groups.
  - Entitlement check: API (`PermissionsGuard`) and SQL (`sgp_has_permission`) permission gates.

## Exclusions

Excluded from analysis as non-source-of-truth for this scope:

- Generated build artifacts (`stynx/backend/dist/**`).
- Historical patch snapshots.
- Agent worktree mirrors (`pec/.claude/worktrees/**`).
- Legacy/archive SQL paths (`pec/database/archive/**`) except where cross-checking historical key family drift.
- Frontend-only files unless directly involved in backend tenant/session resolution.

## Migration Risks

1. Missing explicit tenant entitlement in `stynx` request path.

- Evidence: `stynx/backend/src/core/auth/guards/jwt-auth.guard.ts` assigns header tenant directly; no `principal.tenants.includes(requestedTenant)` equivalent.

2. Key-family incompatibility across apps.

- `pec` reads `app.current_tenant`; `stynx`/`porm` use `auth.*`; `stynx` also references `stynx.*` fallbacks.
- A shared applier that hardcodes one family will silently break RLS scope in other apps.

3. Tenant model mismatch (`tenant_id` UUID vs `org_cnpj` string vs permission-only model).

- `porm` scope is org (`auth.org_cnpj`), not tenant UUID.
- `sgp` RLS is permission-driven and often table-global, not `tenant_id`-based.

4. Claim-key hardcoding drift risk.

- `stynx` and `pec` use hardcoded claim-key lists/URIs for tenant extraction; IdP claim-shape changes will break resolution unless key mapping is configurable.

5. Connection/context lifecycle differences.

- `pec` binds tenant to a per-request `pgClient` released in middleware (`pec/src/@core/middleware/tenant.middleware.ts`).
- `stynx` applies context per query/transaction wrapper.
- `sgp` relies on AsyncLocalStorage (`RequestContextStore`) then applies `set_config` per transaction.

6. Bypass channel risk in operational scripts.

- `sgp` exposes `sgp_bypass_rls()` and sets `app.bypass_rls=true` in seed (`sgp/source/backend/prisma/seed.mjs`).
- Must remain restricted to trusted maintenance/seed paths.
