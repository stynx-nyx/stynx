---
title: backend/auth
---

# `StynxBackendAuthModule` — `@stynx/auth` wired into the backend pipeline

`StynxBackendAuthModule` wraps `@stynx/auth` for the canonical backend composition. It mounts `StynxAuthModule.forRoot(authOptions)` with the pipeline's expected DI bindings (the `DefaultPrincipalMapper`, `ActorContextInterceptor`, `StynxAuthGuard` as global `APP_GUARD`).

## When to mount

Always, for any app needing authenticated endpoints. Mount after `StynxPlatformPipelineModule`.

## Wiring

```ts
import { StynxBackendAuthModule } from '@stynx/backend';

StynxBackendAuthModule.forRoot({
  verifier: 'cognito',
  cognito: { userPoolId: '...', clientId: '...', tokenUse: 'access' },
  permissionCache: { kind: 'redis', ttlMs: 5 * 60_000, redis: { host: 'redis.internal' } },
});
```

Options are the underlying `StynxAuthModule.forRoot()` shape — see [`@stynx/auth`](/docs/packages/auth/) for the full schema.

## Configuration

Forwarded to `@stynx/auth`'s `StynxAuthOptions`. The backend submodule adds:

| Option            | Type                    | Default                                              | Description                              |
| ----------------- | ----------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `principalMapper` | `(claims) => Principal` | `DefaultPrincipalMapper` (in `@stynx/backend`)       | Override the claim-to-principal mapping. |
| `tenantResolver`  | `TenantResolver`        | `RequiredTenantHeaderResolver` (in `@stynx/backend`) | Override the tenant resolution strategy. |

## Common pitfalls

- **Mounting without `StynxPlatformPipelineModule`** — the auth guard registers as `APP_GUARD` but interactions with rate-limit (also `APP_GUARD`) become order-dependent. Mount the pipeline first.
- **Permission cache backend mismatch** with the multi-instance posture: in-memory across instances will produce inconsistent authZ. Use Redis.

## Related

- [`@stynx/auth`](/docs/packages/auth/) — the underlying package.
- [`backend/authorization`](/docs/packages/backend/authorization/) — sibling submodule; permission predicate evaluator.
- [`backend/pipeline`](/docs/packages/backend/pipeline/) — mount before this.
