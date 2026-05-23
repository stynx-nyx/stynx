import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { CanActivateFn, UrlTree } from '@angular/router';
import { Router } from '@angular/router';
import { STYNX_ANGULAR_AUTH_OPTIONS, StynxSessionService } from '@stynx-web/angular-auth';
import type { StynxSdkClient } from '@stynx-web/sdk';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import * as iam from '../src';
import { IamApiService } from '../src/iam-api.service';
import { IAM_ROUTES, iamRoutes } from '../src/routes';
import { STYNX_IAM_CLIENT } from '../src/tokens';
import type { PagedResult, StynxGroup, StynxRole, StynxUser } from '../src';

type ClientCall = [path: string, bodyOrOptions?: unknown, maybeOptions?: unknown];

function createClient(): StynxSdkClient & {
  calls: {
    get: ClientCall[];
    post: ClientCall[];
    patch: ClientCall[];
    put: ClientCall[];
    delete: ClientCall[];
  };
} {
  const calls = {
    get: [] as ClientCall[],
    post: [] as ClientCall[],
    patch: [] as ClientCall[],
    put: [] as ClientCall[],
    delete: [] as ClientCall[],
  };

  const users: PagedResult<StynxUser> = {
    items: [{ id: 'user-1', email: 'ada@example.test', displayName: 'Ada' }],
    meta: { page: 2, pageSize: 25, total: 1 },
  };
  const roles: StynxRole[] = [{ id: 'role-1', key: 'admin', name: 'Admin' }];
  const groups: StynxGroup[] = [{ id: 'group-1', key: 'ops', name: 'Ops' }];

  return {
    calls,
    get: async (path: string, options?: unknown) => {
      calls.get.push([path, options]);
      if (path === '/admin/users') return users;
      if (path === '/admin/users/user-1') return { ...users.items[0]!, locale: 'en-US' };
      if (path === '/admin/users/user-1/roles') return roles;
      if (path === '/admin/users/user-1/groups') return groups;
      if (path === '/admin/users/user-1/effective-permissions') return { userId: 'user-1', permissions: [] };
      if (path === '/admin/roles') return roles;
      if (path === '/admin/roles/role-1/permissions') return [{ key: 'iam:users:read' }];
      if (path === '/admin/groups') return groups;
      if (path === '/admin/groups/group-1/roles') return roles;
      if (path === '/admin/groups/group-1/members') return users.items;
      throw new Error(`Unhandled GET ${path}`);
    },
    post: async (path: string, body?: unknown, options?: unknown) => {
      calls.post.push([path, body, options]);
      if (path === '/admin/users') return { id: 'user-2', email: 'grace@example.test' };
      if (path === '/admin/roles') return { id: 'role-2', key: 'auditor', name: 'Auditor' };
      if (path === '/admin/roles/role-1/clone') return { id: 'role-3', key: 'clone', name: 'Clone' };
      if (path === '/admin/groups') return { id: 'group-2', key: 'support', name: 'Support' };
      return undefined;
    },
    patch: async (path: string, body?: unknown, options?: unknown) => {
      calls.patch.push([path, body, options]);
      if (path === '/admin/users/user-1') return { id: 'user-1', email: 'patched@example.test' };
      if (path === '/admin/roles/role-1') return { id: 'role-1', key: 'admin', name: 'Admin patched' };
      if (path === '/admin/groups/group-1') return { id: 'group-1', key: 'ops', name: 'Ops patched' };
      throw new Error(`Unhandled PATCH ${path}`);
    },
    put: async (path: string, body?: unknown, options?: unknown) => {
      calls.put.push([path, body, options]);
      return undefined;
    },
    delete: async (path: string, options?: unknown) => {
      calls.delete.push([path, options]);
      return undefined;
    },
  } as StynxSdkClient & {
    calls: {
      get: ClientCall[];
      post: ClientCall[];
      patch: ClientCall[];
      put: ClientCall[];
      delete: ClientCall[];
    };
  };
}

function createService(client: StynxSdkClient): IamApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_IAM_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new IamApiService());
}

describe('@stynx-web/angular-iam API and routes', () => {
  it('exposes a host-facing provider and defensive IAM route factory', () => {
    expect(typeof iam.provideStynxIam).toBe('function');
    expect(typeof iam.iamRoutes).toBe('function');
    expect(iam.STYNX_IAM_CLIENT.toString()).toContain('STYNX_IAM_CLIENT');
    expect(iam.provideStynxIam({ clientFactory: createClient })).toEqual(expect.any(Object));
    expect(iam.iamRoutes().map((route) => route.path)).toEqual([
      'users',
      'users/:userId',
      'roles',
      'roles/:roleId',
      'groups',
      'groups/:groupId',
    ]);
  });

  it('wraps every IAM SDK endpoint and updates list caches', async () => {
    const client = createClient();
    const service = createService(client);

    await expect(firstValueFrom(service.listUsers({ q: 'ada', page: 2, pageSize: 25, tenantId: 'tenant-1' })))
      .resolves.toMatchObject({ meta: { page: 2, pageSize: 25, total: 1 } });
    expect(service.users()).toEqual([expect.objectContaining({ id: 'user-1' })]);
    expect(client.calls.get[0]).toEqual([
      '/admin/users',
      { query: { q: 'ada', page: 2, pageSize: 25 }, tenantId: 'tenant-1' },
    ]);

    await firstValueFrom(service.refreshUsers());
    await firstValueFrom(service.getUser('user-1'));
    await firstValueFrom(service.createUser({ email: 'grace@example.test', sendInvite: true }));
    expect(service.users().map((user) => user.id)).toEqual(['user-2', 'user-1']);
    await firstValueFrom(service.patchUser('user-1', { email: 'patched@example.test' }));
    expect(service.users().find((user) => user.id === 'user-1')?.email).toBe('patched@example.test');
    await firstValueFrom(service.disableUser('user-1'));
    await firstValueFrom(service.reactivateUser('user-1'));
    await firstValueFrom(service.inviteUser('user-1'));
    await firstValueFrom(service.forceLogoutUser('user-1'));
    await firstValueFrom(service.listUserRoles('user-1'));
    await firstValueFrom(service.setUserRoles('user-1', ['role-1']));
    await firstValueFrom(service.listUserGroups('user-1'));
    await firstValueFrom(service.setUserGroups('user-1', ['group-1']));
    await firstValueFrom(service.getEffectivePermissions('user-1'));

    await firstValueFrom(service.listRoles());
    expect(service.roles()).toEqual([expect.objectContaining({ id: 'role-1' })]);
    await firstValueFrom(service.refreshRoles());
    await firstValueFrom(service.createRole({ key: 'auditor', name: 'Auditor' }));
    await firstValueFrom(service.patchRole('role-1', { name: 'Admin patched' }));
    await firstValueFrom(service.cloneRole('role-1', { key: 'clone', name: 'Clone' }));
    expect(service.roles().map((role) => role.id)).toEqual(['role-3', 'role-2', 'role-1']);
    await firstValueFrom(service.listRolePermissions('role-1'));
    await firstValueFrom(service.setRolePermissions('role-1', ['iam:users:read']));
    await firstValueFrom(service.deleteRole('role-1'));
    expect(service.roles().map((role) => role.id)).toEqual(['role-3', 'role-2']);

    await firstValueFrom(service.listGroups());
    expect(service.groups()).toEqual([expect.objectContaining({ id: 'group-1' })]);
    await firstValueFrom(service.refreshGroups());
    await firstValueFrom(service.createGroup({ key: 'support', name: 'Support' }));
    await firstValueFrom(service.patchGroup('group-1', { name: 'Ops patched' }));
    expect(service.groups().map((group) => group.id)).toEqual(['group-2', 'group-1']);
    await firstValueFrom(service.listGroupRoles('group-1'));
    await firstValueFrom(service.setGroupRoles('group-1', ['role-1']));
    await firstValueFrom(service.listGroupMembers('group-1'));
    await firstValueFrom(service.setGroupMembers('group-1', ['user-1']));
    await firstValueFrom(service.deleteGroup('group-1'));
    expect(service.groups().map((group) => group.id)).toEqual(['group-2']);

    expect(client.calls.post.map(([path]) => path)).toEqual(expect.arrayContaining([
      '/admin/users/user-1/disable',
      '/admin/users/user-1/reactivate',
      '/admin/users/user-1/invite',
      '/admin/users/user-1/force-logout',
      '/admin/roles/role-1/clone',
    ]));
    expect(client.calls.put).toEqual(expect.arrayContaining([
      ['/admin/users/user-1/roles', { roleIds: ['role-1'] }, undefined],
      ['/admin/users/user-1/groups', { groupIds: ['group-1'] }, undefined],
      ['/admin/roles/role-1/permissions', { permissionKeys: ['iam:users:read'] }, undefined],
      ['/admin/groups/group-1/roles', { roleIds: ['role-1'] }, undefined],
      ['/admin/groups/group-1/members', { userIds: ['user-1'] }, undefined],
    ]));
  });

  // WAVE-05A targeted kills — patchRole/patchGroup state update + URL templates.
  it('patchRole hits the exact /admin/roles/<id> URL and updates roles state with the patched record', async () => {
    const client = createClient();
    const service = createService(client);
    await firstValueFrom(service.listRoles());
    // Patch URL must be exactly `/admin/roles/${id}` — kills StringLiteral mutation that empties the template.
    await firstValueFrom(service.patchRole('role-1', { name: 'Admin patched' }));
    expect(client.calls.patch.find(([p]) => p === '/admin/roles/role-1')).toEqual(expect.anything());
    // The tap() body updates state with the response shape — kills BlockStatement {} mutation.
    expect(service.roles().find((role) => role.id === 'role-1')?.name).toBe('Admin patched');
  });

  it('patchGroup hits the exact /admin/groups/<id> URL and updates groups state with the patched record', async () => {
    const client = createClient();
    const service = createService(client);
    await firstValueFrom(service.listGroups());
    await firstValueFrom(service.patchGroup('group-1', { name: 'Ops patched' }));
    expect(client.calls.patch.find(([p]) => p === '/admin/groups/group-1')).toEqual(expect.anything());
    expect(service.groups().find((group) => group.id === 'group-1')?.name).toBe('Ops patched');
  });

  it('deleteRole hits the exact /admin/roles/<id> URL (kills StringLiteral mutation on the delete-role template)', async () => {
    const client = createClient();
    const service = createService(client);
    await firstValueFrom(service.listRoles());
    await firstValueFrom(service.deleteRole('role-1'));
    expect(client.calls.delete.map(([p]) => p)).toContain('/admin/roles/role-1');
  });

  it('deleteGroup hits the exact /admin/groups/<id> URL (kills StringLiteral mutation on the delete-group template)', async () => {
    const client = createClient();
    const service = createService(client);
    await firstValueFrom(service.listGroups());
    await firstValueFrom(service.deleteGroup('group-1'));
    expect(client.calls.delete.map(([p]) => p)).toContain('/admin/groups/group-1');
  });

  it('omits empty query options while preserving explicit tenant scope', async () => {
    const client = createClient();
    const service = createService(client);

    await firstValueFrom(service.listUsers({ tenantId: 'tenant-2' }));

    expect(client.calls.get[0]).toEqual(['/admin/users', { tenantId: 'tenant-2' }]);
  });

  it('returns defensive IAM route copies with permission metadata', () => {
    const first = iamRoutes();
    const second = iamRoutes();
    first.pop();

    expect(second).toHaveLength(IAM_ROUTES.length);
    expect(second.map((route) => route.path)).toEqual([
      'users',
      'users/:userId',
      'roles',
      'roles/:roleId',
      'groups',
      'groups/:groupId',
    ]);
    expect(second.map((route) => route.data?.['permission'])).toEqual([
      'iam:users:read',
      'iam:users:read',
      'iam:roles:read',
      'iam:roles:read',
      'iam:groups:read',
      'iam:groups:read',
    ]);
  });

  it('allows and denies route activation through the IAM permission guards', () => {
    const usersRoute = iamRoutes().find((route) => route.path === 'users');
    const guard = usersRoute?.canActivate?.[0] as CanActivateFn;
    const parseUrl = vi.fn((value: string) => ({ redirectedTo: value }) as unknown as UrlTree);

    const allowedInjector = Injector.create({
      providers: [
        { provide: StynxSessionService, useValue: { hasAllPermissions: () => true } },
        { provide: Router, useValue: { parseUrl } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: {} },
      ],
    });
    expect(runInInjectionContext(allowedInjector, () => guard({} as never, {} as never))).toBe(true);

    const deniedInjector = Injector.create({
      providers: [
        { provide: StynxSessionService, useValue: { hasAllPermissions: (permissions: string[]) => permissions.includes('other') } },
        { provide: Router, useValue: { parseUrl } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: { permissionDeniedRoute: '/forbidden' } },
      ],
    });
    expect(runInInjectionContext(deniedInjector, () => guard({} as never, {} as never))).toEqual({ redirectedTo: '/forbidden' });
  });
});
