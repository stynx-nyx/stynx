# GAP-005 — Storage: S3 Object Lock, Lifecycle Rules, Presign Rate Limiting

**Priority:** MEANINGFUL  
**Package:** `packages/storage` (`@stynx/storage-s3`)  
**Source of truth:** porm's S3 compliance configuration  
**Run from:** `./stynx` repo root

---

## Context

`@stynx/storage-s3` presigns upload/download URLs and manages documents but
has no support for:

1. **S3 Object Lock** — compliance buckets require WORM retention so documents
   cannot be deleted or overwritten during the lock period (legal hold, GOVERNANCE
   or COMPLIANCE mode).
2. **Lifecycle rules** — without automatic transitions, old objects stay in
   S3 Standard indefinitely. porm moves objects to IA at 30 days, Glacier at
   180 days, and hard-deletes non-locked objects at 3 650 days.
3. **Presign rate limiting** — any caller can generate unlimited presigned URLs,
   creating a potential enumeration or exfiltration vector. porm gates presigns
   per tenant per minute.

---

## Goal

Add `configureLifecycle()`, `enableObjectLock()`, and rate-limited
`presignDownload()` to `S3Service`. The new methods are opt-in via module
options so existing consumers are unaffected.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `packages/storage/src/types.ts`
- `packages/storage/src/s3.service.ts`
- `packages/storage/src/storage.module.ts`
- `packages/storage/src/index.ts`
- `packages/storage/src/tokens.ts`

---

## Step 2 — Add new types to `packages/storage/src/types.ts`

Append after the existing type definitions:

```typescript
export type S3ObjectLockMode = 'GOVERNANCE' | 'COMPLIANCE';

export interface S3ObjectLockConfig {
  /** Lock mode applied to newly uploaded objects. */
  mode: S3ObjectLockMode;
  /** Retention period in days. */
  retainDays: number;
}

export interface S3LifecycleRule {
  /** Human-readable name. Also used as the S3 rule ID. */
  name: string;
  /** Days after object creation to transition to S3 Standard-IA. */
  transitionToIaDays?: number;
  /** Days after object creation to transition to S3 Glacier. */
  transitionToGlacierDays?: number;
  /** Days after object creation to expire (delete) the object. Only applies to
   *  non-locked objects. Lock-protected objects will be skipped by S3. */
  expirationDays?: number;
  /** Optional key prefix filter. If absent, applies to all objects. */
  prefix?: string;
}

export interface PresignRateLimitOptions {
  /** Max presign calls per tenant per minute. Default: 60. */
  maxPerMinute: number;
}

export interface S3ComplianceOptions {
  objectLock?: S3ObjectLockConfig;
  lifecycle?: S3LifecycleRule[];
  presignRateLimit?: PresignRateLimitOptions;
}
```

Add `compliance?: S3ComplianceOptions` to `StynxStorageModuleOptions`:

```typescript
export interface StynxStorageModuleOptions {
  environment: string;
  region: string;
  kmsAlias: string;
  collections: Record<string, StorageCollectionConfig>;
  bucketName?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  uploadExpiresInSeconds?: number;
  downloadExpiresInSeconds?: number;
  compliance?: S3ComplianceOptions; // ADD
}
```

---

## Step 3 — Add methods to `S3Service` in `packages/storage/src/s3.service.ts`

### 3a — Import new AWS SDK commands at the top

```typescript
import {
  // existing imports …
  PutBucketLifecycleConfigurationCommand,
  PutObjectRetentionCommand,
  type LifecycleRule,
  type ObjectLockRetention,
} from '@aws-sdk/client-s3';
```

### 3b — Add in-memory presign rate limiter

Add a private field and helper inside `S3Service`:

```typescript
private readonly presignCounts = new Map<string, { count: number; windowStart: number }>();

private checkPresignRateLimit(tenantId: string): void {
  const limit = this.options.compliance?.presignRateLimit?.maxPerMinute ?? 60;
  const now = Date.now();
  const windowMs = 60_000;
  const entry = this.presignCounts.get(tenantId);
  if (!entry || now - entry.windowStart >= windowMs) {
    this.presignCounts.set(tenantId, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= limit) {
    throw new StorageValidationError(
      `Presign rate limit exceeded for tenant ${tenantId}: ${limit} per minute`,
      { tenantId, limit },
    );
  }
  entry.count += 1;
}
```

### 3c — Add `presignDownloadForTenant()`

```typescript
async presignDownloadForTenant(input: {
  key: string;
  tenantId: string;
  expiresInSeconds?: number;
}): Promise<string> {
  this.checkPresignRateLimit(input.tenantId);
  const command = new GetObjectCommand({
    Bucket: this.bucketName,
    Key: input.key,
  });
  return getSignedUrl(this.client, command, {
    expiresIn: input.expiresInSeconds ?? this.downloadExpiresInSeconds,
  });
}
```

### 3d — Add `configureLifecycle()`

```typescript
async configureLifecycle(rules: S3LifecycleRule[]): Promise<void> {
  const awsRules: LifecycleRule[] = rules.map((r) => ({
    ID: r.name,
    Status: 'Enabled',
    ...(r.prefix !== undefined ? { Filter: { Prefix: r.prefix } } : { Filter: {} }),
    Transitions: [
      ...(r.transitionToIaDays !== undefined
        ? [{ Days: r.transitionToIaDays, StorageClass: 'STANDARD_IA' as const }]
        : []),
      ...(r.transitionToGlacierDays !== undefined
        ? [{ Days: r.transitionToGlacierDays, StorageClass: 'GLACIER' as const }]
        : []),
    ],
    ...(r.expirationDays !== undefined ? { Expiration: { Days: r.expirationDays } } : {}),
  }));

  await this.client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: this.bucketName,
      LifecycleConfiguration: { Rules: awsRules },
    }),
  );
}
```

### 3e — Add `applyObjectLock()`

```typescript
async applyObjectLock(
  key: string,
  versionId: string,
  config: S3ObjectLockConfig,
): Promise<void> {
  const retainUntil = new Date(
    Date.now() + config.retainDays * 24 * 60 * 60 * 1000,
  );
  const retention: ObjectLockRetention = {
    Mode: config.mode,
    RetainUntilDate: retainUntil,
  };
  await this.client.send(
    new PutObjectRetentionCommand({
      Bucket: this.bucketName,
      Key: key,
      VersionId: versionId,
      Retention: retention,
    }),
  );
}
```

---

## Step 4 — Export new types from `packages/storage/src/index.ts`

The existing `export * from './types'` already covers all new additions.
Confirm after build:

```bash
pnpm --filter @stynx/storage build && node -e "const m = require('./packages/storage/dist'); console.log(Object.keys(m))" | tr ',' '\n' | grep -iE "lock|lifecycle|presign"
```

---

## Step 5 — Add unit test

In `test/packages/` add `storage-compliance.test.ts`:

```typescript
// 1. Instantiate S3Service with a mock S3Client (Vitest.fn() on send)
// 2. Call presignDownloadForTenant() twice with the same tenantId within a window
//    of 60 requests — expect no error
// 3. Call presignDownloadForTenant() 61 times within a window — expect
//    StorageValidationError with "rate limit exceeded"
// 4. Call configureLifecycle() — verify send was called with
//    PutBucketLifecycleConfigurationCommand and the correct rule shape
// 5. Call applyObjectLock() — verify send was called with
//    PutObjectRetentionCommand and RetainUntilDate ≈ now + retainDays
```

---

## Verification

```bash
# TypeScript builds
pnpm --filter @stynx/storage build

# Unit tests pass
pnpm --filter @stynx/storage test

# Lint clean
pnpm --filter @stynx/storage lint
```

---

## Acceptance criteria

- [ ] `S3ObjectLockConfig`, `S3LifecycleRule`, `PresignRateLimitOptions`, `S3ComplianceOptions` exported from `@stynx/storage`
- [ ] `StynxStorageModuleOptions` accepts `compliance` without breaking existing consumers
- [ ] `S3Service.presignDownloadForTenant()` enforces per-tenant-per-minute cap
- [ ] `S3Service.configureLifecycle()` emits correct IA / Glacier / expiration rules
- [ ] `S3Service.applyObjectLock()` sets WORM retention with correct expiry
- [ ] Unit test covers rate-limit enforcement and AWS command shapes
- [ ] `pnpm build`, `pnpm test:unit`, `pnpm lint` all green
