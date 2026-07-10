# `@stynx-nyx/storage` — S3-backed object storage with presign + document-metadata persistence

`@stynx-nyx/storage` is STYNX's object-storage substrate. It implements `@stynx-nyx/contracts`'s `ObjectStorageService` against S3 (production) or LocalStack (dev), exposes presigned upload/download URLs (so client browsers can talk directly to S3 without the API in the data path), and persists document metadata (filename, size, content-type, uploader) via a `DocumentMetadataRepository` so app code can list/lookup documents without re-querying S3.

## Purpose

File uploads in multi-tenant apps need: tenant-scoped key prefixes, presigned URLs (clients don't proxy through the API), KMS encryption knobs, and a metadata repo so the app can list user files without hitting S3 every time. `@stynx-nyx/storage` provides all of this.

You reach for it whenever your app stores user files (documents, avatars, exports).

What it does NOT do: it doesn't run a virus scanner (use an S3 event + Lambda). It doesn't auto-resize images (use Lambda@Edge or CloudFront image-optim). It doesn't proxy uploads through the API (use presigned URLs — proxying defeats S3's scaling).

## Audience

Backend developers building file-upload features.

## Install

```bash
pnpm add @stynx-nyx/storage @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/contracts` `^1`, `@aws-sdk/client-s3` `^3`, `@aws-sdk/s3-request-presigner` `^3`.

## Quick start

```ts
import { StynxStorageModule } from '@stynx-nyx/storage';

StynxStorageModule.forRoot({
  s3: { region: 'us-east-1', bucket: 'my-app-docs' },
  keyStrategy: 'tenant-prefixed',
  presignTtl: '15m',
});
```

```ts
import { StorageService } from '@stynx-nyx/storage';

@Injectable()
export class DocumentsService {
  constructor(private readonly storage: StorageService) {}

  async getUploadUrl(filename: string, contentType: string) {
    return this.storage.presignUpload({ key: filename, contentType });
  }
}
```

## Public API surface

### Modules

| Export               | Signature                                | Description                                                   |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `StynxStorageModule` | `.forRoot(options: StynxStorageOptions)` | Registers S3 client, presign service, document metadata repo. |

### Services / Injectables

| Export                                             | Description                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageService` (the `ObjectStorageService` impl) | `presignUpload(req): PresignedUploadResponse`, `presignDownload(req): PresignedDownloadResponse`, `exists(key): boolean`, `delete(key): void`. |
| `DocumentsService`                                 | Persists `DocumentMetadataRecord` rows. `create(record)`, `getById(id)`, `deleteById(id)`.                                                     |
| `ObjectStoreService`                               | Lower-level S3 wrapper; rarely used directly.                                                                                                  |
| `S3Service`                                        | Even-lower S3 client; for direct S3 ops outside the presign flow.                                                                              |

### Errors

| Export                     | Code                    | Description                                  |
| -------------------------- | ----------------------- | -------------------------------------------- |
| `ObjectNotFoundError`      | `OBJECT_NOT_FOUND`      | `exists()` returned false / `getObject` 404. |
| `StorageAccessDeniedError` | `STORAGE_ACCESS_DENIED` | IAM rejection.                               |
| `PresignFailedError`       | `PRESIGN_FAILED`        | Could not produce a presigned URL.           |

### Types / Interfaces

| Export                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `StynxStorageOptions` | `forRoot()` options.                                     |
| `KeyStrategy`         | `'tenant-prefixed' \| 'flat' \| ((req, ctx) => string)`. |

## Configuration

### `StynxStorageModule.forRoot()` options

| Option                       | Type          | Default             | Description                         |
| ---------------------------- | ------------- | ------------------- | ----------------------------------- |
| `s3.bucket`                  | `string`      | (required)          | Bucket name.                        |
| `s3.region`                  | `string`      | `'us-east-1'`       | AWS region.                         |
| `s3.endpoint`                | `string`      | n/a                 | Custom endpoint (LocalStack dev).   |
| `s3.kmsKeyId`                | `string`      | n/a                 | KMS key for server-side encryption. |
| `keyStrategy`                | `KeyStrategy` | `'tenant-prefixed'` | How keys are computed.              |
| `presignTtl`                 | `string`      | `'15m'`             | Default presign TTL.                |
| `documentMetadata.tableName` | `string`      | `'stynx_documents'` | Metadata table.                     |

## Examples

### Example 1 — direct-to-S3 upload flow

```ts
// Client requests a presigned URL from your API
const presign = await api.getUploadUrl({ filename: 'invoice.pdf', contentType: 'application/pdf' });

// Client uploads directly to S3
await fetch(presign.url, { method: 'PUT', body: file, headers: presign.headers });

// Client notifies your API the upload completed; you write metadata
await api.confirmUpload({ storageKey: presign.key, filename: 'invoice.pdf' });
```

### Example 2 — LocalStack dev

```ts
StynxStorageModule.forRoot({
  s3: {
    endpoint: 'http://localhost:4566',
    region: 'us-east-1',
    bucket: 'my-app-docs',
    forcePathStyle: true,
  },
});
```

### Example 3 — KMS encryption

```ts
StynxStorageModule.forRoot({
  s3: { region: 'us-east-1', bucket: 'my-app-docs', kmsKeyId: 'arn:aws:kms:...' },
});
```

## Common pitfalls

- **Tenant prefix collision** with the `'flat'` strategy across tenants — use `'tenant-prefixed'` (default) or a custom function.
- **Presign TTL too short** — clients with slow networks fail; bump to 30m+ for large uploads.
- **Forgetting CORS on the bucket** — direct-to-S3 PUT fails the browser preflight. Configure bucket CORS to allow the API's origin.
- **Returning the storage key to clients as the canonical identifier** — couples your URLs to S3's key shape. Return the metadata record's `id` instead.
- **`StorageService.delete()` without checking existence** — silently no-ops if the object is gone; some callers expect an error. Wrap with `exists()` first.

## Related packages

- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — defines `ObjectStorageService` + `PresignedUploadRequest`/`Response`.
- [`@stynx-nyx/tenancy`](/docs/packages/tenancy/) — provides tenant-prefix data for `keyStrategy: 'tenant-prefixed'`.
- [`@stynx-nyx/privacy`](/docs/packages/privacy/) — uses this package for export packaging.
- [`@stynx-nyx/angular-storage`](/docs/packages-web/angular-storage/) — Angular pair: file-upload widget consuming the presign flow.
- [`backend/storage`](/docs/packages/backend/storage/) — `@stynx-nyx/backend` submodule.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-storage/`](/docs/api-reference/stynx-storage/)
