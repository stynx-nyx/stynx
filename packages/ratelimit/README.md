# @stynx/ratelimit

Request throttling primitives, policy resolution, durable rate-limit stores, Redis sliding-window store, and guard wiring.

## Purpose

Request throttling primitives, policy resolution, durable rate-limit stores, Redis sliding-window store, and guard wiring.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/ratelimit';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxRateLimitModule` before controllers that use rate-limit decorators.

```ts
@Module({
  imports: [StynxRateLimitModule.forRoot({ store, policyResolver })],
})
export class RateLimitHostModule {}
```

## Data And Security Model

Decisions can be scoped by IP, tenant, user, and route. Stores must preserve tenant isolation and avoid exposing rate-limit state across tenants.

## Example

```ts
import { RateLimit } from '@stynx/ratelimit';

@RateLimit({ bucket: 'tenant', limit: 120, windowSeconds: 60 })
@Post('/records')
createRecord() {}
```

## Public API

- StynxRateLimitModule
- RateLimitGuard
- RateLimit decorator
- DatabaseRateLimitPolicyResolver
- PgRateLimitStore
- RedisSlidingWindowRateLimitStore
- metrics, tokens, request context, and types

Current barrel highlights:

- `export * from './constants'`
- `export * from './decorators'`
- `export * from './metrics'`
- `export * from './pg-rate-limit.store'`
- `export * from './rate-limit-policy.service'`
- `export * from './rate-limit.guard'`
- `export * from './rate-limit.module'`
- `export * from './redis-rate-limit.store'`
- `export * from './request-context'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx/ratelimit build
pnpm --filter @stynx/ratelimit test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/ratelimit test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/framework/arch/developer-documentation.md](../../docs/framework/arch/developer-documentation.md)
- [docs/stynx/package-architecture.md](../../docs/stynx/package-architecture.md)
- [docs/meta/security/README.md](../../docs/meta/security/README.md)
