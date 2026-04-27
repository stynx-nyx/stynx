# stynx Package Architecture

## Implemented Workspace Shape

- `package.json` (workspace root)
- `tsconfig.base.json`
- `packages/stynx-contracts`
- `packages/backend`
- `packages/stynx-auth-cognito`
- `packages/stynx-auth-cognito-admin`
- `packages/stynx-storage-s3`
- `packages/stynx-audit-sql`
- `packages/stynx-frontend-contracts`
- `packages/stynx-frontend-client`
- `apps/reference-backend`
- `apps/reference-frontend`

## Public Package Roles

### `@stech/stynx-contracts`

Framework-agnostic contracts:

- principal/auth verification contracts
- policy evaluator contracts
- audit envelope/sink contracts
- storage contracts
- DB context contracts
- tenancy contracts
- identity-admin contracts
- common error/result envelopes

### `@stynx/backend`

NestJS infrastructure modules:

- `StynxAuthModule.forRoot(...)`
- `StynxAuthorizationModule.forRoot(...)`
- `StynxAuditModule.forRoot(...)`
- `StynxDbContextModule.forRoot(...)`
- `StynxStorageModule.forRoot(...)`
- `StynxIdentityAdminModule.forRoot(...)`
- `StynxRateLimitModule.forRoot(...)`
- `StynxSlaModule.forRoot(...)`
- `StynxIdempotencyModule.forRoot(...)`
- `StynxPlatformPipelineModule.forRoot(...)` (PEC-style global stack composition)

Identity-admin runtime surface:

- `IdentityAdminService` (provider-generic operations + optional local sync/meta adapter hooks)

Also includes shared guards/decorators/interceptors:

- `AuthContextGuard`
- `CurrentPrincipal`
- `RequireRoles`, `RequirePermissions`
- `AuthorizationGuard`
- `Audit`, `AuditInterceptor`
- `DbContextInterceptor`
- `RateLimitGuard`
- `SlaMonitorInterceptor`
- `IdempotencyInterceptor`

Tenant isolation toolkit (PEC-style):

- `RequiredTenantHeaderResolver`
- `ClaimFirstTenantEntitlementPolicy`
- `SqlTenantEntitlementFallback`
- `RequestDbClientLifecycle`, `PgTenantDbClientLifecycle`
- `TenantLifecycleMiddleware`, `createTenantLifecycleMiddleware(...)`
- `PgSessionDbContextApplier` (default Postgres session context applier with `row_security` + `set_config`)
- `StynxDbContextModule.forRoot({ requestDbClientLifecycle })`

### `@stech/stynx-auth-cognito`

Cognito/OIDC token verifier adapter:

- `CognitoTokenVerifier`
- supports issuer/audience/token_use validation
- configurable claim-key sets for roles/permissions/tenants

### `@stech/stynx-auth-cognito-admin`

Cognito identity-admin adapter:

- `CognitoIdentityAdminAdapter`
- `buildCognitoAdminOptionsFromEnv(...)`
- standard credentials strategy (`default-chain`, `profile`, `provided`)
- shared provider error mapping policy

### `@stech/stynx-storage-s3`

S3 adapter:

- `S3ObjectStorageService`
- presign upload/download
- object exists/delete

### `@stech/stynx-audit-sql`

SQL audit sink adapter:

- `AuditSqlSink`
- modes: `audit_write_function` and `audit_event_table`

### `@stynx-web/sdk`

Framework-agnostic frontend contracts:

- token store contract (`FrontendTokenStore`)
- token/principal/auth-state contracts
- API request/fetch-like transport contracts

### `@stynx-web/sdk`

Frontend shared toolkit:

- `FrontendSessionManager` (token hydration, expiry checks, claim-to-principal mapping)
- `BrowserLocalStorageTokenStore`, `InMemoryTokenStore`
- `StynxApiClient` (auth + tenant headers, query/body normalization)
- authorization helpers (`hasAnyRole`, `hasAnyPermission`, `hasAllPermissions`)
- Cognito hosted-UI login URL helper (`buildCognitoHostedUiLoginUrl`)

## Compatibility Surface

`AuthContextGuard` intentionally attaches:

- `req.user` style context (`porm`, `pec` compatibility)
- `request.actor` style context (`sgp` compatibility)

Evidence:

- `../porm/backend/src/core/auth/jwt-auth.guard.ts`
- `../pec/src/@core/security/jwt-auth.guard.ts`
- `../sgp/source/backend/src/auth/cognito-jwt.guard.ts`

## Why Scaffold Is No Longer Primary API

- publishable surface is now in `packages/*`
- scaffold consumption shown in `apps/reference-backend` and `apps/reference-frontend`
- no package exports point to app code

## Current Coupling Still Present

- Legacy runnable scaffold remains in `backend/` and `frontend/` until staged migration completes.
- CI/build scripts still target legacy folders.
