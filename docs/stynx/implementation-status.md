# stynx Implementation Status (2026-04-24)

## Completed In This Pass

1. Workspace/package foundation

- Added root workspace manifest and base TS config.
- Added package family skeleton and manifests.

2. Contracts package

- Created `packages/stynx-contracts` with stable interfaces for:
  - auth principal + verifier
  - authorization requirements/evaluator
  - audit envelope/sink
  - object storage + metadata repository
  - DB session context applier
  - tenancy resolver/entitlement
  - common errors/result envelope

3. Backend core package

- Created `packages/backend` with dynamic modules and adapters.
- Implemented shared auth guard/decorator pipeline with compatibility request attachment (`req.user` and `request.actor`).
- Implemented authorization decorators + guard with pluggable evaluator.
- Implemented audit decorator + interceptor + sink injection.
- Implemented DB context interceptor + applier injection.
- Implemented storage module contract wiring.

4. Optional adapter packages

- `packages/stynx-auth-cognito`
- `packages/stynx-auth-cognito-admin`
- `packages/stynx-storage-s3`
- `packages/stynx-audit-sql`

5. Reference consumer scaffold

- Added `apps/reference-backend` to demonstrate package composition and decouple runnable scaffold from package API.

6. Subagent outputs consolidated

- `docs/stynx/working-notes/*.md` created for auth/authz/db-context/audit/storage/package architecture and used to freeze the extraction model.

7. Identity-admin convergence groundwork

- Added `@stech/stynx-auth-cognito-admin` with standardized credentials strategies and error mapping.
- Added shared identity-admin contracts in `packages/stynx-contracts/src/identity-admin.ts`.
- Added backend registration module `StynxIdentityAdminModule`.
- Added backend `IdentityAdminService` facade with normalized exception mapping for controller integration.
- Added identity-admin local sync/meta extension points (`syncToLocal`, `syncUser`, `listGroupsWithMetaByUserId`) via optional local adapter contract.
- Added convergence plan: `docs/stynx/identity-admin-convergence.md`.
- Added explicit coverage matrix: `docs/stynx/feature-coverage-status.md`.

8. Dependency refresh (workspace package family)

- Updated NestJS references in package family to latest 11.1.x line.
- Updated AWS SDK adapters to latest 3.1034.x line (and matching `@aws-sdk/types` latest line).
- Updated Cognito token adapter to latest `jose` major.

9. Legacy backend alignment

- Upgraded `backend/package.json` to NestJS 11.1.x and refreshed core runtime/dev dependency set.
- Installed updated backend dependencies and validated legacy backend build (`backend npm run build`) after compatibility fixes.

10. Audit trigger convergence with PORM + PK capture

- Updated `db/ddl/02-audit.sql` to add `audit.events.pk jsonb` and `idx_audit_events_pk` (GIN).
- Added `audit.extract_primary_key(...)` for trigger-time PK extraction from catalog metadata.
- Updated `audit.fn_log_dml` to write table-qualified entity names and extracted PK for INSERT/UPDATE/DELETE.
- Updated `@stech/stynx-audit-sql` function-mode mapping to align with current `audit.write(...)` signature and forward optional `pk`/`oldData`/`newData`.

11. PEC canonical tenant-isolation extraction into package layer

- Added strict header tenant resolver: `RequiredTenantHeaderResolver`.
- Added claim-first entitlement policy with PEC claim semantics: `ClaimFirstTenantEntitlementPolicy`.
- Added optional SQL fallback for entitlement checks: `SqlTenantEntitlementFallback`.
- Added request tenant-bound DB client lifecycle abstraction:
  - `RequestDbClientLifecycle`
  - `PgTenantDbClientLifecycle`
- Extended `StynxDbContextModule`/`DbContextInterceptor` to support `requestDbClientLifecycle` acquire/release wiring and attach acquired client to request (`pgClient`/`dbClient`).

12. RLS helper convergence in SQL DDL

- Added reusable SQL helpers in `db/ddl/01-auth.sql`:
  - `auth.create_tenant_enforcement_trigger(...)`
  - `auth.attach_tenant_enforcement_triggers(...)`
  - `auth.create_rls_policy(...)`
- Rewired `db/ddl/03-storage.sql` to consume shared helpers (`storage.files`) instead of manual trigger/policy DDL.
- Added repo smoke check `scripts/check-rls-smoke.sh` and workspace script `npm run check:rls-smoke`.
- Expanded DB DDL tests to assert helper definitions and helper-based wiring.

13. Default Postgres DB session-context applier (gap closed)

- Added `PgSessionDbContextApplier` in `packages/backend/src/db-context/pg-session-db-context.applier.ts`.
- Behavior:
  - enables `SET row_security = on`
  - applies request session context through `set_config(...)`
  - writes compatibility keys for `stynx.*`, `auth.*`, and `app.current_tenant`.
- Updated `StynxDbContextModule.forRoot(...)` to accept either:
  - `applier` (custom), or
  - `pgSessionApplier` (built-in default constructor options).
- Updated `apps/reference-backend` to consume `pgSessionApplier`.

14. Package-level unit testing depth (core shared behaviors)

- Added dedicated package harness under `test/packages` (Vitest + Vitest).
- Added targeted unit tests for:
  - `PgSessionDbContextApplier` behavior and compatibility key mapping.
  - `DefaultPolicyEvaluator` role/permission semantics.
  - `IdentityAdminService` error mapping and local-sync adapter delegation.
  - `stynx-auth-cognito-admin` env option builder and provider error mapping.
- Added package test harnesses. Current root package tests run through
  `pnpm test`.

15. Reference frontend module + frontend libraries

- Added `packages/stynx-frontend-contracts` for shared frontend contracts:
  - token/principal/auth-state
  - API transport (`FetchLike`, request/response contract)
- Added `packages/stynx-frontend-client` with reusable frontend mechanics:
  - token stores (`BrowserLocalStorageTokenStore`, `InMemoryTokenStore`)
  - `FrontendSessionManager`
  - `StynxApiClient` (auth + tenant header injection)
  - authorization helpers (`hasAnyRole`, `hasAnyPermission`, `hasAllPermissions`)
  - Cognito hosted UI URL builder
- Added `apps/reference-frontend` (Angular module reference app) consuming these libraries.
- Added package tests for frontend client behaviors (`session-manager`, `api-client`).

16. Bootstrap migration to package-first app targets

- Retargeted bootstrap backend build from legacy `backend` workspace to dynamic package-first resolution (`@stech/reference-backend` preferred; legacy fallback).
- Retargeted frontend build/deploy from legacy `frontend` to dynamic package-first resolution (`@stech/reference-frontend` preferred; legacy fallback).
- Added reference frontend static build pipeline (`build:web`) producing deployable assets in `apps/reference-frontend/dist/browser`.
- Migrated bootstrap env write/update targets to package-first paths:
  - backend env primary: `apps/reference-backend/.env` (with legacy mirror when present)
  - frontend env updates: `apps/reference-frontend/src/environments/*` (and legacy mirror if present)
- Generalized sync-env source via `--sync-env-source` (default remains `../porm/backend/.env`).

17. Identity local-sync concrete adapter + PORM meta helper

- Added `PgIdentityLocalSyncAdapter` for concrete provider-to-local-db sync:
  - `syncToLocal`
  - `syncUser`
  - `listGroupsWithMetaByUserId`
- Added optional helper `loadPormRoleMetaRows(...)` to converge PORM role metadata enrichment in a reusable package surface.

18. Optional response-event tenant DB client lifecycle

- Added `ResponseEventRequestDbClientLifecycle`:
  - defers release to response `finish/close`
  - preserves compatibility for stacks that require middleware-style response completion semantics.
- Added middleware-style tenant lifecycle adapter:
  - `TenantLifecycleMiddleware`
  - `createTenantLifecycleMiddleware(...)`
  - preserves PEC-style strict `x-tenant-id` validation and response-event client release behavior.

19. Audit metadata redaction and SQL read-model parity helpers

- Added shared metadata redaction policy support:
  - `AuditMetadataRedactionPolicy`
  - `PatternAuditMetadataRedactionPolicy`
- Added `AuditSqlReader` in `@stech/stynx-audit-sql` for:
  - `stynx_events` source (`audit.events`)
  - `porm_logged_actions` source (`audit.logged_actions`)

20. Expanded compatibility matrix tests

- Added package tests covering:
  - auth request attachment parity (`req.user` and `request.actor`)
  - tenant entitlement parity (claim-first + SQL fallback)
  - audit sink parity (`audit_write_function` vs `audit_event_table`)
  - audit metadata redaction behavior
  - response-event + middleware-style DB lifecycle behavior
  - identity local sync concrete adapter behavior
  - idempotency replay/conflict/strict durable behavior
  - rate-limit in-memory/distributed/strict behavior
  - SLA sample/aggregate/error-path behavior
  - global pipeline module (`APP_GUARD`/`APP_INTERCEPTOR`) wiring behavior

21. PEC global SLA/idempotency/rate-limit stack productization

- Added `StynxPlatformPipelineModule` as package-level API for global stack registration.
- Added dedicated concern modules:
  - `StynxRateLimitModule`
  - `StynxSlaModule`
  - `StynxIdempotencyModule`
- Preserved concern-level opt-out at registration time (`false` to disable specific stack components).

## stynx Diagnosis Checklist (current)

### Keep

- `backend/src/shared/database/database.service.ts` session-context patterns as reference behavior.
- `backend/src/core/auth/*`, `backend/src/core/audit/*`, `backend/src/core/storage/*` as migration source inputs.

### Extract As-Is (or near as-is)

- Decorator metadata patterns (`Audit`, role/permission requirement metadata).
- Guard/interceptor composition patterns.

### Normalize First

- Claim mapping and role/permission normalization.
- Tenant resolution and entitlement hooks.
- Audit envelopes and sink payload contracts.
- Storage presign contracts and response headers.

### Redesign

- App-first module aggregation (`backend/src/core/core.module.ts`) into package modules with `forRoot`.
- Direct concrete SQL coupling into adapter interfaces.

### Keep App-Local

- Role/permission catalogs and business policy engines.
- Domain document ownership/lifecycle logic.

### Deprecate/Move

- Treat legacy `backend/` and `frontend/` as transitional scaffold roots while `packages/*` become primary public API.

## Validated Cross-Repo Evidence (key)

- Auth verifier divergence:
  - `../porm/backend/src/core/auth/auth.service.ts`
  - `../pec/src/@core/security/jwt-auth.guard.ts`
  - `../sgp/source/backend/src/auth/cognito-jwt.service.ts`
- Authorization model divergence:
  - `../pec/src/@core/security/roles.guard.ts`
  - `../sgp/source/backend/src/auth/permissions.guard.ts`
- DB context divergence:
  - `../porm/backend/src/database/database.service.ts`
  - `../sgp/source/backend/src/database/database.service.ts`
  - `../pec/src/@core/db/db.service.ts`
- Storage divergence:
  - `../porm/backend/src/core/storage/storage.service.ts`
  - `../pec/src/storage/storage.service.ts`
  - `../sgp/source/backend/src/documents/documents-storage.service.ts`
- Audit divergence:
  - `../pec/src/@core/services/audit.service.ts`
  - `../sgp/source/backend/src/audit/audit-writer.service.ts`
  - `porm/database/audit/ddl.sql`

## Verified Mismatches Between Prior Docs and Current Code

- Legacy `backend/` and package-first `packages/*` currently coexist, so there are still two runtime surfaces during migration.
- CI/workflow and release automation are not yet package-native (no root workflows/changesets in place).
- Consumers (`porm`, `pec`, `sgp`) are not yet fully switched to package APIs; convergence is still staged.

## What Is Still Legacy

- `backend/` and `frontend/` remain present as legacy scaffold roots.
- Legacy CI/build/test paths still reference those directories.
- PORM and PEC are not yet switched to consume the new identity-admin adapter package.

## Verification Notes

- Workspace validation completed:
  - `npm run bootstrap:typecheck`: success
  - `npm run bootstrap:cli -- deploy-backend --dry-run`: success
  - `npm run bootstrap:cli -- deploy-frontend --dry-run --non-interactive --yes`: success
  - `npm run typecheck` (workspace): success
  - `npm run build` (workspace): success
  - `npm run check:rls-smoke`: success
  - `npm run test`: success
  - `npm run test`: success
  - `cd backend && npm run build`: success
