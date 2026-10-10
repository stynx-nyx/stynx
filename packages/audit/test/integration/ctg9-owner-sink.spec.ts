import { Test, type TestingModule } from '@nestjs/testing';
import { StynxDataModule } from '@stynx-nyx/data';
import { AuditSqlSink } from '../../src/sql-adapter';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'f1111111-1111-4111-8111-111111111111';
const ACTOR = 'f2222222-2222-4222-8222-222222222222';

describe('CTG9 owner AuditSqlSink tenant chain (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_owner_audit', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-audit-owner') },
            app: { connectionString: postgres.appConnectionString('ctg9-audit-app') },
            reader: { connectionString: postgres.connectionString('ctg9-audit-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1, 'ctg9-owner-audit', 'CTG9 owner audit', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('writes a real tenant event through owner role and verifies its hash chain', async () => {
    const client = await postgres.connectAsAdmin();
    try {
      await client.query('begin');
      await client.query('set local role stynx_owner');
      const sink = new AuditSqlSink(client, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: new Date().toISOString(),
        tenantId: TENANT,
        actorId: ACTOR,
        actorRole: 'owner',
        action: 'CTG9_OWNER_WRITE',
        entity: 'ctg9.owner',
        entityId: 'one',
      });
      await client.query('commit');
      const event = await client.query<{ tenancy_id: string; actor_id: string }>(
        `select tenancy_id, actor_id from audit.events
          where entity = 'ctg9.owner' and entity_id = 'one'`,
      );
      expect(event.rows).toEqual([{ tenancy_id: TENANT, actor_id: ACTOR }]);
      const verification = await client.query<{ chain_valid: boolean }>(
        'select chain_valid from audit.verify_chain($1::uuid, 1000)',
        [TENANT],
      );
      expect(verification.rows).toEqual([{ chain_valid: true }]);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});
