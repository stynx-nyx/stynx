import {
  PecIdentityAdminFacade,
  PormIdentityAdminFacade,
} from '../../../packages/backend/src/identity-admin/integration-facades';

function createIdentityAdminServiceStub() {
  return {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    getUserBySubject: jest.fn(),
    updateUser: jest.fn(),
    disableUser: jest.fn(),
    enableUser: jest.fn(),
    listGroupsForUser: jest.fn(),
    listGroups: jest.fn(),
    addUserToGroup: jest.fn(),
    removeUserFromGroup: jest.fn(),
    resetUserPassword: jest.fn(),
    setUserPassword: jest.fn(),
    verifyUserChannels: jest.fn(),
    syncToLocal: jest.fn(),
    syncUser: jest.fn(),
    listGroupsWithMetaByUserId: jest.fn(),
  };
}

describe('PormIdentityAdminFacade', () => {
  it('maps list/get to porm-compatible shape with attributes and groups', async () => {
    const service = createIdentityAdminServiceStub();
    service.listUsers.mockResolvedValue({
      items: [
        {
          username: 'john',
          enabled: true,
          status: 'CONFIRMED',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          email: 'john@example.com',
          phoneNumber: '+551199999999',
        },
      ],
      nextToken: 'next',
    });
    service.getUser.mockResolvedValue({
      username: 'john',
      enabled: true,
      status: 'CONFIRMED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      attributes: {
        sub: '1',
        email: 'john@example.com',
      },
    });
    service.listGroupsForUser.mockResolvedValue([
      { name: 'admins', description: 'Admins' },
      { name: 'analysts' },
    ]);

    const facade = new PormIdentityAdminFacade(service as never);
    const result = await facade.list({ email: 'john@example.com', limit: 10 });

    expect(result).toEqual({
      users: [
        {
          username: 'john',
          enabled: true,
          status: 'CONFIRMED',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          attributes: {
            sub: '1',
            email: 'john@example.com',
          },
          groups: ['admins', 'analysts'],
        },
      ],
      nextToken: 'next',
    });
    expect(service.listUsers).toHaveBeenCalledWith({
      email: 'john@example.com',
      phone: undefined,
      group: undefined,
      limit: 10,
      token: undefined,
    });
    expect(service.getUser).toHaveBeenCalledWith('john');
    expect(service.listGroupsForUser).toHaveBeenCalledWith('john');
  });

  it('returns updated=false when update payload is empty', async () => {
    const service = createIdentityAdminServiceStub();
    const facade = new PormIdentityAdminFacade(service as never);

    await expect(facade.update('john', {})).resolves.toEqual({ updated: false });
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('maps verify and sync operations for porm compatibility', async () => {
    const service = createIdentityAdminServiceStub();
    service.verifyUserChannels.mockResolvedValue({ ok: true });
    service.syncToLocal.mockResolvedValue({ ok: true, groups: 1, users: 2, memberships: 3 });
    service.syncUser.mockResolvedValue({
      ok: true,
      groups: 1,
      users: 1,
      memberships: 1,
      id: 'u-1',
    });
    service.listGroupsWithMetaByUserId.mockResolvedValue({
      groups: [{ name: 'admins', isIn: true, code: 'admin' }],
    });

    const facade = new PormIdentityAdminFacade(service as never);

    await expect(facade.verify('john', {})).resolves.toEqual({ verified: false });
    await expect(facade.verify('john', { email: true })).resolves.toEqual({ verified: true });
    await expect(facade.syncToLocal({ actorId: 'actor-1' })).resolves.toEqual({
      ok: true,
      groups: 1,
      users: 2,
      memberships: 3,
    });
    await expect(facade.syncUser('john', { actorId: 'actor-1' })).resolves.toEqual({
      ok: true,
      groups: 1,
      users: 1,
      memberships: 1,
      id: 'u-1',
    });
    await expect(facade.listGroupsWithMetaByUserId('user-1')).resolves.toEqual({
      groups: [{ name: 'admins', isIn: true, code: 'admin' }],
    });

    expect(service.verifyUserChannels).toHaveBeenCalledWith('john', { email: true });
    expect(service.syncToLocal).toHaveBeenCalledWith({ actorId: 'actor-1' });
    expect(service.syncUser).toHaveBeenCalledWith('john', { actorId: 'actor-1' });
  });
});

describe('PecIdentityAdminFacade', () => {
  it('maps list and update request/response to pec-compatible shape', async () => {
    const service = createIdentityAdminServiceStub();
    service.listUsers.mockResolvedValue({
      items: [
        {
          username: 'alice',
          enabled: true,
          status: 'FORCE_CHANGE_PASSWORD',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-02T00:00:00.000Z',
          email: 'alice@example.com',
          phoneNumber: '+551188888888',
        },
      ],
      nextToken: 'page-2',
    });
    service.updateUser.mockResolvedValue({
      username: 'alice',
      enabled: true,
      status: 'CONFIRMED',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-03T00:00:00.000Z',
      attributes: { email: 'alice@example.com' },
    });

    const facade = new PecIdentityAdminFacade(service as never);

    const listed = await facade.list({ phone: '5511' });
    expect(listed.nextToken).toBe('page-2');
    expect(listed.items[0]).toMatchObject({
      username: 'alice',
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      email: 'alice@example.com',
      phone_number: '+551188888888',
    });
    expect(listed.items[0].createdAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');

    const updated = await facade.update('alice', {
      email: 'new-alice@example.com',
      phone_number: '+551177777777',
      custom: { city: 'RJ' },
    });
    expect(updated.username).toBe('alice');
    expect(updated.updatedAt?.toISOString()).toBe('2026-02-03T00:00:00.000Z');
    expect(service.updateUser).toHaveBeenCalledWith('alice', {
      email: 'new-alice@example.com',
      phoneNumber: '+551177777777',
      custom: { city: 'RJ' },
    });
  });

  it('delegates group/password/verify operations', async () => {
    const service = createIdentityAdminServiceStub();
    service.listGroups.mockResolvedValue({
      items: [{ name: 'admins', description: 'Admins' }],
      nextToken: 'g-next',
    });
    service.resetUserPassword.mockResolvedValue({ ok: true });
    service.verifyUserChannels.mockResolvedValue({ ok: true });
    service.addUserToGroup.mockResolvedValue({ ok: true });
    service.removeUserFromGroup.mockResolvedValue({ ok: true });

    const facade = new PecIdentityAdminFacade(service as never);

    await expect(facade.listAllGroups({ limit: 50 })).resolves.toEqual({
      items: [{ name: 'admins', description: 'Admins' }],
      nextToken: 'g-next',
    });
    await expect(facade.resetPassword('alice')).resolves.toEqual({ ok: true });
    await expect(facade.verify('alice', { email: true })).resolves.toEqual({ ok: true });
    await expect(facade.addToGroup('alice', 'admins')).resolves.toEqual({ ok: true });
    await expect(facade.removeFromGroup('alice', 'admins')).resolves.toEqual({ ok: true });

    expect(service.listGroups).toHaveBeenCalledWith({ limit: 50 });
    expect(service.verifyUserChannels).toHaveBeenCalledWith('alice', { email: true });
  });
});
