import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = 'f1111111-1111-4111-8111-111111111111';
const ACTOR = 'f2222222-2222-4222-8222-222222222222';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const bounded = async <T>(work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CTG9 legacy late deadline')), 5_000),
    ),
  ]);

describe('CTG9 in-flight legacy failure after cutover (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let rejectSend!: (error: Error) => void;
  let sendStarted!: () => void;
  const sending = new Promise<void>((resolve) => {
    sendStarted = resolve;
  });

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_legacy_late', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-late-owner') },
            app: {
              connectionString: asRole(postgres.connectionString('ctg9-late-app'), 'stynx_app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-late-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher: {
            send: async () => {
              sendStarted();
              return new Promise<void>((_resolve, reject) => {
                rejectSend = reject;
              });
            },
          },
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
        `insert into tenancy.tenants (id,slug,name) values ($1,'ctg9-legacy-late','CTG9 legacy late')`,
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

  it('mirrors a late legacy send failure into the migrated attempt and projection', async () => {
    const key = `ctg9-late-${randomUUID()}`;
    const legacy = await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        (trx) =>
          outbox.enqueue(trx, {
            entity: 'ctg9.legacy-late',
            entityId: key,
            idempotencyKey: key,
            payload: { key },
          }),
        { role: 'app', retry: false },
      ),
    );
    const sendingPromise = outbox.dispatchDue(1);
    await bounded(sending);
    const migration = await bounded(outbox.cutoverLegacyMessages());
    expect(migration.migrated).toBe(1);
    const admin = await postgres.connectAsAdmin();
    try {
      const during = await admin.query<{ migrated_event_id: string; status: string }>(
        'select migrated_event_id,status from outbox.messages where id=$1',
        [legacy.id],
      );
      expect(during.rows[0]?.status).toBe('SENT');
      const eventId = during.rows[0]!.migrated_event_id;
      const unresolved = await admin.query<{ status: string }>(
        'select status from outbox.event_delivery where tenant_id=$1 and event_id=$2',
        [TENANT, eventId],
      );
      expect(unresolved.rows).toEqual([{ status: 'SENT_UNRESOLVED' }]);
      expect(await outbox.dispatchEventsDue(1)).toHaveLength(0);

      rejectSend(new Error('provider failed after cutover'));
      const outcomes = await bounded(sendingPromise);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.dispatched).toBe(false);
      expect(outcomes[0]?.error).toContain('provider failed after cutover');
      const mirrored = await admin.query<{
        status: string;
        last_error: string;
        next_attempt_at: Date | null;
      }>(
        'select status,last_error,next_attempt_at from outbox.event_delivery where tenant_id=$1 and event_id=$2',
        [TENANT, eventId],
      );
      expect(mirrored.rows[0]).toMatchObject({
        status: 'ERROR',
        last_error: 'provider failed after cutover',
      });
      expect(new Date(mirrored.rows[0]!.next_attempt_at!).getTime()).toBeGreaterThan(Date.now());
      const ledger = await admin.query<{
        result: string;
        attempt_ordinal: number;
        legacy_message_id: string;
        error: string;
      }>(
        `select result,attempt_ordinal,legacy_message_id,error from outbox.event_attempts
          where tenant_id=$1 and event_id=$2`,
        [TENANT, eventId],
      );
      expect(ledger.rows).toEqual(
        expect.arrayContaining([
          {
            result: 'LEGACY_HISTORY_UNAVAILABLE',
            attempt_ordinal: 0,
            legacy_message_id: legacy.id,
            error: null,
          },
          {
            result: 'ERROR',
            attempt_ordinal: 1,
            legacy_message_id: legacy.id,
            error: 'provider failed after cutover',
          },
        ]),
      );
      expect(ledger.rows).toHaveLength(2);
    } finally {
      await admin.end();
    }
  }, 15_000);
});
