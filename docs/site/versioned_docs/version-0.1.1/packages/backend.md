---
title: '@stynx/backend'
---

# @stynx/backend

Compatibility aggregation package that re-exports shared NestJS backend modules for existing STYNX host applications.

## Purpose

Compatibility aggregation package that re-exports shared NestJS backend modules for existing STYNX host applications.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/backend';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

No separate runtime module is required. Import direct modules from their owning packages for new code, or use this package when a host needs the compatibility barrel.

## Data And Security Model

Does not own database tables or external calls directly. Runtime behavior belongs to the re-exported packages such as auth, audit, idempotency, rate limit, storage, and DB context.

## Example

```ts
import { CurrentPrincipal, RequirePermissions, StynxPlatformPipelineModule } from '@stynx/backend';

@Module({
  imports: [StynxPlatformPipelineModule.forRoot(platformOptions)],
})
export class AppModule {}
```

## Public API

- contracts re-export
- auth/authz decorators and guards
- audit and DB context interceptors
- storage module compatibility exports
- idempotency and rate-limit re-exports
- platform pipeline and identity-admin modules

Current barrel highlights:

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
- See `src/index.ts` for the complete public barrel.

## Verification

```sh
pnpm --filter @stynx/backend build
pnpm --filter @stynx/backend test
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/arch/developer-documentation.md](/docs/arch/developer-documentation)
- [docs/stynx/package-architecture.md](/docs/narrative/stynx/package-architecture)
