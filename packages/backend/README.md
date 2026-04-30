# @stynx/backend

Compatibility aggregation package that re-exports shared backend modules for reference applications.

## Public API

- `export * from '@stynx/contracts'`
- `export * from './common/request-context'`
- `export * from './auth/constants'`
- `export * from './auth/default-principal-mapper'`
- `export * from './auth/current-principal.decorator'`
- `export * from './auth/auth-context.guard'`
- `export * from './auth/auth.module'`
- `export * from './auth/required-tenant-header.resolver'`
- `export * from './auth/claim-first-tenant-entitlement.policy'`
- `export * from './auth/sql-tenant-entitlement.fallback'`
- `export * from './authorization/constants'`
- `export * from './authorization/decorators'`
- `export * from './authorization/default-policy-evaluator'`
- `export * from './authorization/authorization.guard'`
- `export * from './authorization/authorization.module'`
- `export * from './audit/constants'`
- `export * from './audit/decorators'`
- `export * from './audit/audit.interceptor'`
- `export * from './audit/audit.module'`
- `export * from './audit/redaction-policy'`
- `export * from './db-context/constants'`
- `export * from './db-context/request-db-client-lifecycle'`
- `export * from './db-context/tenant-lifecycle.middleware'`
- `export * from './db-context/pg-session-db-context.applier'`
- `export * from './db-context/db-context.interceptor'`
- `export * from './db-context/db-context.module'`
- `export * from './storage/constants'`
- `export * from './storage/storage.module'`
- `export {`
- `export {`
- `export {`
- `export {`
- `export * from './sla/constants'`
- `export * from './sla/types'`
- `export * from './sla/default-sla-category.resolver'`
- `export * from './sla/logger-sla-event.sink'`
- `export * from './sla/sla-monitor.interceptor'`
- `export * from './sla/sla.module'`
- `export * from './pipeline/platform-pipeline.module'`
- `export * from './identity-admin/constants'`
- `export * from './identity-admin/identity-admin.module'`
- `export * from './identity-admin/identity-admin.service'`
- `export * from './identity-admin/integration-facades'`
- `export * from './identity-admin/pg-local-sync.adapter'`

## Peer Dependencies

- `@nestjs/common` ^11.1.19
- `@nestjs/core` ^11.1.19
- `reflect-metadata` ^0.2.2
- `rxjs` ^7.8.2

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 0.2.0           | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [STYNX Spec section 3](../../specs/STYNX-SPEC-v0.6.md)
- [Package README template](../../docs/templates/package-README.md)
