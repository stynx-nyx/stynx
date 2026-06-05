# `@stynx/contracts` — framework-agnostic interfaces shared across `@stynx/*`

`@stynx/contracts` is the _type-only_ package holding the runtime interfaces that cross package boundaries: `Principal` + `AuthVerificationResult` (auth), `DbContext` + `DbSessionContext` (data), `AuditEventEnvelope` + `AuditSink` (audit), `ObjectStorageService` + `PresignedUploadRequest`/`Response` (storage), `TenantResolver` + `TenantEntitlementPolicy` (tenancy), `IdentityAdminService` (admin endpoints), `Permission` + `PermissionPredicate` (authorization), `StynxError` + family (error envelope). It carries no NestJS dependency, no runtime imports beyond a few `Symbol` constants — _pure types and interfaces_. Every other `@stynx/*` package implements these, and integrators who want to provide a custom backend for any of them (custom storage, custom auth verifier, custom audit sink) implement the matching interface here.

## Purpose

`@stynx/contracts` solves the _cross-package contract_ problem: every `@stynx/*` package that exposes a swap-out point (audit sink, storage adapter, db-context applier, tenant resolver, identity admin backend) needs a contract that consumers can implement. If each package defined its own interface, custom adapters would couple to a specific package version. Centralising the contracts here lets `@stynx/storage`, `@stynx/audit`, `@stynx/auth`, `@stynx/data`, `@stynx/tenancy` all consume + implement a single source of truth.

You reach for `@stynx/contracts` when you are: (a) authoring a custom adapter for a `@stynx/*` package (e.g. a different storage backend), (b) writing typed DTOs that flow through `@stynx/*` packages and need to use the canonical `Principal` / `RequestActor` shape, or (c) authoring a sibling package that needs to typed-consume `@stynx/*` outputs without taking a runtime dependency.

What it does NOT do: no runtime behaviour. It exports interfaces, types, and a handful of error classes. There is no `forRoot()`, no DI tokens (those live in the implementer packages), no global registration.

## Audience

NestJS backend developers in two scenarios: (1) you're authoring a custom adapter for a `@stynx/*` swap-out (e.g. a Vault-backed `SecretLoader`, an Azure-backed `ObjectStorageService`, a Postgres-direct `DbContextApplier`) — you implement the contract from this package and inject it via the corresponding `@stynx/*` package's DI slot. (2) You're authoring a sibling package or a cross-cutting service that types its input/output against the canonical `Principal` / `AuditEventEnvelope` / `RequestActor` shape — you import the type and skip the runtime dependency.

## Install

```bash
pnpm add @stynx/contracts
```

**No peer dependencies.** This package has no runtime imports of NestJS, Angular, Drizzle, AWS SDKs, or any other library. Safe to consume from sibling packages, frontend code, or standalone scripts.

**Node:** 24.x. **TS target:** ES2022.

## Quick start

```ts
// Authoring a custom ObjectStorageService backed by a different bucket provider
import type {
  ObjectStorageService,
  PresignedUploadRequest,
  PresignedUploadResponse,
  PresignedDownloadRequest,
  PresignedDownloadResponse,
} from '@stynx/contracts';

export class MyCustomStorageService implements ObjectStorageService {
  async presignUpload(input: PresignedUploadRequest): Promise<PresignedUploadResponse> {
    // ... your provider's presigning logic
    return { method: 'PUT', url: '...', expiresInSeconds: 3600 };
  }
  async presignDownload(input: PresignedDownloadRequest): Promise<PresignedDownloadResponse> {
    return { url: '...', expiresInSeconds: 3600 };
  }
  async exists(key: string): Promise<boolean> {
    return false;
  }
}
```

Then wire your implementation in via `@stynx/storage`'s `StynxStorageModule.forRoot({ implementation: MyCustomStorageService })`.

## Public API surface

### Auth contracts

| Export                    | Description                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Principal`               | Canonical authenticated identity: `{ id, username?, email?, roles, permissions, tenants, claims }`. Every `@stynx/auth` verifier returns one of these. |
| `PrincipalId`             | Type alias for `string`; nominal hint for IDs flowing through APIs.                                                                                    |
| `AuthVerificationResult`  | `{ principal, token, issuedAt?, expiresAt?, tokenUse? }` — what a JWT verifier returns.                                                                |
| `RequestPrincipalContext` | `{ principal, tenantId?, correlationId? }` — request-attached identity context.                                                                        |
| `AuthVerifier`            | `verify(token: string): Promise<AuthVerificationResult>` — implementer interface for custom JWT verifiers (Cognito, Auth0, custom).                    |

### Authorization contracts

| Export                      | Description                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Permission`                | `string` alias — permission-name token. Convention: `<resource>:<verb>` e.g. `'users:read'`.           |
| `PermissionPredicate`       | Function `(principal, context) => boolean \| Promise<boolean>` for custom predicate-based permissions. |
| `AuthorizationRequirements` | Per-route required-permission declaration consumed by `@stynx/auth`'s guard.                           |

### Audit contracts

| Export               | Description                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AuditEventEnvelope` | Canonical audit-event shape: `{ occurredAt, action, entity, entityId?, tenantId?, actorId?, oldData?, newData?, ... }`.                                                        |
| `AuditSink`          | `write(event: AuditEventEnvelope): Promise<void>` — sink interface. Default impl is the SQL sink in `@stynx/audit`; custom impls (CloudWatch, file-tail, etc.) implement this. |

### DB-context contracts

| Export                      | Description                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DbSessionContext`          | Request-scoped DB-session metadata: `{ userId?, roles?, permissions?, tenantId?, correlationId?, requestId?, extras? }`. Used by RLS-aware Drizzle queries.                             |
| `DbContextApplier<TClient>` | `apply(client: TClient, context: DbSessionContext): Promise<void>` — implementer interface for projecting session context into the DB connection (typically: `SET LOCAL` for Postgres). |

### Storage contracts

| Export                                                   | Description                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ObjectStorageService`                                   | Presigning + existence + delete contract for object storage backends.                                    |
| `PresignedUploadRequest` / `PresignedUploadResponse`     | Upload presigning IO shapes.                                                                             |
| `PresignedDownloadRequest` / `PresignedDownloadResponse` | Download presigning IO shapes.                                                                           |
| `DocumentMetadataRecord`                                 | Persisted-metadata shape for documents stored via the `ObjectStorageService` + a separate metadata repo. |
| `DocumentMetadataRepository`                             | `save/getById/deleteById` interface for the metadata persistence layer.                                  |

### Tenancy contracts

| Export                     | Description                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TenantResolver`           | `resolve(context): string \| undefined` — how a request's tenant is determined. Implementers can swap the resolution strategy. |
| `TenantResolverContext`    | `{ headerTenantId?, principal }`.                                                                                              |
| `TenantEntitlementPolicy`  | `isEntitled(context): boolean` — does this principal belong to this tenant?                                                    |
| `TenantEntitlementContext` | `{ principal, tenantId }`.                                                                                                     |

### Identity-admin contracts

| Export                 | Description                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `IdentityAdminService` | User/role/group management interface implemented by backend-side admin endpoints. Consumed by `@stynx-web/angular-iam`. |

### Error contracts

All extend the contracts-side `StynxError` (note: this is distinct from `@stynx/core`'s `StynxError` — they share the name but contracts' is framework-agnostic; core's adds HTTP status mapping).

| Export                | Code                   | Description                                                                  |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `StynxError`          | (caller-defined)       | Base error class with `code` + `details`. Pure types — no NestJS dependency. |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | Verifier rejected the credential.                                            |
| `AuthorizationError`  | `AUTHORIZATION_ERROR`  | Principal lacks required permissions.                                        |

## Configuration

This package exposes no runtime configuration. There are no `forRoot()` calls, no env vars, no defaults to tune.

The IMPLEMENTER packages — `@stynx/auth`, `@stynx/storage`, etc. — have their own configuration; see those packages' READMEs.

## Examples

### Example 1 — typing your service against `Principal`

```ts
import type { Principal } from '@stynx/contracts';

export class UserActivityService {
  recordActivity(principal: Principal, action: string) {
    // principal.tenants is the canonical shape; consume without runtime cost
    if (principal.tenants.length === 0) {
      throw new Error('Principal has no tenants');
    }
    // ... record activity
  }
}
```

### Example 2 — implementing a custom `AuditSink`

```ts
import type { AuditEventEnvelope, AuditSink } from '@stynx/contracts';

export class CloudWatchAuditSink implements AuditSink {
  async write(event: AuditEventEnvelope): Promise<void> {
    // Push to CloudWatch Logs via the AWS SDK
  }
}
```

Wire via `StynxAuditModule.forRoot({ sink: new CloudWatchAuditSink() })`.

### Example 3 — implementing a custom `DbContextApplier` for a non-Postgres dialect

```ts
import type { DbContextApplier, DbSessionContext } from '@stynx/contracts';
import type { MySQLClient } from 'mysql2/promise';

export class MySQLContextApplier implements DbContextApplier<MySQLClient> {
  async apply(client: MySQLClient, context: DbSessionContext): Promise<void> {
    await client.execute('SET @stynx_request_id = ?', [context.requestId]);
    await client.execute('SET @stynx_tenant_id = ?', [context.tenantId]);
  }
}
```

## Common pitfalls

- **Importing this package from frontend code** is safe (no Node-only or Nest-only runtime imports), but importing from `@stynx/core`'s downstream consumers may indirectly pull in `@stynx/core` itself. To stay pure-types, mark the import as `import type {}`.
- **`StynxError` collision with `@stynx/core`'s `StynxError`**. They are similar but not identical. The contracts version is framework-agnostic; the core version adds HTTP status mapping. In application code you usually want core's version. In sibling-package code that wants to stay framework-agnostic, use contracts' version.
- **Implementing `ObjectStorageService` without `delete`** is fine — the method is optional. But `@stynx/storage`'s `StorageService.delete()` throws if the underlying impl doesn't support it; test before depending on it.
- **`DbSessionContext.extras` is structured loosely** (string/number/boolean/null) — putting complex objects there serialises poorly in Postgres `SET LOCAL`. Use the typed fields when possible.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — defines `RequestActor` + `RequestContext` whose shapes mirror contracts' `Principal` and request-attached context.
- [`@stynx/auth`](/docs/packages/auth/) — implements `AuthVerifier`; produces `AuthVerificationResult`.
- [`@stynx/audit`](/docs/packages/audit/) — implements `AuditSink` (default: SQL sink); consumes `AuditEventEnvelope`.
- [`@stynx/storage`](/docs/packages/storage/) — implements `ObjectStorageService` (default: S3); consumes `PresignedUploadRequest`/`Response`.
- [`@stynx/data`](/docs/packages/data/) — implements `DbContextApplier` (default: Postgres `SET LOCAL`).
- [`@stynx/tenancy`](/docs/packages/tenancy/) — implements `TenantResolver` + `TenantEntitlementPolicy`.
- [STYNX framework — Contracts](/docs/framework/contracts/) — the substrate that catalogues every cross-package contract; this package is the runtime mirror.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-contracts/`](/docs/api-reference/stynx-contracts/)
