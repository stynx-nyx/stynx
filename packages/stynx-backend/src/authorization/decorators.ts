import { SetMetadata } from '@nestjs/common';
import type { PermissionRequirement, RequirementMatchMode, RoleRequirement } from '@stech/stynx-contracts';
import { STYNX_AUTHZ_METADATA } from './constants';

export interface AuthzMetadata {
  roles?: RoleRequirement;
  permissions?: PermissionRequirement;
}

export function RequireRoles(roles: string[], mode: RequirementMatchMode = 'all'): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_AUTHZ_METADATA, { roles: { roles, mode } } satisfies AuthzMetadata);
}

export function RequirePermissions(
  permissions: string[],
  mode: RequirementMatchMode = 'all',
): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_AUTHZ_METADATA, {
    permissions: { permissions, mode },
  } satisfies AuthzMetadata);
}
