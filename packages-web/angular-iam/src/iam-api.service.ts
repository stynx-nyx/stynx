import * as response from './response-validation';
import { Injectable, computed, inject, signal } from '@angular/core';
import { from, tap } from 'rxjs';
import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { STYNX_IAM_CLIENT } from './tokens';
import type {
  IamListUsersParams,
  PagedResult,
  StynxCloneRoleRequest,
  StynxCreateGroupRequest,
  StynxCreateRoleRequest,
  StynxCreateUserRequest,
  StynxEffectivePermissions,
  StynxGroup,
  StynxPatchGroupRequest,
  StynxPatchRoleRequest,
  StynxPatchUserRequest,
  StynxPermission,
  StynxRole,
  StynxUser,
  StynxUserDetail,
} from './types';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type SdkRequestOptions = {
  query?: QueryParams;
  tenantId?: string | null;
};

function query(input: QueryParams): QueryParams | undefined {
  const filtered: QueryParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function requestOptions(queryParams?: QueryParams, tenantId?: string): SdkRequestOptions {
  const options: SdkRequestOptions = {};
  if (queryParams) {
    options.query = queryParams;
  }
  if (tenantId !== undefined) {
    options.tenantId = tenantId;
  }
  return options;
}

function replaceById<T extends { id: string }>(items: T[], next: T): T[] {
  const found = items.some((item) => item.id === next.id);
  if (!found) {
    return [next, ...items];
  }
  return items.map((item) => (item.id === next.id ? next : item));
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

@Injectable({ providedIn: 'root' })
export class IamApiService {
  private readonly client = inject(STYNX_IAM_CLIENT);
  private readonly usersState = signal<StynxUser[]>([]);
  private readonly rolesState = signal<StynxRole[]>([]);
  private readonly groupsState = signal<StynxGroup[]>([]);

  readonly users: Signal<StynxUser[]> = computed(() => this.usersState());
  readonly roles: Signal<StynxRole[]> = computed(() => this.rolesState());
  readonly groups: Signal<StynxGroup[]> = computed(() => this.groupsState());

  listUsers(params: IamListUsersParams = {}): Observable<PagedResult<StynxUser>> {
    return from(
      this.client.get(
        '/admin/users',
        requestOptions(query({ q: params.q, page: params.page, pageSize: params.pageSize }), params.tenantId),
      ).then(response.decode(response.isPagedResult(response.isStynxUser), 'PagedResult<StynxUser>')),
    ).pipe(
      tap((page) => {
        this.usersState.set(page.items);
      }),
    );
  }

  refreshUsers(params: IamListUsersParams = {}): Observable<PagedResult<StynxUser>> {
    return this.listUsers(params);
  }

  getUser(id: string): Observable<StynxUserDetail> {
    return from(this.client.get(`/admin/users/${id}`).then(response.decode(response.isStynxUserDetail, 'StynxUserDetail')));
  }

  createUser(body: StynxCreateUserRequest): Observable<StynxUser> {
    return from(this.client.post('/admin/users', body).then(response.decode(response.isStynxUser, 'StynxUser'))).pipe(
      tap((user) => {
        this.usersState.update((users) => replaceById(users, user));
      }),
    );
  }

  patchUser(id: string, diff: StynxPatchUserRequest): Observable<StynxUser> {
    return from(this.client.patch(`/admin/users/${id}`, diff).then(response.decode(response.isStynxUser, 'StynxUser'))).pipe(
      tap((user) => {
        this.usersState.update((users) => replaceById(users, user));
      }),
    );
  }

  disableUser(id: string): Observable<unknown> {
    return from(this.client.post(`/admin/users/${id}/disable`, {}));
  }

  reactivateUser(id: string): Observable<unknown> {
    return from(this.client.post(`/admin/users/${id}/reactivate`, {}));
  }

  inviteUser(id: string): Observable<unknown> {
    return from(this.client.post(`/admin/users/${id}/invite`, {}));
  }

  forceLogoutUser(id: string): Observable<unknown> {
    return from(this.client.post(`/admin/users/${id}/force-logout`, {}));
  }

  listUserRoles(id: string): Observable<StynxRole[]> {
    return from(this.client.get(`/admin/users/${id}/roles`).then(response.decode(response.array(response.isStynxRole), 'StynxRole[]')));
  }

  setUserRoles(id: string, roleIds: string[]): Observable<unknown> {
    return from(this.client.put(`/admin/users/${id}/roles`, { roleIds }));
  }

  listUserGroups(id: string): Observable<StynxGroup[]> {
    return from(this.client.get(`/admin/users/${id}/groups`).then(response.decode(response.array(response.isStynxGroup), 'StynxGroup[]')));
  }

  setUserGroups(id: string, groupIds: string[]): Observable<unknown> {
    return from(this.client.put(`/admin/users/${id}/groups`, { groupIds }));
  }

  getEffectivePermissions(id: string): Observable<StynxEffectivePermissions> {
    return from(this.client.get(`/admin/users/${id}/effective-permissions`).then(response.decode(response.isStynxEffectivePermissions, 'StynxEffectivePermissions')));
  }

  listRoles(): Observable<StynxRole[]> {
    return from(this.client.get('/admin/roles').then(response.decode(response.array(response.isStynxRole), 'StynxRole[]'))).pipe(
      tap((roles) => {
        this.rolesState.set(roles);
      }),
    );
  }

  refreshRoles(): Observable<StynxRole[]> {
    return this.listRoles();
  }

  createRole(body: StynxCreateRoleRequest): Observable<StynxRole> {
    return from(this.client.post('/admin/roles', body).then(response.decode(response.isStynxRole, 'StynxRole'))).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  patchRole(id: string, diff: StynxPatchRoleRequest): Observable<StynxRole> {
    return from(this.client.patch(`/admin/roles/${id}`, diff).then(response.decode(response.isStynxRole, 'StynxRole'))).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  deleteRole(id: string): Observable<unknown> {
    return from(this.client.delete(`/admin/roles/${id}`)).pipe(
      tap(() => {
        this.rolesState.update((roles) => removeById(roles, id));
      }),
    );
  }

  cloneRole(id: string, body: StynxCloneRoleRequest): Observable<StynxRole> {
    return from(this.client.post(`/admin/roles/${id}/clone`, body).then(response.decode(response.isStynxRole, 'StynxRole'))).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  listRolePermissions(id: string): Observable<StynxPermission[]> {
    return from(this.client.get(`/admin/roles/${id}/permissions`).then(response.decode(response.array(response.isStynxPermission), 'StynxPermission[]')));
  }

  setRolePermissions(id: string, permissionKeys: string[]): Observable<unknown> {
    return from(this.client.put(`/admin/roles/${id}/permissions`, { permissionKeys }));
  }

  listGroups(): Observable<StynxGroup[]> {
    return from(this.client.get('/admin/groups').then(response.decode(response.array(response.isStynxGroup), 'StynxGroup[]'))).pipe(
      tap((groups) => {
        this.groupsState.set(groups);
      }),
    );
  }

  refreshGroups(): Observable<StynxGroup[]> {
    return this.listGroups();
  }

  createGroup(body: StynxCreateGroupRequest): Observable<StynxGroup> {
    return from(this.client.post('/admin/groups', body).then(response.decode(response.isStynxGroup, 'StynxGroup'))).pipe(
      tap((group) => {
        this.groupsState.update((groups) => replaceById(groups, group));
      }),
    );
  }

  patchGroup(id: string, diff: StynxPatchGroupRequest): Observable<StynxGroup> {
    return from(this.client.patch(`/admin/groups/${id}`, diff).then(response.decode(response.isStynxGroup, 'StynxGroup'))).pipe(
      tap((group) => {
        this.groupsState.update((groups) => replaceById(groups, group));
      }),
    );
  }

  deleteGroup(id: string): Observable<unknown> {
    return from(this.client.delete(`/admin/groups/${id}`)).pipe(
      tap(() => {
        this.groupsState.update((groups) => removeById(groups, id));
      }),
    );
  }

  listGroupRoles(id: string): Observable<StynxRole[]> {
    return from(this.client.get(`/admin/groups/${id}/roles`).then(response.decode(response.array(response.isStynxRole), 'StynxRole[]')));
  }

  setGroupRoles(id: string, roleIds: string[]): Observable<unknown> {
    return from(this.client.put(`/admin/groups/${id}/roles`, { roleIds }));
  }

  listGroupMembers(id: string): Observable<StynxUser[]> {
    return from(this.client.get(`/admin/groups/${id}/members`).then(response.decode(response.array(response.isStynxUser), 'StynxUser[]')));
  }

  setGroupMembers(id: string, userIds: string[]): Observable<unknown> {
    return from(this.client.put(`/admin/groups/${id}/members`, { userIds }));
  }
}
