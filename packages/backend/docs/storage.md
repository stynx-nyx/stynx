---
title: backend/storage
---

# `StynxBackendStorageModule` — `@stynx/storage` wired with tenant-prefixed S3

Wraps `@stynx/storage` with the canonical backend wiring: S3 (or LocalStack in dev), tenant-prefixed key strategy, document-metadata table backed by `@stynx/data`.

## When to mount

Whenever your app stores user-uploaded files.

## Wiring

```ts
import { StynxBackendStorageModule } from '@stynx/backend';

StynxBackendStorageModule.forRoot({
  s3: { region: 'us-east-1', bucket: 'my-app-docs' },
  keyStrategy: 'tenant-prefixed',
  presignTtl: '15m',
});
```

## Configuration

Forwarded to `@stynx/storage`'s `StynxStorageOptions`. See [`@stynx/storage`](/docs/packages/storage/).

## Common pitfalls

- **Bucket CORS misconfigured** — browser direct-to-S3 uploads fail preflight.
- **Tenant-prefixed strategy + IAM policy that's per-bucket** — IAM grants access to the whole bucket; tenant isolation depends entirely on the prefix. Double-check IAM policies don't grant `*` paths to all tenants.

## Related

- [`@stynx/storage`](/docs/packages/storage/) — the underlying package.
- [`backend/db-context`](/docs/packages/backend/db-context/) — provides DB for document-metadata persistence.
- [`@stynx-web/angular-storage`](/docs/packages-web/angular-storage/) — Angular pair: file upload UI.
