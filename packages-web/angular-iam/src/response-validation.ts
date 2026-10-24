import type { StynxUser, StynxUserDetail, StynxRole, StynxGroup, StynxPermission, StynxPermissionGrant, StynxEffectivePermissions, PagedResult } from './types';

/** Complete declared-field guards; returned values retain identity and unknown extensions. */
export type Guard<T> = (value: unknown) => value is T;
type Shape<T> = { [K in keyof T]-?: Guard<T[K]> };

export const string: Guard<string> = (value): value is string => typeof value === 'string';
export const number: Guard<number> = (value): value is number => typeof value === 'number';
export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
export const opaque: Guard<unknown> = (_value): _value is unknown => true;
export const record: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const nullValue: Guard<null> = (value): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    // Visit empty slots too; every() skips them and cannot establish T[].
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (!guard(item)) return false;
    }
    return true;
  };
}
export function union<A, B>(left: Guard<A>, right: Guard<B>): Guard<A | B> {
  return (value): value is A | B => left(value) || right(value);
}
export function literals<const T extends string>(...values: readonly T[]): Guard<T> {
  return (value): value is T => values.some((candidate) => candidate === value);
}
export function object<T extends object>(shape: Shape<T>): Guard<T> {
  return (value): value is T => {
    if (!record(value)) return false;
    for (const key in shape) {
      if (!shape[key](value[key])) return false;
    }
    return true;
  };
}
export function decode<T>(guard: Guard<T>, name: string): (value: unknown) => T {
  return (value) => {
    if (!guard(value)) throw new TypeError(`Invalid ${name} response`);
    return value;
  };
}

export function isStynxUser(value: unknown): value is StynxUser {
  return object<StynxUser>({
    id: string,
    tenantId: optional(string),
    email: string,
    firstName: optional(nullable(string)),
    lastName: optional(nullable(string)),
    displayName: optional(nullable(string)),
    locale: optional(nullable(string)),
    status: optional(string),
    createdAt: optional(string),
    updatedAt: optional(string),
    disabledAt: optional(nullable(string)),
    lastLoginAt: optional(nullable(string)),
  })(value);
}

export function isStynxUserDetail(value: unknown): value is StynxUserDetail {
  return object<StynxUserDetail>({
    id: string,
    tenantId: optional(string),
    email: string,
    firstName: optional(nullable(string)),
    lastName: optional(nullable(string)),
    displayName: optional(nullable(string)),
    locale: optional(nullable(string)),
    status: optional(string),
    createdAt: optional(string),
    updatedAt: optional(string),
    disabledAt: optional(nullable(string)),
    lastLoginAt: optional(nullable(string)),
    roles: optional(array(isStynxRole)),
    groups: optional(array(isStynxGroup)),
    effectivePermissions: optional(isStynxEffectivePermissions),
  })(value);
}

export function isStynxRole(value: unknown): value is StynxRole {
  return object<StynxRole>({
    id: string,
    tenantId: optional(string),
    key: string,
    name: string,
    description: optional(nullable(string)),
    system: optional(boolean),
    membersCount: optional(number),
    permissionsCount: optional(number),
    createdAt: optional(string),
    updatedAt: optional(string),
  })(value);
}

export function isStynxGroup(value: unknown): value is StynxGroup {
  return object<StynxGroup>({
    id: string,
    tenantId: optional(string),
    key: string,
    name: string,
    description: optional(nullable(string)),
    membersCount: optional(number),
    rolesCount: optional(number),
    createdAt: optional(string),
    updatedAt: optional(string),
  })(value);
}

export function isStynxPermission(value: unknown): value is StynxPermission {
  return object<StynxPermission>({
    id: optional(string),
    key: string,
    resource: optional(string),
    action: optional(string),
    description: optional(nullable(string)),
  })(value);
}

export function isStynxPermissionGrant(value: unknown): value is StynxPermissionGrant {
  return object<StynxPermissionGrant>({
    permission: isStynxPermission,
    grantedBy: array(object<StynxPermissionGrant['grantedBy'][number]>({ type: literals('role', 'group'), id: string, key: optional(string), name: optional(string) })),
  })(value);
}

export function isStynxEffectivePermissions(value: unknown): value is StynxEffectivePermissions {
  return object<StynxEffectivePermissions>({
    userId: string,
    permissions: array(isStynxPermissionGrant),
  })(value);
}

export function isPagedResult<T>(item: Guard<T>): Guard<PagedResult<T>> {
  return object<PagedResult<T>>({ items: array(item), meta: object<PagedResult<T>['meta']>({ page: number, pageSize: number, total: number }) });
}
