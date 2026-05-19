export interface PagedResult<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface IamListUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
  tenantId?: string;
}

export interface StynxUser {
  id: string;
  tenantId?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  locale?: string | null;
  status?: 'active' | 'disabled' | 'invited' | 'archived' | string;
  createdAt?: string;
  updatedAt?: string;
  disabledAt?: string | null;
  lastLoginAt?: string | null;
}

export interface StynxUserDetail extends StynxUser {
  roles?: StynxRole[];
  groups?: StynxGroup[];
  effectivePermissions?: StynxEffectivePermissions;
}

export interface StynxCreateUserRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  locale?: string;
  sendInvite?: boolean;
}

export type StynxPatchUserRequest = Partial<Omit<StynxCreateUserRequest, 'sendInvite'>> & {
  status?: StynxUser['status'];
};

export interface StynxRole {
  id: string;
  tenantId?: string;
  key: string;
  name: string;
  description?: string | null;
  system?: boolean;
  membersCount?: number;
  permissionsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StynxCreateRoleRequest {
  key: string;
  name: string;
  description?: string;
}

export type StynxPatchRoleRequest = Partial<StynxCreateRoleRequest>;

export interface StynxCloneRoleRequest {
  key: string;
  name: string;
  description?: string;
}

export interface StynxGroup {
  id: string;
  tenantId?: string;
  key: string;
  name: string;
  description?: string | null;
  membersCount?: number;
  rolesCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StynxCreateGroupRequest {
  key: string;
  name: string;
  description?: string;
}

export type StynxPatchGroupRequest = Partial<StynxCreateGroupRequest>;

export interface StynxPermission {
  id?: string;
  key: string;
  resource?: string;
  action?: string;
  description?: string | null;
}

export interface StynxPermissionGrant {
  permission: StynxPermission;
  grantedBy: Array<{
    type: 'role' | 'group';
    id: string;
    key?: string;
    name?: string;
  }>;
}

export interface StynxEffectivePermissions {
  userId: string;
  permissions: StynxPermissionGrant[];
}
