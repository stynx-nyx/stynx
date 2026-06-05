# Migration Compatibility Working Note

## Files inspected

- `../porm/backend/src/core/auth/jwt-auth.guard.ts`
- `../porm/backend/src/common/decorators/current-user.decorator.ts`
- `../porm/backend/src/common/services/context-aware.service.ts`
- `../porm/backend/src/database/database.service.ts`
- `../pec/src/@core/security/jwt-auth.guard.ts`
- `../pec/src/@core/security/current-user.decorator.ts`
- `../pec/src/@core/security/roles.guard.ts`
- `../pec/src/@core/services/tenant-session.service.ts`
- `../pec/src/types/express.d.ts`
- `../sgp/source/backend/src/auth/cognito-jwt.guard.ts`
- `../sgp/source/backend/src/auth/current-actor.decorator.ts`
- `../sgp/source/backend/src/auth/permissions.guard.ts`
- `../sgp/source/backend/src/common/request-context/request-context.store.ts`
- `../sgp/source/backend/src/database/database.service.ts`
- `stynx/packages/backend/src/auth/auth-context.guard.ts`
- `stynx/packages/backend/src/authorization/authorization.guard.ts`
- `stynx/packages/backend/src/db-context/db-context.interceptor.ts`
- `stynx/packages/stynx-contracts/src/*.ts`

## Compatibility shim strategy

### 1. Request principal shape shim

Use one shared internal principal and attach both compatibility shapes:

- `req.user` for `porm` and `pec`
- `request.actor` for `sgp`

Implemented in:

- `stynx/packages/backend/src/auth/auth-context.guard.ts`

### 2. Role and permission coexistence shim

Use one guard engine with a pluggable policy evaluator:

- role evaluator adapter for `porm`/`pec`
- permission evaluator adapter for `sgp`

Implemented in:

- `stynx/packages/backend/src/authorization/authorization.guard.ts`
- `stynx/packages/backend/src/authorization/default-policy-evaluator.ts`

### 3. Tenant/context key mapping shim

Use app-specific `DbContextApplier` adapters to preserve DB key families:

- `auth.*` keys for `porm`/`stynx`
- `app.*` keys for `sgp`
- `auth.set_tenant` flow for `pec`

Contract:

- `stynx/packages/stynx-contracts/src/db-context.ts`

### 4. Tenant entitlement shim

Inject `TenantEntitlementPolicy` so `pec`-style guardrails can be preserved without forcing them on all apps.

Contract:

- `stynx/packages/stynx-contracts/src/tenancy.ts`

## Per-repo incremental sequence

### `pec`

1. Introduce shared auth guard with adapter around `TenantSessionService.isTenantEntitled`.
2. Swap `RolesGuard` path to shared authorization with role evaluator preserving existing semantics.
3. Move audit pipeline to shared interceptor + SQL function sink mode.
4. Swap storage presign service to S3 adapter; keep `pec.documents` domain service local.

### `porm`

1. Introduce shared auth guard with principal mapper preserving `org_cnpj` fallback and role normalization.
2. Preserve existing admin-only route behavior while migrating to shared role evaluator.
3. Adopt shared storage adapter and keep domain document record services local.
4. Keep trigger-based audit model; optionally add app-level audit sink where needed.

### `sgp`

1. Introduce shared auth guard with mapper preserving groups->permissions behavior.
2. Replace permission guard path with shared authorization guard + permission evaluator configured for `every` semantics.
3. Preserve `request.actor` and async context-store projection.
4. Move audit writes to shared SQL sink in table mode while preserving event shape.
5. Adopt shared storage S3 adapter while keeping upload-session/document lifecycle local.

## Risks

1. Role/permission decision semantic mismatch (`any` vs `all`) can widen or narrow access.
2. Tenant model mismatch (`tenant_id` vs `org_cnpj` vs permission-only scope).
3. DB session key mismatch can break RLS silently.
4. Request shape regressions if controllers expect exact legacy properties.
5. Audit sink schema drift across repos (`audit.write` vs `audit_event` table).
