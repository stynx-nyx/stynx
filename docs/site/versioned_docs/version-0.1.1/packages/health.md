---
title: '@stynx-nyx/health'
---

# @stynx-nyx/health

Health, readiness, metrics, and guarded info endpoints for STYNX services.

## Purpose

Health, readiness, metrics, and guarded info endpoints for STYNX services.

## Install And Import

```ts
import {} from /* public exports */ '@stynx-nyx/health';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx-nyx/*` versions from the same release train.

## Module Setup

Import `StynxHealthModule` after metrics and dependency indicators are available.

```ts
@Module({
  imports: [StynxHealthModule.forRoot({ indicators })],
})
export class HealthHostModule {}
```

## Data And Security Model

Exposes operational health and Prometheus-style metrics. Info endpoints must stay guarded; metrics access should follow the reference app and infrastructure controls.

## Example

```ts
import { StynxMetricsService } from '@stynx-nyx/health';

metrics.observeHttpRequest({ method: 'GET', route: '/records', statusCode: 200, durationMs: 12 });
```

## Public API

- HealthController
- StynxHealthModule
- StynxHealthService
- InfoGuard
- StynxMetricsService
- health indicator tokens and types

Current barrel highlights:

- `export * from './health.controller'`
- `export * from './health.module'`
- `export * from './health.service'`
- `export * from './info.guard'`
- `export * from './metrics.service'`
- `export * from './tokens'`

## Verification

```sh
pnpm --filter @stynx-nyx/health build
pnpm --filter @stynx-nyx/health test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/health test:int
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
- [docs/ops/README.md](/docs/ops)
