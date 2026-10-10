import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'a1111111-1111-4111-8111-111111111111';
const ACTOR = 'a2222222-2222-4222-8222-222222222222';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const bounded = async <T>(work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    delay(5_000).then(() => {
      throw new Error('CTG9 A/B/C queue deadline');
    }),
  ]);

describe('CTG9 A/B/C ownership queue (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_queue', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-queue-owner') },
            app: {
              connectionString: postgres.appConnectionString('ctg9-queue-app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-queue-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({ lockTimeoutMs: 2_000 }),
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
        `insert into tenancy.tenants (id,slug,name) values ($1,'ctg9-queue','CTG9 queue')`,
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

  it('lets B finish its marker and advisory wait before C cutover while A resolves or retries without duplicates', async () => {
    const aggregate = randomUUID();
    const keyA = `ctg9-queue-a-${aggregate}`;
    const keyB = `ctg9-queue-b-${aggregate}`;
    const completion: string[] = [];
    let startA!: () => void;
    let releaseA!: () => void;
    const aStarted = new Promise<void>((resolve) => {
      startA = resolve;
    });
    const aMayEnqueue = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const admin = await postgres.connectAsAdmin();
    const waitForLock = async (application: string, event?: string) => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const state = await admin.query<{ count: string }>(
          `select count(*)::text as count from pg_stat_activity
            where datname=current_database() and application_name=$1
              and wait_event_type='Lock' and ($2::text is null or wait_event=$2)`,
          [application, event ?? null],
        );
        if (Number(state.rows[0]?.count) > 0) return;
        await delay(10);
      }
      throw new Error(`did not observe ${application} lock wait`);
    };
    try {
      const a = database
        .withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
          database.tx(
            async (trx) => {
              await trx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [TENANT]);
              startA();
              await aMayEnqueue;
              return outbox.enqueue(trx, {
                entity: 'ctg9.queue',
                entityId: aggregate,
                idempotencyKey: keyA,
                payload: { actor: 'A' },
              });
            },
            { role: 'app', isolation: 'read committed', retry: false },
          ),
        )
        .finally(() => {
          completion.push('A');
        });
      await bounded(aStarted);
      const b = database
        .withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
          database.tx(
            (trx) =>
              outbox.appendInTransaction(trx, {
                entity: 'ctg9.queue',
                entityId: aggregate,
                idempotencyKey: keyB,
                payload: { actor: 'B' },
              }),
            { role: 'app', isolation: 'read committed', retry: false },
          ),
        )
        .finally(() => {
          completion.push('B');
        });
      await waitForLock('ctg9-queue-app', 'advisory');
      const c = outbox.cutoverLegacyMessages().finally(() => {
        completion.push('C');
      });
      await waitForLock('ctg9-queue-owner');
      releaseA();
      const [aResult, bResult, cResult] = await bounded(Promise.allSettled([a, b, c]));
      if (aResult.status === 'rejected') {
        expect(aResult.reason).toMatchObject({ code: 'OUTBOX_OWNERSHIP_CONTENTION' });
      }
      expect(bResult.status).toBe('fulfilled');
      expect(cResult.status).toBe('fulfilled');
      expect(completion.indexOf('A')).toBeLessThan(completion.indexOf('C'));
      expect(completion.indexOf('B')).toBeLessThan(completion.indexOf('C'));
      const legacy = await admin.query<{ count: string }>(
        'select count(*)::text as count from outbox.messages where tenant_id=$1 and idempotency_key=$2',
        [TENANT, keyA],
      );
      expect(legacy.rows[0]?.count).toBe(aResult.status === 'fulfilled' ? '1' : '0');
      const facts = await admin.query<{ idempotency_key: string; count: string }>(
        `select idempotency_key,count(*)::text as count from outbox.events
          where tenant_id=$1 and idempotency_key in ($2,$3) group by idempotency_key`,
        [TENANT, keyA, keyB],
      );
      expect(facts.rows.find((row) => row.idempotency_key === keyB)?.count).toBe('1');
      expect(facts.rows.find((row) => row.idempotency_key === keyA)?.count).toBe(
        aResult.status === 'fulfilled' ? '1' : undefined,
      );
      if (aResult.status === 'rejected') {
        await expect(
          database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
            database.tx(
              (trx) =>
                outbox.enqueue(trx, {
                  entity: 'ctg9.queue',
                  entityId: aggregate,
                  idempotencyKey: keyA,
                  payload: { actor: 'A' },
                }),
              { role: 'app', retry: false },
            ),
          ),
        ).rejects.toMatchObject({ code: 'OUTBOX_LEGACY_CUTOVER' });
      }
    } finally {
      releaseA?.();
      await admin.end();
    }
  }, 15_000);
});
