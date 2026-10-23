import { Test, type TestingModule } from '@nestjs/testing';
import { RequestContextMutator } from '@stynx-nyx/core';
import { Database } from '../../src/database.js';
import { StynxDataModule } from '../../src/data.module.js';
import { StynxPoolRegistry } from '../../src/pools.js';
import { createPostgresTestDatabase } from '../support/postgres.js';

interface RoleSnapshot {
  pid: number;
  roles: string;
}

// INV-RBAC-001 / SM-05: a reused connection's ambient session role list cannot
// grant privileges to the next verified request or an owner system transaction.
describe('Database transaction role isolation (PostgreSQL)', () => {
  it(
    'shadows ambient privileged roles for absent/empty claims and owner context on reused connections',
    { timeout: 120_000 },
    async () => {
      const postgres = await createPostgresTestDatabase('stynx_data_roles');
      let moduleRef: TestingModule | undefined;
      try {
        moduleRef = await Test.createTestingModule({
          imports: [
            StynxDataModule.forRoot({
              connections: {
                owner: { connectionString: postgres.connectionString('roles-owner'), max: 1 },
                app: { connectionString: postgres.appConnectionString('roles-app'), max: 1 },
                reader: { connectionString: postgres.connectionString('roles-reader'), max: 1 },
              },
              retry: false,
            }),
          ],
        }).compile();
        await moduleRef.init();
        const database = moduleRef.get(Database);
        const pools = moduleRef.get(StynxPoolRegistry);
        const mutator = moduleRef.get(RequestContextMutator, { strict: false });
        const snapshotSql = `select pg_backend_pid() as pid, current_setting('app.roles', true) as roles`;

        for (const role of ['app', 'reader', 'owner'] as const) {
          const pool = pools.get(role);
          const client = await pool.connect();
          let ambient: RoleSnapshot;
          try {
            await client.query(`select set_config('app.roles', 'platform:superadmin', false)`);
            ambient = (await client.query<RoleSnapshot>(snapshotSql)).rows[0]!;
          } finally {
            client.release();
          }
          expect(ambient.roles).toBe('platform:superadmin');

          for (const roles of [['tenant:admin'], [], undefined]) {
            const transact = () =>
              database.tx(
                async (trx) => {
                  const result = await trx.query<RoleSnapshot>(snapshotSql);
                  return result.rows[0];
                },
                { role, readonly: role === 'reader' },
              );
            const observed = await mutator.runWithRequestContext(
              {
                requestId: 'role-isolation',
                tenantId: 'tenant-1',
                actorId: 'actor-1',
                ...(roles ? { roles } : {}),
                startedAt: new Date(),
              },
              () =>
                role === 'owner'
                  ? database.withSystemContext('verify owner role isolation', transact)
                  : transact(),
            );

            expect(observed).toEqual({
              pid: ambient.pid,
              roles: role === 'owner' ? '' : (roles ?? []).join(','),
            });
            // SET LOCAL must mask the ambient value only inside the transaction.
            expect((await pool.query<RoleSnapshot>(snapshotSql)).rows[0]).toEqual(ambient);
          }
        }
      } finally {
        await moduleRef?.close();
        await postgres.dispose();
      }
    },
  );
});
