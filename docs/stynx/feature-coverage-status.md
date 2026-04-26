# Cross-Repo Feature Coverage Status

## Direct answer
No. `stynx` does not yet contain all features from `../porm`, `../pec`, and `../sgp`.

## Covered in `stynx` package family

| Concern | Status | Implemented In |
|---|---|---|
| JWT verification adapter | implemented | `packages/stynx-auth-cognito/src/index.ts` |
| Auth context guard + principal attachment (`req.user`, `request.actor`) | implemented | `packages/stynx-backend/src/auth/auth-context.guard.ts` |
| Role/permission authorization primitives | implemented | `packages/stynx-backend/src/authorization/*` |
| DB context abstraction | implemented | `packages/stynx-contracts/src/db-context.ts`, `packages/stynx-backend/src/db-context/*` |
| Audit decorator/interceptor + sink abstraction | implemented | `packages/stynx-backend/src/audit/*`, `packages/stynx-audit-sql/src/index.ts` |
| S3 storage abstraction/presign adapter | implemented | `packages/stynx-contracts/src/storage.ts`, `packages/stynx-storage-s3/src/index.ts` |
| Identity-admin generic adapter | implemented | `packages/stynx-contracts/src/identity-admin.ts`, `packages/stynx-auth-cognito-admin/src/index.ts` |
| Identity-admin backend facade/module | implemented | `packages/stynx-backend/src/identity-admin/*` |
| Identity-admin local sync/meta extension points | implemented (adapter hooks) | `packages/stynx-contracts/src/identity-admin.ts`, `packages/stynx-backend/src/identity-admin/identity-admin.service.ts` |
| PORM + PEC integration facades over identity-admin core | implemented | `packages/stynx-backend/src/identity-admin/integration-facades.ts` |
| Postgres concrete local identity sync implementation | implemented | `packages/stynx-backend/src/identity-admin/pg-local-sync.adapter.ts` |
| PORM role/group-meta enrichment helper | implemented (optional loader helper) | `packages/stynx-backend/src/identity-admin/pg-local-sync.adapter.ts#loadPormRoleMetaRows` |
| Response-event (`finish`/`close`) DB client lifecycle wrapper | implemented | `packages/stynx-backend/src/db-context/request-db-client-lifecycle.ts#ResponseEventRequestDbClientLifecycle` |
| Audit SQL read-model helper (`audit.events` / `audit.logged_actions`) | implemented | `packages/stynx-audit-sql/src/index.ts#AuditSqlReader` |
| Audit metadata redaction policy support | implemented | `packages/stynx-backend/src/audit/redaction-policy.ts`, `packages/stynx-backend/src/audit/audit.module.ts` |
| PEC global cross-cutting pipeline stack (SLA/idempotency/rate-limit) | implemented | `packages/stynx-backend/src/pipeline/platform-pipeline.module.ts`, `packages/stynx-backend/src/sla/*`, `packages/stynx-backend/src/idempotency/*`, `packages/stynx-backend/src/rate-limit/*` |
| Optional middleware-style tenant lifecycle adapter | implemented | `packages/stynx-backend/src/db-context/tenant-lifecycle.middleware.ts` |
| Compatibility matrix package tests | implemented | `test/packages/auth/*.spec.ts`, `test/packages/audit*.spec.ts`, `test/packages/db-context/*.spec.ts`, `test/packages/identity-admin/*.spec.ts`, `test/packages/idempotency/*.spec.ts`, `test/packages/rate-limit/*.spec.ts`, `test/packages/sla/*.spec.ts`, `test/packages/pipeline/*.spec.ts` |

## Not yet fully covered (gaps)

| Gap | Why not in `stynx` yet | Source evidence |
|---|---|---|
| PORM trigger-first audit model adoption in consumers | core trigger/write/read mechanics now exist in `stynx`; consuming repos still need adoption/migration | `db/ddl/02-audit.sql`, `packages/stynx-audit-sql/src/index.ts`, `../porm/backend/src/core/audit/audit.service.ts` |
| PEC tenant-bound `pgClient` lifecycle adoption in consumers | lifecycle primitives now include both interceptor-based and middleware-style release adapters in `stynx`; consuming repos still need integration cutover | `packages/stynx-backend/src/db-context/request-db-client-lifecycle.ts`, `packages/stynx-backend/src/db-context/tenant-lifecycle.middleware.ts`, `../pec/src/@core/security/jwt-auth.guard.ts`, `../pec/src/@core/middleware/tenant.middleware.ts` |

## Explicitly out of scope for extraction (app-local by design)
- SGP permission catalog/domain matrix:
  - `../sgp/source/backend/src/iam/permissions/permission-catalog.ts`
- SGP document upload-session lifecycle:
  - `../sgp/source/backend/src/documents/documents.service.ts`

## Current convergence state
- Platform mechanisms are present and installable.
- PORM/PEC migration can now target `PormIdentityAdminFacade` / `PecIdentityAdminFacade` for low-churn service adoption over shared adapter core.
- Local identity sync + group-meta helper + response-event/middleware lifecycle + metadata redaction are now package-level capabilities.
- PEC-style global pipeline registration is now package-level (`StynxPlatformPipelineModule`).
- App semantics are still local by design where required.
- Remaining work is migration/integration in consuming repos (`porm`, `pec`, `sgp`) and selected additional abstractions where stable.
- Detailed porting discussion: `docs/stynx/porting-analysis.md`.
