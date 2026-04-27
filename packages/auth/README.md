# @stynx/auth

Authentication, authorization guards, permission caches, and Cognito integration for tenant-aware APIs.

## Public API

- `export * from './cognito-token-verifier'`
- `export * from './cognito-admin.adapter'`
- `export * from './actor-context.interceptor'`
- `export * from './auth.controller'`
- `export * from './auth.module'`
- `export * from './auth.service'`
- `export * from './cognito-jwt.validator'`
- `export * from './decorators'`
- `export * from './doctor'`
- `export * from './effective-hash-computer'`
- `export * from './in-memory-permission-cache-backend'`
- `export * from './permission-cache'`
- `export * from './permission-cache-metrics'`
- `export * from './permission.guard'`
- `export * from './permission-query.service'`
- `export * from './redis-permission-cache-backend'`
- `export * from './stynx-auth.guard'`
- `export * from './stynx-jwt.validator'`
- `export * from './tokens'`
- `export * from './types'`

## Peer Dependencies

- `@nestjs/common` ^11.1.19
- `@nestjs/core` ^11.1.19
- `reflect-metadata` ^0.2.2
- `rxjs` ^7.8.2

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 0.1.0           | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [STYNX Spec section 3](../../specs/STYNX-SPEC-v0.6.md)
- [Package README template](../../docs/templates/package-README.md)
