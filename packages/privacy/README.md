# `@stynx-nyx/privacy`

Tenant privacy exports, erasure and retention for NestJS, with PII metadata and a
ROPA Markdown generator. Legal basis, retention policy and provider approval remain
application responsibilities.

## Installation and configuration

```bash
pnpm add @stynx-nyx/privacy
```

Configure the canonical STYNX authentication, sessions, tenancy and data modules
in the host application. Privacy HTTP requires their actual verified tenant and
audit actor; an unsigned tenant header or a manually created RequestContext is
insufficient.

```ts
import { StynxPrivacyModule } from '@stynx-nyx/privacy';

StynxPrivacyModule.forRoot({
  environment: configuredEnvironment,
  region: configuredRegion,
  erasureSalt: configuredPrivacySalt,
  bucketName: configuredPrivacyBucket,
});
```

The variables above come from the application's reviewed configuration. Required
`StynxPrivacyModuleOptions` fields are `environment`, `region` and `erasureSalt`.
Optional fields are `appRoot`, `bucketName`, `endpoint`, `forcePathStyle` and
`exportTtlSeconds` (default 604800 seconds). `forRoot` also accepts configured
`PrivacyObjectStore` and `PrivacyCognitoAdmin` adapters. Without an identity
adapter, global erasure refuses before destructive work. A configured adapter's
shape alone does not establish provider approval or successful real effects.

## Tenant HTTP operations

| Method and path                                    | Permission               | Completed response                                                |
| -------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `POST /privacy/exports`                            | `privacy:subject-rights` | 201: export ID, object key, download URL, expiry and table counts |
| `POST /privacy/erasures`                           | `privacy:subject-rights` | 201: subject ID and per-column live/archive actions               |
| `GET /privacy/retention`, omitted or `dryRun=true` | `privacy:read`           | 200: dry-run actions and `partitions: []`                         |
| `GET /privacy/retention?dryRun=false`              | `privacy:subject-rights` | 200: applied tenant actions and `partitions: []`                  |

Exports accept `{subjectUserId?, tenantId?, format: 'json' | 'csv'}` and require
at least one UUID selector. A supplied tenant must equal the verified tenant.
Erasures accept `{subjectUserId}` as a UUID. Unknown body fields and unsupported
retention query values are rejected. Subject operations require active membership
in the admitted tenant, including when the caller acts on self. The subject is
separate from the verified audit actor.

Operations are synchronous. An export completes its SQL snapshot, uploads its ZIP
and obtains its download URL before returning success. Export ZIPs contain a
manifest plus JSON and CSV members for live and archive rows, regardless of the
compatibility format selector. JSON preserves raw values; CSV neutralizes
formula-capable string and header beginnings before CSV escaping, while keeping
numeric values. Tenant object keys are `exports/<tenant-uuid>/<export-uuid>.zip`.
An expiry value on upload does not itself prove object deletion or a storage
lifecycle policy. Provider failures propagate without a fabricated completed
result or distributed transaction.

Tenant operations use independent restricted reader/app transactions. They do not
elevate to owner, modify global user records, disable shared identities or drop
whole session partitions. Existing held or hidden connections are refused.

## PII rules and erasure

`PiiMapService` merges `core.pii_map` with the server-controlled
`app/privacy/pii-map.yaml` beneath `appRoot`. `PrivacyRule` declares table/schema,
column, `subjectColumn`, optional `tenantColumn`, category/notes and optional
retention metadata. Every rule for one table must agree on its subject and tenant
mapping. Groups without tenant metadata are global and excluded from tenant
operations; tenant completion is not a whole-account export or erasure.

Supported `PrivacyStrategy` values are `nullify`, `hash_with_salt`, `tombstone`
and `delete_row`. Hash replacements use deterministic, domain-separated HMAC-SHA256
with the configured nonempty salt, bound to table, column, subject and tenant scope.
They retain the `hash:` prefix. This is pseudonymization, not anonymity; historical
replacements are not silently rewritten. Nullification requires nullable columns.

Retention rules declare `timestampColumn`, positive `olderThanDays`, optional
`target` (`live`, `archive` or `both`) and reason. Application retains existing
`delete_row` effects; other strategies are reported according to the existing
retention contract.

## Internal global administration and migration

`PrivacyService.exportData`, `eraseSubject` and `applyRetention` are global internal
entrypoints. The caller must establish explicit `SystemContext` with a meaningful
reason outside HTTP, without an existing held transaction. These methods do not
create their own authority. Tenant controllers use `exportTenantData`,
`eraseTenantSubject` and `applyTenantRetention` instead. HTTP origin remains bound
through nested SystemContext and CLS resets; neither grants access to global ports.

Migrate previous global HTTP administration to reviewed internal jobs. Global
identity disable additionally requires an approved real provider/subject mapping.
Global retention defaults to dry-run and retains the existing owner-only session
partition rules, including the database clock, 90-day cutoff and current/next-month
protection. Tenant HTTP retention never performs that partition maintenance.

## Public exports

The package exports `StynxPrivacyModule`, `PrivacyController`, `PrivacyService`,
`PiiMapService`, `PrivacyObjectStoreService`, configuration/provider tokens, request
and result interfaces, rule/retention types, and `PrivacyValidationError` (400,
`PRIVACY_VALIDATION_ERROR`) and `PrivacyConfigurationError` (500,
`PRIVACY_CONFIGURATION_ERROR`). `generateRopaMarkdown` generates ROPA Markdown;
`PrivacyService.generateRopa` obtains rules through the internal metadata lane.
No PII property decorator or asynchronous job API is supplied.

See the repository's privacy administration contract for the exact admission and
independent verification obligations. Actual storage and identity provider
qualification is separate from unit or in-memory adapter tests.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/auth`: `workspace:*`
- `@stynx-nyx/contracts`: `workspace:*`
- `@stynx-nyx/core`: `workspace:*`
- `@stynx-nyx/data`: `workspace:*`
- `@stynx-nyx/idempotency`: `workspace:*`
- `@stynx-nyx/storage`: `workspace:*`
- `jszip`: `^3.10.1`
- `yaml`: `^2.8.3`
- `zod`: `^4.3.6`

### Optional dependencies

_None._

### Peer dependencies

- `@nestjs/common`: `^11.1.19`
- `@nestjs/core`: `^11.1.19`
- `reflect-metadata`: `^0.2.2`
- `rxjs`: `^7.8.2`

### Development-only dependencies

- `@nestjs/platform-express`: `^11.1.26`
- `@nestjs/testing`: `^11.1.26`
- `@stynx-nyx/testing`: `workspace:*`
- `@types/node`: `24.13.4`
- `@types/supertest`: `^7.2.0`
- `supertest`: `^7.2.2`
- `ts-node`: `^10.9.2`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
