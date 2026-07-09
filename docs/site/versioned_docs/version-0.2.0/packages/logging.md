---
title: '@stynx-nyx/logging'
---

# @stynx-nyx/logging

Structured logging primitives, request logging middleware, Pino factory, and duplicate-log suppression.

## Purpose

Structured logging primitives, request logging middleware, Pino factory, and duplicate-log suppression.

## Install And Import

```ts
import {} from /* public exports */ '@stynx-nyx/logging';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx-nyx/*` versions from the same release train.

## Module Setup

Import `StynxLoggingModule` early in the host module graph.

```ts
@Module({
  imports: [StynxLoggingModule.forRoot({ serviceName: 'reference-api' })],
})
export class LoggingHostModule {}
```

## Data And Security Model

Logs must redact configured sensitive paths and include request/tenant context when available. This package should not persist audit evidence; use @stynx-nyx/audit for audit trails.

## Example

```ts
import { StynxLogger } from '@stynx-nyx/logging';

logger.info({ tenantId, requestId }, 'record created');
```

## Public API

- dedupe helpers
- StynxLogger
- StynxLoggingModule
- createPinoLogger options
- request logging middleware
- tokens and options

Current barrel highlights:

- `export * from './dedupe'`
- `export * from './logger.service'`
- `export * from './logging.module'`
- `export * from './pino.factory'`
- `export * from './request-logging.middleware'`
- `export * from './tokens'`

## Verification

```sh
pnpm --filter @stynx-nyx/logging build
pnpm --filter @stynx-nyx/logging test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/logging test:int
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
- [docs/meta/security/README.md](../../docs/meta/security/README.md)
