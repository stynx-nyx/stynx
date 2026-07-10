# `@stynx-nyx/tenancy` — multi-tenant context, membership, platform-admin guard

`@stynx-nyx/tenancy` is STYNX's multi-tenant substrate. It resolves the active tenant per request (from header, JWT claim, or route param), enforces tenant membership (the principal must belong to the tenant), caches membership lookups, exposes platform-admin endpoints for tenant lifecycle (archive/restore/suspend), and bridges into `@stynx-nyx/data`'s request-scoped DB context for RLS-aware queries. The `tenant-context.interceptor` writes the resolved tenant id into `RequestContext` so every downstream package sees it.

## Purpose

Multi-tenant apps need a canonical answer to "which tenant is this request acting under?" and a canonical answer to "is this principal allowed to act under that tenant?" — both decisions need to happen early, deterministically, with caching for the membership check. `@stynx-nyx/tenancy` centralises this.

You reach for `@stynx-nyx/tenancy` whenever the app has multiple tenants — typically immediately after `@stynx-nyx/auth`.

What it does NOT do: it doesn't define your tenant schema (your migrations do), doesn't enforce RLS policies (your Postgres policies do, with the `tenantId` this package writes), doesn't manage cross-tenant data access (use platform-admin endpoints for that).

## Audience

Backend developers building multi-tenant apps. Most use is configuration + decorators; direct service interaction is rare.

## Install

```bash
pnpm add @stynx-nyx/tenancy
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/contracts` `^1`, `@stynx-nyx/data` `^1`.

## Quick start

```ts
import { StynxTenancyModule } from '@stynx-nyx/tenancy';

StynxTenancyModule.forRoot({
  source: 'jwt-claim',
  claimName: 'custom:tenant_id',
  enforcement: 'strict',
});
```

Every request now has `RequestContext.tenantId` populated from the JWT claim; the membership check is performed once per request and cached.

## Public API surface

### Modules

| Export               | Signature                                | Description                                                                |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `StynxTenancyModule` | `.forRoot(options: StynxTenancyOptions)` | Registers controller, interceptor, membership cache, platform-admin guard. |

### Services / Injectables

| Export                      | Description                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `StynxTenancyService`       | High-level tenant ops: lookup, archive, restore, suspend.                                        |
| `MembershipCache`           | Caches `(principal × tenant) → entitled?` lookups.                                               |
| `TenantContextInterceptor`  | Resolves tenant per request and writes to `RequestContext`.                                      |
| `TenantSystemOperationSink` | Records tenant lifecycle events (archive/restore) for audit.                                     |
| `StynxPlatformAdminGuard`   | Protects platform-admin endpoints — requires elevated permission separate from per-tenant roles. |

### Endpoints (1 controller — platform admin)

| Method  | Path                           | Auth           | Description                                                                       |
| ------- | ------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `GET`   | `/tenancy/tenants`             | platform-admin | List tenants.                                                                     |
| `GET`   | `/tenancy/tenants/:id`         | platform-admin | Get a tenant.                                                                     |
| `POST`  | `/tenancy/tenants`             | platform-admin | Create a tenant.                                                                  |
| `PATCH` | `/tenancy/tenants/:id`         | platform-admin | Update tenant metadata.                                                           |
| `POST`  | `/tenancy/tenants/:id/suspend` | platform-admin | Suspend a tenant.                                                                 |
| `POST`  | `/tenancy/tenants/:id/archive` | platform-admin | Archive (soft-delete) a tenant; cascades per `@stynx-nyx/data` soft-delete rules. |

### Types / Interfaces

| Export                | Description             |
| --------------------- | ----------------------- |
| `StynxTenancyOptions` | `forRoot()` options.    |
| `TenantRecord`        | Persisted tenant shape. |

## Configuration

### `StynxTenancyModule.forRoot()` options

| Option                  | Type                                       | Default         | Description                                                                                |
| ----------------------- | ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------ |
| `source`                | `'header' \| 'jwt-claim' \| 'route-param'` | `'jwt-claim'`   | Where the tenant id comes from.                                                            |
| `headerName`            | `string`                                   | `'X-Tenant-Id'` | Header name when `source: 'header'`.                                                       |
| `claimName`             | `string`                                   | `'tenant_id'`   | JWT claim name when `source: 'jwt-claim'`.                                                 |
| `enforcement`           | `'strict' \| 'permissive'`                 | `'strict'`      | Strict: throw 403 if principal isn't entitled to the tenant. Permissive: log and continue. |
| `membershipCache.ttlMs` | `number`                                   | `60_000`        | Membership cache TTL.                                                                      |

## Examples

### Example 1 — header-based tenant

```ts
StynxTenancyModule.forRoot({
  source: 'header',
  headerName: 'X-Tenant-Id',
  enforcement: 'strict',
});
```

Use this when the JWT doesn't carry the tenant claim (e.g. multi-tenant user belongs to multiple tenants).

### Example 2 — fallback resolver

```ts
StynxTenancyModule.forRoot({
  source: 'header',
  fallback: 'jwt-claim',
  claimName: 'custom:default_tenant',
});
```

### Example 3 — entitlement check on a custom route

```ts
import { StynxPlatformAdminGuard } from '@stynx-nyx/tenancy';

@Controller('admin-stuff')
@UseGuards(StynxPlatformAdminGuard)
export class AdminController {
  /* ... */
}
```

## Common pitfalls

- **Empty tenant claim** silently treated as `undefined` — your downstream RLS policies may then leak across tenants. Either enforce `claim required` at the JWT level or use `enforcement: 'strict'`.
- **Membership cache stale after a tenant suspension** — a suspended tenant's existing sessions still pass membership for up to `ttlMs`. Either lower TTL or explicitly invalidate on suspend.
- **`StynxPlatformAdminGuard` on a regular route** — the guard requires a platform-admin permission. Don't use it for tenant-scoped routes; use `@Permission()` instead.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContextMutator`; this package writes `tenantId` to the request frame.
- [`@stynx-nyx/auth`](/docs/packages/auth/) — resolves the principal whose tenant claim this package reads.
- [`@stynx-nyx/data`](/docs/packages/data/) — consumes the resolved `tenantId` for RLS-aware DB sessions.
- [`@stynx-nyx/angular-tenancy`](/docs/packages-web/angular-tenancy/) — Angular pair: tenant switcher + context display.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-tenancy/`](/docs/api-reference/stynx-tenancy/)
