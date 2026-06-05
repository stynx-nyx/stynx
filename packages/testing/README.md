# @stynx/testing

Reusable integration-test harnesses, fixtures, archive-aware matchers, LGPD fixtures, and session helpers for STYNX consumers.

## Purpose

Reusable integration-test harnesses, fixtures, archive-aware matchers, LGPD fixtures, and session helpers for STYNX consumers.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/testing';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

No production NestJS module setup is required. Import helpers from test code only.

## Data And Security Model

May start local PostgreSQL, Redis, LocalStack, or Cognito test services. Test helpers must not leak production credentials and should default to disposable databases or containers.

## Example

```ts
import { createTestApp, expectArchivedRow } from '@stynx/testing';

const app = await createTestApp({ imports: [FeatureModule] });
expectArchivedRow(result).toMatchObject({ deletedBy: actorId });
```

## Public API

- context helpers
- createTestApp
- doctor helpers
- fixtures and LGPD fixture
- archive-aware matchers
- mintTestSession
- test harness types

Current barrel highlights:

- `export * from './context'`
- `export * from './create-test-app'`
- `export * from './doctor'`
- `export * from './fixtures'`
- `export * from './lgpd-fixture'`
- `export * from './matchers'`
- `export * from './mint-test-session'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx/testing build
pnpm --filter @stynx/testing test
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
