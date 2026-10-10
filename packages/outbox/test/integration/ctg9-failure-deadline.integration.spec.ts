import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import type { OutboxRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'f3111111-1111-4111-8111-111111111111';
const ACTOR = 'f3222222-2222-4222-8222-222222222222';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('CTG9 legacy failure persistence deadline (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let transport: (row: OutboxRow) => Promise<void>;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_failure_deadline', {
      useTemplate: false,
    });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-deadline-owner') },
            app: {
              connectionString: postgres.appConnectionString('ctg9-deadline-app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-deadline-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          failurePersistenceDeadlineMs: 350,
          lockTimeoutMs: 20,
          dispatcher: { send: (row) => transport(row) },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
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
        `insert into tenancy.tenants(id,slug,name) values ($1,'ctg9-failure-deadline','CTG9 failure deadline')`,
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

  it('returns one unresolved row after a held marker exceeds the deadline and still sends the next claim', async () => {
    const enqueue = (key: string) =>
      database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
        database.tx(
          (trx) =>
            outbox.enqueue(trx, {
              entity: 'ctg9.deadline',
              entityId: key,
              idempotencyKey: key,
              payload: { key },
            }),
          { role: 'app', retry: false },
        ),
      );
    const first = await enqueue(`ctg9-first-${randomUUID()}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await enqueue(`ctg9-second-${randomUUID()}`);
    const holder = await postgres.connectAsAdmin();
    const sent: string[] = [];
    transport = async (row) => {
      sent.push(row.id);
      if (row.id === first.id) {
        await holder.query('begin');
        await holder.query('select id from outbox.legacy_ownership for update');
        throw new Error('first provider failed');
      }
      await holder.query('commit');
    };
    try {
      const started = Date.now();
      const outcomes = await outbox.dispatchDue(2);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(sent).toEqual([first.id, second.id]);
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0]).toMatchObject({
        row: { id: first.id },
        dispatched: false,
        reconciliationRequired: true,
        error: expect.stringContaining('persistence unresolved'),
      });
      expect(outcomes[1]).toMatchObject({ row: { id: second.id }, dispatched: true });
      const persisted = await holder.query<{ id: string; status: string; attempts: number }>(
        `select id,status,attempts from outbox.messages where id in ($1,$2) order by created_at,id`,
        [first.id, second.id],
      );
      expect(persisted.rows).toEqual([
        { id: first.id, status: 'SENT', attempts: 1 },
        { id: second.id, status: 'SENT', attempts: 1 },
      ]);
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);
});
