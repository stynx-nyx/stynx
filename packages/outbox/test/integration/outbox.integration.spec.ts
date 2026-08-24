import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

async function insertTenants(database: PostgresTestDatabase): Promise<void> {
  const admin = await database.connectAsAdmin();
  try {
    await admin.query(
      `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
       values ($1, 'outbox-a', 'Outbox A', true, clock_timestamp(), clock_timestamp()),
              ($2, 'outbox-b', 'Outbox B', true, clock_timestamp(), clock_timestamp())`,
      [TENANT_A, TENANT_B],
    );
  } finally {
    await admin.end();
  }
}

describe('transactional outbox integration', () => {
  let postgres: PostgresTestDatabase | undefined;
  let moduleRef: TestingModule | undefined;
  let database: Database;
  let outbox: OutboxService;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('stynx-outbox-owner') },
            app: { connectionString: postgres.connectionString('stynx-outbox-app') },
            reader: { connectionString: postgres.connectionString('stynx-outbox-reader') },
          },
          migrations: { enabled: true },
        }),
        StynxOutboxModule.forRoot(),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    await insertTenants(postgres);
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  beforeEach(async () => {
    await database.withSystemContext('outbox fixture cleanup', async () =>
      database.tx(
        async (trx) => {
          await trx.query('truncate outbox.acknowledgements, outbox.messages');
        },
        { role: 'owner', readonly: false },
      ),
    );
  });

  it('grants tenant roles table access while FORCE RLS remains enabled', async () => {
    const admin = await postgres!.connectAsAdmin();
    try {
      const result = await admin.query<{ forced: boolean; app_access: boolean; reader_access: boolean; owner_bypass: boolean }>(`
        select c.relforcerowsecurity as forced,
               has_table_privilege('stynx_app', 'outbox.messages', 'SELECT,INSERT,UPDATE,DELETE') as app_access,
               has_table_privilege('stynx_reader', 'outbox.messages', 'SELECT') as reader_access,
               (select rolbypassrls from pg_roles where rolname = 'stynx_owner') as owner_bypass
          from pg_class c
         where c.oid = 'outbox.messages'::regclass
      `);
      expect(result.rows[0]).toEqual({ forced: true, app_access: true, reader_access: true, owner_bypass: true });
    } finally {
      await admin.end();
    }
  });

  it('keeps tenant reads RLS-scoped and lets owner-context dispatch span tenants', async () => {
    await database.withSystemContext('outbox fixture insert', async () =>
      database.tx(
        async (trx) => {
          await trx.query(
            `insert into outbox.messages (tenant_id, entity, entity_id, payload, idempotency_key)
             values ($1, 'test.aggregate', 'a', '{}', 'test-a'),
                    ($2, 'test.aggregate', 'b', '{}', 'test-b')`,
            [TENANT_A, TENANT_B],
          );
        },
        { role: 'owner', readonly: false },
      ),
    );

    const app = await postgres!.connectAsAdmin();
    try {
      await app.query('begin');
      await app.query('set local role stynx_app');
      await app.query(`select set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      const visibleToTenantA = await app.query<{ count: string }>('select count(*)::text as count from outbox.messages');
      expect(visibleToTenantA.rows[0]?.count).toBe('1');
      await app.query('rollback');
    } finally {
      await app.end();
    }

    const claimed = await outbox.dispatchDue(10);
    expect(claimed).toHaveLength(2);
    expect(claimed.map((outcome) => outcome.row.tenantId).sort()).toEqual([TENANT_A, TENANT_B]);
  });

  it('never double-claims one row across concurrent dispatcher sweeps', async () => {
    await database.withSystemContext('outbox lock fixture insert', async () =>
      database.tx(
        async (trx) => {
          await trx.query(
            `insert into outbox.messages (tenant_id, entity, entity_id, payload, idempotency_key)
             values ($1, 'test.aggregate', 'locked', '{}', 'test-locked')`,
            [TENANT_A],
          );
        },
        { role: 'owner', readonly: false },
      ),
    );

    const [first, second] = await Promise.all([outbox.dispatchDue(1), outbox.dispatchDue(1)]);
    const claimedIds = [...first, ...second].map((outcome) => outcome.row.id);
    expect(claimedIds).toHaveLength(1);
    expect(new Set(claimedIds).size).toBe(1);
  });
});
