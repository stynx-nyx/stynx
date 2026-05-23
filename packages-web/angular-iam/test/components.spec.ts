import '@angular/compiler';
import { signal } from '@angular/core';
import type { Provider, Signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxToastService } from '@stynx-web/angular-ui';
import { of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../src/iam-api.service';
import { StynxEffectivePermissionsComponent } from '../src/effective-permissions.component';
import { StynxGroupCreateDialogComponent } from '../src/group-create-dialog.component';
import { StynxGroupDetailComponent } from '../src/group-detail.component';
import { StynxGroupMembersEditorComponent } from '../src/group-members-editor.component';
import { StynxGroupRolesEditorComponent } from '../src/group-roles-editor.component';
import { StynxGroupsAdminComponent } from '../src/groups-admin.component';
import { StynxPermissionMatrixComponent } from '../src/permission-matrix.component';
import { StynxRoleCreateDialogComponent } from '../src/role-create-dialog.component';
import { StynxRoleDetailComponent } from '../src/role-detail.component';
import { StynxRolesAdminComponent } from '../src/roles-admin.component';
import { StynxUserCreateDialogComponent } from '../src/user-create-dialog.component';
import { StynxUserDetailComponent } from '../src/user-detail.component';
import { StynxUserDisableConfirmDialogComponent } from '../src/user-disable-confirm-dialog.component';
import { StynxUsersAdminComponent } from '../src/users-admin.component';
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
} from '../src/types';

const USERS: StynxUser[] = [
  { id: 'user-1', email: 'ada@example.test', firstName: 'Ada', lastName: 'Lovelace', status: 'active', locale: 'en-US' },
  { id: 'user-2', email: 'grace@example.test', displayName: 'Grace Hopper', status: 'disabled' },
];
const ROLES: StynxRole[] = [
  { id: 'role-1', key: 'admin', name: 'Admin', description: 'Administrators', permissionsCount: 2 },
  { id: 'role-2', key: 'viewer', name: 'Viewer', system: true },
];
const GROUPS: StynxGroup[] = [
  { id: 'group-1', key: 'ops', name: 'Operations', description: 'Ops team', membersCount: 1, rolesCount: 1 },
  { id: 'group-2', key: 'finance', name: 'Finance' },
];
const EFFECTIVE: StynxEffectivePermissions = {
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

class FakeI18nService {
  readonly locale = signal('en-US');

  translate(key: string, params: Record<string, string | number> = {}): string {
    const suffix = Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : '';
    return `${key}${suffix}`;
  }
}

class FakeToastService {
  readonly push = vi.fn();
}

class FakeIamApi {
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
    if (body.firstName) {
      user.firstName = body.firstName;
    }
    if (body.lastName) {
      user.lastName = body.lastName;
    }
    this.usersState.set([user, ...this.usersState()]);
    return of(user);
  });
  readonly patchUser = vi.fn((id: string, diff: Partial<StynxUser>) => {
    const updated = { ...USERS[0]!, id, ...diff };
    this.usersState.set(this.usersState().map((user) => (user.id === id ? updated : user)));
    return of(updated);
  });
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
  readonly patchRole = vi.fn((id: string, diff: Partial<StynxRole>) => {
    const updated = { ...ROLES[0]!, id, ...diff };
    this.rolesState.set(this.rolesState().map((role) => (role.id === id ? updated : role)));
    return of(updated);
  });
  readonly deleteRole = vi.fn((id: string) => {
    this.rolesState.set(this.rolesState().filter((role) => role.id !== id));
    return of(undefined);
  });
  readonly cloneRole = vi.fn((_id: string, body: StynxCreateRoleRequest) => {
    const role = { id: 'role-clone', ...body };
    this.rolesState.set([role, ...this.rolesState()]);
    return of(role);
  });
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
  readonly patchGroup = vi.fn((id: string, diff: Partial<StynxGroup>) => {
    const updated = { ...GROUPS[0]!, id, ...diff };
    this.groupsState.set(this.groupsState().map((group) => (group.id === id ? updated : group)));
    return of(updated);
  });
  readonly deleteGroup = vi.fn((id: string) => {
    this.groupsState.set(this.groupsState().filter((group) => group.id !== id));
    return of(undefined);
  });
  readonly listGroupRoles = vi.fn(() => of([ROLES[0]!]));
  readonly setGroupRoles = vi.fn(() => of(undefined));
  readonly listGroupMembers = vi.fn(() => of([USERS[0]!]));
  readonly setGroupMembers = vi.fn(() => of(undefined));
}

type UsersAdminAccess = {
  displayName(user: StynxUser): string;
  statusKey(user: StynxUser): string;
  search(): void;
  clearSearch(): void;
  pageChanged(event: { pageIndex: number; pageSize: number }): void;
  openCreateDialog(): void;
  closeCreateDialog(): void;
  createUser(body: StynxCreateUserRequest): void;
  openDetail(user: StynxUser): void;
};
type RoleAdminAccess = {
  search(): void;
  clearSearch(): void;
  openCreateDialog(): void;
  openCloneDialog(role: StynxRole): void;
  closeDialog(): void;
  createRole(body: StynxCreateRoleRequest): void;
  cloneRole(body: StynxCreateRoleRequest): void;
  deleteRole(role: StynxRole): void;
  openDetail(role: StynxRole): void;
};
type GroupAdminAccess = {
  search(): void;
  clearSearch(): void;
  openCreateDialog(): void;
  closeCreateDialog(): void;
  createGroup(body: StynxCreateGroupRequest): void;
  deleteGroup(group: StynxGroup): void;
  openDetail(group: StynxGroup): void;
};
type DetailAccess = {
  tabKey(tab: string): string;
  displayName(user: StynxUser): string;
  statusKey(user: StynxUser): string;
  grantSourceKey(type: 'role' | 'group'): string;
  roleAssigned(id: string): boolean;
  groupAssigned(id: string): boolean;
  systemKey?(role: StynxRole): string;
  saveOverview(): void;
  toggleRole(id: string): void;
  toggleGroup(id: string): void;
  saveRoles(): void;
  saveGroups(): void;
  sendInvite(): void;
  forceLogout(): void;
  reactivate(): void;
  disableUser(): void;
};
type MatrixAccess = {
  applySearch(): void;
  clearSearch(): void;
  dirtyKey(): string;
  permissionSelected(key: string): boolean;
  selectedInGroup(group: { permissions: Array<{ key: string }> }): number;
  togglePermission(key: string): void;
  selectResource(group: { permissions: Array<{ key: string }> }): void;
  clearResource(group: { permissions: Array<{ key: string }> }): void;
  save(): void;
};
type EditorAccess = {
  search?(): void;
  clearSearch?(): void;
  toggleRole?(id: string): void;
  toggleMember?(id: string): void;
  hasRole?(id: string): boolean;
  hasMember?(id: string): boolean;
  save(): void;
};
type EffectiveAccess = {
  applySearch(): void;
  clearSearch(): void;
  refresh(): void;
  emptyTitleKey(): string;
  emptyDescriptionKey(): string;
  sourceTypeKey(type: 'role' | 'group'): string;
};
type DialogAccess = {
  submit(): void;
  titleKey?(): string;
  submitKey?(): string;
};

function setup<T>(component: Type<T>, extraProviders: Provider[] = []) {
  const api = new FakeIamApi();
  const i18n = new FakeI18nService();
  const toast = new FakeToastService();
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      { provide: IamApiService, useValue: api },
      { provide: StynxI18nService, useValue: i18n },
      { provide: StynxToastService, useValue: toast },
      ...extraProviders,
    ],
  });
  const fixture = TestBed.createComponent(component);
  return { api, fixture, i18n, toast, component: fixture.componentInstance };
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-iam component TestBed specs', () => {
  it('renders the users admin table and drives search, pagination, creation, and selection', () => {
    const { api, fixture, component, toast } = setup(StynxUsersAdminComponent);
    const access = component as unknown as UsersAdminAccess;
    const selected: StynxUser[] = [];
    component.userSelected.subscribe((user) => selected.push(user));

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ada@example.test');
    component.searchForm.controls.q.setValue(' Ada ');
    access.search();
    access.pageChanged({ pageIndex: 1, pageSize: 25 });
    access.openCreateDialog();
    expect(component.createOpen()).toBe(true);
    access.createUser({ email: 'new@example.test', sendInvite: true });
    access.openDetail(USERS[0]!);

    expect(api.listUsers).toHaveBeenCalledWith({ q: 'Ada', page: 1, pageSize: 10 });
    expect(api.listUsers).toHaveBeenCalledWith({ q: 'Ada', page: 2, pageSize: 25 });
    expect(api.createUser).toHaveBeenCalledWith({ email: 'new@example.test', sendInvite: true });
    expect(component.createOpen()).toBe(false);
    expect(selected).toEqual([USERS[0]]);
    expect(toast.push).toHaveBeenCalledWith('iam.users.create.created', 'success');

    component.createSaving.set(true);
    access.openCreateDialog();
    access.closeCreateDialog();
    expect(component.createOpen()).toBe(true);
    component.createSaving.set(false);
    access.closeCreateDialog();
    expect(component.createOpen()).toBe(false);
    access.clearSearch();
    expect(component.searchForm.controls.q.value).toBe('');
  });

  it('renders user create and disable dialogs with validated output payloads', () => {
    const userDialog = setup(StynxUserCreateDialogComponent);
    const created: StynxCreateUserRequest[] = [];
    userDialog.component.open = true;
    userDialog.component.create.subscribe((body) => created.push(body));
    userDialog.fixture.detectChanges();
    expect(userDialog.fixture.nativeElement.textContent).toContain('iam.users.create.title');

    userDialog.component.form.setValue({
      email: 'ada@example.test',
      firstName: ' Ada ',
      lastName: ' ',
      locale: ' pt-BR ',
      sendInvite: false,
    });
    userDialog.component.submit();
    expect(created).toEqual([{ email: 'ada@example.test', firstName: 'Ada', locale: 'pt-BR', sendInvite: false }]);
    userDialog.component.reset();
    expect(userDialog.component.form.controls.sendInvite.value).toBe(true);

    TestBed.resetTestingModule();

    const disableDialog = setup(StynxUserDisableConfirmDialogComponent);
    const seen: string[] = [];
    disableDialog.component.open = true;
    disableDialog.component.user = USERS[0]!;
    disableDialog.component.confirm.subscribe(() => seen.push('confirm'));
    disableDialog.component.dismissed.subscribe(() => seen.push('dismiss'));
    disableDialog.fixture.detectChanges();
    disableDialog.component.confirm.emit();
    disableDialog.component.dismissed.emit();
    expect(seen).toEqual(['confirm', 'dismiss']);
  });

  it('drives role admin list, clone/create dialog, deletes, and system-role guard', () => {
    const { api, fixture, component, toast } = setup(StynxRolesAdminComponent);
    const access = component as unknown as RoleAdminAccess;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Admin');

    component.searchForm.controls.q.setValue('view');
    access.search();
    expect(component.filteredRoles().map((role) => role.key)).toEqual(['viewer']);
    access.clearSearch();
    expect(component.filteredRoles()).toHaveLength(2);

    access.openCreateDialog();
    expect(component.createOpen()).toBe(true);
    access.createRole({ key: 'operator', name: 'Operator' });
    expect(api.createRole).toHaveBeenCalledWith({ key: 'operator', name: 'Operator' });

    access.openCloneDialog(ROLES[0]!);
    expect(component.cloneSource()).toEqual(ROLES[0]);
    access.cloneRole({ key: 'admin-copy', name: 'Admin copy' });
    expect(api.cloneRole).toHaveBeenCalledWith('role-1', { key: 'admin-copy', name: 'Admin copy' });

    access.deleteRole(ROLES[1]!);
    expect(api.deleteRole).not.toHaveBeenCalledWith('role-2');
    access.deleteRole(ROLES[0]!);
    expect(api.deleteRole).toHaveBeenCalledWith('role-1');
    expect(toast.push).toHaveBeenCalledWith('iam.roles.delete.deleted', 'success');

    component.dialogSaving.set(true);
    access.openCreateDialog();
    access.closeDialog();
    expect(component.createOpen()).toBe(true);
  });

  it('renders role create dialog and emits create versus clone payloads', () => {
    const { fixture, component } = setup(StynxRoleCreateDialogComponent);
    const access = component as unknown as DialogAccess;
    const created: StynxCreateRoleRequest[] = [];
    const cloned: StynxCreateRoleRequest[] = [];
    component.open = true;
    component.create.subscribe((body) => created.push(body));
    component.clone.subscribe((body) => cloned.push(body));
    component.form.setValue({ key: ' admin ', name: ' Admin ', description: ' ' });
    access.submit();
    component.sourceRole = ROLES[0]!;
    component.form.setValue({ key: ' clone ', name: ' Clone ', description: ' Copied ' });
    access.submit();
    fixture.detectChanges();

    expect(created).toEqual([{ key: 'admin', name: 'Admin' }]);
    expect(cloned).toEqual([{ key: 'clone', name: 'Clone', description: 'Copied' }]);
    expect(access.titleKey?.()).toBe('iam.roles.clone.title');
    expect(access.submitKey?.()).toBe('iam.roles.clone.submit');
  });

  it('drives group admin list, create dialog, delete, and search branches', () => {
    const { api, fixture, component, toast } = setup(StynxGroupsAdminComponent);
    const access = component as unknown as GroupAdminAccess;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Operations');

    component.searchForm.controls.q.setValue('fin');
    access.search();
    expect(component.filteredGroups().map((group) => group.key)).toEqual(['finance']);
    access.clearSearch();
    access.openCreateDialog();
    access.createGroup({ key: 'support', name: 'Support' });
    access.deleteGroup(GROUPS[0]!);

    expect(api.createGroup).toHaveBeenCalledWith({ key: 'support', name: 'Support' });
    expect(api.deleteGroup).toHaveBeenCalledWith('group-1');
    expect(toast.push).toHaveBeenCalledWith('iam.groups.delete.deleted', 'success');
    component.createSaving.set(true);
    access.openCreateDialog();
    access.closeCreateDialog();
    expect(component.createOpen()).toBe(true);
  });

  it('renders group create dialog and trims optional description', () => {
    const { fixture, component } = setup(StynxGroupCreateDialogComponent);
    const access = component as unknown as DialogAccess;
    const created: StynxCreateGroupRequest[] = [];
    component.open = true;
    component.create.subscribe((body) => created.push(body));
    component.form.setValue({ key: ' ops ', name: ' Operations ', description: ' Team ' });
    access.submit();
    fixture.detectChanges();
    expect(created).toEqual([{ key: 'ops', name: 'Operations', description: 'Team' }]);
  });

  it('loads and saves user detail overview, memberships, and lifecycle actions', () => {
    const { api, fixture, component, toast } = setup(StynxUserDetailComponent);
    const access = component as unknown as DetailAccess;
    const changed: StynxUserDetail[] = [];
    component.userChanged.subscribe((user) => changed.push(user));
    component.userId = 'user-1';
    fixture.detectChanges();

    expect(component.user()?.email).toBe('ada@example.test');
    expect(access.tabKey('roles')).toBe('iam.users.detail.tabs.roles');
    expect(access.displayName({ id: 'user-x', email: 'fallback@example.test' })).toBe('fallback@example.test');
    expect(access.statusKey({ id: 'user-x', email: 'status@example.test' })).toBe('iam.users.status.active');
    expect(access.grantSourceKey('role')).toBe('iam.users.permissions.source.role');
    expect(access.roleAssigned('role-1')).toBe(true);
    expect(access.groupAssigned('group-1')).toBe(true);
    component.overviewForm.setValue({ email: 'patched@example.test', firstName: 'Ada', lastName: '', locale: 'en-US' });
    access.saveOverview();
    access.toggleRole('role-2');
    access.saveRoles();
    access.toggleGroup('group-1');
    access.saveGroups();
    access.sendInvite();
    access.forceLogout();
    access.reactivate();
    component.disableDialogOpen.set(true);
    access.disableUser();

    expect(api.patchUser).toHaveBeenCalledWith('user-1', { email: 'patched@example.test', firstName: 'Ada', locale: 'en-US' });
    expect(api.setUserRoles).toHaveBeenCalledWith('user-1', ['role-1', 'role-2']);
    expect(api.setUserGroups).toHaveBeenCalledWith('user-1', []);
    expect(api.inviteUser).toHaveBeenCalledWith('user-1');
    expect(api.forceLogoutUser).toHaveBeenCalledWith('user-1');
    expect(api.reactivateUser).toHaveBeenCalledWith('user-1');
    expect(api.disableUser).toHaveBeenCalledWith('user-1');
    expect(component.disableDialogOpen()).toBe(false);
    expect(changed).toHaveLength(1);
    expect(toast.push).toHaveBeenCalledWith('iam.users.detail.saved', 'success');
  });

  it('loads and saves role and group detail overview forms', () => {
    const role = setup(StynxRoleDetailComponent);
    const roleAccess = role.component as unknown as { saveOverview(): void; systemKey(value: StynxRole): string; tabKey(value: string): string };
    role.component.roleId = 'role-1';
    role.fixture.detectChanges();
    role.component.overviewForm.setValue({ key: ' admin ', name: ' Admin updated ', description: '' });
    roleAccess.saveOverview();
    expect(role.api.patchRole).toHaveBeenCalledWith('role-1', { key: 'admin', name: 'Admin updated' });
    expect(roleAccess.systemKey(ROLES[1]!)).toBe('iam.common.yes');
    expect(roleAccess.tabKey('permissions')).toBe('iam.roles.detail.tabs.permissions');

    TestBed.resetTestingModule();

    const group = setup(StynxGroupDetailComponent);
    const groupAccess = group.component as unknown as { saveOverview(): void; tabKey(value: string): string };
    group.component.groupId = 'group-1';
    group.fixture.detectChanges();
    group.component.overviewForm.setValue({ key: ' ops ', name: ' Ops updated ', description: ' ' });
    groupAccess.saveOverview();
    expect(group.api.patchGroup).toHaveBeenCalledWith('group-1', { key: 'ops', name: 'Ops updated' });
    expect(groupAccess.tabKey('members')).toBe('iam.groups.detail.tabs.members');
  });

  it('filters, mutates, and saves the permission matrix', () => {
    const { api, fixture, component, toast } = setup(StynxPermissionMatrixComponent);
    const access = component as unknown as MatrixAccess;
    const changed: string[][] = [];
    component.permissionsChanged.subscribe((keys) => changed.push(keys));
    component.roleId = 'role-1';
    fixture.detectChanges();

    expect(component.permissionCount()).toBeGreaterThan(2);
    expect(access.permissionSelected('iam:users:read')).toBe(true);
    component.filterForm.controls.q.setValue('custom');
    access.applySearch();
    expect(component.filteredPermissions().map((permission) => permission.key)).toContain('iam:custom:approve');
    access.togglePermission('iam:custom:approve');
    expect(component.dirty()).toBe(true);
    expect(access.dirtyKey()).toBe('iam.roles.permissions.unsaved');
    const group = component.groups()[0]!;
    access.selectResource(group);
    expect(access.selectedInGroup(group)).toBe(group.permissions.length);
    access.clearResource(group);
    access.save();

    expect(api.setRolePermissions).toHaveBeenCalledWith('role-1', expect.any(Array));
    expect(changed).toHaveLength(1);
    expect(toast.push).toHaveBeenCalledWith('iam.roles.permissions.savedToast', 'success');
    access.clearSearch();
    component.roleId = null;
    expect(component.currentRoleId()).toBe('');
  });

  it('loads and saves group roles and members editors', () => {
    const roles = setup(StynxGroupRolesEditorComponent);
    const roleAccess = roles.component as unknown as EditorAccess & { hasRole(id: string): boolean };
    const roleEvents: string[][] = [];
    roles.component.rolesChanged.subscribe((ids) => roleEvents.push(ids));
    roles.component.groupId = 'group-1';
    roles.fixture.detectChanges();
    expect(roleAccess.hasRole('role-1')).toBe(true);
    roleAccess.toggleRole?.('role-2');
    roleAccess.save();
    expect(roles.api.setGroupRoles).toHaveBeenCalledWith('group-1', ['role-1', 'role-2']);
    expect(roleEvents).toEqual([['role-1', 'role-2']]);

    TestBed.resetTestingModule();

    const members = setup(StynxGroupMembersEditorComponent);
    const memberAccess = members.component as unknown as EditorAccess & { hasMember(id: string): boolean; displayName(user: StynxUser): string; statusKey(user: StynxUser): string };
    const memberEvents: string[][] = [];
    members.component.membersChanged.subscribe((ids) => memberEvents.push(ids));
    members.component.groupId = 'group-1';
    members.fixture.detectChanges();
    expect(memberAccess.hasMember('user-1')).toBe(true);
    expect(memberAccess.displayName(USERS[0]!)).toBe('Ada Lovelace');
    const { status: _status, ...userWithoutStatus } = USERS[0]!;
    expect(memberAccess.statusKey(userWithoutStatus)).toBe('iam.users.status.active');
    members.component.searchForm.controls.q.setValue('Grace');
    memberAccess.search?.();
    expect(members.component.filteredUsers().map((user) => user.id)).toEqual(['user-2']);
    memberAccess.toggleMember?.('user-2');
    memberAccess.save();
    expect(members.api.setGroupMembers).toHaveBeenCalledWith('group-1', ['user-1', 'user-2']);
    expect(memberEvents).toEqual([['user-1', 'user-2']]);
    memberAccess.clearSearch?.();
    expect(members.component.searchText()).toBe('');
  });

  it('renders effective permissions, filters grant sources, refreshes, and handles empty input', () => {
    const { api, fixture, component } = setup(StynxEffectivePermissionsComponent);
    const access = component as unknown as EffectiveAccess;
    const loaded: StynxEffectivePermissions[] = [];
    component.permissionsLoaded.subscribe((permissions) => loaded.push(permissions));
    component.userId = 'user-1';
    fixture.detectChanges();

    expect(component.permissions()).toHaveLength(2);
    expect(component.grantSourceCount()).toBe(2);
    component.filterForm.controls.q.setValue('operations');
    access.applySearch();
    expect(component.filteredPermissions().map((permission) => permission.grant.permission.key)).toEqual(['iam:groups:write']);
    expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.emptySearch.title');
    expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.emptySearch.description');
    expect(access.sourceTypeKey('group')).toBe('iam.effectivePermissions.source.group');
    access.refresh();
    expect(api.getEffectivePermissions).toHaveBeenCalledTimes(2);
    expect(loaded).toHaveLength(2);
    access.clearSearch();
    component.userId = '';
    expect(component.permissionsSnapshot()).toEqual({ userId: '', permissions: [] });
  });

  it('records component error branches without weakening assertions', () => {
    const users = setup(StynxUsersAdminComponent);
    users.api.listUsers.mockReturnValueOnce(throwError(() => new Error('users down')));
    (users.component as unknown as UsersAdminAccess).pageChanged({ pageIndex: 0, pageSize: 10 });
    expect(users.component.error()).toBe('users down');

    TestBed.resetTestingModule();
    const roles = setup(StynxRolesAdminComponent);
    roles.api.deleteRole.mockReturnValueOnce(throwError(() => 'offline'));
    (roles.component as unknown as RoleAdminAccess).deleteRole(ROLES[0]!);
    expect(roles.component.error()).toBe('iam.roles.delete.failed');

    TestBed.resetTestingModule();
    const groups = setup(StynxGroupsAdminComponent);
    groups.api.createGroup.mockReturnValueOnce(throwError(() => new Error('create failed')));
    (groups.component as unknown as GroupAdminAccess).createGroup({ key: 'x', name: 'X' });
    expect(groups.component.createError()).toBe('create failed');

    TestBed.resetTestingModule();
    const matrix = setup(StynxPermissionMatrixComponent);
    matrix.component.roleId = 'role-1';
    matrix.api.setRolePermissions.mockReturnValueOnce(throwError(() => 'offline'));
    (matrix.component as unknown as MatrixAccess).togglePermission('iam:roles:read');
    (matrix.component as unknown as MatrixAccess).save();
    expect(matrix.component.error()).toBe('iam.roles.permissions.saveFailed');
  });

  it('covers dialog validation, clone initial state, and optional payload fields', () => {
    const group = setup(StynxGroupCreateDialogComponent);
    const groupAccess = group.component as unknown as DialogAccess;
    const groups: StynxCreateGroupRequest[] = [];
    group.component.create.subscribe((body) => groups.push(body));
    groupAccess.submit();
    group.component.form.setValue({ key: ' ops ', name: ' Operations ', description: ' ' });
    groupAccess.submit();
    expect(groups).toEqual([{ key: 'ops', name: 'Operations' }]);

    TestBed.resetTestingModule();
    const role = setup(StynxRoleCreateDialogComponent);
    const roleAccess = role.component as unknown as DialogAccess;
    role.component.initialRole = ROLES[0]!;
    expect(role.component.form.controls.name.value).toBe('Admin');
    role.component.initialRole = null;
    roleAccess.submit();
    expect(role.component.form.invalid).toBe(true);

    TestBed.resetTestingModule();
    const user = setup(StynxUserCreateDialogComponent);
    const created: StynxCreateUserRequest[] = [];
    user.component.create.subscribe((body) => created.push(body));
    user.component.submit();
    user.component.form.setValue({ email: 'grace@example.test', firstName: '', lastName: ' Hopper ', locale: 'en-US', sendInvite: true });
    user.component.submit();
    expect(created).toEqual([{ email: 'grace@example.test', lastName: 'Hopper', locale: 'en-US', sendInvite: true }]);
  });

  it('covers admin navigation, close, and dialog error branches', () => {
    const router = { navigate: vi.fn() };
    const route = {};
    const users = setup(StynxUsersAdminComponent, [
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: route },
    ]);
    users.api.createUser.mockReturnValueOnce(throwError(() => 'offline'));
    (users.component as unknown as UsersAdminAccess).createUser({ email: 'x@example.test', sendInvite: false });
    (users.component as unknown as UsersAdminAccess).openDetail(USERS[0]!);
    expect(users.component.createError()).toBe('iam.users.create.failed');
    expect(router.navigate).toHaveBeenCalledWith(['user-1'], { relativeTo: route });

    TestBed.resetTestingModule();
    const groups = setup(StynxGroupsAdminComponent, [
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: route },
    ]);
    const groupAccess = groups.component as unknown as GroupAdminAccess;
    groupAccess.openCreateDialog();
    groupAccess.closeCreateDialog();
    groups.api.deleteGroup.mockReturnValueOnce(throwError(() => 'delete failed'));
    groupAccess.deleteGroup(GROUPS[0]!);
    groupAccess.openDetail(GROUPS[0]!);
    expect(groups.component.createOpen()).toBe(false);
    expect(groups.component.error()).toBe('iam.groups.delete.failed');
    expect(router.navigate).toHaveBeenCalledWith(['group-1'], { relativeTo: route });
  });

  it('covers role admin close, clone guard, load, clone, and create failures', () => {
    const router = { navigate: vi.fn() };
    const route = {};
    const roles = setup(StynxRolesAdminComponent, [
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: route },
    ]);
    const access = roles.component as unknown as RoleAdminAccess;
    access.openCreateDialog();
    access.closeDialog();
    expect(roles.component.createOpen()).toBe(false);
    roles.api.createRole.mockReturnValueOnce(throwError(() => new Error('create failed')));
    access.createRole({ key: 'x', name: 'X' });
    access.cloneRole({ key: 'none', name: 'None' });
    access.openCloneDialog(ROLES[0]!);
    roles.api.cloneRole.mockReturnValueOnce(throwError(() => 'clone failed'));
    access.cloneRole({ key: 'copy', name: 'Copy' });
    expect(roles.component.dialogError()).toBe('iam.roles.clone.failed');
    access.openDetail(ROLES[0]!);
    roles.api.listRoles.mockReturnValueOnce(throwError(() => 'load failed'));
    access.cloneRole({ key: 'copy-2', name: 'Copy 2' });
    expect(roles.component.error()).toBe('iam.roles.error.loadFailed');
    expect(router.navigate).toHaveBeenCalledWith(['role-1'], { relativeTo: route });
  });

  it('covers role and group detail guard, load, save, and fallback error branches', () => {
    const role = setup(StynxRoleDetailComponent);
    const roleAccess = role.component as unknown as DetailAccess;
    role.component.roleId = null;
    roleAccess.saveOverview();
    role.component.roleId = 'missing-role';
    expect(role.component.role()).toBe(null);
    role.api.listRoles.mockReturnValueOnce(throwError(() => 'roles down'));
    role.component.roleId = 'role-1';
    expect(role.component.error()).toBe('iam.roles.detail.loadFailed');
    role.component.roleId = 'role-2';
    role.component.overviewForm.setValue({ key: 'viewer', name: 'Viewer', description: ' Viewer role ' });
    role.api.patchRole.mockReturnValueOnce(throwError(() => new Error('save failed')));
    roleAccess.saveOverview();
    expect(role.component.error()).toBe('save failed');
    expect(roleAccess.systemKey?.(ROLES[0]!)).toBe('iam.common.no');

    TestBed.resetTestingModule();
    const group = setup(StynxGroupDetailComponent);
    const groupAccess = group.component as unknown as DetailAccess;
    group.component.groupId = null;
    groupAccess.saveOverview();
    group.component.groupId = 'missing-group';
    expect(group.component.group()).toBe(null);
    group.api.listGroups.mockReturnValueOnce(throwError(() => 'groups down'));
    group.component.groupId = 'group-1';
    expect(group.component.error()).toBe('iam.groups.detail.loadFailed');
    group.component.groupId = 'group-1';
    group.component.overviewForm.setValue({ key: 'ops', name: 'Ops', description: ' Ops team ' });
    group.api.patchGroup.mockReturnValueOnce(throwError(() => new Error('save failed')));
    groupAccess.saveOverview();
    expect(group.component.error()).toBe('save failed');
  });

  it('covers user detail no-id guards and every save/load failure callback', () => {
    const detail = setup(StynxUserDetailComponent);
    const access = detail.component as unknown as DetailAccess;
    access.saveOverview();
    access.saveRoles();
    access.saveGroups();
    access.sendInvite();
    expect(detail.api.patchUser).not.toHaveBeenCalledTimes(1);
    detail.api.getUser.mockReturnValueOnce(of({ id: 'user-3', email: 'empty@example.test', groups: [], roles: [], effectivePermissions: EFFECTIVE }));
    detail.component.userId = 'user-3';
    expect(detail.component.overviewForm.getRawValue()).toEqual({ email: 'empty@example.test', firstName: '', lastName: '', locale: 'en-US' });
    detail.component.overviewForm.setValue({ email: 'bad@example.test', firstName: '', lastName: ' Hopper ', locale: '' });
    detail.api.patchUser.mockReturnValueOnce(throwError(() => new Error('patch failed')));
    access.saveOverview();
    detail.api.setUserRoles.mockReturnValueOnce(throwError(() => 'roles failed'));
    access.saveRoles();
    detail.api.setUserGroups.mockReturnValueOnce(throwError(() => 'groups failed'));
    access.saveGroups();
    detail.api.inviteUser.mockReturnValueOnce(throwError(() => 'invite failed'));
    access.sendInvite();
    expect(detail.component.error()).toBe('iam.users.invite.failed');

    TestBed.resetTestingModule();
    const load = setup(StynxUserDetailComponent);
    load.api.getUser.mockReturnValueOnce(throwError(() => 'user down'));
    load.component.userId = 'user-1';
    expect(load.component.error()).toBe('iam.users.detail.loadFailed');
  });

  it('covers group role and member editor reset, removal, no-id, and error branches', () => {
    const roles = setup(StynxGroupRolesEditorComponent);
    const roleAccess = roles.component as unknown as EditorAccess;
    roles.component.groupId = null;
    roleAccess.save();
    roles.component.groupId = 'group-1';
    roleAccess.toggleRole?.('role-1');
    roles.api.setGroupRoles.mockReturnValueOnce(throwError(() => 'save failed'));
    roleAccess.save();
    roles.api.listRoles.mockReturnValueOnce(throwError(() => new Error('load failed')));
    roles.component.groupId = 'group-1';
    expect(roles.component.error()).toBe('load failed');

    TestBed.resetTestingModule();
    const members = setup(StynxGroupMembersEditorComponent);
    const memberAccess = members.component as unknown as EditorAccess & { displayName(user: StynxUser): string };
    members.component.groupId = null;
    memberAccess.save();
    members.component.groupId = 'group-1';
    expect(memberAccess.displayName(USERS[1]!)).toBe('Grace Hopper');
    memberAccess.toggleMember?.('user-1');
    members.api.setGroupMembers.mockReturnValueOnce(throwError(() => 'save failed'));
    memberAccess.save();
    members.api.listUsers.mockReturnValueOnce(throwError(() => new Error('load failed')));
    members.component.groupId = 'group-1';
    expect(members.component.error()).toBe('load failed');
  });

  it('covers permission matrix synthetic permissions, no-id save, and fallback errors', () => {
    const matrix = setup(StynxPermissionMatrixComponent);
    const access = matrix.component as unknown as MatrixAccess;
    matrix.component.assignedKeys.set(new Set(['', 'lonely']));
    matrix.component.originalKeys.set(new Set(['other', 'lonely']));
    expect(matrix.component.allPermissions().map((permission) => permission.key)).toContain('lonely');
    expect(matrix.component.dirty()).toBe(true);
    access.save();
    expect(matrix.api.setRolePermissions).not.toHaveBeenCalledTimes(1);
    matrix.api.listRolePermissions.mockReturnValueOnce(throwError(() => new Error('load failed')));
    matrix.component.roleId = 'role-1';
    expect(matrix.component.error()).toBe('load failed');
  });

  it('covers effective permission fallback normalization, source fallbacks, and load errors', () => {
    const effective = setup(StynxEffectivePermissionsComponent);
    const access = effective.component as unknown as EffectiveAccess;
    effective.api.getEffectivePermissions.mockReturnValueOnce(of({
      userId: 'user-3',
      permissions: [{ permission: { key: 'lonely' }, grantedBy: [{ type: 'group', id: 'group-3' }] }],
    }));
    effective.component.userId = 'user-3';
    expect(effective.component.permissions()[0]).toMatchObject({ resource: 'custom', action: 'lonely' });
    effective.component.filterForm.controls.q.setValue('group-3');
    access.applySearch();
    expect(effective.component.filteredPermissions()).toHaveLength(1);
    access.clearSearch();
    expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.empty.title');
    expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.empty.description');

    TestBed.resetTestingModule();
    const fallback = setup(StynxEffectivePermissionsComponent, [
      { provide: StynxI18nService, useValue: { locale: signal('en-US'), translate: () => undefined } },
    ]);
    fallback.api.getEffectivePermissions.mockReturnValueOnce(throwError(() => 'offline'));
    fallback.component.userId = 'user-1';
    expect(fallback.component.error()).toBe('iam.effectivePermissions.loadFailed');
  });

  it('covers remaining fallback translation and default-value branches', () => {
    const noTranslate = { locale: signal('en-US'), translate: () => undefined };
    const effective = setup(StynxEffectivePermissionsComponent);
    effective.component.userId = undefined;
    effective.api.getEffectivePermissions.mockReturnValueOnce(throwError(() => new Error('effective down')));
    effective.component.userId = 'user-1';
    expect(effective.component.error()).toBe('effective down');

    TestBed.resetTestingModule();
    const roleDialog = setup(StynxRoleCreateDialogComponent);
    const dialogAccess = roleDialog.component as unknown as DialogAccess;
    roleDialog.component.initialRole = ROLES[1]!;
    roleDialog.component.sourceRole = null;
    expect(roleDialog.component.form.controls.description.value).toBe('');
    expect(dialogAccess.titleKey?.()).toBe('iam.roles.create.title');
    expect(dialogAccess.submitKey?.()).toBe('iam.roles.create.submit');

    TestBed.resetTestingModule();
    const users = setup(StynxUsersAdminComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    const userAccess = users.component as unknown as UsersAdminAccess;
    expect(userAccess.displayName({ id: 'u', email: 'u@example.test', firstName: 'Only' })).toBe('Only');
    expect(userAccess.displayName({ id: 'fallback', email: 'fallback@example.test' })).toBe('fallback@example.test');
    expect(userAccess.statusKey({ id: 'fallback', email: 'fallback@example.test' })).toBe('iam.users.status.active');
    users.api.listUsers.mockReturnValueOnce(throwError(() => 'load failed'));
    users.api.createUser.mockReturnValueOnce(of({ id: 'u', email: 'u@example.test' }));
    userAccess.createUser({ email: 'u@example.test', sendInvite: false });
    expect(users.component.error()).toBe('iam.users.error.loadFailed');

    TestBed.resetTestingModule();
    const groups = setup(StynxGroupsAdminComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    groups.api.listGroups.mockReturnValueOnce(throwError(() => 'load failed'));
    groups.api.createGroup.mockReturnValueOnce(of(GROUPS[0]!));
    (groups.component as unknown as GroupAdminAccess).createGroup({ key: 'ops', name: 'Ops' });
    expect(groups.component.error()).toBe('iam.groups.error.loadFailed');

    TestBed.resetTestingModule();
    const matrix = setup(StynxPermissionMatrixComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    matrix.component.rolePermissions.set([{ key: 'raw', resource: '', action: 'read' }]);
    expect(matrix.component.groups().map((group) => group.resource)).toContain('raw');
    Object.defineProperty(matrix.component, 'filteredPermissions', {
      value: signal([{ key: 'custom', resource: '', action: 'read' }]),
    });
    matrix.component.search.set('force-recompute');
    expect(matrix.component.groups().map((group) => group.resource)).toContain('custom');
    matrix.api.listRolePermissions.mockReturnValueOnce(throwError(() => 'matrix down'));
    matrix.component.roleId = 'role-1';
    expect(matrix.component.error()).toBe('iam.roles.permissions.loadFailed');

    TestBed.resetTestingModule();
    const user = setup(StynxUserDetailComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    user.component.userId = 'user-1';
    user.component.overviewForm.setValue({ email: 'patched@example.test', firstName: '', lastName: ' Hopper ', locale: 'en-US' });
    user.api.patchUser.mockReturnValueOnce(throwError(() => new Error('patch failed')));
    (user.component as unknown as DetailAccess).saveOverview();
    expect(user.api.patchUser).toHaveBeenCalledWith('user-1', { email: 'patched@example.test', lastName: 'Hopper', locale: 'en-US' });
    expect(user.component.error()).toBe('patch failed');
  });

  it('covers remaining detail and editor translation fallbacks', () => {
    const noTranslate = { locale: signal('en-US'), translate: () => undefined };
    const group = setup(StynxGroupDetailComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    group.component.groupId = 'group-2';
    expect(group.component.overviewForm.controls.description.value).toBe('');
    group.api.patchGroup.mockReturnValueOnce(throwError(() => 'save failed'));
    (group.component as unknown as DetailAccess).saveOverview();
    expect(group.component.error()).toBe('iam.groups.detail.saveFailed');

    TestBed.resetTestingModule();
    const role = setup(StynxRoleDetailComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    role.component.roleId = 'role-1';
    role.api.patchRole.mockReturnValueOnce(throwError(() => 'save failed'));
    (role.component as unknown as DetailAccess).saveOverview();
    expect(role.component.error()).toBe('iam.roles.detail.saveFailed');

    TestBed.resetTestingModule();
    const roles = setup(StynxRolesAdminComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    roles.api.deleteRole.mockReturnValueOnce(throwError(() => 'delete failed'));
    (roles.component as unknown as RoleAdminAccess).deleteRole(ROLES[0]!);
    expect(roles.component.error()).toBe('iam.roles.delete.failed');

    TestBed.resetTestingModule();
    const members = setup(StynxGroupMembersEditorComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    const memberAccess = members.component as unknown as EditorAccess & { displayName(user: StynxUser): string };
    expect(memberAccess.displayName({ id: 'u', email: 'u@example.test' })).toBe('u@example.test');
    members.component.users.set([{ id: 'u', email: 'u@example.test' }]);
    members.component.searchText.set('missing');
    expect(members.component.filteredUsers()).toEqual([]);
    members.component.groupId = 'group-1';
    members.api.setGroupMembers.mockReturnValueOnce(throwError(() => 'save failed'));
    memberAccess.save();
    expect(members.component.error()).toBe('iam.groups.members.saveFailed');

    TestBed.resetTestingModule();
    const groupRoles = setup(StynxGroupRolesEditorComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    groupRoles.component.groupId = 'group-1';
    groupRoles.api.setGroupRoles.mockReturnValueOnce(throwError(() => 'save failed'));
    (groupRoles.component as unknown as EditorAccess).save();
    expect(groupRoles.component.error()).toBe('iam.groups.roles.saveFailed');

    TestBed.resetTestingModule();
    const user = setup(StynxUserDetailComponent, [{ provide: StynxI18nService, useValue: noTranslate }]);
    user.component.userId = 'user-1';
    user.api.inviteUser.mockReturnValueOnce(throwError(() => 'invite failed'));
    (user.component as unknown as DetailAccess).sendInvite();
    expect(user.component.error()).toBe('iam.users.invite.failed');
  });

  // ===========================================================================
  // WAVE-05A targeted mutation kills — users-admin + effective-permissions.
  // Each describe targets specific survivor clusters in the mutation report.
  // ===========================================================================

  describe('UsersAdminComponent — mutation-killing assertions', () => {
    it('userDisplayName joins firstName + lastName with a single space (kills L19 StringLiteral)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      // Original: ' ' separator → 'Ada Lovelace'.
      // Mutation: '' separator → 'AdaLovelace'.
      expect(access.displayName({
        id: 'u', email: 'u@example.test', firstName: 'Ada', lastName: 'Lovelace',
      })).toBe('Ada Lovelace');
    });

    it('userDisplayName falls back to email when no name parts are present', () => {
      // Kills the LogicalOperator `||` mutation that would swap to `&&` and
      // return the empty join result instead of falling through.
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      expect(access.displayName({ id: 'u', email: 'fallback@example.test' })).toBe('fallback@example.test');
    });

    it('userDisplayName filters out empty string parts (kills MethodExpression .filter mutant)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      // Only lastName provided → 'Lovelace' (no leading space).
      expect(access.displayName({
        id: 'u', email: 'u@example.test', lastName: 'Lovelace',
      })).toBe('Lovelace');
    });

    it('statusKey concatenates the literal "iam.users.status." prefix with status (kills StringLiteral on prefix)', () => {
      // Original prefix 'iam.users.status.' + status → 'iam.users.status.disabled'.
      // Mutation '' / 'Stryker was here!' would break the exact key.
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      expect(access.statusKey({ id: 'u', email: 'u@example.test', status: 'disabled' })).toBe('iam.users.status.disabled');
    });

    it('statusKey defaults to "active" when user.status is falsy (kills StringLiteral on the "active" fallback)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      expect(access.statusKey({ id: 'u', email: 'u@example.test' })).toBe('iam.users.status.active');
    });

    it('search() resets pageIndex to 0 (kills BooleanLiteral / ArithmeticOperator on the reset path)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      users.fixture.detectChanges();
      access.pageChanged({ pageIndex: 5, pageSize: 25 });
      expect(users.component.pageIndex()).toBe(5);
      access.search();
      expect(users.component.pageIndex()).toBe(0);
    });

    it('clearSearch() resets the search input to empty string (kills StringLiteral on reset value)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      users.component.searchForm.controls.q.setValue('ada');
      access.clearSearch();
      expect(users.component.searchForm.controls.q.value).toBe('');
      expect(users.component.pageIndex()).toBe(0);
    });

    it('load() applies Math.max(0, page.meta.page - 1) — kills the Math.min mutant', () => {
      // Set up a fresh component with an api that returns meta.page = 5.
      const users = setup(StynxUsersAdminComponent);
      users.api.listUsers.mockReturnValueOnce(of({
        items: [...USERS],
        meta: { total: 100, page: 5, pageSize: 10 },
      } satisfies PagedResult<StynxUser>));
      (users.component as unknown as UsersAdminAccess).search();  // triggers load()
      // Math.max(0, 5-1) = 4. Math.min mutation = 0.
      expect(users.component.pageIndex()).toBe(4);
    });

    it('load() applies Math.max(0, page.meta.page - 1) — kills the ArithmeticOperator + 1 mutant', () => {
      const users = setup(StynxUsersAdminComponent);
      users.api.listUsers.mockReturnValueOnce(of({
        items: [...USERS],
        meta: { total: 100, page: 3, pageSize: 10 },
      } satisfies PagedResult<StynxUser>));
      (users.component as unknown as UsersAdminAccess).search();
      // 3-1 = 2; mutation 3+1 = 4.
      expect(users.component.pageIndex()).toBe(2);
    });

    it('load() omits the q param entirely when search box is empty (kills BooleanLiteral on q ? {q} : {})', () => {
      const users = setup(StynxUsersAdminComponent);
      users.component.searchForm.controls.q.setValue('');
      (users.component as unknown as UsersAdminAccess).search();
      const last = users.api.listUsers.mock.calls.at(-1)?.[0];
      expect(last).toEqual({ page: 1, pageSize: 10 });
      expect(last).not.toHaveProperty('q');
    });

    it('load() trims whitespace from the search query before sending (kills BooleanLiteral on trim path)', () => {
      const users = setup(StynxUsersAdminComponent);
      users.component.searchForm.controls.q.setValue('   ');
      (users.component as unknown as UsersAdminAccess).search();
      const last = users.api.listUsers.mock.calls.at(-1)?.[0];
      // Trimmed empty string → no q key.
      expect(last).not.toHaveProperty('q');
    });

    it('successful createUser pushes the exact toast key + level', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      users.api.createUser.mockReturnValueOnce(of({
        id: 'created', email: 'new@example.test',
      } as StynxUser));
      access.createUser({ email: 'new@example.test', sendInvite: true });
      // Kills StringLiteral mutations on both arguments.
      expect(users.toast.push).toHaveBeenCalledWith('iam.users.create.created', 'success');
    });

    it('failed createUser sets createError to the exact fallback i18n key, not empty string', () => {
      const users = setup(StynxUsersAdminComponent, [
        { provide: StynxI18nService, useValue: { locale: signal('en'), translate: () => undefined } },
      ]);
      const access = users.component as unknown as UsersAdminAccess;
      users.api.createUser.mockReturnValueOnce(throwError(() => undefined));
      access.createUser({ email: 'x@example.test', sendInvite: true });
      expect(users.component.createError()).toBe('iam.users.create.failed');
    });

    it('failed load() sets error to the exact fallback key', () => {
      const users = setup(StynxUsersAdminComponent, [
        { provide: StynxI18nService, useValue: { locale: signal('en'), translate: () => undefined } },
      ]);
      users.api.listUsers.mockReturnValueOnce(throwError(() => undefined));
      (users.component as unknown as UsersAdminAccess).search();
      expect(users.component.error()).toBe('iam.users.error.loadFailed');
    });

    it('error path with Error instance uses error.message verbatim (kills ConditionalExpression on the type-guard)', () => {
      const users = setup(StynxUsersAdminComponent);
      users.api.createUser.mockReturnValueOnce(throwError(() => new Error('boom')));
      (users.component as unknown as UsersAdminAccess).createUser({ email: 'x@example.test', sendInvite: true });
      expect(users.component.createError()).toBe('boom');
    });

    it('closeCreateDialog respects the createSaving guard (kills BlockStatement {} mutation)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      access.openCreateDialog();
      users.component.createSaving.set(true);
      access.closeCreateDialog();
      expect(users.component.createOpen()).toBe(true);    // saving in progress → stays open
      users.component.createSaving.set(false);
      access.closeCreateDialog();
      expect(users.component.createOpen()).toBe(false);   // not saving → closes
    });

    it('openCreateDialog clears createError and opens the dialog (kills StringLiteral on the reset)', () => {
      const users = setup(StynxUsersAdminComponent);
      users.component.createError.set('previous error');
      (users.component as unknown as UsersAdminAccess).openCreateDialog();
      expect(users.component.createError()).toBe('');
      expect(users.component.createOpen()).toBe(true);
    });
  });

  describe('EffectivePermissionsComponent — mutation-killing assertions', () => {
    it('sourceTypeKey returns the exact `iam.effectivePermissions.source.<type>` key', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      // Kills StringLiteral mutations on the template literal prefix.
      expect(access.sourceTypeKey('role')).toBe('iam.effectivePermissions.source.role');
      expect(access.sourceTypeKey('group')).toBe('iam.effectivePermissions.source.group');
    });

    it('emptyTitleKey switches between empty and emptySearch variants based on the search term', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      // Without a search term → empty.title.
      expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.empty.title');
      // With a search term → emptySearch.title.
      effective.component.filterForm.controls.q.setValue('admin');
      access.applySearch();
      expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.emptySearch.title');
    });

    it('emptyDescriptionKey switches between empty and emptySearch variants based on the search term', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.empty.description');
      effective.component.filterForm.controls.q.setValue('write');
      access.applySearch();
      expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.emptySearch.description');
    });

    it('clearSearch() resets the search form to empty string', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      effective.component.filterForm.controls.q.setValue('admin');
      access.clearSearch();
      expect(effective.component.filterForm.controls.q.value).toBe('');
    });

    it('applySearch() trims the search input before applying the filter', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      effective.component.filterForm.controls.q.setValue('   admin  ');
      access.applySearch();
      // emptyTitleKey returns the emptySearch variant only if search is non-empty;
      // after applySearch trims '   admin  ' → 'admin', the search variant fires.
      expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.emptySearch.title');
    });

    it('applySearch() trims a whitespace-only input down to empty, falling back to the non-search empty key (kills MethodExpression .trim drop)', () => {
      // With .trim() in place, '   ' becomes '', search is empty → empty.title.
      // Without .trim() (MethodExpression mutation), '   ' is truthy → emptySearch.title.
      const effective = setup(StynxEffectivePermissionsComponent);
      const access = effective.component as unknown as EffectiveAccess;
      effective.component.filterForm.controls.q.setValue('   ');
      access.applySearch();
      expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.empty.title');
    });

    it('empty-search shows ALL permissions (kills BlockStatement {} on the includesSearch early-return)', () => {
      // includesSearch returns true on empty value via `if (!value) return true;`.
      // Mutation `{}` falls through to the loop which evaluates against empty
      // searchableParts → array.some is false → all permissions filter out.
      // Asserting filteredPermissions.length === permissions.length (both non-zero) catches it.
      const effective = setup(StynxEffectivePermissionsComponent);
      effective.component.userId = 'user-1';
      effective.fixture.detectChanges();
      const total = effective.component.permissions().length;
      expect(total).toBeGreaterThan(0);
      expect(effective.component.filteredPermissions().length).toBe(total);
    });

    it('search matching by permission key returns only matching entries (kills BlockStatement / StringLiteral on the searchable-parts construction)', () => {
      const effective = setup(StynxEffectivePermissionsComponent);
      effective.component.userId = 'user-1';
      effective.fixture.detectChanges();
      const access = effective.component as unknown as EffectiveAccess;
      effective.component.filterForm.controls.q.setValue('groups');  // matches 'iam:groups:write' but not 'iam:users:read'
      access.applySearch();
      const filtered = effective.component.filteredPermissions();
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.key).toBe('iam:groups:write');
    });
  });

  describe('UsersAdminComponent — constructor + initial-state kills', () => {
    it('constructor invokes the initial load() with empty q AND default page=1,pageSize=10 (kills BlockStatement {} on the constructor body + StringLiteral on the form default)', () => {
      // Calling the constructor must produce an initial listUsers call.
      const users = setup(StynxUsersAdminComponent);
      // The first listUsers call is the constructor-triggered load. Inspect it.
      const first = users.api.listUsers.mock.calls[0]?.[0];
      // Constructor body must execute (kills BlockStatement → {} on line 309).
      expect(users.api.listUsers).toHaveBeenCalledTimes(1);
      // Initial form default `q: ['']` produces an empty q which is omitted
      // from the listUsers payload entirely. A StringLiteral mutation on the
      // default would inject 'Stryker was here!' into the payload.
      expect(first).toEqual({ page: 1, pageSize: 10 });
      expect(first).not.toHaveProperty('q');
    });

    it('clearSearch() preserves the searchForm default q value after explicit setValue', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      users.component.searchForm.controls.q.setValue('Ada');
      access.clearSearch();
      // After clearSearch the form must hold the literal empty string.
      // Pre-mutation StringLiteral on the reset's { q: '' } default would make
      // this assertion fail if it became 'Stryker was here!'.
      expect(users.component.searchForm.controls.q.value).toBe('');
    });

    it('openDetail emits userSelected EXACTLY when a user is opened (kills BlockStatement {} on openDetail body)', () => {
      const users = setup(StynxUsersAdminComponent);
      const access = users.component as unknown as UsersAdminAccess;
      const emitted: StynxUser[] = [];
      users.component.userSelected.subscribe((user) => emitted.push(user));
      access.openDetail(USERS[0]!);
      expect(emitted).toEqual([USERS[0]]);
    });
  });
});
