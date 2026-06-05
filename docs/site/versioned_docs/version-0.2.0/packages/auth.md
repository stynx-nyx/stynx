---
title: '@stynx/auth'
---

# @stynx/auth

Authentication, authorization guards, permission caches, Cognito validation, and auth runtime primitives for tenant-aware APIs.

## Purpose

Authentication, authorization guards, permission caches, Cognito validation, and auth runtime primitives for tenant-aware APIs.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/auth';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxAuthModule` near the start of the HTTP pipeline and provide token validation, permission lookup, and optional cache backends.

```ts
@Module({
  imports: [
    StynxAuthModule.forRoot({
      issuer,
      audience,
      permissionCacheBackend,
    }),
  ],
})
export class AuthHostModule {}
```

## Data And Security Model

Validates principals and permissions before route handlers execute. Permission cache data may use Redis and database lookups, but idempotency integration is limited to the documented decorator-only exception for pre-session auth endpoints.

## Example

```ts
import { Permission, StynxAuthGuard } from '@stynx/auth';

@UseGuards(StynxAuthGuard)
@Permission('records.read')
@Get('/records')
listRecords() {}
```

## Layering Note

`@stynx/auth` intentionally depends on `@stynx/idempotency` only for the
`@NoIdempotent()` decorator used on session/authentication endpoints. This is
a documented exception to the strict package DAG: auth routes must opt out of
mutation idempotency before a STYNX session exists, while the runtime
idempotency interceptor still lives above auth in the HTTP pipeline. Keep this
edge decorator-only; do not import idempotency stores, interceptors, or module
providers into auth.

## Public API

- StynxAuthModule
- StynxAuthGuard and PermissionGuard
- CognitoTokenVerifier and Cognito admin adapter
- PermissionCache with Redis and in-memory backends
- auth decorators, tokens, and types

Current barrel highlights:

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
- See `src/index.ts` for the complete public barrel.

## Verification

```sh
pnpm --filter @stynx/auth build
pnpm --filter @stynx/auth test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/auth test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/framework/arch/developer-documentation.md](../../docs/framework/arch/developer-documentation.md)
- [docs/stynx/package-architecture.md](/docs/narrative/stynx/package-architecture)
- [docs/meta/rfcs/0008-auth-idempotency-layering.md](../../docs/meta/rfcs/0008-auth-idempotency-layering.md)
- [docs/meta/security/README.md](../../docs/meta/security/README.md)
