# @stynx/privacy

LGPD privacy exports, PII maps, data-subject export/erasure workflows, retention planning, ROPA generation, and object-store integration.

## Purpose

LGPD privacy exports, PII maps, data-subject export/erasure workflows, retention planning, ROPA generation, and object-store integration.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/privacy';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxPrivacyModule` after data, storage, auth, and audit are configured.

```ts
@Module({
  imports: [StynxPrivacyModule.forRoot({ objectStore, cognitoAdmin })],
})
export class PrivacyHostModule {}
```

## Data And Security Model

Reads PII map metadata, exports live/archive subject data, applies erasure strategies, records audit evidence, and may disable Cognito users through the configured adapter.

## Example

```ts
import { PrivacyService } from '@stynx/privacy';

await privacy.eraseSubject({ tenantId, subjectId, requestedBy });
```

## Public API

- PiiMapService
- PrivacyController
- StynxPrivacyModule
- PrivacyService
- PrivacyObjectStoreService
- ROPA helpers
- tokens, errors, and types

Current barrel highlights:

- `export * from './errors'`
- `export * from './pii-map.service'`
- `export * from './privacy.controller'`
- `export * from './privacy.module'`
- `export * from './privacy.service'`
- `export * from './privacy-object-store.service'`
- `export * from './ropa'`
- `export * from './tokens'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx/privacy build
pnpm --filter @stynx/privacy test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/privacy test:int
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
- [docs/meta/ops/runbooks/lgpd-erasure.md](../../docs/meta/ops/runbooks/lgpd-erasure.md)
