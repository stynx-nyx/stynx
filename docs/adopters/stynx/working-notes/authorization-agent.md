# Authorization Agent Working Note

## Decision summary

Adopt a shared authorization kernel in `stynx` based on request principal normalization + metadata requirements + pluggable evaluators. Keep role/permission catalogs and mapping rules in each app (`porm`, `pec`, `sgp`) and only standardize evaluator interfaces and execution pipeline in `stynx`.

## Files inspected (code evidence)

### porm

- `porm/backend/src/core/auth/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate`
- `porm/backend/src/core/auth/auth.service.ts`
  - `AuthService.verifyBearer`, `AuthService.assertAudience`, `extractRoles`
- `porm/backend/src/core/admin/users/admin-only.guard.ts`
  - `AdminOnlyGuard.canActivate`
- `porm/backend/src/flow/services/flow-policy.service.ts`
  - `FlowPolicyService.getActivePolicySet`, `FlowPolicyService.evaluateAction`, `FlowPolicyService.evaluateCapability`, `FlowPolicyService.matchesConditions`, `FlowPolicyService.decide`
- `porm/backend/src/common/utils/role-assertions.ts`
  - `hasAnyRole`, `requireAnyRole`
- `porm/backend/src/common/services/context-aware.service.ts`
  - `ContextAwareService.hasRole`, `ContextAwareService.ensureAnyRole`
- `porm/backend/src/core/admin/auth/admin-auth.controller.ts`
  - class-level `@UseGuards(JwtAuthGuard, AdminOnlyGuard)` on `AdminAuthController`
- `porm/backend/src/database/database.service.ts`
  - `DatabaseService.withTransaction` (`set_config('auth.roles', ...)`)
- `porm/database/auth/ddl.sql`
  - `auth.context_roles`, `auth.context_has_role`, `auth.has_role`, `auth.has_any_role`
- `porm/database/flow/rls.sql`
  - `flow.has_role`, `flow.is_staff`, `flow.can_view_target`, `flow.can_manage_target`
- `porm/database/porm/rls.sql`
  - `porm.has_role`, `porm.has_any_role`, `porm.can_view_subject_id`, `porm.can_manage_subject_id`

### pec

- `pec/src/@core/security/roles.decorator.ts`
  - `ROLES_METADATA_KEY`, `RoleCode`, `ALL_ROLES`, `Roles`
- `pec/src/@core/security/roles.guard.ts`
  - `RolesGuard.canActivate`
- `pec/src/@core/security/roles.util.ts`
  - `normalizeRoles`
- `pec/src/@core/security/role-policies.ts`
  - `ADMIN_ROLES`, `SWITCH_TENANT_ROLES`, `PATIENT_READ_ROLES`, `PATIENT_WRITE_ROLES`, etc.
- `pec/src/@core/security/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate`
- `pec/src/@core/core.module.ts`
  - global guard registration via `APP_GUARD` (`JwtAuthGuard`, `RolesGuard`)
- `pec/src/auth/auth.controller.ts`
  - `@UseGuards(RolesGuard)`, `@Roles(...SWITCH_TENANT_ROLES)`
- `pec/src/pec/biometrics/biometrics.controller.ts`
  - `@Roles(...)`, `ensureVerifyPermissions`, `extractRoles`
- `pec/database/ddl/01-auth.sql`
  - tables `auth.roles`, `auth.permissions`, `auth.user_roles`, `auth.role_permissions`

### sgp

- `sgp/source/backend/src/auth/permissions.decorator.ts`
  - `REQUIRED_PERMISSIONS`, `RequirePermissions`
- `sgp/source/backend/src/auth/permissions.guard.ts`
  - `PermissionsGuard.canActivate`
- `sgp/source/backend/src/auth/cognito-jwt.guard.ts`
  - `CognitoJwtGuard.canActivate`
- `sgp/source/backend/src/auth/cognito-jwt.service.ts`
  - `verifyAuthorizationHeader`, `verifyToken`, `toActor`
- `sgp/source/backend/src/auth/auth.types.ts`
  - `AuthenticatedActor` (`groups`, `permissions`)
- `sgp/source/backend/src/iam/permissions/permission-catalog.ts`
  - `PERMISSIONS`, `GROUP_PERMISSION_MAP`
- `sgp/source/backend/src/iam/permissions/permissions.service.ts`
  - `PermissionsService.permissionsForGroups`
- `sgp/source/backend/src/iam/permissions/permissions.controller.ts`
  - `@UseGuards(CognitoJwtGuard, PermissionsGuard)`, `@RequirePermissions('iam:read')`
- `sgp/source/backend/src/notifications/notifications.controller.ts`
  - `@RequirePermissions('auth:read')`
- `sgp/source/backend/src/database/database.service.ts`
  - `applySessionContext` (`app.current_permissions`, `app.current_groups`)
- `sgp/source/database/sql/11-rls-context.sql`
  - `public.sgp_current_permissions`, `public.sgp_has_permission`
- `sgp/source/database/sql/10-auth.sql`
  - views `public.v_permission_catalog`, `public.v_profile_permission_matrix`
- `sgp/source/backend/prisma/schema.prisma`
  - models `Permission`, `AccessProfile`, `ProfilePermission`

### stynx

- `stynx/backend/src/core/auth/decorators/roles.decorator.ts`
  - `ROLES_METADATA_KEY`, `RequireRoles`
- `stynx/backend/src/core/auth/guards/role.guard.ts`
  - `RoleGuard.canActivate`
- `stynx/backend/src/core/auth/guards/jwt-auth.guard.ts`
  - `JwtAuthGuard.canActivate`
- `stynx/backend/src/core/auth/guards/user.guard.ts`
  - `UserGuard.canActivate`
- `stynx/backend/src/core/auth/guards/tenancy.guard.ts`
  - `TenancyGuard.canActivate`
- `stynx/backend/src/core/auth/auth.service.ts`
  - `AuthService.verifyBearer`, `AuthService.resolveRoles`, `AuthService.resolveTenants`
- `stynx/backend/src/core/auth/auth.module.ts`
  - exported auth guards/services
- `stynx/backend/src/core/roles/roles.controller.ts`
  - `@RequireRoles('platform:admin', 'platform:superadmin')`
- `stynx/backend/src/core/roles/roles.service.ts`
  - `RolesService.list`, `RolesService.create`, `RolesService.assignRole`
- `stynx/backend/src/core/tenancy/tenancy.controller.ts`
  - `@UseGuards(RoleGuard)`, `@RequireRoles(...)`
- `stynx/database/ddl/01-auth.sql`
  - `auth.current_roles`, `auth.has_role`, `auth.set_user_context`, RLS policies using `auth.has_role('platform:superadmin')`

## Same-vs-different semantics

| Dimension            | porm                                                                                                                                | pec                                                                                                            | sgp                                                                                                         | stynx                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Decorator model      | No backend role/permission metadata decorator found in inspected backend files; routes rely on `@UseGuards(...)` and service checks | Role metadata decorator: `Roles(...RoleCode[])`                                                                | Permission metadata decorator: `RequirePermissions(...string[])`                                            | Role metadata decorator: `RequireRoles(...string[])`                                                            |
| Guard decision type  | `AdminOnlyGuard` is role check (`admin`); most routes only require JWT                                                              | `RolesGuard` checks any overlap with `requiredRoles`                                                           | `PermissionsGuard` requires **all** declared permissions (`every`)                                          | `RoleGuard` checks any overlap with required roles                                                              |
| Principal enrichment | `JwtAuthGuard` sets `req.user` from `AuthService.verifyBearer` (`id`, `roles`, `orgCnpj`)                                           | `JwtAuthGuard` verifies token, normalizes roles via `normalizeRoles`, binds tenant client                      | `CognitoJwtGuard` sets `request.actor`; permissions derived by `PermissionsService.permissionsForGroups`    | `JwtAuthGuard` sets `request.user` with `roles` + `tenants`; tenant resolved from header or single-tenant token |
| Catalog location     | Role semantics split between code checks and DB functions (`auth.*`, `porm.*`, `flow.*`) and flow policy tables                     | Role sets centralized in `role-policies.ts`; DB also defines `auth.permissions`/`auth.role_permissions` tables | Permission catalog and group mapping in `permission-catalog.ts`; DB has permission/profile models and views | Role model in code + DB; no permission decorator/guard/catalog in inspected `stynx`                             |
| Evaluator style      | Rule evaluator service (`FlowPolicyService`) with conditions (`rolesAny`, `orgRelationIn`, `assignmentStateIn`, `requireCreatedBy`) | Mostly guard-level RBAC + some action-specific in-method checks (`ensureVerifyPermissions`)                    | Permission guard + mapping evaluator (`permissionsForGroups`) + DB helper (`sgp_has_permission`)            | Simple role guard + tenancy/user guards                                                                         |

## Shared authorization primitives (proposed)

1. `AuthorizationPrincipal`

- normalized subject used by all evaluators:
  - `subjectId: string`
  - `roles: string[]`
  - `permissions: string[]`
  - `groups: string[]`
  - `tenants: string[]`
  - `claims: Record<string, unknown>`

2. `AuthorizationRequirement` (metadata payload)

- support coexistence explicitly:
  - `rolesAny?: string[]`
  - `rolesAll?: string[]`
  - `permissionsAny?: string[]`
  - `permissionsAll?: string[]`
  - `policy?: { engine: string; key: string; params?: Record<string, unknown> }`

3. `AuthorizationDecision`

- evaluator output:
  - `allow: boolean`
  - `reasonCode: string`
  - `evaluator: string`
  - `details?: Record<string, unknown>`

4. `AuthorizationGuard` pipeline in `stynx`

- sequence:
  - collect merged requirements from metadata
  - execute registered evaluators by requirement type
  - fail closed on denied decision

5. Default evaluators in `stynx`

- `RoleEvaluator` (supports any/all)
- `PermissionEvaluator` (supports any/all)
- optional `TenantEvaluator` for tenant-scoped requirement checks

6. App-provided pluggable evaluators (outside `stynx`)

- `porm`: adapter around `FlowPolicyService.evaluateAction/evaluateCapability`
- `pec`: optional evaluator for contextual checks like `BiometricsController.ensureVerifyPermissions`
- `sgp`: evaluator backed by app-local catalog/mapping (`PermissionsService.permissionsForGroups`)

## Required interfaces

```ts
export interface AuthorizationEvaluator {
  id: string;
  supports(requirement: AuthorizationRequirement): boolean;
  evaluate(input: {
    principal: AuthorizationPrincipal;
    requirement: AuthorizationRequirement;
    resource?: Record<string, unknown>;
  }): Promise<AuthorizationDecision> | AuthorizationDecision;
}

export interface AuthorizationCatalogProvider {
  // app-local source of truth; stynx must not own domain catalogs
  listRoles?(): readonly string[];
  listPermissions?(): readonly string[];
  mapGroupsToPermissions?(groups: readonly string[]): readonly string[];
}

export interface AuthorizationContextBinder {
  // DB session projection for RLS helpers
  bind(client: unknown, principal: AuthorizationPrincipal): Promise<void>;
}
```

## Exclusions

- Do not migrate app-specific catalogs into `stynx`:
  - `pec/src/@core/security/role-policies.ts`
  - `sgp/source/backend/src/iam/permissions/permission-catalog.ts`
  - PORM flow policy data in `flow.policy_sets` / `flow.policy_rules` and `FlowPolicyService`
- Do not remove role model in favor of permission-only model.
- Do not remove permission model where it already exists (`sgp`, PEC DB schema).
- Do not alter existing RLS helper function contracts in this phase (`auth.has_role`, `sgp_has_permission`, etc.).

## Migration risks

- Semantic drift risk (high): current guards differ (`any-role` vs `all-permissions`); incorrect default combiner can broaden or shrink access.
- Claim-shape risk (high): role extraction differs by app (`cognito:groups` only in PEC vs multi-claim in stynx/porm); unified principal mapper may drop effective roles.
- Hidden in-method authorization risk (medium): controller/service checks like `ensureVerifyPermissions` can be missed if migration only targets decorators/guards.
- RLS context mismatch risk (high): each app sets different session keys (`auth.roles`, `app.current_permissions`); incomplete binder breaks DB-level enforcement.
- Catalog ownership risk (medium): moving catalogs into `stynx` would create cross-app coupling and slower policy iteration.
- Rollout risk (medium): PEC uses global guards (`APP_GUARD`), while SGP/PORM rely on route/class guards; migration requires staged dual-run or feature flagging.
