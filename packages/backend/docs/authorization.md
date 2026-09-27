---
title: backend/authorization
---

# `StynxAuthorizationModule`

`StynxAuthorizationModule` evaluates `@RequireRoles` and
`@RequirePermissions` metadata using the request principal. It is local by
default: mount `AuthorizationGuard` on the routes that need it. Set `global: true`
to register the same guard as an `APP_GUARD`.

```ts
import { StynxAuthorizationModule } from '@stynx-nyx/backend';

StynxAuthorizationModule.forRoot({ global: true });
```

For global authorization, register the authentication guard as an earlier
`APP_GUARD` and import its module before the authorization module. A
controller-level authentication guard runs too late to supply identity to a
global authorization guard. The guard reads `request.tenantId` only when an
earlier authentication guard has established the tenant from verified identity
and entitlement; a raw tenant header is not authorization context.

For a local `@UseGuards(AuthorizationGuard)`, Nest first injects evaluator and
options from the guard's module when they are available. If they are absent,
the guard looks up the exported `STYNX_AUTHZ_POLICY_EVALUATOR` and
`STYNX_AUTHZ_OPTIONS` tokens across the application. If no module registered
either token, it uses `DefaultPolicyEvaluator` and empty options. An
application with several `forRoot` registrations should import the intended
configuration into the module that owns the local guard; the app-wide fallback
does not choose a registration by route.

## Options

| Option              | Behavior                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `policyEvaluator`   | Custom `PolicyEvaluator` instance; defaults to `DefaultPolicyEvaluator`. The `STYNX_AUTHZ_POLICY_EVALUATOR` token is always injectable. |
| `global`            | Register `AuthorizationGuard` globally when `true`; defaults to local.                                                                  |
| `resolveTarget`     | Resolve an optional resource/action target from the Nest execution context. A partial target is passed unchanged.                       |
| `publicMetadataKey` | Method-first, then class metadata key that skips authorization when true.                                                               |
| `onDeny`            | Return an `Error` to throw on a missing principal or denied policy. The default is `ForbiddenException`.                                |

An undecorated route with no resolved target is skipped. Decorated routes use
the class name and handler name as the fallback target. A resolved target,
including one with only `resource` or `action`, is evaluated even without
STYNX permission metadata. Custom evaluator and denial errors propagate to
the application's exception filters unchanged.

The default evaluator compares roles case insensitively and exactly. It
compares permissions case insensitively and accepts a granted `*` or a final
segment wildcard such as `ops:*`. `ops:*` grants `ops:read` and
`ops:case:read`, but not `ops` or `ops2:read`. A required wildcard remains
literal. The separate `@stynx-nyx/auth` `PermissionGuard` retains exact
matching.
