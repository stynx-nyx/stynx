---
title: '@stynx-nyx/idempotency'
---

# @stynx-nyx/idempotency

Mutation idempotency primitives, response replay, durable stores, Redis backend, and HTTP interceptor wiring.

## Purpose

Mutation idempotency primitives, response replay, durable stores, Redis backend, and HTTP interceptor wiring.

## Install And Import

```ts
import {} from /* public exports */ '@stynx-nyx/idempotency';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx-nyx/*` versions from the same release train.

## Module Setup

Import `StynxIdempotencyModule` above mutation controllers and configure a store/backend.

```ts
@Module({
  imports: [StynxIdempotencyModule.forRoot({ store, backend })],
})
export class IdempotencyHostModule {}
```

## Data And Security Model

Stores idempotency keys and replay envelopes by tenant/user/request context. Auth/session bootstrap routes can opt out with the documented decorator exception.

## Example

```ts
import { Idempotent } from '@stynx-nyx/idempotency';

@Idempotent({ scope: 'tenant' })
@Post('/records')
createRecord() {}
```

## Public API

- StynxIdempotencyModule
- IdempotencyInterceptor
- DatabaseIdempotencyStore
- PgIdempotencyStore
- RedisIdempotencyBackend
- decorators, metrics, request context, tokens, and types

Current barrel highlights:

- `export * from './constants'`
- `export * from './database-idempotency.store'`
- `export * from './decorators'`
- `export * from './idempotency.interceptor'`
- `export * from './idempotency.module'`
- `export * from './metrics'`
- `export * from './pg-idempotency.store'`
- `export * from './redis-idempotency.backend'`
- `export * from './request-context'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx-nyx/idempotency build
pnpm --filter @stynx-nyx/idempotency test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/idempotency test:int
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
- [docs/rfcs/0008-auth-idempotency-layering.md](/docs/rfcs/0008-auth-idempotency-layering)
