---
title: backend/authorization
---

# `StynxAuthorizationModule` — role + permission predicate evaluator

`StynxAuthorizationModule` is the authorization layer sibling to `backend/auth`. It evaluates `@RequirePermissions(...)` and `@Permission(...)` decorator metadata against the principal's resolved permission set (cached by `@stynx-nyx/auth`'s `PermissionCache`).

## When to mount

Whenever you use the declarative permission decorators. The module is mounted automatically when `StynxBackendAuthModule` is present; you can mount it explicitly if you want a custom policy evaluator.

## Wiring

```ts
import { StynxAuthorizationModule, DefaultPolicyEvaluator } from '@stynx-nyx/backend';

StynxAuthorizationModule.forRoot({
  evaluator: DefaultPolicyEvaluator,
  // OR a custom evaluator:
  // evaluator: MyPolicyEvaluator,
});
```

The default `DefaultPolicyEvaluator` is a string-membership check against `Principal.permissions`. Custom evaluators can implement RBAC + ABAC + tenant-conditional policies.

## Configuration

| Option       | Type                                  | Default                  | Description                                                                 |
| ------------ | ------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `evaluator`  | `Type<PolicyEvaluator>`               | `DefaultPolicyEvaluator` | The class implementing the evaluation strategy.                             |
| `predicates` | `Record<string, PermissionPredicate>` | `{}`                     | Per-permission predicate overrides (e.g. `'orders:read': (p, ctx) => ...`). |

## Common pitfalls

- **Mounting without `backend/auth`** — the policy evaluator runs against `Principal.permissions`, which is populated by `@stynx-nyx/auth`'s guard. Without that, every request has an undefined principal.
- **Custom evaluator throwing instead of returning false** — throws bubble as 500 from the guard; return `false` for denial.

## Related

- [`@stynx-nyx/auth`](/docs/packages/auth/) — provides `@Permission` decorator + permission cache.
- [`backend/auth`](/docs/packages/backend/auth/) — sibling submodule; mount first.
