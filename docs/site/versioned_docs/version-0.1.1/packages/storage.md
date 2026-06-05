---
title: '@stynx/storage'
---

# @stynx/storage

Document metadata, object-store abstraction, S3 access, presigned upload/download, and storage module wiring.

## Purpose

Document metadata, object-store abstraction, S3 access, presigned upload/download, and storage module wiring.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/storage';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxStorageModule` after data, tenancy, auth, and audit context are configured.

```ts
@Module({
  imports: [StynxStorageModule.forRoot({ collections, objectStore })],
})
export class StorageHostModule {}
```

## Data And Security Model

Stores document metadata in PostgreSQL and object bytes through the configured store, usually S3. Access must remain tenant-scoped and audited; privacy exports consume storage abstractions rather than direct S3 imports.

## Example

```ts
import { DocumentsService } from '@stynx/storage';

const upload = await documents.initiateUpload({ tenantId, collection, filename });
```

## Public API

- DocumentsService
- ObjectStoreService contracts
- S3Service
- StynxStorageModule
- tokens, errors, and types

Current barrel highlights:

- `export * from './documents.service'`
- `export * from './errors'`
- `export * from './object-store.service'`
- `export * from './s3.service'`
- `export * from './storage.module'`
- `export * from './tokens'`
- `export * from './types'`

## Verification

```sh
pnpm --filter @stynx/storage build
pnpm --filter @stynx/storage test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/storage test:int
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
- [docs/ops/recovery/kms-key-recovery.md](/docs/ops/recovery/kms-key-recovery)
- [docs/security/README.md](/docs/security)
