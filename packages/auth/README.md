# `@stynx/auth` — JWT verification, principal attachment, permission-cached authZ

`@stynx/auth` is STYNX's authentication + authorization substrate. It verifies JWTs (Cognito or generic), maps claims to the canonical `Principal` shape, attaches the principal to the request frame via `@stynx/core`'s `RequestContextMutator`, exposes permission-based guards (`StynxAuthGuard`, `PermissionGuard`), and caches resolved permissions per-principal (in-memory or Redis backend) so authorization checks stay fast. Route decorators (`@Public`, `@System`, `@ReadOnly`, `@Permission`) let you mark each endpoint's policy declaratively.

## Purpose

Authentication + authorization in NestJS apps usually starts simple (a single Bearer-token guard) and grows tangled: multiple verifiers (Cognito + service-to-service tokens), permission resolution that needs caching, route policy expressed as decorators that the guard reads, and a request-context bridge so downstream services see who they're acting for. `@stynx/auth` consolidates all of this with a single `StynxAuthModule.forRoot()` plus opt-in decorators.

You reach for `@stynx/auth` when your STYNX app needs ANY authenticated endpoint, or when you're integrating against AWS Cognito (or a generic JWT issuer) and want the principal extraction + permission cache + guard wiring as a unit. The `actor-context.interceptor` populates `RequestContext` with the resolved principal so every other `@stynx/*` package (tenancy, audit, idempotency) sees the right actor.

What it does NOT do: it does not issue tokens (use Cognito or another IdP). It does not own admin endpoints for users/roles/groups (those live in `@stynx/backend`'s `identity-admin` submodule). It does not enforce tenant scoping beyond reading a tenant claim — `@stynx/tenancy` is what binds the resolved tenant to RLS-aware queries.

## Audience

NestJS backend developers wiring authentication for the first time, OR replacing an existing ad-hoc verifier with something that integrates cleanly with the rest of STYNX. Typical scenario: a new endpoint added to a STYNX-based app needs to be protected; you decorate with `@Permission('orders:read')` and `StynxAuthModule` does the rest.

## Install

```bash
pnpm add @stynx/auth
```

**Peer dependencies:** `@nestjs/common` `^11`, `@nestjs/core` `^11`, `@stynx/core` `^1`, `@stynx/contracts` `^1`, `@stynx/sessions` `^1`, `aws-jwt-verify` (Cognito), `ioredis` (optional, for the Redis permission cache).

**Node:** 24.x.

## Quick start

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { StynxAuthModule } from '@stynx/auth';

@Module({
  imports: [
    StynxCoreModule.forRoot({ appName: 'my-app', schema: ConfigSchema }),
    StynxAuthModule.forRoot({
      verifier: 'cognito',
      cognito: {
        userPoolId: 'us-east-1_abc123',
        clientId: 'xxxxxx',
        tokenUse: 'access',
      },
      permissionCache: { kind: 'in-memory', ttlMs: 60_000 },
    }),
  ],
})
export class AppModule {}
```

```ts
// src/orders/orders.controller.ts
import { Controller, Get, Post } from '@nestjs/common';
import { Permission, Public, ReadOnly } from '@stynx/auth';

@Controller('orders')
export class OrdersController {
  @Get('public-info')
  @Public()
  publicInfo() {
    /* no auth required */
  }

  @Get()
  @Permission('orders:read')
  @ReadOnly()
  list() {
    /* requires orders:read */
  }

  @Post()
  @Permission('orders:create')
  create() {
    /* requires orders:create */
  }
}
```

`StynxAuthGuard` is registered globally as `APP_GUARD`; the decorators set route metadata it reads.

## Public API surface

### Modules

| Export            | Signature                             | Description                                                                                        |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `StynxAuthModule` | `.forRoot(options: StynxAuthOptions)` | Registers the auth controller, guard, interceptor, permission cache backend, JWT verifier. Global. |

### Services / Injectables

| Export                           | Description                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `StynxAuthService`               | High-level auth ops: exchange Cognito token for a STYNX session, resolve principal, refresh permissions.                 |
| `StynxAuthGuard`                 | Global `CanActivate`. Verifies Bearer token, populates `RequestContext` with the principal, rejects with 401 if invalid. |
| `PermissionGuard`                | Checks `@Permission(...)` metadata against the cached principal permissions; throws 403 if missing.                      |
| `PermissionCache`                | The permission cache façade (backed by in-memory or Redis).                                                              |
| `PermissionCacheMetrics`         | Hit/miss/eviction counters.                                                                                              |
| `PermissionQueryService`         | Programmatic permission lookups (rare; useful in cron jobs / system contexts).                                           |
| `EffectiveHashComputer`          | Hashes the principal's effective permission set for cache invalidation.                                                  |
| `InMemoryPermissionCacheBackend` | Default permission cache backend.                                                                                        |
| `RedisPermissionCacheBackend`    | Redis-backed cache backend (multi-instance deployments).                                                                 |
| `CognitoAdminAdapter`            | AWS Cognito admin operations. Consumed by the `backend/identity-admin` submodule.                                        |
| `CognitoTokenVerifier`           | Wraps `aws-jwt-verify` for Cognito access tokens.                                                                        |
| `CognitoJwtValidator`            | Lower-level validator.                                                                                                   |
| `StynxJwtValidator`              | Generic-JWT validator alternative.                                                                                       |
| `ActorContextInterceptor`        | Populates `RequestContext` after the guard accepts.                                                                      |

### Decorators

| Export             | Targets           | Description                                                          |
| ------------------ | ----------------- | -------------------------------------------------------------------- |
| `@Public()`        | Methods + classes | Mark the route as not requiring auth.                                |
| `@System()`        | Methods + classes | System-context route (typically internal endpoints invoked by cron). |
| `@ReadOnly()`      | Methods + classes | Hint for the audit interceptor: this route does not mutate.          |
| `@Permission(key)` | Methods + classes | Declare the permission required (e.g. `@Permission('orders:read')`). |

### Endpoints (`@stynx/auth` exposes 1 controller)

| Method | Path                        | Auth                | Description                                                                                |
| ------ | --------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `POST` | `/auth/session-exchange`    | public              | Exchange a Cognito ID/access token for a STYNX session (handing off to `@stynx/sessions`). |
| `GET`  | `/auth/principal`           | bearer              | Return the currently-resolved `Principal`.                                                 |
| `GET`  | `/auth/permissions/:userId` | bearer + `iam:read` | Look up effective permissions for a user.                                                  |

### Types / Interfaces

| Export                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `StynxAuthOptions`    | `forRoot()` options.                                 |
| `RequestLike`         | Subset of the Nest `Request` the auth code consumes. |
| `SessionExchangeBody` | `POST /auth/session-exchange` request body.          |

### Tokens (decorator metadata keys)

| Export                   | Used to                           |
| ------------------------ | --------------------------------- |
| `STYNX_PUBLIC_ROUTE`     | Metadata key for `@Public()`.     |
| `STYNX_SYSTEM_ROUTE`     | Metadata key for `@System()`.     |
| `STYNX_READONLY_ROUTE`   | Metadata key for `@ReadOnly()`.   |
| `STYNX_PERMISSION_ROUTE` | Metadata key for `@Permission()`. |

## Configuration

### `StynxAuthModule.forRoot()` options

| Option            | Type                                               | Default                                        | Description                        |
| ----------------- | -------------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `verifier`        | `'cognito' \| 'generic'`                           | `'cognito'`                                    | Which JWT verifier to wire.        |
| `cognito`         | `{ userPoolId, clientId, tokenUse }`               | required for `verifier: 'cognito'`             | Cognito user pool config.          |
| `generic`         | `{ jwksUrl, issuer, audience }`                    | required for `verifier: 'generic'`             | Generic JWT config.                |
| `permissionCache` | `{ kind: 'in-memory' \| 'redis'; ttlMs?; redis? }` | `{ kind: 'in-memory', ttlMs: 60_000 }`         | Permission cache backend.          |
| `principalMapper` | `(claims) => Principal`                            | `DefaultPrincipalMapper` from `@stynx/backend` | Custom claim-to-principal mapping. |

### Environment variables

The auth module doesn't read env vars itself; secrets go through your `StynxCoreModule` schema and are passed to `forRoot()`.

## Examples

### Example 1 — generic JWT (non-Cognito)

```ts
StynxAuthModule.forRoot({
  verifier: 'generic',
  generic: {
    jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
    issuer: 'https://auth.example.com/',
    audience: 'stynx-api',
  },
});
```

### Example 2 — Redis permission cache for multi-instance deploys

```ts
StynxAuthModule.forRoot({
  verifier: 'cognito',
  cognito: { userPoolId: '...', clientId: '...', tokenUse: 'access' },
  permissionCache: {
    kind: 'redis',
    ttlMs: 5 * 60_000,
    redis: { host: 'redis.internal', port: 6379 },
  },
});
```

### Example 3 — custom claim mapping

```ts
StynxAuthModule.forRoot({
  verifier: 'cognito',
  cognito: {
    /* ... */
  },
  principalMapper: (claims) => ({
    id: claims.sub,
    email: claims.email,
    roles: (claims['custom:roles'] ?? '').split(','),
    permissions: (claims['custom:perms'] ?? '').split(','),
    tenants: (claims['custom:tenants'] ?? '').split(','),
    claims,
  }),
});
```

## Common pitfalls

- **Forgetting `@Public()` on the health check** — the global guard rejects unauthenticated requests, including your own probes. Mark health/readiness endpoints `@Public()`.
- **Permission cache stampede on TTL expiry** — under heavy load, many concurrent permission misses hit the cache miss path simultaneously. The Redis backend deduplicates; in-memory does not. For high-RPS apps, prefer Redis.
- **JWT clock skew rejection** — if your app's clock drifts from Cognito's, valid tokens reject as `Token used before issued at` or `Token expired`. NTP sync or set verifier clock-tolerance.
- **`@Permission` decorator without `StynxAuthModule.forRoot()`** — the decorator sets metadata but the guard isn't wired. Endpoints "appear protected" but accept anonymous traffic.
- **Tenant claim missing from JWT** — `@stynx/tenancy` reads the tenant claim; missing means tenant is `undefined`. Either require it in your principal mapper or use a `TenantResolver` with a fallback.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides `RequestContextMutator`; this package writes the principal to the request frame.
- [`@stynx/contracts`](/docs/packages/contracts/) — defines `Principal` + `AuthVerifier`; this package implements them.
- [`@stynx/sessions`](/docs/packages/sessions/) — signs the access tokens this package's session-exchange endpoint hands off to.
- [`@stynx/tenancy`](/docs/packages/tenancy/) — reads tenant from the principal this package attaches.
- [`@stynx/idempotency`](/docs/packages/idempotency/) — uses `actorId` from the principal to scope idempotency keys.
- [`@stynx/audit`](/docs/packages/audit/) — uses `actorId` for audit-event attribution.
- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth/) — Angular pair: login UI + TokenInterceptor.
- [`backend/auth`](/docs/packages/backend/auth/) — the `@stynx/backend` submodule that wraps this package's wiring.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-auth/`](/docs/api-reference/stynx-auth/)
