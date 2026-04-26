# Auth Foundation Agent

## Scope
Inspected runtime auth/token/Cognito/OIDC/JWKS/request-principal code paths in:
- `/Users/aarusso/Development/stech/porm`
- `/Users/aarusso/Development/stech/pec`
- `/Users/aarusso/Development/stech/sgp`
- `/Users/aarusso/Development/stech/stynx`

Only implementation files were used for conclusions below (not assumptions from docs/tests).

## Files Inspected (with concrete symbols)

### porm
- `/Users/aarusso/Development/stech/porm/backend/src/core/auth/auth.service.ts`
  - `AuthService.verifyBearer()`
  - `AuthService.ensureJwks()`
  - `AuthService.assertAudience()`
  - `extractRoles()`
  - `readOrgCnpjClaim()`
- `/Users/aarusso/Development/stech/porm/backend/src/core/auth/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate()`
- `/Users/aarusso/Development/stech/porm/backend/src/common/decorators/current-user.decorator.ts`
  - `CurrentUser`
- `/Users/aarusso/Development/stech/porm/backend/src/common/types/user-context.ts`
  - `UserContext`
- `/Users/aarusso/Development/stech/porm/backend/src/cms/menu/menu.controller.ts`
  - `MenuController.list()` (optional bearer verification path)
- `/Users/aarusso/Development/stech/porm/backend/src/porm/storage/porm-storage.controller.ts`
  - `PormStorageController.presignDownload()` (optional bearer verification path)
- `/Users/aarusso/Development/stech/porm/backend/src/database/database.service.ts`
  - `DatabaseService.withTransaction()` (auth context session vars)
- `/Users/aarusso/Development/stech/porm/frontend/src/app/core/auth/auth.interceptor.ts`
  - `AuthInterceptor.intercept()`
- `/Users/aarusso/Development/stech/porm/frontend/src/app/core/auth/auth.service.ts`
  - `AuthService.getAccessTokenSync()`
  - `AuthService.getIdTokenSync()`
  - `AuthService.extractRoles()`

### pec
- `/Users/aarusso/Development/stech/pec/src/@core/security/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate()`
  - `JwtAuthGuard.getKey()`
  - `JwtAuthGuard.getRequestedTenant()`
  - `JwtAuthGuard.denyTenantAccess()`
- `/Users/aarusso/Development/stech/pec/src/@core/security/roles.util.ts`
  - `normalizeRoles()`
- `/Users/aarusso/Development/stech/pec/src/@core/security/current-user.decorator.ts`
  - `CurrentUser`
- `/Users/aarusso/Development/stech/pec/src/@core/services/tenant-session.service.ts`
  - `TenantSessionService.isTenantEntitled()`
  - `TenantSessionService.findTenantClaim()`
  - `TenantSessionService.connectWithTenant()`
- `/Users/aarusso/Development/stech/pec/src/@core/services/users-sync.service.ts`
  - `UsersSyncService.ensureUserRecord()`
- `/Users/aarusso/Development/stech/pec/src/@core/middleware/tenant.middleware.ts`
  - `TenantMiddleware.use()`
- `/Users/aarusso/Development/stech/pec/src/@core/middleware/tenant-middleware.module.ts`
  - `TenantMiddlewareModule.configure()`
- `/Users/aarusso/Development/stech/pec/src/@core/core.module.ts`
  - global providers for `APP_GUARD` (`JwtAuthGuard`, `RolesGuard`)
- `/Users/aarusso/Development/stech/pec/src/@core/db/db.service.ts`
  - `DbService.connectWithTenant()`
- `/Users/aarusso/Development/stech/pec/src/@core/config/configuration.ts`
  - `oidcConfig`, `cognitoConfig`

### sgp
- `/Users/aarusso/Development/stech/sgp/source/backend/src/auth/cognito-jwt.service.ts`
  - `CognitoJwtService.verifyAuthorizationHeader()`
  - `CognitoJwtService.verifyToken()`
  - `CognitoJwtService.verifySignature()`
  - `CognitoJwtService.validateClaims()`
  - `CognitoJwtService.toActor()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/auth/cognito-jwt.guard.ts`
  - `CognitoJwtGuard.canActivate()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/auth/auth.types.ts`
  - `AuthenticatedActor`, `CognitoJwtPayload`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/auth/current-actor.decorator.ts`
  - `CurrentActor`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/auth/permissions.guard.ts`
  - `PermissionsGuard.canActivate()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/iam/permissions/permissions.service.ts`
  - `PermissionsService.permissionsForGroups()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/common/request-id/request-id.middleware.ts`
  - `RequestIdMiddleware.use()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/common/request-context/request-context.store.ts`
  - `RequestContextStore.run()`, `RequestContextStore.setActor()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/database/database.service.ts`
  - `DatabaseService.applySessionContext()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/config/environment.ts`
  - `validateEnvironment()`, `buildCognitoIssuer()`, `buildCognitoJwksUri()`
- `/Users/aarusso/Development/stech/sgp/source/backend/src/app.module.ts`
  - `AppModule.configure()` middleware wiring
- `/Users/aarusso/Development/stech/sgp/source/frontend/src/app/core/http/auth-token-interceptor.ts`
  - `authTokenInterceptor`
- `/Users/aarusso/Development/stech/sgp/source/frontend/src/app/core/auth/cognito-auth.ts`
  - `CognitoAuth.startLogin()`, `CognitoAuth.accessToken()`

### stynx
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/auth.service.ts`
  - `AuthService.verifyBearer()`
  - `AuthService.ensureAudience()`
  - `AuthService.resolveUserId()`
  - `AuthService.resolveRoles()`
  - `AuthService.resolveTenants()`
  - `AuthService.persistPrincipal()`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/guards/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate()`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/guards/user.guard.ts`
  - `UserGuard.canActivate()`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/guards/role.guard.ts`
  - `RoleGuard.canActivate()`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/guards/tenancy.guard.ts`
  - `TenancyGuard.canActivate()`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/decorators/current-user.decorator.ts`
  - `CurrentUser`
- `/Users/aarusso/Development/stech/stynx/backend/src/core/auth/auth.controller.ts`
  - `AuthController.me()`
- `/Users/aarusso/Development/stech/stynx/backend/src/shared/database/database.service.ts`
  - `DatabaseService.applyContext()`
- `/Users/aarusso/Development/stech/stynx/backend/src/config/configuration.ts`
  - `cognitoConfig`
- `/Users/aarusso/Development/stech/stynx/frontend/src/app/core/auth/auth.interceptor.ts`
  - `authInterceptor`
- `/Users/aarusso/Development/stech/stynx/frontend/src/app/core/auth/cognito-auth.service.ts`
  - `CognitoAuthService.login()`, `CognitoAuthService.getAccessToken()`
- `/Users/aarusso/Development/stech/stynx/frontend/src/app/core/auth/auth.facade.ts`
  - `AuthFacade.getPreferredTenant()`

## Flow Comparison (token -> principal -> request context)

| Area | porm | pec | sgp | stynx |
|---|---|---|---|---|
| Bearer extraction | `JwtAuthGuard.canActivate()` reads `authorization` and calls `AuthService.verifyBearer()` | `JwtAuthGuard.canActivate()` reads `authorization`; global guard via `APP_GUARD` | `CognitoJwtGuard.canActivate()` calls `CognitoJwtService.verifyAuthorizationHeader()` | `JwtAuthGuard.canActivate()` reads header and calls `AuthService.verifyBearer()` |
| JWKS/JWT verifier | `jose.jwtVerify` + `createRemoteJWKSet` or `createLocalJWKSet` (`COGNITO_JWKS_PATH`) | `jsonwebtoken.verify` + `jwks-rsa` `JwksClient.getSigningKey()` | manual decode + `node:crypto.createVerify` + `jwks-rsa` | `jose.jwtVerify` + `createRemoteJWKSet` |
| Issuer/audience checks | issuer enforced in `jwtVerify`; audience via `aud/client_id/azp` in `assertAudience()` | issuer in verify options; audience via `aud || client_id`; token_use limited to `id/access` | `validateClaims()` checks issuer, audience, exp/nbf, optional token_use exact match | issuer in `jwtVerify`; audience via `aud/client_id/azp` |
| Principal mapping | `sub -> id`, `cognito:groups -> roles` (lower/singular), org from claims/fallback DB | payload copied to `CurrentUser`, roles from `normalizeRoles(cognito:groups)` whitelist | `toActor()` maps `sub`, username fallback chain, groups, derived permissions | maps `userId`, roles from multiple claim shapes, tenants from namespaced/array claims |
| Request attachment hook | guard sets `req.user = {id,roles,orgCnpj,lang}` | guard sets `req.user` and `req.pgClient` | guard sets `request.actor`, plus `RequestContextStore.setActor()` | guard sets `request.user`, `request.tenants`, optional `request.tenantId` |
| Tenant binding model | org scope via `orgCnpj` claim/fallback; no mandatory tenant header in guard | hard requirement: `x-tenant-id` middleware + entitlement in `TenantSessionService` + tenant DB client | no explicit tenant claim enforcement in auth guard; DB context receives actor/groups/permissions | tenant may come from `x-tenant-id` or single claim-derived tenant; `TenancyGuard` only checks presence |
| Auth side effects during verification | verifies token; no user upsert in `AuthService.verifyBearer()` | verifies token + opens tenant DB client + synchronizes `auth.users` / `auth.user_roles` | verifies token + computes permissions; actor injected into async request context used by DB session vars | verifies token + persists principal/roles to DB + enqueues sync (`CognitoSyncService.enqueueSync`) |

## Shared Nucleus (portable)

1. **Token verifier nucleus**
- Parse Bearer token and reject missing/invalid format.
- Verify signature with JWKS and validate issuer.
- Validate audience with support for both `aud` and `client_id`.
- Emit normalized verified claims object.

2. **Principal mapper nucleus**
- Deterministic mapping from verified claims -> principal shape (`subject`, `roles`, optional `tenants`, optional `attributes`).
- No transport coupling (no `Request`, no DB client) in the mapper contract.

3. **Request attachment nucleus**
- Attach mapped principal into per-request container.
- Hook contract should be explicit for each runtime (`req.user`, `req.actor`, async-local context).

## Adapter Boundaries

### A) Token verifier adapter boundary
Define one adapter per implementation style:
- `porm`/`stynx`: jose-based verifier adapter (`jwtVerify` + JWKS URI/local set).
- `pec`: jsonwebtoken+jwks-rsa verifier adapter.
- `sgp`: manual RS256 verifier adapter (currently implemented in `CognitoJwtService.verifySignature()`).

Adapter contract boundary:
- Input: `authorization header | raw token`, verifier config (`issuer`, `audience`, `jwksUri`, optional `tokenUse`).
- Output: verified claims object.
- Errors: typed auth errors (`missing token`, `bad signature`, `issuer mismatch`, `audience mismatch`, `token expired/not active`, `unsupported token type`).

### B) Principal mapper adapter boundary
Mapper differences that should stay app-specific adapters:
- role claim sources/normalization (`cognito:groups` only vs multi-claim merge, case transforms, whitelist filtering).
- tenant/org derivation model (`x-tenant-id` entitlement, claim-derived tenant arrays, org CNPJ fallback query).
- permission derivation from groups (`sgp` `PermissionsService.permissionsForGroups()`).

### C) Request attachment hook boundary
Attachment adapter differences:
- `porm`/`stynx`: set `req.user` object.
- `pec`: set `req.user` plus request-scoped DB client (`req.pgClient`) from tenant session.
- `sgp`: set `request.actor` and async-local actor via `RequestContextStore.setActor()`.

## Exclusions
- Admin/provisioning operations and Cognito management workflows (e.g., user CRUD/sync controllers/services) were not treated as foundation verifier/mapping hooks.
- SQL schema/policies were not used to redefine business authorization logic in extraction recommendations.
- Frontend login UX and callback completeness were not used as source of backend verifier truth.
- Tests/docs were not used as primary evidence for runtime behavior.

## Migration Risks

1. **Role normalization mismatch risk**
- `porm` lowers and singularizes role strings (`extractRoles()` in backend auth service).
- `pec` uppercases and filters to `ALL_ROLES` via `normalizeRoles()`.
- `stynx` lowercases merged roles from `roles`, `realm_access.roles`, `cognito:groups`, `permissions`.
- `sgp` keeps raw groups and derives permissions via normalized group mapping.

2. **Tenant semantics divergence risk**
- `pec` requires `x-tenant-id` and explicit entitlement check (`TenantSessionService.isTenantEntitled()`).
- `stynx` can infer tenant when principal has exactly one tenant; `TenancyGuard` only requires presence.
- `porm` focuses on org CNPJ claim/fallback rather than header tenant selection.
- `sgp` auth path does not enforce tenant claim selection in guard.

3. **Auth side-effect coupling risk**
- `pec` and `stynx` couple verification path with user/role persistence and/or tenant DB context setup.
- `porm` verifier is comparatively side-effect-light.
- `sgp` couples principal to DB session context through async-local store.

4. **Guard wiring variance risk**
- `pec` uses global `APP_GUARD` stack.
- `porm`, `sgp`, `stynx` apply guards at controller/route level.
- Migration to shared core must not assume one registration model.

5. **Test bypass policy risk**
- `pec`: `ALLOW_CONTRACT_TESTS` path in `JwtAuthGuard.canActivate()`.
- `sgp`: `AUTH_ALLOW_UNSIGNED_TEST_TOKENS` in `CognitoJwtService.verifyToken()`.
- Shared core must isolate non-production bypass behavior.

6. **Observed implementation hazard in sgp verifier**
- In `sgp/source/backend/src/auth/cognito-jwt.service.ts`, `verifySignature()` checks `if (!this.client) throw ...` before `await this.getClient()`, which blocks lazy JWKS client creation on first request.
- If unchanged, this can prevent normal signed-token verification unless `this.client` is pre-populated.

## Confirmed Shared Foundation Decision
A portable auth foundation is viable if split into three strict interfaces:
- **Token verifier core** (JWT/JWKS correctness).
- **Principal mapper adapter** (claims -> app identity semantics).
- **Request attachment adapter** (framework/request-context binding, including optional DB/session context propagation).

Business authorization policies (role catalogs, permission catalogs, tenant/org business rules) should remain outside the extracted nucleus.
