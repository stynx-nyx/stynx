# FE-03 — Admin & RBAC Surfaces

**Compiled:** 2026-05-19
**Reads:** `packages-web/*`, the backend `packages/iam/*` and `packages/rbac/*` (read-only, to confirm endpoints exist on the backend side).
**Why a dedicated file.** The user singled out admin interfaces — "user lifecycle, associations, grants, etc." — as deserving special attention. The current `packages-web/*` library set ships **no admin surface** for these concerns.

## What "admin surface" means here

For a client application built on `@stynx-web/*`, an administrator must be able to:

| Capability                                       | Typical UI                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **User lifecycle**                               | List + search + paginate users; create, disable, reactivate, archive; reset password; resend invite; force-logout; impersonate (audited). |
| **Role catalogue**                               | List roles, create / clone / delete, see role description, see members count.       |
| **Role-to-permission grants**                    | Permission matrix per role; bulk grant / revoke; see effective permissions.         |
| **Group catalogue**                              | List groups, create / delete, see members, see role assignments per group.          |
| **Group-to-role assignments**                    | Toggle role membership per group; bulk re-assign.                                   |
| **User-to-role assignments**                     | Toggle role assignments per user; bulk re-assign across users.                      |
| **User-to-group assignments**                    | Toggle group memberships per user.                                                  |
| **Tenancy crossover**                            | All of the above scoped to the current tenant; admin can act on tenant-local users only. |
| **Audit of admin actions**                       | Every admin write must produce an audit-log entry visible to a separate audit viewer (see [FE-04 is for Flow; the audit viewer is part of this audit scope but lives in a separate missing package — see FE-01 rows 17–18]). |

## Current state in `packages-web/*`

A direct grep across the source for relevant identifiers:

| Identifier                         | Result                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `user-list`, `users-table`, `UsersListComponent`, `user-admin` | **No match** in any `packages-web/*` package.                                                                  |
| `role-list`, `RolesListComponent`, `role-admin`               | No match.                                                                                                      |
| `group-list`, `GroupsListComponent`, `group-admin`            | No match.                                                                                                      |
| `permission-matrix`, `grant`, `revoke`                        | Only `permissionGuard` / `*stynxHasPermission` — check, not management.                                          |
| `iam`, `admin`                                                | No `@stynx-web/angular-iam`, no `@stynx-web/angular-admin`, no `admin/` sub-folder in any package.               |
| `invite`, `password-reset`, `force-logout`                    | No match in any web package.                                                                                    |
| `impersonate`                                                  | No match.                                                                                                       |

**Effective admin surface available to a client developer today: zero.** Every IAM admin screen would have to be authored from scratch by the consumer.

## What the SDK gives us to build on

`@stynx-web/sdk` re-exports the auto-generated OpenAPI client. The OpenAPI definition for `reference-api` (the canonical backend) ships these resources, per `reference/api/openapi.json` (cross-checked against `packages/iam` and `packages/rbac` services):

- `GET / POST /admin/users`, `GET / PATCH / DELETE /admin/users/{id}`, `POST /admin/users/{id}/disable`, `POST /admin/users/{id}/reactivate`, `POST /admin/users/{id}/invite`, `POST /admin/users/{id}/force-logout`.
- `GET / POST /admin/roles`, `GET / PATCH / DELETE /admin/roles/{id}`, `GET / PUT /admin/roles/{id}/permissions`.
- `GET / POST /admin/groups`, `GET / PATCH / DELETE /admin/groups/{id}`, `GET / PUT /admin/groups/{id}/roles`, `GET / PUT /admin/groups/{id}/members`.
- `GET /admin/users/{id}/effective-permissions`.

So the **backend is ready**; the **frontend is the bottleneck**.

## Plan implication

A new package — `@stynx-web/angular-iam` — is the minimum to deliver the assignment. It must ship:

| Component / Service                                | Selector / API                                            |
| -------------------------------------------------- | --------------------------------------------------------- |
| `StynxUsersAdminComponent`                         | `<stynx-users-admin>` — list / search / paginate / open detail. |
| `StynxUserDetailComponent`                         | `<stynx-user-detail [userId]>` — fields + tabs.            |
| `StynxUserRolesEditorComponent`                    | `<stynx-user-roles-editor [userId]>` — toggle role memberships. |
| `StynxUserGroupsEditorComponent`                   | `<stynx-user-groups-editor [userId]>` — toggle group memberships. |
| `StynxRolesAdminComponent`                         | `<stynx-roles-admin>` — list / create / clone / delete.    |
| `StynxRoleDetailComponent` + `StynxPermissionMatrixComponent` | `<stynx-role-detail [roleId]>` with permission grid. |
| `StynxGroupsAdminComponent`                        | `<stynx-groups-admin>`.                                   |
| `StynxGroupDetailComponent` + role/members editors  | `<stynx-group-detail [groupId]>`.                          |
| `StynxEffectivePermissionsComponent`               | `<stynx-effective-permissions [userId]>` — read-only.      |
| `IamApiService`                                    | Wraps the SDK admin endpoints; signal-cached lists; RxJS HTTP. |
| `iamRoutes()`                                      | Exportable `Routes[]` to mount under any path.            |
| `provideStynxIam(...)`                             | Standalone provider.                                       |

All standalone, `OnPush`, signal-based UI state, RxJS service calls, fully translated via `@stynx-web/angular-i18n`, guard-protected via `@stynx-web/angular-auth` permission guard. Empty / loading / error states use `@stynx-web/angular-ui` primitives. The package consumes — but does not depend on a fork of — `angular-auth`, `angular-tenancy`, `angular-i18n`, `angular-ui`. Tests target ≥ 80 % branch coverage and ≥ 70 % mutation score.

See [plan/FE-WAVE-B](../plan/FE-WAVE-B-admin-iam-ui.md) for the wave that delivers this package.

## Why this matters beyond the assignment

- Every multi-tenant SaaS built on `@stynx-web/*` will need this surface. Building it once, in `packages-web/`, removes duplication across consumers.
- The current state forces every consumer to learn the IAM domain — users / roles / groups, the effective-permissions evaluation, soft-delete semantics — and ship its own admin UI, which contradicts the stated goal that consumers "rely all shared features and utilities on stynx packages".
- The admin surface is also where audit-log emission is most concentrated. Pairing this package with a `@stynx-web/angular-audit` viewer (see [FE-04 doesn't cover Audit — that's outlined in FE-01 rows 17–18 and elaborated in plan/FE-WAVE-E](../plan/FE-WAVE-E-tenancy-and-audit.md)) gives consumers admin + traceability in one move.
