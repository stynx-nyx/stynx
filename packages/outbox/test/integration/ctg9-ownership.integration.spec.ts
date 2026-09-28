import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'c1111111-1111-4111-8111-111111111111';
const ACTOR = 'c2222222-2222-4222-8222-222222222222';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('CTG9 legacy ownership barrier (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_ownership', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-owner') },
            app: { connectionString: asRole(postgres.connectionString('ctg9-app'), 'stynx_app') },
            reader: {
              connectionString: asRole(postgres.connectionString('ctg9-reader'), 'stynx_reader'),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot(),
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
      }>('select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user');
      expect(identity.rows).toEqual([{ current_user: role, rolsuper: false, rolbypassrls: false }]);
    }

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1, 'ctg9-ownership', 'CTG9 ownership', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
      // A missing platform migration must not be the red result of this lock sensor.
      // The local relation has the same singleton ownership shape and is discarded with the DB.
      const exists = await admin.query<{ present: string | null }>(
        `select to_regclass('outbox.legacy_ownership')::text as present`,
      );
      if (!exists.rows[0]?.present) {
        await admin.query(`create table outbox.legacy_ownership (
          id integer primary key check (id = 1),
          state text not null check (state in ('LEGACY', 'NEW')),
          generation bigint not null default 0
        )`);
        await admin.query('grant select on outbox.legacy_ownership to stynx_app');
        await admin.query(
          `insert into outbox.legacy_ownership (id, state, generation) values (1, 'LEGACY', 0)`,
        );
      }
      const marker = await admin.query<{ state: string }>(
        'select state from outbox.legacy_ownership',
      );
      expect(marker.rows).toEqual([expect.objectContaining({ state: 'LEGACY' })]);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('keeps marker state owner-only under the real app role', async () => {
    const admin = await postgres.connectAsAdmin();
    try {
      let denied = false;
      try {
        const attempt = await database.withRequestContext(
          { tenantId: TENANT, actorId: ACTOR },
          () =>
            database.tx(
              (trx) =>
                trx.query<{ state: string }>(
                  `update outbox.legacy_ownership set state='NEW' where id=true returning state`,
                ),
              { role: 'app', retry: false },
            ),
        );
        denied = attempt.rows.length === 0;
      } catch (error) {
        denied = ['42501', '44000'].includes((error as { code?: string }).code ?? '');
      }
      expect(denied).toBe(true);
      const marker = await admin.query<{ state: string }>(
        'select state from outbox.legacy_ownership where id=true',
      );
      expect(marker.rows).toEqual([{ state: 'LEGACY' }]);
    } finally {
      await admin.query(`update outbox.legacy_ownership set state='LEGACY'`).catch(() => undefined);
      await admin.end();
    }
  });

  it('rolls back enqueue when cutover already holds marker UPDATE; same key can be retried', async () => {
    const holder = await postgres.connectAsAdmin();
    const key = `ctg9-contention-${randomUUID()}`;
    try {
      await holder.query('begin');
      await holder.query('select * from outbox.legacy_ownership for update');

      let failure: unknown;
      try {
        await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
          database.tx(
            async (trx) => {
              await trx.query(`select set_config('lock_timeout', '200ms', true)`);
              await outbox.enqueue(trx, {
                entity: 'ctg9.aggregate',
                entityId: key,
                idempotencyKey: key,
                payload: { step: 1 },
              });
            },
            { role: 'app', retry: false },
          ),
        );
      } catch (error) {
        failure = error;
      }
      expect((failure as Error | undefined)?.constructor.name).toBe(
        'OutboxOwnershipContentionError',
      );
      expect((failure as { code?: string } | undefined)?.code).toBeDefined();

      const absent = await holder.query<{ count: string }>(
        'select count(*)::text as count from outbox.messages where tenant_id = $1 and idempotency_key = $2',
        [TENANT, key],
      );
      expect(absent.rows[0]?.count).toBe('0');
      await holder.query('commit');

      const retried = await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
        database.tx(
          (trx) =>
            outbox.enqueue(trx, {
              entity: 'ctg9.aggregate',
              entityId: key,
              idempotencyKey: key,
              payload: { step: 1 },
            }),
          { role: 'app', retry: false },
        ),
      );
      expect(retried.tenantId).toBe(TENANT);
      const committed = await holder.query<{ count: string }>(
        'select count(*)::text as count from outbox.messages where tenant_id = $1 and idempotency_key = $2',
        [TENANT, key],
      );
      expect(committed.rows[0]?.count).toBe('1');
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);

  it('rejects legacy enqueue after ownership is NEW without creating a message', async () => {
    const admin = await postgres.connectAsAdmin();
    const key = `ctg9-new-${randomUUID()}`;
    try {
      await admin.query(
        `update outbox.legacy_ownership set state = 'NEW', generation = generation + 1`,
      );
      let failure: unknown;
      try {
        await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
          database.tx(
            (trx) =>
              outbox.enqueue(trx, {
                entity: 'ctg9.aggregate',
                entityId: key,
                idempotencyKey: key,
                payload: { step: 1 },
              }),
            { role: 'app', retry: false },
          ),
        );
      } catch (error) {
        failure = error;
      }
      expect((failure as Error | undefined)?.constructor.name).toBe('OutboxLegacyCutoverError');
      const rows = await admin.query<{ count: string }>(
        'select count(*)::text as count from outbox.messages where tenant_id = $1 and idempotency_key = $2',
        [TENANT, key],
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      await admin
        .query(`update outbox.legacy_ownership set state = 'LEGACY'`)
        .catch(() => undefined);
      await admin.end();
    }
  });

  it('keeps the legacy enqueue, dispatchDue and ACK path usable while marker is LEGACY', async () => {
    const key = `ctg9-legacy-${randomUUID()}`;
    const marker = await postgres.connectAsAdmin();
    try {
      const state = await marker.query<{ state: string }>(
        'select state from outbox.legacy_ownership',
      );
      expect(state.rows).toEqual([expect.objectContaining({ state: 'LEGACY' })]);
    } finally {
      await marker.end();
    }
    const enqueued = await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        (trx) =>
          outbox.enqueue(trx, {
            entity: 'ctg9.legacy',
            entityId: key,
            idempotencyKey: key,
            payload: { legacy: true },
          }),
        { role: 'app', retry: false },
      ),
    );
    expect(enqueued.status).toBe('PENDING');
    const claimed = await outbox.dispatchDue(20);
    expect(claimed.some((outcome) => outcome.row.id === enqueued.id)).toBe(true);
    const acked = await outbox.ack({
      entity: 'ctg9.legacy',
      entityId: key,
      tenantId: TENANT,
      status: 'ACKED',
    });
    expect(acked.status).toBe('ACKED');
    const admin = await postgres.connectAsAdmin();
    try {
      const ledger = await admin.query<{ count: string }>(
        'select count(*)::text as count from outbox.acknowledgements where message_id = $1',
        [enqueued.id],
      );
      expect(ledger.rows[0]?.count).toBe('1');
    } finally {
      await admin.end();
    }
  });

  it('does not claim legacy rows while cutover holds marker UPDATE', async () => {
    const key = `ctg9-claim-${randomUUID()}`;
    const holder = await postgres.connectAsAdmin();
    try {
      await holder.query(
        `insert into outbox.messages (tenant_id, entity, entity_id, payload, idempotency_key)
         values ($1, 'ctg9.claim', $2, '{}'::jsonb, $2)`,
        [TENANT, key],
      );
      await holder.query('begin');
      await holder.query('select * from outbox.legacy_ownership for update');
      let failure: unknown;
      try {
        await outbox.dispatchDue(20);
      } catch (error) {
        failure = error;
      }
      expect((failure as Error | undefined)?.constructor.name).toBe(
        'OutboxOwnershipContentionError',
      );
      const target = await holder.query<{ status: string; attempts: number }>(
        'select status, attempts from outbox.messages where tenant_id = $1 and idempotency_key = $2',
        [TENANT, key],
      );
      expect(target.rows).toEqual([{ status: 'PENDING', attempts: 0 }]);
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);
});
