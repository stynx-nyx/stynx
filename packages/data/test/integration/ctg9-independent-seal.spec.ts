import { Test, type TestingModule } from '@nestjs/testing';
import { Database } from '../../src/database';
import { StynxDataModule } from '../../src/data.module';
import { ReadOnlyViolationError } from '../../src/errors';
import { StynxPoolRegistry } from '../../src/pools';
import type { Transaction } from '../../src/transaction';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres';

const TENANT = 'a1111111-1111-4111-8111-111111111111';
const ACTOR = 'a2222222-2222-4222-8222-222222222222';

type IndependentPort = Database & {
  txIndependent<T>(
    fn: (trx: Transaction) => Promise<T>,
    options: {
      role: 'app';
      isolation: 'read committed';
      strictItemMode: true;
      retry?: false;
    },
  ): Promise<T>;
};

describe('CTG9 strict independent item transaction (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: IndependentPort;
  let pools: StynxPoolRegistry;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_seal', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-seal-owner') },
            app: { connectionString: postgres.appConnectionString('ctg9-seal-app'), max: 1 },
            reader: { connectionString: postgres.connectionString('ctg9-seal-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database) as IndependentPort;
    pools = moduleRef.get(StynxPoolRegistry);
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query('create table public.ctg9_seal_probe (id integer primary key)');
      await admin.query('grant select, insert on public.ctg9_seal_probe to stynx_app');
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('rejects a derived-context second connection before pool.connect and clears the holder afterward', async () => {
    await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.txIndependent(
        async (trx) => {
          const first = await trx.query<{ pid: number }>('select pg_backend_pid() as pid');
          expect(first.rows[0]?.pid).toEqual(expect.any(Number));
          const spy = vi.spyOn(pools.pools.app, 'connect').mockImplementation(() => {
            throw new Error('SECOND_CONNECT_ATTEMPT');
          });
          try {
            let failure: unknown;
            try {
              await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
                database.tx(
                  async (other) => {
                    await other.query('select 1');
                  },
                  { role: 'app', retry: false },
                ),
              );
            } catch (error) {
              failure = error;
            }
            expect((failure as Error | undefined)?.constructor.name).toBe(
              'IndependentTransactionConnectionError',
            );
            expect(spy).not.toHaveBeenCalled();
          } finally {
            spy.mockRestore();
          }
        },
        { role: 'app', isolation: 'read committed', strictItemMode: true, retry: false },
      ),
    );
    const after = await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ ok: number }>('select 1 as ok');
          return result.rows[0]?.ok;
        },
        { role: 'app', retry: false },
      ),
    );
    expect(after).toBe(1);
  }, 10_000);

  it('maps a write after the terminal seal to ReadOnlyViolationError and rolls back the item', async () => {
    await expect(
      database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
        database.txIndependent(
          async (trx) => {
            await trx.query('insert into public.ctg9_seal_probe (id) values (1)');
            await trx.query('set local transaction_read_only = on');
            await trx.query('insert into public.ctg9_seal_probe (id) values (2)');
          },
          { role: 'app', isolation: 'read committed', strictItemMode: true, retry: false },
        ),
      ),
    ).rejects.toBeInstanceOf(ReadOnlyViolationError);
    const admin = await postgres.connectAsAdmin();
    try {
      const result = await admin.query<{ count: string }>(
        'select count(*)::text as count from public.ctg9_seal_probe',
      );
      expect(result.rows[0]?.count).toBe('0');
    } finally {
      await admin.end();
    }
  });
});
