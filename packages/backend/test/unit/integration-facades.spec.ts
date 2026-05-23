import {
  PecIdentityAdminFacade,
  PormIdentityAdminFacade,
} from '../../src/identity-admin/integration-facades';

function makeAdminService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listUsers: vi.fn(async () => ({ items: [], nextToken: 'next-x' })),
    getUser: vi.fn(async () => ({
      username: 'u',
      enabled: true,
      attributes: { foo: 'bar' },
      status: 'CONFIRMED',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
      email: 'a@b',
      phoneNumber: '+1',
    })),
    getUserBySubject: vi.fn(async () => ({ username: 'u' })),
    listGroupsForUser: vi.fn(async () => [
      { name: 'admins', description: 'admin role' },
    ]),
    listGroups: vi.fn(async () => ({ items: [{ name: 'g' }], nextToken: 'next-g' })),
    updateUser: vi.fn(async () => ({ username: 'u', enabled: true, attributes: {} })),
    disableUser: vi.fn(async () => ({ ok: true })),
    enableUser: vi.fn(async () => ({ ok: true })),
    addUserToGroup: vi.fn(async () => ({ ok: true })),
    removeUserFromGroup: vi.fn(async () => ({ ok: true })),
    verifyUserChannels: vi.fn(async () => ({ ok: true })),
    resetUserPassword: vi.fn(async () => ({ ok: true })),
    setUserPassword: vi.fn(async () => ({ ok: true })),
    syncToLocal: vi.fn(async () => ({ inserted: 0, updated: 0 })),
    syncUser: vi.fn(async () => ({ id: 'u', inserted: 0, updated: 1 })),
    listGroupsWithMetaByUserId: vi.fn(async () => ({ groups: [] })),
    ...overrides,
  } as never;
}

describe('PormIdentityAdminFacade', () => {
  it('list() expands each item via get() to include groups + attributes', async () => {
    const service = makeAdminService({
      listUsers: vi.fn(async () => ({ items: [{ username: 'alice', enabled: true }] })),
    });
    const facade = new PormIdentityAdminFacade(service);
    const result = await facade.list({ limit: 1 });
    expect(result.users).toHaveLength(1);
    expect(result.users[0].groups).toEqual(['admins']);
    expect(result.users[0].attributes).toEqual({ foo: 'bar' });
  });

  it('list() forwards every supported filter to listUsers', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await facade.list({
      email: 'a@b',
      phone: '+1',
      group: 'admins',
      limit: 25,
      token: 'next-token',
    });
    expect(service.listUsers).toHaveBeenCalledWith({
      email: 'a@b',
      phone: '+1',
      group: 'admins',
      limit: 25,
      token: 'next-token',
    });
  });

  it('list() handles items without a username inline', async () => {
    const service = makeAdminService({
      listUsers: vi.fn(async () => ({
        items: [
          {
            enabled: false,
            status: 'UNCONFIRMED',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-02-01T00:00:00Z',
          },
        ],
        nextToken: 'tok',
      })),
    });
    const facade = new PormIdentityAdminFacade(service);
    const result = await facade.list({});
    expect(result.users[0].username).toBe('');
    expect(result.users[0].status).toBe('UNCONFIRMED');
    expect(result.users[0].enabled).toBe(false);
    expect(result.users[0].attributes).toEqual({});
    expect(result.users[0].groups).toEqual([]);
    expect(result.users[0].createdAt).toBe('2026-01-01T00:00:00Z');
    expect(result.users[0].updatedAt).toBe('2026-02-01T00:00:00Z');
    expect(result.nextToken).toBe('tok');
  });

  it('describes branch: list() omits optional inline fields and next token when absent', async () => {
    const service = makeAdminService({
      listUsers: vi.fn(async () => ({
        items: [{ enabled: true }],
      })),
    });
    const result = await new PormIdentityAdminFacade(service).list({});
    expect(result).toEqual({
      users: [{ username: '', enabled: true, attributes: {}, groups: [] }],
    });
  });

  it('get() composes user details + group names', async () => {
    const facade = new PormIdentityAdminFacade(makeAdminService());
    const result = await facade.get('alice');
    expect(result.username).toBe('u');
    expect(result.enabled).toBe(true);
    expect(result.status).toBe('CONFIRMED');
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(result.updatedAt).toBe('2026-02-01T00:00:00Z');
    expect(result.groups).toEqual(['admins']);
    expect(result.attributes).toEqual({ foo: 'bar' });
  });

  it('describes branch: get() omits optional status and timestamp fields', async () => {
    const service = makeAdminService({
      getUser: vi.fn(async () => ({
        username: 'u',
        enabled: true,
        attributes: {},
      })),
      listGroupsForUser: vi.fn(async () => []),
    });
    await expect(new PormIdentityAdminFacade(service).get('u')).resolves.toEqual({
      username: 'u',
      enabled: true,
      attributes: {},
      groups: [],
    });
  });

  it('getBySub() resolves username via getUserBySubject then composes', async () => {
    const facade = new PormIdentityAdminFacade(makeAdminService());
    const result = await facade.getBySub('sub-1');
    expect(result.username).toBe('u');
  });

  it('update() short-circuits when no updatable attributes are set', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await expect(facade.update('alice', {})).resolves.toEqual({ updated: false });
    expect(service.updateUser).not.toHaveBeenCalledTimes(1);
  });

  it('update() short-circuits when custom is empty', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await expect(facade.update('alice', { custom: {} })).resolves.toEqual({ updated: false });
    expect(service.updateUser).not.toHaveBeenCalledTimes(1);
  });

  it('update() passes through every present field to updateUser', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await facade.update('alice', {
      email: 'a@b',
      phone_number: '+1',
      name: 'Alice',
      given_name: 'A',
      family_name: 'L',
      custom: { dept: 'eng' },
    });
    expect(service.updateUser).toHaveBeenCalledWith('alice', {
      email: 'a@b',
      phoneNumber: '+1',
      name: 'Alice',
      givenName: 'A',
      familyName: 'L',
      custom: { dept: 'eng' },
    });
  });

  it.each([
    ['email', { email: 'a@b' }, { email: 'a@b' }],
    ['phone', { phone_number: '+1' }, { phoneNumber: '+1' }],
    ['name', { name: 'Alice' }, { name: 'Alice' }],
    ['given name', { given_name: 'A' }, { givenName: 'A' }],
    ['family name', { family_name: 'L' }, { familyName: 'L' }],
    ['custom', { custom: { dept: 'eng' } }, { custom: { dept: 'eng' } }],
  ])('update() treats %s as independently updatable', async (_label, input, expected) => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await expect(facade.update('alice', input)).resolves.toEqual({ updated: true });
    expect(service.updateUser).toHaveBeenCalledWith('alice', expected);
  });

  it('disable/enable/addToGroup/removeFromGroup/resetPassword/setPassword return their tags', async () => {
    const facade = new PormIdentityAdminFacade(makeAdminService());
    await expect(facade.disable('u')).resolves.toEqual({ disabled: true });
    await expect(facade.enable('u')).resolves.toEqual({ enabled: true });
    await expect(facade.addToGroup('u', 'g')).resolves.toEqual({ added: true });
    await expect(facade.removeFromGroup('u', 'g')).resolves.toEqual({ removed: true });
    await expect(facade.resetPassword('u')).resolves.toEqual({ reset: true });
    await expect(facade.setPassword('u', 'pw')).resolves.toEqual({ updated: true });
  });

  it('verify() short-circuits when neither email nor phone is requested', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    await expect(facade.verify('u', {})).resolves.toEqual({ verified: false });
    expect(service.verifyUserChannels).not.toHaveBeenCalledTimes(1);
  });

  it('verify() delegates when email or phone is requested', async () => {
    const facade = new PormIdentityAdminFacade(makeAdminService());
    await expect(facade.verify('u', { email: true })).resolves.toEqual({ verified: true });
  });

  it('listGroups / listGroupsWithMetaByUserId / listAllGroups delegate', async () => {
    const facade = new PormIdentityAdminFacade(makeAdminService());
    await expect(facade.listGroups('u')).resolves.toEqual({
      groups: [{ name: 'admins', description: 'admin role' }],
    });
    await expect(facade.listGroupsWithMetaByUserId('uid')).resolves.toEqual({ groups: [] });
    await expect(facade.listAllGroups({ limit: 5 })).resolves.toEqual({
      groups: [{ name: 'g' }],
      nextToken: 'next-g',
    });
  });

  it('describes branch: listAllGroups omits next token when provider has no token', async () => {
    const service = makeAdminService({
      listGroups: vi.fn(async () => ({ items: [{ name: 'g' }] })),
    });
    await expect(new PormIdentityAdminFacade(service).listAllGroups()).resolves.toEqual({
      groups: [{ name: 'g' }],
    });
  });

  it('syncToLocal / syncUser delegate', async () => {
    const service = makeAdminService();
    const facade = new PormIdentityAdminFacade(service);
    const context = { actorId: 'actor-1' };
    await expect(facade.syncToLocal(context)).resolves.toEqual({ inserted: 0, updated: 0 });
    await expect(facade.syncUser('u', context)).resolves.toEqual({ id: 'u', inserted: 0, updated: 1 });
    expect(service.syncToLocal).toHaveBeenCalledWith(context);
    expect(service.syncUser).toHaveBeenCalledWith('u', context);
  });
});

describe('PecIdentityAdminFacade', () => {
  it('list() maps items into PEC summary shape with parsed dates', async () => {
    const service = makeAdminService({
      listUsers: vi.fn(async () => ({
        items: [
          {
            username: 'u',
            status: 'CONFIRMED',
            enabled: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: 'invalid-date',
            email: 'a@b',
            phoneNumber: '+1',
          },
        ],
        nextToken: 'next-y',
      })),
    });
    const facade = new PecIdentityAdminFacade(service);
    const result = await facade.list({
      email: 'a@b',
      phone: '+1',
      group: 'admins',
      limit: 10,
      token: 'next',
    });
    expect(service.listUsers).toHaveBeenCalledWith({
      email: 'a@b',
      phone: '+1',
      group: 'admins',
      limit: 10,
      token: 'next',
    });
    expect(result.items[0].createdAt).toBeInstanceOf(Date);
    expect(result.items[0].updatedAt).toBe(undefined);
    expect(result.items[0].username).toBe('u');
    expect(result.items[0].status).toBe('CONFIRMED');
    expect(result.items[0].enabled).toBe(true);
    expect(result.items[0].email).toBe('a@b');
    expect(result.items[0].phone_number).toBe('+1');
    expect(result.nextToken).toBe('next-y');
  });

  it('list() emits null email/phone when adapter returns undefined', async () => {
    const service = makeAdminService({
      listUsers: vi.fn(async () => ({
        items: [{ username: 'u', enabled: true }],
      })),
    });
    const facade = new PecIdentityAdminFacade(service);
    const result = await facade.list({});
    expect(result.items[0].email).toBe(null);
    expect(result.items[0].phone_number).toBe(null);
  });

  it('get() maps user detail with parsed dates', async () => {
    const facade = new PecIdentityAdminFacade(makeAdminService());
    const result = await facade.get('u');
    expect(result.username).toBe('u');
    expect(result.status).toBe('CONFIRMED');
    expect(result.enabled).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.attributes).toEqual({ foo: 'bar' });
  });

  it('update() filters undefined fields, calls updateUser, returns mapped detail', async () => {
    const service = makeAdminService({
      updateUser: vi.fn(async () => ({
        username: 'u',
        status: 'UPDATED',
        enabled: false,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: 'invalid-date',
        attributes: { bar: 'baz' },
      })),
    });
    const facade = new PecIdentityAdminFacade(service);
    const result = await facade.update('u', {
      email: 'new@b',
      phone_number: '+2',
      custom: { team: 'ops' },
    });
    expect(service.updateUser).toHaveBeenCalledWith('u', {
      email: 'new@b',
      phoneNumber: '+2',
      custom: { team: 'ops' },
    });
    expect(result.status).toBe('UPDATED');
    expect(result.enabled).toBe(false);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBe(undefined);
  });

  it('describes branch: PEC update passes an empty patch when all fields are undefined', async () => {
    const service = makeAdminService({
      updateUser: vi.fn(async () => ({
        username: 'u',
        enabled: true,
        attributes: {},
      })),
    });
    const result = await new PecIdentityAdminFacade(service).update('u', {});
    expect(service.updateUser).toHaveBeenCalledWith('u', {});
    expect(result).toEqual({
      username: 'u',
      status: undefined,
      enabled: true,
      createdAt: undefined,
      updatedAt: undefined,
      attributes: {},
    });
  });

  it('disable/enable/listGroups/addToGroup/removeFromGroup/verify/resetPassword delegate', async () => {
    const facade = new PecIdentityAdminFacade(makeAdminService());
    await expect(facade.disable('u')).resolves.toEqual({ ok: true });
    await expect(facade.enable('u')).resolves.toEqual({ ok: true });
    await expect(facade.listGroups('u')).resolves.toEqual([
      { name: 'admins', description: 'admin role' },
    ]);
    await expect(facade.addToGroup('u', 'g')).resolves.toEqual({ ok: true });
    await expect(facade.removeFromGroup('u', 'g')).resolves.toEqual({ ok: true });
    await expect(facade.verify('u', { email: true })).resolves.toEqual({ ok: true });
    await expect(facade.resetPassword('u')).resolves.toEqual({ ok: true });
  });

  it('listAllGroups() maps items + nextToken', async () => {
    const facade = new PecIdentityAdminFacade(makeAdminService());
    await expect(facade.listAllGroups({ limit: 5 })).resolves.toEqual({
      items: [{ name: 'g' }],
      nextToken: 'next-g',
    });
  });

  it('describes branch: PEC listAllGroups omits next token when absent', async () => {
    const service = makeAdminService({
      listGroups: vi.fn(async () => ({ items: [{ name: 'g' }] })),
    });
    await expect(new PecIdentityAdminFacade(service).listAllGroups()).resolves.toEqual({
      items: [{ name: 'g' }],
    });
  });
});
