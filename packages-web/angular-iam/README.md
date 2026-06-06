# `@stynx-web/angular-iam` — Angular admin UI for users, roles, groups, permissions

`@stynx-web/angular-iam` is the identity-and-access-management admin UI: components for managing roles (list, create, detail), groups (list, create, detail, member-editor, role-editor), the effective-permissions view, and a permission-matrix grid. It consumes the backend's `identity-admin` endpoints ([`backend/identity-admin`](/docs/packages/backend/identity-admin/)) via an `IamApiService`. Ships ready-to-mount admin routes.

## Purpose

Apps with role-based access need an admin surface: who has which role, which groups exist, what permissions a role grants. Building these CRUD screens per app is repetitive. `@stynx-web/angular-iam` provides them as drop-in components + routes.

You reach for it when your app exposes an admin area for managing identity.

What it does NOT do: it doesn't authenticate (that's `@stynx-web/angular-auth`). It doesn't define your permission model (the backend does). It renders the management UI over the backend's admin API.

## Audience

Angular frontend developers building admin consoles.

## Install

```bash
pnpm add @stynx-web/angular-iam
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/router` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/angular-auth` `^1`, `@stynx-web/angular-ui` `^1`.

## Quick start

```ts
import { provideIam, iamRoutes } from '@stynx-web/angular-iam';

export const appConfig = { providers: [provideIam()] };

export const routes: Routes = [
  { path: 'admin/iam', children: iamRoutes, canActivate: [permissionGuard('iam:read')] },
];
```

## Public API surface

### Providers + routes

| Export       | Description                                             |
| ------------ | ------------------------------------------------------- |
| `provideIam` | Registers the IAM API service + component dependencies. |
| `iamRoutes`  | Ready-to-mount child routes for the full admin surface. |

### Components (14)

**Roles**

| Selector                     | Component                   | Description              |
| ---------------------------- | --------------------------- | ------------------------ |
| `<stynx-roles-admin>`        | `RolesAdminComponent`       | Role list + management.  |
| `<stynx-role-detail>`        | `RoleDetailComponent`       | Single-role view + edit. |
| `<stynx-role-create-dialog>` | `RoleCreateDialogComponent` | Create-role modal.       |

**Groups**

| Selector                       | Component                     | Description               |
| ------------------------------ | ----------------------------- | ------------------------- |
| `<stynx-groups-admin>`         | `GroupsAdminComponent`        | Group list.               |
| `<stynx-group-detail>`         | `GroupDetailComponent`        | Single-group view.        |
| `<stynx-group-create-dialog>`  | `GroupCreateDialogComponent`  | Create-group modal.       |
| `<stynx-group-members-editor>` | `GroupMembersEditorComponent` | Add/remove group members. |
| `<stynx-group-roles-editor>`   | `GroupRolesEditorComponent`   | Assign roles to a group.  |

**Permissions**

| Selector                        | Component                       | Description                                      |
| ------------------------------- | ------------------------------- | ------------------------------------------------ |
| `<stynx-permission-matrix>`     | `PermissionMatrixComponent`     | Grid of roles × permissions.                     |
| `<stynx-effective-permissions>` | `EffectivePermissionsComponent` | A principal's resolved effective permission set. |

### Services

| Export          | Description                                |
| --------------- | ------------------------------------------ |
| `IamApiService` | Wraps the SDK's identity-admin operations. |

### Types + catalogs

| Export        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `iamCatalogs` | i18n catalog entries for the IAM UI.                       |
| (types)       | See [TypeDoc](/docs/api-reference/stynx-web-angular-iam/). |

## Configuration

| Option        | Type     | Default | Description                                             |
| ------------- | -------- | ------- | ------------------------------------------------------- |
| `routePrefix` | `string` | `'iam'` | Must match the backend's `identity-admin` route prefix. |
| `pageSize`    | `number` | `20`    | List pagination size.                                   |

## Examples

### Example 1 — mounting the full admin surface

```ts
{ path: 'admin/iam', children: iamRoutes, canActivate: [permissionGuard('iam:read')] }
```

### Example 2 — embedding just the permission matrix

```html
<stynx-permission-matrix [roleId]="selectedRole" />
```

### Example 3 — effective permissions for a user

```html
<stynx-effective-permissions [userId]="user.id" />
```

## Common pitfalls

- **Backend `identity-admin` submodule not mounted** — the IAM components 404 against the admin API. Ensure `backend/identity-admin` is mounted server-side.
- **`routePrefix` mismatch** — the frontend prefix must equal the backend's `StynxIdentityAdminModule` `routePrefix`, or API calls hit the wrong path.
- **Missing `iam:write` permission** — read-only admins can view but mutations 403. Gate the create/edit components behind `*hasPermission="'iam:write'"`.

## Related packages

- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth/) — auth + the `permissionGuard` for the IAM routes.
- [`backend/identity-admin`](/docs/packages/backend/identity-admin/) — the backend admin API this consumes.
- [`@stynx/auth`](/docs/packages/auth/) — defines the permission model.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-iam/`](/docs/api-reference/stynx-web-angular-iam/)
