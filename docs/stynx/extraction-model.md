# stynx Extraction Model (Frozen)

## Canonical Table

| Concern | Source Evidence | Shared Nucleus | Target Package/Module | Strategy | Keep App-Local | Risk | Priority |
|---|---|---|---|---|---|---|---|
| Token verification | `../porm/backend/src/core/auth/auth.service.ts#verifyBearer`, `../pec/src/@core/security/jwt-auth.guard.ts#canActivate`, `../sgp/source/backend/src/auth/cognito-jwt.service.ts#verifyToken` | Bearer parse, JWKS verify, issuer/audience/token_use checks | `packages/stynx-auth-cognito` (`CognitoTokenVerifier`) | Normalize | Claim semantics | claim drift | P0 |
| Principal mapping | `../porm/backend/src/core/auth/auth.service.ts#extractRoles`, `../pec/src/@core/security/roles.util.ts#normalizeRoles`, `../sgp/source/backend/src/iam/permissions/permissions.service.ts#permissionsForGroups` | claims -> principal | `packages/stynx-contracts` + mapper injection in `packages/stynx-backend/src/auth/auth.module.ts` | Adapter-driven | role catalogs, permission catalogs | permission/role mismatch | P0 |
| Auth request attachment | `../porm/backend/src/core/auth/jwt-auth.guard.ts`, `../pec/src/@core/security/jwt-auth.guard.ts`, `../sgp/source/backend/src/auth/cognito-jwt.guard.ts` | attach principal context to request | `packages/stynx-backend/src/auth/auth-context.guard.ts` | Normalize | request shape nuances | controller regressions | P0 |
| Authorization mechanism | `../pec/src/@core/security/roles.guard.ts`, `../sgp/source/backend/src/auth/permissions.guard.ts`, `stynx/backend/src/core/auth/guards/role.guard.ts` | metadata + guard + evaluator | `packages/stynx-backend/src/authorization/*` | Redesign | policy catalogs/rules | allow/deny semantic drift | P1 |
| Tenant resolve and entitlement hooks | `../pec/src/@core/services/tenant-session.service.ts#isTenantEntitled`, `stynx/backend/src/core/auth/guards/tenancy.guard.ts`, `../porm/backend/src/core/auth/auth.service.ts#readOrgCnpjClaim` | tenant resolution chain + entitlement policy interface | `packages/stynx-contracts/src/tenancy.ts` + auth module hooks | Normalize | tenant model specifics (uuid vs org_cnpj) | false denies | P1 |
| DB context propagation | `../porm/backend/src/database/database.service.ts#withTransaction`, `../sgp/source/backend/src/database/database.service.ts#applySessionContext`, `stynx/backend/src/shared/database/database.service.ts#applyContext` | request/auth -> DB session context | `packages/stynx-backend/src/db-context/*`, `packages/stynx-contracts/src/db-context.ts` | Normalize | app-specific set_config keys | RLS breakage | P1 |
| Audit capture pipeline | `../pec/src/@core/interceptors/audit.interceptor.ts`, `stynx/backend/src/core/audit/audit.interceptor.ts`, `../sgp/source/backend/src/audit/audit.service.ts#appendMutation` | decorator metadata + post-handler sink write | `packages/stynx-backend/src/audit/*` | Normalize | domain action payload semantics | missing events | P1 |
| Audit persistence sink | `../pec/src/@core/services/audit.service.ts#write`, `../sgp/source/backend/src/audit/audit-writer.service.ts#appendEvent`, `porm/database/audit/ddl.sql#audit.fn_log_dml` | sink abstraction | `packages/stynx-audit-sql/src/index.ts` | Adapter split | DB function/table naming | SQL incompatibility | P2 |
| Object storage presign | `../porm/backend/src/core/storage/storage.service.ts#presignUpload`, `../pec/src/storage/storage.service.ts#presignUpload`, `../sgp/source/backend/src/documents/documents-storage.service.ts#createPresignedUpload` | upload/download presign contract | `packages/stynx-contracts/src/storage.ts`, `packages/stynx-storage-s3/src/index.ts` | Normalize | key strategy, ACL rules | upload failures | P2 |
| Metadata repository boundary | `../porm/backend/src/core/storage/*document-record.service.ts`, `../pec/src/pec/documents/documents.service.ts`, `../sgp/source/backend/src/documents/documents.service.ts` | CRUD interface only | `packages/stynx-contracts/src/storage.ts#DocumentMetadataRepository` | Interface only | domain ownership and lifecycle | over-generalization | P2 |
| Identity admin provider operations | `../porm/backend/src/core/admin/users/users.service.ts`, `../pec/src/admin/users/cognito-users.service.ts` | generic Cognito admin operations | `packages/stynx-contracts/src/identity-admin.ts`, `packages/stynx-auth-cognito-admin/src/index.ts` | Converge + normalize | local DB sync/meta enrichment | API drift between apps | P1 |

## Explicit Extractions Deferred
- Frontend shared package: deferred until backend package adoption stabilizes.

## Non-Extractables
- Permission catalogs in `../sgp/source/backend/src/iam/permissions/permission-catalog.ts`.
- Role policy constants in `../pec/src/@core/security/role-policies.ts`.
- PORM flow/business policy engine in `../porm/backend/src/flow/services/flow-policy.service.ts`.
- PORM local identity sync/meta operations in `../porm/backend/src/core/admin/users/users.service.ts` (`syncToLocal`, `syncUser`, `listGroupsWithMetaByUserId`, `resolveUserGroupLookup`).
