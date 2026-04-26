import type { FrontendPrincipal } from '@stech/stynx-frontend-contracts';

const normalize = (value: string): string => value.trim().toLowerCase();

export const hasAnyRole = (principal: FrontendPrincipal | null, requiredRoles: string[]): boolean => {
  if (!principal) {
    return false;
  }
  const expected = new Set(requiredRoles.map(normalize));
  return principal.roles.some((role) => expected.has(normalize(role)));
};

export const hasAnyPermission = (
  principal: FrontendPrincipal | null,
  requiredPermissions: string[],
): boolean => {
  if (!principal) {
    return false;
  }
  const expected = new Set(requiredPermissions.map(normalize));
  return principal.permissions.some((permission) => expected.has(normalize(permission)));
};

export const hasAllPermissions = (
  principal: FrontendPrincipal | null,
  requiredPermissions: string[],
): boolean => {
  if (!principal) {
    return false;
  }
  const granted = new Set(principal.permissions.map(normalize));
  return requiredPermissions.map(normalize).every((permission) => granted.has(permission));
};
