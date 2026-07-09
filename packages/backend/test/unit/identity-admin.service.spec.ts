import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IdentityAdminError } from '@stynx-nyx/contracts';
import { IdentityAdminService } from '../../src/identity-admin/identity-admin.service';

function makeAdapter(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listUsers: vi.fn(async () => ({ users: [], nextToken: null })),
    getUser: vi.fn(async () => ({ username: 'u' })),
    getUserBySubject: vi.fn(async () => ({ username: 'u' })),
    updateUser: vi.fn(async () => ({ username: 'u' })),
    disableUser: vi.fn(async () => undefined),
    enableUser: vi.fn(async () => undefined),
    listGroupsForUser: vi.fn(async () => []),
    listGroups: vi.fn(async () => ({ groups: [], nextToken: null })),
    addUserToGroup: vi.fn(async () => undefined),
    removeUserFromGroup: vi.fn(async () => undefined),
    resetUserPassword: vi.fn(async () => undefined),
    setUserPassword: vi.fn(async () => undefined),
    verifyUserChannels: vi.fn(async () => undefined),
    ...overrides,
  } as never;
}

function makeLocalSync(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    syncToLocal: vi.fn(async () => ({ inserted: 0, updated: 0 })),
    syncUser: vi.fn(async () => ({ username: 'u' })),
    listGroupsWithMetaByUserId: vi.fn(async () => []),
    ...overrides,
  } as never;
}

describe('IdentityAdminService', () => {
  it('delegates list/get/update/disable/enable to the adapter', async () => {
    const adapter = makeAdapter();
    const svc = new IdentityAdminService(adapter);
    await svc.listUsers({ limit: 10 } as never);
    expect(adapter.listUsers).toHaveBeenCalledWith({ limit: 10 });
    await svc.getUser('alice');
    expect(adapter.getUser).toHaveBeenCalledWith('alice');
    await svc.updateUser('alice', { email: 'a@b' } as never);
    expect(adapter.updateUser).toHaveBeenCalledWith('alice', { email: 'a@b' });
    await expect(svc.disableUser('alice')).resolves.toEqual({ ok: true });
    await expect(svc.enableUser('alice')).resolves.toEqual({ ok: true });
  });

  it('delegates group / password / verify operations', async () => {
    const adapter = makeAdapter();
    const svc = new IdentityAdminService(adapter);
    await svc.listGroupsForUser('alice');
    await svc.listGroups({ limit: 5 });
    await expect(svc.addUserToGroup('alice', 'admins')).resolves.toEqual({ ok: true });
    await expect(svc.removeUserFromGroup('alice', 'admins')).resolves.toEqual({ ok: true });
    await expect(svc.resetUserPassword('alice')).resolves.toEqual({ ok: true });
    await expect(svc.setUserPassword('alice', 'pw', false)).resolves.toEqual({ ok: true });
    expect(adapter.setUserPassword).toHaveBeenCalledWith('alice', 'pw', false);
    await expect(
      svc.verifyUserChannels('alice', { email: true } as never),
    ).resolves.toEqual({ ok: true });
  });

  it('throws ServiceUnavailableException for getUserBySubject when adapter lacks support', async () => {
    const adapter = makeAdapter({ getUserBySubject: undefined });
    const svc = new IdentityAdminService(adapter);
    await expect(svc.getUserBySubject('sub-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('delegates getUserBySubject when the adapter supports it', async () => {
    const adapter = makeAdapter();
    const svc = new IdentityAdminService(adapter);
    await expect(svc.getUserBySubject('sub-1')).resolves.toEqual({ username: 'u' });
    expect(adapter.getUserBySubject).toHaveBeenCalledWith('sub-1');
  });

  it('throws ServiceUnavailableException for setUserPassword when adapter lacks support', async () => {
    const adapter = makeAdapter({ setUserPassword: undefined });
    const svc = new IdentityAdminService(adapter);
    await expect(svc.setUserPassword('alice', 'pw')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException for verifyUserChannels when adapter lacks support', async () => {
    const adapter = makeAdapter({ verifyUserChannels: undefined });
    const svc = new IdentityAdminService(adapter);
    await expect(svc.verifyUserChannels('alice', {} as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe('IdentityAdminError → HttpException mapping', () => {
    it.each([
      ['IDENTITY_NOT_FOUND', NotFoundException],
      ['IDENTITY_FORBIDDEN', ForbiddenException],
      ['IDENTITY_CONFLICT', ConflictException],
      ['IDENTITY_VALIDATION_ERROR', BadRequestException],
      ['IDENTITY_RATE_LIMITED', ServiceUnavailableException],
      ['IDENTITY_PROVIDER_ERROR', ServiceUnavailableException],
      ['UNKNOWN_CODE', ServiceUnavailableException],
    ])('%s maps to %p', async (code, ExpectedException) => {
      const adapter = makeAdapter({
        getUser: vi.fn(async () => {
          throw new IdentityAdminError(code as never, `${code} msg`);
        }),
      });
      const svc = new IdentityAdminService(adapter);
      await expect(svc.getUser('x')).rejects.toBeInstanceOf(ExpectedException);
    });
  });

  it('passes through non-IdentityAdminError throws unchanged', async () => {
    const adapter = makeAdapter({
      getUser: vi.fn(async () => {
        throw new Error('downstream');
      }),
    });
    const svc = new IdentityAdminService(adapter);
    await expect(svc.getUser('x')).rejects.toThrow('downstream');
  });

  describe('local-sync adapter delegations', () => {
    it('throws ServiceUnavailableException when no local-sync adapter is wired', async () => {
      const svc = new IdentityAdminService(makeAdapter());
      await expect(svc.syncToLocal()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(svc.syncUser('alice')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(svc.listGroupsWithMetaByUserId('user-x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('delegates syncToLocal / syncUser / listGroupsWithMetaByUserId to the local-sync adapter', async () => {
      const localSync = makeLocalSync();
      const svc = new IdentityAdminService(makeAdapter(), localSync);
      await svc.syncToLocal();
      expect(localSync.syncToLocal).toHaveBeenCalledTimes(1);
      await svc.syncUser('alice', { reason: 'manual' } as never);
      expect(localSync.syncUser).toHaveBeenCalledWith('alice', { reason: 'manual' });
      await svc.listGroupsWithMetaByUserId('user-1');
      expect(localSync.listGroupsWithMetaByUserId).toHaveBeenCalledWith('user-1');
    });
  });
});
