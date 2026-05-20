# FE-WAVE-B — `@stynx-web/angular-iam` (Users / Roles / Groups / Permission-Matrix)

**Wave goal.** Author the missing IAM admin UI package. After this wave, a consuming app does `provideStynxIam(...)` + `iamRoutes()` and has a working users / roles / groups / permission-matrix admin surface.

## Scope

A new package `packages-web/angular-iam/` containing:

| Layer        | Item                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service      | `IamApiService` — RxJS wrapper around the SDK admin endpoints. Internal signal-cached lists for the table views.                                              |
| Components   | See the table in [../inv/FE-03](../inv/FE-03-admin-and-rbac-surfaces.md#plan-implication).                                                                    |
| Routes       | `iamRoutes()` — `Routes[]` exportable; mount under any path; permission-guard pre-attached.                                                                  |
| Provider     | `provideStynxIam({ clientFactory })`.                                                                                                                         |
| Tokens       | `STYNX_IAM_CLIENT`.                                                                                                                                          |
| Types        | `StynxUser`, `StynxRole`, `StynxGroup`, `StynxPermission`, `StynxPermissionGrant`, `StynxUserDetail`, `StynxEffectivePermissions`, request / response shapes. |
| Translations | Per-package translation keys in `src/i18n/{en,pt-BR}.json`.                                                                                                  |

## Workstreams

### B.1 — Package scaffolding

- `packages-web/angular-iam/package.json` — version `0.1.0`, peer deps on `@angular/common`, `@angular/core`, `@angular/forms`, `@angular/router`, `@stynx-web/sdk`, `@stynx-web/angular`, `@stynx-web/angular-auth`, `@stynx-web/angular-i18n`, `@stynx-web/angular-ui`.
- `ng-package.json` with `entryFile: src/index.ts`.
- `tsconfig.json` extending the workspace base.
- `vitest.config.ts` (jsdom).
- `src/index.ts` initially empty.
- Add to `pnpm-workspace.yaml` if not auto-discovered.
- Wire into `test-matrix.config.json`.

### B.2 — `IamApiService` + SDK integration

Methods (signature, RxJS):

```ts
listUsers({ q, page, pageSize, tenantId? }): Observable<PagedResult<StynxUser>>
getUser(id): Observable<StynxUserDetail>
createUser(body): Observable<StynxUser>
patchUser(id, diff): Observable<StynxUser>
disableUser(id): Observable<void>
reactivateUser(id): Observable<void>
inviteUser(id): Observable<void>
forceLogoutUser(id): Observable<void>
listUserRoles(id): Observable<StynxRole[]>
setUserRoles(id, roleIds): Observable<void>
listUserGroups(id): Observable<StynxGroup[]>
setUserGroups(id, groupIds): Observable<void>
getEffectivePermissions(id): Observable<StynxEffectivePermissions>

listRoles(): Observable<StynxRole[]>
createRole, patchRole, deleteRole, cloneRole
listRolePermissions, setRolePermissions

listGroups, createGroup, patchGroup, deleteGroup
listGroupRoles, setGroupRoles, listGroupMembers, setGroupMembers
```

Internally maintain a signal-cached `users()`, `roles()`, `groups()` for table-fed data; expose a `refresh<Resource>()` method.

### B.3 — Users admin surface

Components:
- `StynxUsersAdminComponent` (`<stynx-users-admin>`) — list table, search box, paginate, click-row-to-detail, "Create user" button.
- `StynxUserDetailComponent` (`<stynx-user-detail [userId]>`) — tabs: Overview, Roles, Groups, Effective permissions, Sessions, Audit.
- `StynxUserCreateDialogComponent` — modal.
- `StynxUserDisableConfirmDialogComponent` — modal.

Form: typed reactive `FormGroup<{ email, firstName?, lastName?, locale?, sendInvite }>`.

### B.4 — Roles admin surface

Components:
- `StynxRolesAdminComponent` (`<stynx-roles-admin>`).
- `StynxRoleDetailComponent` (`<stynx-role-detail [roleId]>`).
- `StynxRoleCreateDialogComponent`.
- `StynxPermissionMatrixComponent` (`<stynx-permission-matrix [roleId]>`) — checkbox grid per permission; bulk select; per-resource grouping.

### B.5 — Groups admin surface

Components:
- `StynxGroupsAdminComponent` (`<stynx-groups-admin>`).
- `StynxGroupDetailComponent` — tabs: Overview, Roles, Members.
- `StynxGroupCreateDialogComponent`.
- `StynxGroupRolesEditorComponent` — toggle roles in / out of a group.
- `StynxGroupMembersEditorComponent` — list of users in the group; add / remove.

### B.6 — Effective-permissions viewer

`StynxEffectivePermissionsComponent` (`<stynx-effective-permissions [userId]>`) — read-only list of "permission ← granted by [role: X | group: Y]". Useful for "why can this user do that?" investigations.

### B.7 — Routes + provider

```ts
export function iamRoutes(): Routes {
  return [
    { path: 'users', component: StynxUsersAdminComponent, canActivate: [PermissionGuard], data: { permission: 'iam:users:read' } },
    { path: 'users/:userId', component: StynxUserDetailComponent, canActivate: [PermissionGuard], data: { permission: 'iam:users:read' } },
    { path: 'roles', component: StynxRolesAdminComponent, canActivate: [PermissionGuard], data: { permission: 'iam:roles:read' } },
    { path: 'roles/:roleId', component: StynxRoleDetailComponent, canActivate: [PermissionGuard], data: { permission: 'iam:roles:read' } },
    { path: 'groups', component: StynxGroupsAdminComponent, canActivate: [PermissionGuard], data: { permission: 'iam:groups:read' } },
    { path: 'groups/:groupId', component: StynxGroupDetailComponent, canActivate: [PermissionGuard], data: { permission: 'iam:groups:read' } },
  ];
}

export function provideStynxIam(config: StynxIamConfig): EnvironmentProviders;
```

### B.8 — Translation catalog

- `src/i18n/en.json` and `src/i18n/pt-BR.json` covering every visible string (table headers, button labels, dialog titles, validation messages).
- Use the existing `TranslatePipe` from `@stynx-web/angular-i18n`. Every template literal consumed by `| translate`.

### B.9 — Tests

- TestBed component spec per shipped component (list rendering, sort, search, click, dialog open, form-state).
- Service spec with mocked HTTP transport for every method.
- Router spec navigating each `iamRoutes()` entry with a stubbed permission set.
- Permission-gated assertion: without `iam:users:read`, navigation to `/users` lands on the denial component.
- Mutation threshold: 70 % per the FE-05 schedule.

(Playwright scenarios in FE-WAVE-G.)

## Success criteria

1. `@stynx-web/angular-iam@0.1.0` package builds cleanly via `ng-packagr`.
2. Every component listed in B.3 / B.4 / B.5 / B.6 is shipped, standalone, `OnPush`, signal-driven UI state, typed reactive forms.
3. `IamApiService` covers every endpoint in B.2.
4. `iamRoutes()` and `provideStynxIam()` exported from `index.ts`.
5. Per-component TestBed specs pass; unit branch coverage ≥ 80 %.
6. Mutation score ≥ 70 % (Stryker recorded).
7. Translation catalogs `en` + `pt-BR` shipped; no untranslated literal strings in templates.
8. Wired into `test-matrix.config.json` and `coverage/test-evidence.json` is updated by a fresh `pnpm test:matrix` run.
9. Reference app (`reference/web`) mounts `iamRoutes()` under `/admin` and demonstrates the surface.

## Closure artifact

`docs/work/plan/FE-WAVE-B-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| B.1 scaffold | Engineer |
| B.2 service | Engineer |
| B.3–B.6 components | Engineer |
| B.7 routes + provider | Engineer |
| B.8 translation catalog | Engineer |
| B.9 tests | Inspector |
| ADR for IAM permission-key convention (`iam:users:read`, …) | Architect |
