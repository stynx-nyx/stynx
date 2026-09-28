import { Test, type TestingModule } from '@nestjs/testing';
import { Database } from '../../src/database';
import { StynxDataModule } from '../../src/data.module';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres';

const TENANT = 'd1111111-1111-4111-8111-111111111111';
const ACTOR = 'd2222222-2222-4222-8222-222222222222';

const writeCommand = `select audit.write_command_event(
  'CREATE', 'ctg9.chain', $1, '{}'::jsonb,
  null, null, 'ctg9-chain', null, '{"ok":true}'::jsonb, null
)`;

describe('CTG9 shared audit chain on live PostgreSQL', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_chain', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-chain-owner') },
            app: { connectionString: postgres.connectionString('ctg9-chain-app') },
            reader: { connectionString: postgres.connectionString('ctg9-chain-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1, 'ctg9-chain', 'CTG9 chain', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
      await admin.query('create schema ctg9_audit');
      await admin.query(`create table ctg9_audit.probe (
        id uuid primary key,
        tenant_id uuid not null references tenancy.tenants(id),
        value integer not null
      )`);
      await admin.query(`select audit.enable_for('ctg9_audit.probe'::regclass)`);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  async function beginApp(isolation: 'read committed' | 'repeatable read' | 'serializable') {
    const client = await postgres.connectAsAdmin();
    await client.query(`begin isolation level ${isolation}`);
    await client.query('set local role stynx_app');
    await client.query(`select set_config('app.role', 'app', true)`);
    await client.query(`select set_config('app.tenant_id', $1, true)`, [TENANT]);
    await client.query(`select set_config('app.actor_id', $1, true)`, [ACTOR]);
    return client;
  }

  it('applies requested top-level isolation on the live connection before caller SQL', async () => {
    const live = await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ isolation: string }>(
            `select current_setting('transaction_isolation') as isolation`,
          );
          return result.rows[0]?.isolation;
        },
        { role: 'app', isolation: 'repeatable read', retry: false },
      ),
    );
    expect(live).toBe('repeatable read');
  });

  it.each(['repeatable read', 'serializable'] as const)(
    'rejects %s before writing audit rows, with the fixed isolation error',
    async (isolation) => {
      const client = await beginApp(isolation);
      const entityId = `ctg9-isolation-${isolation}`;
      try {
        let failure: unknown;
        try {
          await client.query(writeCommand, [entityId]);
        } catch (error) {
          failure = error;
        }
        expect(failure).toMatchObject({
          code: '40001',
          message: 'audit_chain_requires_read_committed',
        });
        await client.query('rollback');
        const visible = await client.query<{ count: string }>(
          'select count(*)::text as count from audit.events where tenancy_id = $1 and entity_id = $2',
          [TENANT, entityId],
        );
        expect(visible.rows[0]?.count).toBe('0');
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    },
  );

  it('maps only the audit isolation error and never retries the command callback', async () => {
    let attempts = 0;
    let failure: unknown;
    try {
      await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
        database.tx(
          async (trx) => {
            attempts += 1;
            await trx.query(writeCommand, ['ctg9-mapped-isolation']);
          },
          { role: 'app', isolation: 'serializable', retry: { attempts: 3, jitterMs: [1, 1] } },
        ),
      );
    } catch (error) {
      failure = error;
    }
    expect((failure as Error | undefined)?.constructor.name).toBe('AuditChainIsolationError');
    expect(attempts).toBe(1);
    const admin = await postgres.connectAsAdmin();
    try {
      const rows = await admin.query<{ count: string }>(
        `select count(*)::text as count from audit.events where entity_id = 'ctg9-mapped-isolation'`,
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      await admin.end();
    }
  });

  it('orders three command events in one transaction and verifies the whole chain', async () => {
    const client = await beginApp('read committed');
    const prefix = 'ctg9-three-';
    try {
      for (let index = 0; index < 3; index += 1) {
        await client.query(writeCommand, [`${prefix}${index}`]);
      }
      await client.query('commit');
      const events = await client.query<{
        entity_id: string;
        occurred_at: Date;
        previous_hash: string | null;
        row_hash: string;
      }>(
        `select entity_id, occurred_at, previous_hash, row_hash
           from audit.events where tenancy_id = $1 and entity_id like $2
          order by occurred_at, event_id`,
        [TENANT, `${prefix}%`],
      );
      const distinctTimes = await client.query<{ count: string }>(
        `select count(distinct occurred_at)::text as count from audit.events
          where tenancy_id = $1 and entity_id like $2`,
        [TENANT, `${prefix}%`],
      );
      expect(distinctTimes.rows[0]?.count).toBe('3');
      expect(events.rows.map((row) => row.entity_id)).toEqual([
        `${prefix}0`,
        `${prefix}1`,
        `${prefix}2`,
      ]);
      expect(events.rows[0]!.occurred_at.getTime()).toBeLessThanOrEqual(
        events.rows[1]!.occurred_at.getTime(),
      );
      expect(events.rows[1]!.occurred_at.getTime()).toBeLessThanOrEqual(
        events.rows[2]!.occurred_at.getTime(),
      );
      expect(events.rows[1]!.previous_hash).toBe(events.rows[0]!.row_hash);
      expect(events.rows[2]!.previous_hash).toBe(events.rows[1]!.row_hash);
      const verification = await client.query<{ chain_valid: boolean }>(
        'select chain_valid from audit.verify_chain($1::uuid, 1000)',
        [TENANT],
      );
      expect(verification.rows).toHaveLength(3);
      expect(verification.rows.every((row) => row.chain_valid)).toBe(true);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });

  it('rejects a tenant-chain to NULL-chain switch before taking another advisory lock', async () => {
    const client = await beginApp('read committed');
    const entityId = 'ctg9-chain-switch';
    try {
      await client.query(writeCommand, [entityId]);
      await client.query('set local role stynx_owner');
      let failure: unknown;
      try {
        await client.query(
          `select audit.write(null::uuid, $1::uuid, 'owner', 'CREATE', 'ctg9.chain', 'ctg9-null-switch')`,
          [ACTOR],
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: 'STY41' });
      await client.query('rollback');
      const rows = await client.query<{ count: string }>(
        `select count(*)::text as count from audit.events
          where entity_id in ($1, 'ctg9-null-switch')`,
        [entityId],
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });

  it('gives three trigger-written rows distinct, chain-ordered timestamps in one transaction', async () => {
    const client = await postgres.connectAsAdmin();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.tenant_id', $1, true)`, [TENANT]);
      await client.query(`select set_config('app.actor_id', $1, true)`, [ACTOR]);
      for (let value = 0; value < 3; value += 1) {
        await client.query(
          `insert into ctg9_audit.probe (id, tenant_id, value)
           values (gen_random_uuid(), $1, $2)`,
          [TENANT, value],
        );
      }
      await client.query('commit');
      const distinct = await client.query<{ count: string }>(
        `select count(distinct occurred_at)::text as count from audit.events
          where tenancy_id = $1 and entity = 'ctg9_audit.probe'`,
        [TENANT],
      );
      expect(distinct.rows[0]?.count).toBe('3');
      const verification = await client.query<{ chain_valid: boolean }>(
        'select chain_valid from audit.verify_chain($1::uuid, 1000)',
        [TENANT],
      );
      expect(verification.rows).toHaveLength(6);
      expect(verification.rows.every((row) => row.chain_valid)).toBe(true);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});
