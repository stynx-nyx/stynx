---
title: '@stynx-nyx/tenancy'
---

# @stynx-nyx/tenancy

Tenant resolution, membership validation, tenant lifecycle services, platform-admin guards, and lifecycle system-operation recording.

## Purpose

Tenant resolution, membership validation, tenant lifecycle services, platform-admin guards, and lifecycle system-operation recording.

## Install And Import

```ts
import {} from /* public exports */ '@stynx-nyx/tenancy';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx-nyx/*` versions from the same release train.

## Module Setup

Import `StynxTenancyModule` before tenant-scoped feature modules.

```ts
@Module({
  imports: [StynxTenancyModule.forRoot({ membershipCache, prefixProvisioner })],
})
export class TenancyHostModule {}
```

## Data And Security Model

Tenant state is the hard access gate for request validation and RLS-adjacent checks. Optional paths such as health, metrics, JWKS, and session bootstrap stay outside tenant resolution.

## Example

```ts
import { TenancyService } from '@stynx-nyx/tenancy';

const tenant = await tenancy.provisionTenant({ slug, displayName, requestedBy });
```

## Public API

- StynxTenancyModule
- TenancyService
- TenantContextInterceptor
- membership cache
- platform admin guard
- tenant system operation sink
- tokens, types, and utils

Current barrel highlights:

- `export * from './membership-cache'`
- `export * from './tenant-context.interceptor'`
- `export * from './tenant-system-operation.sink'`
- `export * from './tenancy.controller'`
- `export * from './tenancy.module'`
- `export * from './tenancy.platform-admin.guard'`
- `export * from './tenancy.service'`
- `export * from './tokens'`
- `export * from './types'`
- `export * from './utils'`

## Verification

```sh
pnpm --filter @stynx-nyx/tenancy build
pnpm --filter @stynx-nyx/tenancy test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/tenancy test:int
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
- [docs/meta/ops/runbooks/tenant-suspension.md](../../docs/meta/ops/runbooks/tenant-suspension.md)
- [docs/meta/security/README.md](../../docs/meta/security/README.md)
