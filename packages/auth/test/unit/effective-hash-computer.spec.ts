import type { ModuleRef } from '@nestjs/core';
import { EffectiveHashComputer } from '../../src/effective-hash-computer';

describe('EffectiveHashComputer', () => {
  function createService() {
    const trx = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('select key from auth.perms')) {
          return {
            rows: [{ key: 'document:read:*' }, { key: 'document:write:*' }, { key: 'document:*:*' }],
          };
        }
        if (sql.includes('from auth.membership_roles') && sql.includes('role_id = any')) {
          return { rows: [{ id: 'membership-1' }] };
        }
        if (sql.includes('from auth.group_roles')) {
          return { rows: [{ id: 'membership-2' }] };
        }
        if (sql.includes('from auth.group_memberships') && sql.includes('group_id = any')) {
          return { rows: [{ id: 'membership-3' }] };
        }
        if (sql.includes('from auth.memberships membership')) {
          return { rows: [{ id: 'membership-4' }] };
        }
        if (sql.includes('from auth.memberships') && sql.includes('user_id = $1')) {
          return { rows: [{ id: 'membership-5' }] };
        }
        if (sql.includes('select distinct perm.key')) {
          return { rows: [{ key: 'document:*:*' }] };
        }
        return { rows: [] };
      }),
    };
    const database = {
      tx: jest.fn(async (fn: (value: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const moduleRef = {
      get: jest.fn(() => database),
    } as unknown as ModuleRef;

    return { service: new EffectiveHashComputer(moduleRef), trx, database };
  }

  it('recomputes membership hashes for direct and grouped role mutations', async () => {
    const { service, trx } = createService();

    await service.afterRolePermissionMutation(trx as never, ['role-1']);
    await service.afterGroupRoleMutation(trx as never, ['group-1']);
    await service.afterPlatformRoleChange(trx as never);

    expect(trx.query).toHaveBeenCalledWith(expect.stringContaining('update auth.memberships'), expect.any(Array));
  });

  it('recomputes the active membership hash for a user and tenant pair', async () => {
    const { service, database } = createService();

    await service.ensureMembershipHash('user-1', 'tenant-1');

    expect(database.tx).toHaveBeenCalled();
  });

  it('short-circuits empty mutation inputs', async () => {
    const { service, trx } = createService();

    await service.afterRolePermissionMutation(trx as never, []);
    await service.afterGroupRoleMutation(trx as never, []);

    expect(trx.query).not.toHaveBeenCalledWith(expect.stringContaining('select distinct membership_id as id'), []);
  });
});
