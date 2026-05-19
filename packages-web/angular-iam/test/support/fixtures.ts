import { signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type {
  PagedResult,
  StynxCreateGroupRequest,
  StynxCreateRoleRequest,
  StynxCreateUserRequest,
  StynxEffectivePermissions,
  StynxGroup,
  StynxRole,
  StynxUser,
  StynxUserDetail,
} from '../../src/types';

export const USERS: StynxUser[] = [
  { id: 'user-1', email: 'ada@example.test', firstName: 'Ada', lastName: 'Lovelace', status: 'active', locale: 'en-US' },
  { id: 'user-2', email: 'grace@example.test', displayName: 'Grace Hopper', status: 'disabled' },
];

export const ROLES: StynxRole[] = [
  { id: 'role-1', key: 'admin', name: 'Admin', description: 'Administrators', permissionsCount: 2 },
  { id: 'role-2', key: 'viewer', name: 'Viewer', system: true },
];

export const GROUPS: StynxGroup[] = [
  { id: 'group-1', key: 'ops', name: 'Operations', description: 'Ops team', membersCount: 1, rolesCount: 1 },
  { id: 'group-2', key: 'finance', name: 'Finance' },
];

export const EFFECTIVE: StynxEffectivePermissions = {
  userId: 'user-1',
  permissions: [
    {
      permission: { key: 'iam:users:read', resource: 'users', action: 'read', description: 'Read users' },
      grantedBy: [{ type: 'role', id: 'role-1', key: 'admin', name: 'Admin' }],
    },
    {
      permission: { key: 'iam:groups:write', resource: 'groups', action: 'write' },
      grantedBy: [{ type: 'group', id: 'group-1', key: 'ops', name: 'Operations' }],
    },
  ],
};

export class FakeI18nService {
  readonly locale = signal('en-US');

  translate(key: string, params: Record<string, string | number> = {}): string {
    const suffix = Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : '';
    return `${key}${suffix}`;
  }
}

export class FakeToastService {
  readonly push = vi.fn();
}

export class FakeIamApi {
  private readonly usersState = signal<StynxUser[]>([...USERS]);
  private readonly rolesState = signal<StynxRole[]>([...ROLES]);
  private readonly groupsState = signal<StynxGroup[]>([...GROUPS]);

  readonly users: Signal<StynxUser[]> = this.usersState.asReadonly();
  readonly roles: Signal<StynxRole[]> = this.rolesState.asReadonly();
  readonly groups: Signal<StynxGroup[]> = this.groupsState.asReadonly();

  readonly listUsers = vi.fn((params: { page?: number; pageSize?: number } = {}) => {
    const pageSize = params.pageSize ?? 10;
    this.usersState.set([...USERS]);
    return of<PagedResult<StynxUser>>({
      items: this.usersState(),
      meta: { page: params.page ?? 1, pageSize, total: this.usersState().length },
    });
  });
  readonly getUser = vi.fn((id: string) => of<StynxUserDetail>({
    ...USERS.find((user) => user.id === id)!,
    groups: [GROUPS[0]!],
    roles: [ROLES[0]!],
    effectivePermissions: EFFECTIVE,
  }));
  readonly createUser = vi.fn((body: StynxCreateUserRequest) => {
    const user: StynxUser = { id: 'user-created', email: body.email };
    if (body.firstName) user.firstName = body.firstName;
    if (body.lastName) user.lastName = body.lastName;
    this.usersState.set([user, ...this.usersState()]);
    return of(user);
  });
  readonly patchUser = vi.fn((id: string, diff: Partial<StynxUser>) => of({ ...USERS[0]!, id, ...diff }));
  readonly disableUser = vi.fn(() => of(undefined));
  readonly reactivateUser = vi.fn(() => of(undefined));
  readonly inviteUser = vi.fn(() => of(undefined));
  readonly forceLogoutUser = vi.fn(() => of(undefined));
  readonly listUserRoles = vi.fn(() => of([ROLES[0]!]));
  readonly setUserRoles = vi.fn(() => of(undefined));
  readonly listUserGroups = vi.fn(() => of([GROUPS[0]!]));
  readonly setUserGroups = vi.fn(() => of(undefined));
  readonly getEffectivePermissions = vi.fn(() => of(EFFECTIVE));

  readonly listRoles = vi.fn(() => {
    this.rolesState.set([...ROLES]);
    return of(this.rolesState());
  });
  readonly createRole = vi.fn((body: StynxCreateRoleRequest) => {
    const role = { id: 'role-created', ...body };
    this.rolesState.set([role, ...this.rolesState()]);
    return of(role);
  });
  readonly patchRole = vi.fn((id: string, diff: Partial<StynxRole>) => of({ ...ROLES[0]!, id, ...diff }));
  readonly deleteRole = vi.fn((id: string) => {
    this.rolesState.set(this.rolesState().filter((role) => role.id !== id));
    return of(undefined);
  });
  readonly cloneRole = vi.fn((_id: string, body: StynxCreateRoleRequest) => of({ id: 'role-clone', ...body }));
  readonly listRolePermissions = vi.fn(() => of([
    { key: 'iam:users:read', resource: 'users', action: 'read' },
    { key: 'iam:custom:approve' },
  ]));
  readonly setRolePermissions = vi.fn(() => of(undefined));

  readonly listGroups = vi.fn(() => {
    this.groupsState.set([...GROUPS]);
    return of(this.groupsState());
  });
  readonly createGroup = vi.fn((body: StynxCreateGroupRequest) => {
    const group: StynxGroup = { id: 'group-created', ...body };
    this.groupsState.set([group, ...this.groupsState()]);
    return of(group);
  });
  readonly patchGroup = vi.fn((id: string, diff: Partial<StynxGroup>) => of({ ...GROUPS[0]!, id, ...diff }));
  readonly deleteGroup = vi.fn((id: string) => {
    this.groupsState.set(this.groupsState().filter((group) => group.id !== id));
    return of(undefined);
  });
  readonly listGroupRoles = vi.fn(() => of([ROLES[0]!]));
  readonly setGroupRoles = vi.fn(() => of(undefined));
  readonly listGroupMembers = vi.fn(() => of([USERS[0]!]));
  readonly setGroupMembers = vi.fn(() => of(undefined));
}
