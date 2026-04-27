# Porting Analysis: PEC, SGP, PORM (and SQL sink drift)

## PEC tenant-bound `pgClient` lifecycle wiring

## Current behavior (evidence)

- `../pec/src/@core/middleware/tenant.middleware.ts` sets/validates tenant context.
- `../pec/src/@core/security/jwt-auth.guard.ts` resolves entitlement and attaches `req.pgClient` via `TenantSessionService.connectWithTenant(...)`.
- `../pec/src/@core/services/tenant-session.service.ts` handles claim/DB entitlement logic.

## What should be ported to `stynx`

- Mechanism only:
  - tenant resolver interface
  - entitlement policy interface
  - db-client resolver hook (`request -> client`)
  - db context applier abstraction
- Already partially present:
  - `TenantResolver`, `TenantEntitlementPolicy` contracts
  - `DbContextApplier` and `DbContextInterceptor`

## Newly extracted in `stynx` (this pass)

- PEC-style strict header tenant resolver:
  - `RequiredTenantHeaderResolver`
  - file: `packages/backend/src/auth/required-tenant-header.resolver.ts`
- PEC-style claim-first tenant entitlement policy:
  - `ClaimFirstTenantEntitlementPolicy`
  - file: `packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts`
- Optional SQL fallback checker for tenant entitlement:
  - `SqlTenantEntitlementFallback`
  - file: `packages/backend/src/auth/sql-tenant-entitlement.fallback.ts`
- Request tenant-bound DB client lifecycle abstraction:
  - `RequestDbClientLifecycle`, `PgTenantDbClientLifecycle`
  - file: `packages/backend/src/db-context/request-db-client-lifecycle.ts`
  - wired into `DbContextInterceptor`/`StynxDbContextModule` via `requestDbClientLifecycle`

## What should stay app-local

- PEC tenant claim lookup order and exact guardrail semantics.
- PEC-specific client lifecycle policies (when to open/release `pgClient`).

## Tenant lifecycle gap status

- Closed at package level:
  - `ResponseEventRequestDbClientLifecycle` for interceptor-driven stacks.
  - `TenantLifecycleMiddleware` / `createTenantLifecycleMiddleware(...)` for middleware-style release semantics (`finish`/`close`) matching PEC behavior.
- Remaining work is consumer migration, not shared API extraction.

---

## SGP permission catalog and document upload-session lifecycle

## Current behavior (evidence)

- Permission catalog: `../sgp/source/backend/src/iam/permissions/permission-catalog.ts`
- Permission evaluation: `../sgp/source/backend/src/auth/permissions.guard.ts`
- Upload-session lifecycle: `../sgp/source/backend/src/documents/documents.service.ts`

## What should be ported to `stynx`

- Mechanism only:
  - permission requirement metadata + evaluator pipeline (already in `stynx-backend` authorization)
  - storage presign abstraction and adapter (already in `stynx-storage-s3`)
  - document metadata repository interface (already in contracts)

## What should stay app-local

- Permission catalog entries and group-to-permission mapping matrix.
- Document upload-session state machine and ownership semantics.

## Recommended next extraction

- Add optional `UploadSessionRepository` interface to contracts if at least two apps converge on staged-upload workflow.
- Keep SGP domain workflow local until a second app shares same lifecycle semantics.

---

## PORM trigger-first audit end-to-end model

## Current behavior (evidence)

- Trigger model and schema: `../porm/database/audit/ddl.sql`
- Read-side service: `../porm/backend/src/core/audit/audit.service.ts`

## What should be ported to `stynx`

- Sink adapter mechanism (already done in `stynx-audit-sql`).
- Canonical event envelope + sink translation strategy.
- Trigger-level DML capture with PK extraction:
  - `db/ddl/02-audit.sql` now stores `pk jsonb` in `audit.events`.
  - `audit.fn_log_dml` now logs `schema.table`, `old_data`, `new_data`, and extracted PK.

## What should stay app-local

- Trigger attachment topology by schema/table.
- PORM-specific read model query semantics over `audit.logged_actions`.

## Recommended next extraction

- Add `AuditReadRepository` optional contract only if another app needs same query/read model pattern.

---

## SQL sink shape drift (`audit.write` vs table sink) — what it means

It means each SQL sink expects different columns, types, and semantics for the same logical audit event.

## Example mismatch

- `audit.write` function style (PEC/STYNX-like):
  - semantic fields: `tenant_id`, `actor_id`, `actor_role`, `action`, `entity`, `entity_id`, `details/metadata`, `ip`, `correlation_id`
- table insert style (SGP-like `audit_event`):
  - semantic fields: `resource_type`, `resource_id`, `request_id`, `metadata`, `actor_sub`, etc.
- trigger log style (PORM `audit.logged_actions`):
  - semantic fields: `schema_name`, `table_name`, `op`, `old_data`, `new_data`, context vars

If we write one canonical envelope without per-sink translation, we risk:

- losing fields (for example `entity` vs `resource_type` mismap)
- wrong type casts (`uuid`/`text`/`inet` mismatches)
- inconsistent audit analytics across products

## How to handle correctly

1. Keep a canonical in-memory envelope (`AuditEventEnvelope`).
2. Implement per-sink mappers/serializers in adapter package.
3. Verify with parity tests per sink mode.
4. Keep sink-specific schema knowledge out of core contracts.
