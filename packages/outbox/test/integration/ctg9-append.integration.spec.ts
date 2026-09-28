import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuditChainKeyMismatchError,
  Database,
  StynxDataModule,
  StynxPoolRegistry,
  type Transaction,
} from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxError } from '../../src/errors';
import { StynxOutboxModule } from '../../src/outbox.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT_A = 'e1111111-1111-4111-8111-111111111111';
const TENANT_B = 'e2222222-2222-4222-8222-222222222222';
const ACTOR = 'e3333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

interface AppendedFact {
  id: string;
  tenantId: string;
  createdAt: string | Date;
}

interface AppendPort {
  appendInTransaction(
    trx: Transaction,
    event: {
      entity: string;
      entityId: string;
      idempotencyKey: string;
      payload: Record<string, unknown>;
    },
  ): Promise<AppendedFact>;
  cutoverLegacyMessages(): Promise<unknown>;
  dispatchEventsDue(limit: number): Promise<unknown[]>;
  recordUnboundAck(rawBody: Buffer, reason: string): Promise<unknown>;
  ackEvent(input: {
    tenantId: string;
    eventId: string;
    rawBody: Buffer;
    status: 'ACKED';
  }): Promise<unknown>;
}

describe('CTG9 append-only outbox facts (PostgreSQL/RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let append: AppendPort;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_ctg9_append', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg9-append-owner') },
            app: {
              connectionString: asRole(postgres.connectionString('ctg9-append-app'), 'stynx_app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg9-append-reader'),
                'stynx_reader',
              ),
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
    append = moduleRef.get(OutboxService) as unknown as AppendPort;
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
         values ($1, 'ctg9-append-a', 'CTG9 append A', true, clock_timestamp(), clock_timestamp()),
                ($2, 'ctg9-append-b', 'CTG9 append B', true, clock_timestamp(), clock_timestamp())`,
        [TENANT_A, TENANT_B],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('restores caller lock_timeout when a caught chain-key mismatch leaves the transaction usable', async () => {
    const key = `ctg9-mismatch-${randomUUID()}`;
    const observed = await database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          await trx.query(`select set_config('lock_timeout','41ms',true)`);
          await trx.query(`select set_config('stynx.audit_chain_key',$1,true)`, [TENANT_B]);
          let failure: unknown;
          try {
            await append.appendInTransaction(trx, {
              entity: 'ctg9.mismatch',
              entityId: key,
              idempotencyKey: key,
              payload: { shouldRollback: true },
            });
          } catch (error) {
            failure = error;
          }
          const setting = await trx.query<{ value: string }>(
            `select current_setting('lock_timeout') as value`,
          );
          const facts = await trx.query<{ count: string }>(
            'select count(*)::text as count from outbox.events where tenant_id=$1 and idempotency_key=$2',
            [TENANT_A, key],
          );
          return { failure, lockTimeout: setting.rows[0]?.value, count: facts.rows[0]?.count };
        },
        { role: 'app', isolation: 'read committed', retry: false },
      ),
    );
    expect(observed.failure).toBeInstanceOf(AuditChainKeyMismatchError);
    expect(observed.lockTimeout).toBe('41ms');
    expect(observed.count).toBe('0');
  });

  it('restores caller lock_timeout and composes append with later audit and idempotency writes', async () => {
    const key = `ctg9-compose-${randomUUID()}`;
    const composed = await database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          await trx.query(`select set_config('lock_timeout','43ms',true)`);
          const event = await append.appendInTransaction(trx, {
            entity: 'ctg9.compose',
            entityId: key,
            idempotencyKey: key,
            payload: { composed: true },
          });
          const setting = await trx.query<{ value: string }>(
            `select current_setting('lock_timeout') as value`,
          );
          await trx.query(
            `select audit.write_command_event(
            'CREATE','ctg9.compose',$1,'{}'::jsonb,
            null,null,'ctg9-compose',null,'{"ok":true}'::jsonb,null)`,
            [key],
          );
          await trx.query(
            `insert into core.idempotency_keys (tenant_id,key,status,response)
           values ($1::uuid,$2,'COMPLETED','{}'::jsonb)`,
            [TENANT_A, key],
          );
          return { event, lockTimeout: setting.rows[0]?.value };
        },
        { role: 'app', isolation: 'read committed', retry: false },
      ),
    );
    expect(composed.lockTimeout).toBe('43ms');
    const admin = await postgres.connectAsAdmin();
    try {
      const facts = await admin.query<{ count: string }>(
        `select count(*)::text as count from outbox.events where tenant_id=$1 and id=$2`,
        [TENANT_A, composed.event.id],
      );
      const audit = await admin.query<{ count: string }>(
        `select count(*)::text as count from audit.events where tenancy_id=$1
          and entity='ctg9.compose' and entity_id=$2`,
        [TENANT_A, key],
      );
      const reservation = await admin.query<{ count: string }>(
        `select count(*)::text as count from core.idempotency_keys where tenant_id=$1 and key=$2`,
        [TENANT_A, key],
      );
      expect(facts.rows[0]?.count).toBe('1');
      expect(audit.rows[0]?.count).toBe('1');
      expect(reservation.rows[0]?.count).toBe('1');
    } finally {
      await admin.end();
    }
    await append.ackEvent({
      tenantId: TENANT_A,
      eventId: composed.event.id,
      status: 'ACKED',
      rawBody: Buffer.from('ctg9-compose-terminal'),
      hmacVerified: true,
    });
  });

  it('rolls back a composed domain write when append meets an already-held cutover UPDATE', async () => {
    const key = `ctg9-append-cutover-${randomUUID()}`;
    const holder = await postgres.connectAsAdmin();
    const writeDomainAndAppend = () =>
      database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
        database.tx(
          async (trx) => {
            await trx.query(
              `insert into core.idempotency_keys (tenant_id,key,status,response)
               values ($1::uuid,$2,'COMPLETED','{}'::jsonb)`,
              [TENANT_A, key],
            );
            return append.appendInTransaction(trx, {
              entity: 'ctg9.append-cutover',
              entityId: key,
              idempotencyKey: key,
              payload: { key },
            });
          },
          { role: 'app', isolation: 'read committed', retry: false },
        ),
      );

    try {
      await holder.query('begin');
      await holder.query('select id from outbox.legacy_ownership for update');

      await expect(writeDomainAndAppend()).rejects.toMatchObject({
        code: 'OUTBOX_OWNERSHIP_CONTENTION',
        status: 503,
      });
      const rolledBack = await holder.query<{ domain: string; event: string }>(
        `select (select count(*)::text from core.idempotency_keys where tenant_id=$1 and key=$2) as domain,
                (select count(*)::text from outbox.events where tenant_id=$1 and idempotency_key=$2) as event`,
        [TENANT_A, key],
      );
      expect(rolledBack.rows).toEqual([{ domain: '0', event: '0' }]);

      await holder.query('commit');
      const retried = await writeDomainAndAppend();
      expect(retried.tenantId).toBe(TENANT_A);
      const committed = await holder.query<{ domain: string; event: string }>(
        `select (select count(*)::text from core.idempotency_keys where tenant_id=$1 and key=$2) as domain,
                (select count(*)::text from outbox.events where tenant_id=$1 and idempotency_key=$2) as event`,
        [TENANT_A, key],
      );
      expect(committed.rows).toEqual([{ domain: '1', event: '1' }]);
      await append.ackEvent({
        tenantId: TENANT_A,
        eventId: retried.id,
        status: 'ACKED',
        rawBody: Buffer.from(`ctg9-append-retry:${key}`),
        hmacVerified: true,
      });
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  }, 15_000);

  it('persists two facts for one aggregate, replays an identical key, rejects divergent reuse, and scopes keys per tenant', async () => {
    const aggregate = `ctg9-${randomUUID()}`;
    const firstKey = `${aggregate}:first`;
    const secondKey = `${aggregate}:second`;
    const event = (key: string, step: number) => ({
      entity: 'ctg9.aggregate',
      entityId: aggregate,
      idempotencyKey: key,
      payload: { step },
    });
    const first = await database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
      database.tx((trx) => append.appendInTransaction(trx, event(firstKey, 1)), {
        role: 'app',
        retry: false,
        isolation: 'read committed',
      }),
    );
    const second = await database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
      database.tx((trx) => append.appendInTransaction(trx, event(secondKey, 2)), {
        role: 'app',
        retry: false,
        isolation: 'read committed',
      }),
    );
    expect(second.id).not.toBe(first.id);
    expect(first.tenantId).toBe(TENANT_A);
    expect(second.tenantId).toBe(TENANT_A);
    const replay = await database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
      database.tx((trx) => append.appendInTransaction(trx, event(firstKey, 1)), {
        role: 'app',
        retry: false,
        isolation: 'read committed',
      }),
    );
    expect(replay.id).toBe(first.id);

    await expect(
      database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
        database.tx((trx) => append.appendInTransaction(trx, event(firstKey, 99)), {
          role: 'app',
          retry: false,
          isolation: 'read committed',
        }),
      ),
    ).rejects.toBeInstanceOf(StynxOutboxError);

    const otherTenant = await database.withRequestContext(
      { tenantId: TENANT_B, actorId: ACTOR },
      () =>
        database.tx((trx) => append.appendInTransaction(trx, event(firstKey, 1)), {
          role: 'app',
          retry: false,
          isolation: 'read committed',
        }),
    );
    expect(otherTenant.id).not.toBe(first.id);
    expect(otherTenant.tenantId).toBe(TENANT_B);

    const admin = await postgres.connectAsAdmin();
    try {
      const rows = await admin.query<{
        tenant_id: string;
        id: string;
        idempotency_key: string;
        payload: { step: number };
      }>(
        `select tenant_id, id, idempotency_key, payload
           from outbox.events where entity = $1 and entity_id = $2
          order by created_at, id`,
        ['ctg9.aggregate', aggregate],
      );
      expect(rows.rows).toHaveLength(3);
      expect(
        rows.rows.filter((row) => row.tenant_id === TENANT_A).map((row) => row.payload.step),
      ).toEqual([1, 2]);
      expect(
        rows.rows.filter((row) => row.tenant_id === TENANT_B).map((row) => row.payload.step),
      ).toEqual([1]);

      await admin.query('begin');
      await admin.query('set local role stynx_app');
      await admin.query(`select set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      const visible = await admin.query<{ id: string }>(
        'select id from outbox.events where entity = $1 and entity_id = $2',
        ['ctg9.aggregate', aggregate],
      );
      expect(visible.rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
      await admin.query('savepoint cross_tenant_mutation');
      let mutationDenied = false;
      try {
        const mutation = await admin.query(
          'update outbox.events set payload = $1::jsonb where id = $2',
          ['{"step":999}', otherTenant.id],
        );
        mutationDenied = mutation.rowCount === 0;
      } catch {
        mutationDenied = true;
      }
      await admin.query('rollback to savepoint cross_tenant_mutation');
      expect(mutationDenied).toBe(true);
      await admin.query('rollback');
      const stillOriginal = await admin.query<{ payload: { step: number } }>(
        'select payload from outbox.events where id = $1',
        [otherTenant.id],
      );
      expect(stillOriginal.rows[0]?.payload.step).toBe(1);
    } finally {
      await admin.query('rollback').catch(() => undefined);
      await admin.end();
    }

    // Discover event-bound ledgers through their composite FK, without
    // assuming the Engineer's table names for projections or attempts.
    const ledgerDb = await postgres.connectAsAdmin();
    try {
      const linked = await ledgerDb.query<{ schema_name: string; table_name: string }>(
        `select distinct n.nspname as schema_name, c.relname as table_name
           from pg_constraint fk
           join pg_class c on c.oid = fk.conrelid
           join pg_namespace n on n.oid = c.relnamespace
          where fk.contype = 'f'
            and fk.confrelid = 'outbox.events'::regclass
            and array_length(fk.conkey, 1) = 2`,
      );
      expect(linked.rows.length).toBeGreaterThanOrEqual(2);
      const counts = async (id: string) => {
        const values = await Promise.all(
          linked.rows.map(async ({ schema_name: schemaName, table_name: tableName }) => {
            const qualified = `"${schemaName.replaceAll('"', '""')}"."${tableName.replaceAll('"', '""')}"`;
            const count = await ledgerDb.query<{ count: string }>(
              `select count(*)::text as count from ${qualified} where tenant_id = $1 and event_id = $2`,
              [TENANT_A, id],
            );
            return Number(count.rows[0]?.count ?? 0);
          }),
        );
        return values.reduce((sum, value) => sum + value, 0);
      };
      const beforeFirst = await counts(first.id);
      const beforeSecond = await counts(second.id);
      const claimed = await append.dispatchEventsDue(10);
      expect(claimed).toHaveLength(2);
      expect(JSON.stringify(claimed)).toContain(first.id);
      expect(JSON.stringify(claimed)).not.toContain(second.id);
      expect(await counts(first.id)).toBeGreaterThan(beforeFirst);
      expect(await counts(second.id)).toBe(beforeSecond);
      expect(await append.dispatchEventsDue(10)).toHaveLength(0);
    } finally {
      await ledgerDb.end();
    }
  });

  it('refuses cutover before mutation when messages carry an audit row trigger', async () => {
    const key = `ctg9-audited-cutover-${randomUUID()}`;
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into outbox.messages (tenant_id, entity, entity_id, payload, idempotency_key)
         values ($1, 'ctg9.audited', $2, '{}'::jsonb, $2)`,
        [TENANT_A, key],
      );
      await admin.query(
        `create trigger ctg9_audit_probe after insert or update or delete on outbox.messages
         for each row execute function audit.fn_row_change()`,
      );
      let failure: unknown;
      try {
        await append.cutoverLegacyMessages();
      } catch (error) {
        failure = error;
      }
      expect((failure as Error | undefined)?.constructor.name).toBe(
        'OutboxCutoverAuditedTableError',
      );
      const marker = await admin.query<{ state: string }>(
        'select state from outbox.legacy_ownership',
      );
      expect(marker.rows[0]?.state).toBe('LEGACY');
      const events = await admin.query<{ count: string }>(
        'select count(*)::text as count from outbox.events where entity_id = $1',
        [key],
      );
      expect(events.rows[0]?.count).toBe('0');
    } finally {
      await admin
        .query('drop trigger if exists ctg9_audit_probe on outbox.messages')
        .catch(() => undefined);
      await admin.end();
    }
  });

  it('cuts over four legacy states exactly once and leaves their legacy queue unclaimed', async () => {
    const prefix = `ctg9-cutover-${randomUUID()}`;
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into outbox.messages
           (tenant_id, entity, entity_id, payload, idempotency_key, status, attempts, next_attempt_at)
         values
           ($1, 'ctg9.cutover', $2, '{"state":"pending"}'::jsonb, $2, 'PENDING', 0, null),
           ($1, 'ctg9.cutover', $3, '{"state":"error"}'::jsonb, $3, 'ERROR', 2, clock_timestamp() - interval '1 minute'),
           ($1, 'ctg9.cutover', $4, '{"state":"sent"}'::jsonb, $4, 'SENT', 1, null),
           ($1, 'ctg9.cutover', $5, '{"state":"acked"}'::jsonb, $5, 'ACKED', 1, null)`,
        [TENANT_A, `${prefix}-pending`, `${prefix}-error`, `${prefix}-sent`, `${prefix}-acked`],
      );
      const acked = await admin.query<{ id: string }>(
        'select id from outbox.messages where entity_id = $1',
        [`${prefix}-acked`],
      );
      await admin.query(
        `insert into outbox.acknowledgements (tenant_id, message_id, ack_status, ack_time)
         values ($1, $2, 'ACKED', clock_timestamp())`,
        [TENANT_A, acked.rows[0]!.id],
      );
    } finally {
      await admin.end();
    }

    await append.cutoverLegacyMessages();
    await append.cutoverLegacyMessages();

    const verify = await postgres.connectAsAdmin();
    try {
      const rows = await verify.query<{
        entity_id: string;
        status: string;
        migrated_event_id: string;
      }>(
        `select entity_id, status, migrated_event_id from outbox.messages
          where entity = 'ctg9.cutover' and entity_id like $1 order by entity_id`,
        [`${prefix}%`],
      );
      expect(rows.rows).toHaveLength(4);
      expect(rows.rows.map((row) => row.status).sort()).toEqual([
        'ACKED',
        'ERROR',
        'PENDING',
        'SENT',
      ]);
      expect(new Set(rows.rows.map((row) => row.migrated_event_id)).size).toBe(4);
      const events = await verify.query<{ count: string }>(
        `select count(*)::text as count from outbox.events
          where entity = 'ctg9.cutover' and entity_id like $1`,
        [`${prefix}%`],
      );
      expect(events.rows[0]?.count).toBe('4');
      const marker = await verify.query<{ state: string }>(
        'select state from outbox.legacy_ownership',
      );
      expect(marker.rows[0]?.state).toBe('NEW');
    } finally {
      await verify.end();
    }
    expect(await moduleRef.get(OutboxService).dispatchDue(10)).toHaveLength(0);

    const sentId = `${prefix}-sent`;
    const service = moduleRef.get(OutboxService);
    const firstAck = await service.ack({
      entity: 'ctg9.cutover',
      entityId: sentId,
      tenantId: TENANT_A,
      status: 'ACKED',
    });
    const replayAck = await service.ack({
      entity: 'ctg9.cutover',
      entityId: sentId,
      tenantId: TENANT_A,
      status: 'ACKED',
    });
    expect(firstAck.id).toBe(replayAck.id);
    expect(firstAck.status).toBe('ACKED');
    expect(replayAck.status).toBe('ACKED');

    const ledger = await postgres.connectAsAdmin();
    let migratedEventId: string;
    try {
      const legacyAck = await ledger.query<{ count: string }>(
        'select count(*)::text as count from outbox.acknowledgements where message_id = $1',
        [firstAck.id],
      );
      expect(legacyAck.rows[0]?.count).toBe('1');
      const linkedEvent = await ledger.query<{ migrated_event_id: string }>(
        'select migrated_event_id from outbox.messages where id = $1',
        [firstAck.id],
      );
      migratedEventId = linkedEvent.rows[0]!.migrated_event_id;
      const bound = await ledger.query<{ schema_name: string; table_name: string }>(
        `select distinct n.nspname as schema_name, c.relname as table_name
           from pg_constraint fk
           join pg_class c on c.oid = fk.conrelid
           join pg_namespace n on n.oid = c.relnamespace
          where fk.contype = 'f'
            and fk.confrelid = 'outbox.events'::regclass
            and array_length(fk.conkey, 1) = 2`,
      );
      const documents: string[] = [];
      for (const { schema_name: schemaName, table_name: tableName } of bound.rows) {
        const qualified = `"${schemaName.replaceAll('"', '""')}"."${tableName.replaceAll('"', '""')}"`;
        const rows = await ledger.query<{ document: Record<string, unknown> }>(
          `select to_jsonb(t) as document from ${qualified} t where tenant_id = $1 and event_id = $2`,
          [TENANT_A, migratedEventId],
        );
        documents.push(...rows.rows.map((row) => JSON.stringify(row.document)));
      }
      expect(documents.join('\n')).toContain('ACKED');
    } finally {
      await ledger.end();
    }
    const nextSweep = await append.dispatchEventsDue(10);
    expect(JSON.stringify(nextSweep)).not.toContain(migratedEventId);
  });

  it('persists invalid and unknown ACK bytes in owner-only unbound quarantine', async () => {
    const invalid = Buffer.from('{"ack":"invalid-signature"}\n', 'utf8');
    const unknown = Buffer.from('{"ack":"unknown-event"}\n', 'utf8');
    await append.recordUnboundAck(invalid, 'invalid-hmac');
    await expect(
      append.ackEvent({
        tenantId: TENANT_A,
        eventId: randomUUID(),
        rawBody: unknown,
        status: 'ACKED',
      }),
    ).rejects.toBeInstanceOf(Error);

    const admin = await postgres.connectAsAdmin();
    try {
      const quarantine = await admin.query<{ document: Record<string, unknown> }>(
        `select to_jsonb(q) as document from outbox.ack_quarantine q`,
      );
      expect(quarantine.rows).toHaveLength(2);
      const serialized = quarantine.rows.map((row) => JSON.stringify(row.document)).join('\n');
      expect(serialized).toContain(createHash('sha256').update(invalid).digest('hex'));
      expect(serialized).toContain(invalid.toString('hex'));
      expect(serialized).toContain(createHash('sha256').update(unknown).digest('hex'));
      const ownerOnly = await admin.query<{ app_insert: boolean; fk_count: string }>(
        `select has_table_privilege('stynx_app', 'outbox.ack_quarantine', 'INSERT') as app_insert,
                (select count(*)::text from pg_constraint
                  where conrelid = 'outbox.ack_quarantine'::regclass and contype = 'f') as fk_count`,
      );
      expect(ownerOnly.rows[0]).toEqual({ app_insert: false, fk_count: '0' });
    } finally {
      await admin.end();
    }
  });
});
