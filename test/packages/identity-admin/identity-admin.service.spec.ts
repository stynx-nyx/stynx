import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IdentityAdminError } from '@stynx-nyx/contracts';
import { IdentityAdminService } from '../../../packages/backend/src/identity-admin/identity-admin.service';

function createAdapterStub() {
  return {
    listUsers: vi.fn(async () => ({ items: [] })),
    getUser: vi.fn(async () => ({ username: 'u1', enabled: true, attributes: {} })),
    updateUser: vi.fn(async () => ({ username: 'u1', enabled: true, attributes: {} })),
    disableUser: vi.fn(async () => undefined),
    enableUser: vi.fn(async () => undefined),
    listGroupsForUser: vi.fn(async () => []),
    listGroups: vi.fn(async () => ({ items: [] })),
    addUserToGroup: vi.fn(async () => undefined),
    removeUserFromGroup: vi.fn(async () => undefined),
    resetUserPassword: vi.fn(async () => undefined),
  };
}

describe('IdentityAdminService', () => {
  it('maps IdentityAdminError to Nest exceptions', async () => {
    const adapter = createAdapterStub();
    const service = new IdentityAdminService(adapter as never);

    adapter.getUser.mockRejectedValueOnce(
      new IdentityAdminError('IDENTITY_NOT_FOUND', 'missing'),
    );
    await expect(service.getUser('u1')).rejects.toBeInstanceOf(NotFoundException);

    adapter.getUser.mockRejectedValueOnce(
      new IdentityAdminError('IDENTITY_CONFLICT', 'conflict'),
    );
    await expect(service.getUser('u1')).rejects.toBeInstanceOf(ConflictException);

    adapter.getUser.mockRejectedValueOnce(
      new IdentityAdminError('IDENTITY_VALIDATION_ERROR', 'invalid'),
    );
    await expect(service.getUser('u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns provider error when local sync adapter is not configured', async () => {
    const adapter = createAdapterStub();
    const service = new IdentityAdminService(adapter as never);

    await expect(service.syncToLocal()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('delegates local sync methods when adapter is provided', async () => {
    const adapter = createAdapterStub();
    const localSync = {
      syncToLocal: vi.fn(async () => ({ ok: true, groups: 1, users: 2, memberships: 3 })),
      syncUser: vi.fn(async () => ({ ok: true, groups: 1, users: 1, memberships: 1 })),
      listGroupsWithMetaByUserId: vi.fn(async () => ({ groups: [] })),
    };
    const service = new IdentityAdminService(adapter as never, localSync as never);

    await expect(service.syncToLocal({ actorId: 'actor-1' })).resolves.toEqual({
      ok: true,
      groups: 1,
      users: 2,
      memberships: 3,
    });
    expect(localSync.syncToLocal).toHaveBeenCalledWith({ actorId: 'actor-1' });

    await expect(service.syncUser('user-1')).resolves.toEqual({
      ok: true,
      groups: 1,
      users: 1,
      memberships: 1,
    });
    expect(localSync.syncUser).toHaveBeenCalledWith('user-1', undefined);
  });
});
