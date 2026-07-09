---
title: backend/identity-admin
---

# `StynxIdentityAdminModule` — admin endpoints for users / roles / groups

`StynxIdentityAdminModule` exposes admin endpoints for managing identity objects: users, roles, groups, role-assignments, and group-memberships. Backed by `@stynx-nyx/auth`'s `CognitoAdminAdapter` (default; Cognito-side admin ops) or a custom adapter implementing the `@stynx-nyx/contracts` `IdentityAdminService` interface.

This is the backend surface that powers `@stynx-web/angular-iam` (W07).

## When to mount

When your app exposes admin UIs for managing users, roles, or groups. Not needed for runtime auth — that's `backend/auth`. The two are independent.

## Wiring

```ts
import { StynxIdentityAdminModule } from '@stynx-nyx/backend';

StynxIdentityAdminModule.forRoot({
  adapter: 'cognito', // or 'custom' with options.implementation
  cognito: { userPoolId: '...', region: 'us-east-1' },
  routePrefix: 'iam',
});
```

## Configuration

| Option           | Type                         | Default                           | Description                          |
| ---------------- | ---------------------------- | --------------------------------- | ------------------------------------ |
| `adapter`        | `'cognito' \| 'custom'`      | `'cognito'`                       | Backend admin adapter.               |
| `cognito`        | `CognitoAdminOptions`        | required for `adapter: 'cognito'` | AWS Cognito admin config.            |
| `implementation` | `Type<IdentityAdminService>` | required for `adapter: 'custom'`  | Custom impl class.                   |
| `routePrefix`    | `string`                     | `'iam'`                           | Mount the endpoints under this path. |

## Endpoints (mounted under `routePrefix`)

| Method   | Path                                   | Required perm | Description                               |
| -------- | -------------------------------------- | ------------- | ----------------------------------------- |
| `GET`    | `/iam/users`                           | `iam:read`    | List users (paginated).                   |
| `GET`    | `/iam/users/:id`                       | `iam:read`    | Get a user.                               |
| `POST`   | `/iam/users`                           | `iam:write`   | Create a user.                            |
| `PATCH`  | `/iam/users/:id`                       | `iam:write`   | Update.                                   |
| `DELETE` | `/iam/users/:id`                       | `iam:write`   | Disable / delete (per adapter semantics). |
| `GET`    | `/iam/roles`                           | `iam:read`    | List roles.                               |
| `POST`   | `/iam/users/:userId/roles/:roleId`     | `iam:write`   | Assign a role.                            |
| `GET`    | `/iam/groups`                          | `iam:read`    | List groups.                              |
| `POST`   | `/iam/groups/:groupId/members/:userId` | `iam:write`   | Add member.                               |

## Common pitfalls

- **`adapter: 'cognito'` without admin IAM permissions** — Cognito Admin\* operations require elevated IAM rights. Application's role must have `cognito-idp:AdminListUsers` etc.
- **Custom adapter doesn't implement every method** — the controller assumes every method exists; partial impls produce 500s on unimplemented routes.

## Related

- [`@stynx-nyx/auth`](/docs/packages/auth/) — provides `CognitoAdminAdapter`.
- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — defines `IdentityAdminService`.
- [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam/) — Angular admin UI consuming these endpoints.
