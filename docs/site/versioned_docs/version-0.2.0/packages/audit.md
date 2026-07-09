---
title: '@stynx-nyx/audit'
---

# @stynx-nyx/audit

Audit logging, SQL audit readers, retention planning, and audit evidence helpers for tenant-aware STYNX services.

## Purpose

Audit logging, SQL audit readers, retention planning, and audit evidence helpers for tenant-aware STYNX services.

## Install And Import

```ts
import {} from /* public exports */ '@stynx-nyx/audit';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx-nyx/*` versions from the same release train.

## Module Setup

Import `StynxAuditModule` after `@stynx-nyx/core`, `@stynx-nyx/data`, and authentication/tenancy context are available.

```ts
@Module({
  imports: [
    StynxAuditModule.forRoot({
      archiveStore,
      dumpRunner,
    }),
  ],
})
export class AuditHostModule {}
```

## Data And Security Model

Writes and reads audit evidence through the platform database. Curated-table DML audit triggers are owned by migrations; this package owns runtime audit APIs, chain verification, retention planning, and archive/dump integration points.

## Example

```ts
import { StynxAuditService } from '@stynx-nyx/audit';

await audit.log({
  tenantId,
  actorId,
  action: 'document.download',
  resourceType: 'storage.document',
  resourceId: documentId,
});
```

## Public API

- StynxAuditModule
- StynxAuditService
- AuditSqlSink and SQL reader helpers
- retention planning types
- audit test helpers

Current barrel highlights:

- `export * from './audit.controller'`
- `export * from './audit.module'`
- `export * from './audit.service'`
- `export * from './retention'`
- `export * from './sql-adapter'`
- `export * from './test-helpers'`
- `export * from './tokens'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx-nyx/audit build
pnpm --filter @stynx-nyx/audit test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx-nyx/audit test:int
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
- [docs/meta/ops/runbooks/flow.md](../../docs/meta/ops/runbooks/flow.md)
- [docs/meta/security/README.md](../../docs/meta/security/README.md)
