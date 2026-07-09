# Consumer Adoption Guide (`porm`, `pec`, `sgp`)

## Goal

Adopt `@stech/stynx-*` incrementally without breaking current request/context semantics.

## Shared Step 1 (all repos)

1. Install packages:

- `@stech/stynx-contracts`
- `@stynx-nyx/backend`
- adapter packages needed by app

2. Register modules in app root module using `forRoot(...)`.
   For DB session context, default to:

- `StynxDbContextModule.forRoot({ pgSessionApplier: { ... } })`
- and add `requestDbClientLifecycle` when your app acquires tenant-bound clients per request.
- if your stack needs release strictly on HTTP completion (`finish`/`close`), wrap lifecycle with `new ResponseEventRequestDbClientLifecycle(...)`.
- for PEC-like global cross-cutting protection, register `StynxPlatformPipelineModule.forRoot(...)` and optionally disable concerns per environment (`sla`, `idempotency`, `rateLimit`).

3. Keep existing controller signatures intact:

- continue supporting `req.user` consumers
- continue supporting `request.actor` consumers

`AuthContextGuard` in `@stynx-nyx/backend` already exposes both shapes.

## `pec` Adoption Sequence

1. Wire `StynxAuthModule` with:

- Cognito token verifier
- `tenantResolver: new RequiredTenantHeaderResolver()`
- `tenantEntitlementPolicy: new ClaimFirstTenantEntitlementPolicy({ fallback: new SqlTenantEntitlementFallback(...) })`

2. Wire `StynxDbContextModule` with:

- built-in `pgSessionApplier` (sets `row_security` + request `set_config`)
- `requestDbClientLifecycle: new PgTenantDbClientLifecycle(tenantSessionServiceLikeAdapter)` to mirror `connectWithTenant(...)` from `../pec/src/@core/services/tenant-session.service.ts`.

3. Replace role guard wiring with `AuthorizationGuard` + role evaluator adapter preserving `RolesGuard` semantics from `../pec/src/@core/security/roles.guard.ts`.
4. Replace global stack wiring from `../pec/src/@core/core.module.ts` with:

- `StynxPlatformPipelineModule.forRoot({ ... })`
- which wires `RateLimitGuard` + `SlaMonitorInterceptor` + `IdempotencyInterceptor` as APP providers.

5. For middleware-style tenant handling parity with `../pec/src/@core/middleware/tenant.middleware.ts`, use `TenantLifecycleMiddleware` (or `createTenantLifecycleMiddleware(...)`) in Nest middleware consumer.
6. Swap audit interceptor/decorator to `@stynx-nyx/backend` + SQL sink mode `audit_write_function` matching `../pec/src/@core/services/audit.service.ts`.
7. Migrate storage presign service via `S3ObjectStorageService` while retaining `pec.documents` service local.
8. Replace direct Cognito admin SDK usage in `../pec/src/admin/users/cognito-users.service.ts` with:

- provider adapter: `@stech/stynx-auth-cognito-admin`
- compatibility facade: `PecIdentityAdminFacade` (`@stynx-nyx/backend`)

## `porm` Adoption Sequence

1. Wire auth module with principal mapper preserving role normalization and `org_cnpj` fallback semantics from `../porm/backend/src/core/auth/auth.service.ts`.
2. Keep `AdminOnlyGuard` behavior until role-evaluator parity is proven (`../porm/backend/src/core/admin/users/admin-only.guard.ts`).
3. Adopt storage S3 adapter for presign; keep CMS/PORM domain document record services local.
4. Keep DB-trigger audit model (`porm/database/audit/ddl.sql`) and bridge to shared envelope only where app-level events are needed.
5. Split current `UserManagementService` in `../porm/backend/src/core/admin/users/users.service.ts` into:

- provider-generic delegate backed by `@stech/stynx-auth-cognito-admin`
- PORM-local sync/meta service for non-generic methods.

6. Use `PormIdentityAdminFacade` (`@stynx-nyx/backend`) for existing service method/response compatibility (`list/get/update/verify/reset/sync`) while keeping PORM-specific local sync/meta implementation as injected adapters.
7. For concrete local sync/meta convergence, use:

- `PgIdentityLocalSyncAdapter` for provider-to-local-db sync (`syncToLocal`, `syncUser`, `listGroupsWithMetaByUserId`)
- optional `loadPormRoleMetaRows(...)` for current PORM enum/meta behavior

## `sgp` Adoption Sequence

1. Wire auth with Cognito verifier and principal mapper that preserves groups->permissions behavior from `../sgp/source/backend/src/iam/permissions/permissions.service.ts`.
2. Use `AuthorizationGuard` with permission evaluator configured for current `every` semantics from `../sgp/source/backend/src/auth/permissions.guard.ts`.
3. Preserve `request.actor` consumers unchanged (compatibility shim provided by `AuthContextGuard`).
4. Adopt audit SQL sink in `audit_event_table` mode matching `../sgp/source/backend/src/audit/audit-writer.service.ts`.
5. Adopt S3 storage adapter while keeping document lifecycle/orchestration in local `documents.service.ts`.

## Compatibility Shims

- `req.user`: preserved by shared auth guard.
- `request.actor`: preserved by shared auth guard.
- tenant resolution: injected through `TenantResolver` and `TenantEntitlementPolicy` adapters.
- DB key mapping: built-in `PgSessionDbContextApplier` already writes `stynx.*`, `auth.*`, and `app.current_tenant` for compatibility with current `porm`/`pec` patterns.

## Rollback Pattern

- feature flags by concern (`AUTH`, `AUTHZ`, `AUDIT`, `STORAGE`, `DB_CONTEXT`, `IDENTITY_ADMIN`).
- dual wiring in one release; remove legacy after parity gates pass.

## Audit Redaction Option

Use `StynxAuditModule.forRoot({ sink, metadataRedactionPolicy })` with `PatternAuditMetadataRedactionPolicy` when metadata payloads can include sensitive keys (token/password/cookie-like fields).

## Frontend Adoption Baseline

Use `reference/web` as the package-consumer baseline for frontend concerns:

1. `@stynx-web/sdk` for token/principal/http contracts.
2. `@stynx-web/sdk` for:

- `FrontendSessionManager` + token stores
- `StynxApiClient` with auth/tenant header wiring
- role/permission helpers
- Cognito hosted-UI login URL builder

3. Keep app-specific view flows and permission catalogs local.
