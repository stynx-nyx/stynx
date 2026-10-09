import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT_A = 'f4111111-1111-4111-8111-111111111111';
const TENANT_B = 'f4222222-2222-4222-8222-222222222222';
const ACTOR = 'f4333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('CTG9 one SSE clock preflight per tenant (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_admission', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-admission-owner') },
            app: {
              connectionString: postgres.appConnectionString('ctg9-admission-app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-admission-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    const pools = moduleRef.get(StynxPoolRegistry).pools;
    for (const [pool, role] of [
      [pools.app, 'stynx_app'],
      [pools.reader, 'stynx_reader'],
    ] as const) {
      const identity = await pool.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>('select current_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user');
      expect(identity.rows).toEqual([{ current_user: role, rolsuper: false, rolbypassrls: false }]);
    }
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants(id,slug,name) values
        ($1,'ctg9-admission-a','CTG9 admission A'),($2,'ctg9-admission-b','CTG9 admission B')`,
        [TENANT_A, TENANT_B],
      );
      await admin.query(
        `insert into outbox.tenant_clock(tenant_id,last_ms)
        values ($1,0) on conflict (tenant_id) do nothing`,
        [TENANT_A],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('times out N waiters without a second same-tenant connection or blocking another tenant', async () => {
    const holder = await postgres.connectAsAdmin();
    const pools = moduleRef.get(StynxPoolRegistry).pools;
    const nativeConnect = pools.app.connect.bind(pools.app);
    let releaseFirst!: () => void;
    let firstConnected!: () => void;
    const firstMayProceed = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const connected = new Promise<void>((resolve) => {
      firstConnected = resolve;
    });
    const connect = vi.spyOn(pools.app, 'connect');
    connect.mockImplementation((async () => {
      const client = await nativeConnect();
      if (connect.mock.calls.length === 1) {
        firstConnected();
        await firstMayProceed;
      }
      return client;
    }) as never);
    const source = new OutboxEventStreamSource(database, { lockTimeoutMs: 120 });
    try {
      await holder.query('begin');
      await holder.query(
        'select tenant_id from outbox.tenant_clock where tenant_id=$1 for update',
        [TENANT_A],
      );
      const first = source.now({ tenantId: TENANT_A, actorId: ACTOR });
      await connected;
      const waiters = Array.from({ length: 6 }, () =>
        source.now({ tenantId: TENANT_A, actorId: ACTOR }),
      );
      const settled = await Promise.allSettled(waiters);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(settled).toHaveLength(6);
      for (const outcome of settled) {
        expect(outcome.status).toBe('rejected');
        if (outcome.status === 'rejected') {
          expect(outcome.reason).toMatchObject({ code: 'SSE_SOURCE_UNAVAILABLE', status: 503 });
        }
      }
      const other = await source.now({ tenantId: TENANT_B, actorId: ACTOR });
      expect(other.getTime()).toBeGreaterThan(0);
      releaseFirst();
      await expect(first).rejects.toMatchObject({ code: '55P03' });
    } finally {
      releaseFirst?.();
      connect.mockRestore();
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);
});
