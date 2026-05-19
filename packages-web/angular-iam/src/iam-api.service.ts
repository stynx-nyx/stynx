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
      this.client.get<PagedResult<StynxUser>>(
        '/admin/users',
        requestOptions(query({ q: params.q, page: params.page, pageSize: params.pageSize }), params.tenantId),
      ),
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
    return from(this.client.get<StynxUserDetail>(`/admin/users/${id}`));
  }

  createUser(body: StynxCreateUserRequest): Observable<StynxUser> {
    return from(this.client.post<StynxUser>('/admin/users', body)).pipe(
      tap((user) => {
        this.usersState.update((users) => replaceById(users, user));
      }),
    );
  }

  patchUser(id: string, diff: StynxPatchUserRequest): Observable<StynxUser> {
    return from(this.client.patch<StynxUser>(`/admin/users/${id}`, diff)).pipe(
      tap((user) => {
        this.usersState.update((users) => replaceById(users, user));
      }),
    );
  }

  disableUser(id: string): Observable<void> {
    return from(this.client.post<void>(`/admin/users/${id}/disable`, {}));
  }

  reactivateUser(id: string): Observable<void> {
    return from(this.client.post<void>(`/admin/users/${id}/reactivate`, {}));
  }

  inviteUser(id: string): Observable<void> {
    return from(this.client.post<void>(`/admin/users/${id}/invite`, {}));
  }

  forceLogoutUser(id: string): Observable<void> {
    return from(this.client.post<void>(`/admin/users/${id}/force-logout`, {}));
  }

  listUserRoles(id: string): Observable<StynxRole[]> {
    return from(this.client.get<StynxRole[]>(`/admin/users/${id}/roles`));
  }

  setUserRoles(id: string, roleIds: string[]): Observable<void> {
    return from(this.client.put<void>(`/admin/users/${id}/roles`, { roleIds }));
  }

  listUserGroups(id: string): Observable<StynxGroup[]> {
    return from(this.client.get<StynxGroup[]>(`/admin/users/${id}/groups`));
  }

  setUserGroups(id: string, groupIds: string[]): Observable<void> {
    return from(this.client.put<void>(`/admin/users/${id}/groups`, { groupIds }));
  }

  getEffectivePermissions(id: string): Observable<StynxEffectivePermissions> {
    return from(this.client.get<StynxEffectivePermissions>(`/admin/users/${id}/effective-permissions`));
  }

  listRoles(): Observable<StynxRole[]> {
    return from(this.client.get<StynxRole[]>('/admin/roles')).pipe(
      tap((roles) => {
        this.rolesState.set(roles);
      }),
    );
  }

  refreshRoles(): Observable<StynxRole[]> {
    return this.listRoles();
  }

  createRole(body: StynxCreateRoleRequest): Observable<StynxRole> {
    return from(this.client.post<StynxRole>('/admin/roles', body)).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  patchRole(id: string, diff: StynxPatchRoleRequest): Observable<StynxRole> {
    return from(this.client.patch<StynxRole>(`/admin/roles/${id}`, diff)).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  deleteRole(id: string): Observable<void> {
    return from(this.client.delete<void>(`/admin/roles/${id}`)).pipe(
      tap(() => {
        this.rolesState.update((roles) => removeById(roles, id));
      }),
    );
  }

  cloneRole(id: string, body: StynxCloneRoleRequest): Observable<StynxRole> {
    return from(this.client.post<StynxRole>(`/admin/roles/${id}/clone`, body)).pipe(
      tap((role) => {
        this.rolesState.update((roles) => replaceById(roles, role));
      }),
    );
  }

  listRolePermissions(id: string): Observable<StynxPermission[]> {
    return from(this.client.get<StynxPermission[]>(`/admin/roles/${id}/permissions`));
  }

  setRolePermissions(id: string, permissionKeys: string[]): Observable<void> {
    return from(this.client.put<void>(`/admin/roles/${id}/permissions`, { permissionKeys }));
  }

  listGroups(): Observable<StynxGroup[]> {
    return from(this.client.get<StynxGroup[]>('/admin/groups')).pipe(
      tap((groups) => {
        this.groupsState.set(groups);
      }),
    );
  }

  refreshGroups(): Observable<StynxGroup[]> {
    return this.listGroups();
  }

  createGroup(body: StynxCreateGroupRequest): Observable<StynxGroup> {
    return from(this.client.post<StynxGroup>('/admin/groups', body)).pipe(
      tap((group) => {
        this.groupsState.update((groups) => replaceById(groups, group));
      }),
    );
  }

  patchGroup(id: string, diff: StynxPatchGroupRequest): Observable<StynxGroup> {
    return from(this.client.patch<StynxGroup>(`/admin/groups/${id}`, diff)).pipe(
      tap((group) => {
        this.groupsState.update((groups) => replaceById(groups, group));
      }),
    );
  }

  deleteGroup(id: string): Observable<void> {
    return from(this.client.delete<void>(`/admin/groups/${id}`)).pipe(
      tap(() => {
        this.groupsState.update((groups) => removeById(groups, id));
      }),
    );
  }

  listGroupRoles(id: string): Observable<StynxRole[]> {
    return from(this.client.get<StynxRole[]>(`/admin/groups/${id}/roles`));
  }

  setGroupRoles(id: string, roleIds: string[]): Observable<void> {
    return from(this.client.put<void>(`/admin/groups/${id}/roles`, { roleIds }));
  }

  listGroupMembers(id: string): Observable<StynxUser[]> {
    return from(this.client.get<StynxUser[]>(`/admin/groups/${id}/members`));
  }

  setGroupMembers(id: string, userIds: string[]): Observable<void> {
    return from(this.client.put<void>(`/admin/groups/${id}/members`, { userIds }));
  }
}
