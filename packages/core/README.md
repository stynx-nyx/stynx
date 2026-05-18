# @stynx/core

Core runtime primitives for configuration, request context, request IDs, error mapping, secret loading, and system operation context.

## Purpose

Core runtime primitives for configuration, request context, request IDs, error mapping, secret loading, and system operation context.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/core';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxCoreModule` before feature modules that need config, request context, or shared error handling.

```ts
@Module({
  imports: [StynxCoreModule.forRoot({ schema, values })],
})
export class CoreHostModule {}
```

## Data And Security Model

Does not own tenant data, but it provides the request/system context used by other packages to apply tenant, audit, and operational metadata consistently. Secret loading uses AWS SSM/Secrets Manager clients when configured.

## Example

```ts
import { StynxConfigService, getRequestId } from '@stynx/core';

const requestId = getRequestId(request);
const config = configService.get('DATABASE_URL');
```

## Public API

- StynxCoreModule
- StynxConfigService
- database and system context helpers
- request context interceptor and request-id helpers
- secret loader
- shared errors and tokens

Current barrel highlights:

- `export * from './core.module'`
- `export * from './config'`
- `export * from './database'`
- `export * from './error.filter'`
- `export * from './errors'`
- `export * from './request-context'`
- `export * from './request-context.interceptor'`
- `export * from './request-id'`
- `export * from './secret-loader'`
- `export * from './system-context'`
- `export * from './tokens'`

## Verification

```sh
pnpm --filter @stynx/core build
pnpm --filter @stynx/core test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/core test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/architecture/developer-documentation.md](../../docs/architecture/developer-documentation.md)
- [docs/stynx/package-architecture.md](../../docs/stynx/package-architecture.md)
- [docs/architecture/STYNX-SPEC-v0.6.md](../../docs/architecture/STYNX-SPEC-v0.6.md)
