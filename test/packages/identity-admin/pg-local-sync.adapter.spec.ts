import { IdentityAdminError } from '@stynx/contracts';
import {
  PgIdentityLocalSyncAdapter,
  loadPormRoleMetaRows,
} from '../../../packages/stynx-backend/src/identity-admin/pg-local-sync.adapter';

function createIdentityAdminStub() {
  return {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    listGroupsForUser: jest.fn(),
    listGroups: jest.fn(),
  };
}

function createDbStub() {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO auth.roles')) {
      return { rows: [{ role_id: `role-${String(params?.[0])}` }] };
    }
    if (sql.includes('SELECT external_id FROM auth.users')) {
      return { rows: [{ external_id: 'john' }] };
    }
    if (sql.includes('FROM porm.v_enum')) {
      return {
        rows: [
          {
            code: 'admin',
            label: 'Administrator',
            icon: 'shield',
            meta: { color: 'red' },
            order: 1,
            sort_order: 1,
          },
        ],
      };
    }
    return { rows: [] };
  });
  const withTransaction = jest.fn(
    async (
      run: (client: unknown) => Promise<unknown>,
      _context?: unknown,
    ) => run({}),
  );
  return { query, withTransaction };
}

describe('PgIdentityLocalSyncAdapter', () => {
  it('syncs users/groups into local tables and returns counters', async () => {
    const identityAdmin = createIdentityAdminStub();
    const db = createDbStub();
    identityAdmin.listGroups.mockResolvedValue({
      items: [{ name: 'admins', description: 'Admins' }],
      nextToken: undefined,
    });
    identityAdmin.listUsers.mockResolvedValue({
      items: [
        {
          username: 'john',
          enabled: true,
          status: 'CONFIRMED',
        },
      ],
      nextToken: undefined,
    });
    identityAdmin.getUser.mockResolvedValue({
      username: 'john',
      enabled: true,
      status: 'CONFIRMED',
      attributes: {
        sub: '11111111-1111-1111-1111-111111111111',
        email: 'john@example.com',
      },
    });
    identityAdmin.listGroupsForUser.mockResolvedValue([{ name: 'admins' }]);

    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: identityAdmin as never,
      db: db as never,
    });

    const result = await adapter.syncToLocal({ actorId: 'actor-1' });
    expect(result).toEqual({
      ok: true,
      groups: 1,
      users: 1,
      memberships: 1,
      skipped: 0,
    });
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(identityAdmin.getUser).toHaveBeenCalledWith('john');
  });

  it('syncUser throws validation error when detail has invalid subject', async () => {
    const identityAdmin = createIdentityAdminStub();
    const db = createDbStub();
    identityAdmin.getUser.mockResolvedValue({
      username: 'john',
      enabled: true,
      attributes: { sub: 'not-a-uuid' },
    });

    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: identityAdmin as never,
      db: db as never,
    });

    await expect(adapter.syncUser('john')).rejects.toBeInstanceOf(IdentityAdminError);
  });

  it('returns group metadata by user id using optional meta loader', async () => {
    const identityAdmin = createIdentityAdminStub();
    const db = createDbStub();
    identityAdmin.listGroups.mockResolvedValue({
      items: [{ name: 'admins', description: 'Admins' }],
      nextToken: undefined,
    });
    identityAdmin.listGroupsForUser.mockResolvedValue([{ name: 'admins' }]);

    const adapter = new PgIdentityLocalSyncAdapter({
      identityAdmin: identityAdmin as never,
      db: db as never,
      loadGroupMetaRows: async (executor) => loadPormRoleMetaRows(executor),
    });

    const result = await adapter.listGroupsWithMetaByUserId(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(result).toEqual({
      groups: [
        {
          name: 'admins',
          description: 'Admins',
          isIn: true,
          code: 'admin',
          label: 'Administrator',
          caption: 'Administrator',
          icon: 'shield',
          meta: { color: 'red' },
          sortOrder: 1,
        },
      ],
    });
  });
});
