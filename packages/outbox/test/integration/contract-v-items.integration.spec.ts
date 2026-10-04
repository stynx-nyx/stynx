import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import { OutboxEventConflictError, OutboxEventTransactionError } from '../../src/errors';
import { StynxOutboxModule } from '../../src/outbox.module';
import type { OutboxAppendEvent, OutboxEventRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT_A = 'c5111111-1111-4111-8111-111111111111';
const TENANT_B = 'c5222222-2222-4222-8222-222222222222';
const ACTOR = 'c5333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('UPS-OBX-09 V-01/V-04/V-05 behavior (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let source: OutboxEventStreamSource;

  const asTenant = <T>(tenantId: string, work: () => Promise<T>) =>
    database.withRequestContext({ tenantId, actorId: ACTOR }, work);
  const fact = (entity = 'contract.v', entityId = randomUUID()): OutboxAppendEvent => ({
    entity, entityId, idempotencyKey: `v:${randomUUID()}`, payload: { entityId },
  });
  const append = (tenantId: string, event: OutboxAppendEvent) => asTenant(tenantId, () => database.tx(
    (trx) => outbox.appendInTransaction(trx, event),
    { role: 'app', isolation: 'read committed', retry: false, requireActor: true },
  ));
  const state = async (event: OutboxEventRow) => {
    const admin = await postgres.connectAsAdmin();
    try {
      const delivery = await admin.query<{ status: string; next_attempt_at: Date | null }>(
        `select status,next_attempt_at from outbox.event_delivery where tenant_id=$1 and event_id=$2`, [event.tenantId, event.id]);
      const acks = await admin.query<{ status: string }>(
        `select status from outbox.event_acks where tenant_id=$1 and event_id=$2 order by received_at,id`, [event.tenantId, event.id]);
      return { ...delivery.rows[0], acks: acks.rows.map((row) => row.status) };
    } finally {
      await admin.end();
    }
  };

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_contract_v', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('outbox-v-owner') },
            app: { connectionString: asRole(postgres.connectionString('outbox-v-app'), 'stynx_app') },
            reader: { connectionString: asRole(postgres.connectionString('outbox-v-reader'), 'stynx_reader') },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({ dispatcher: { send: async () => undefined } }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    source = new OutboxEventStreamSource(database);
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`insert into tenancy.tenants (id,slug,name) values ($1,'contract-v-a','V A'),($2,'contract-v-b','V B')`,
        [TENANT_A, TENANT_B]);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('V-01 refuses an owner transaction, replays an identical key and keeps tenant created_at monotonic', async () => {
    const refused = fact();
    await expect(database.withSystemContext('v-01 owner probe', () => database.tx(
      (trx) => outbox.appendInTransaction(trx, refused), { role: 'owner', isolation: 'read committed', retry: false },
    ))).rejects.toBeInstanceOf(OutboxEventTransactionError);
    const appended: OutboxEventRow[] = [];
    for (let index = 0; index < 4; index += 1) appended.push(await append(TENANT_A, fact()));
    const times = appended.map((row) => row.createdAt.getTime());
    expect([...times].sort((left, right) => left - right)).toEqual(times);
    const ordered = [...appended].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : 1));
    expect(ordered.map((row) => row.id)).toEqual(appended.map((row) => row.id));

    const original = fact();
    const first = await append(TENANT_A, original);
    await expect(append(TENANT_A, original)).resolves.toEqual(first);
    await expect(append(TENANT_A, { ...original, payload: { changed: true } })).rejects.toBeInstanceOf(OutboxEventConflictError);
    const admin = await postgres.connectAsAdmin();
    try {
      const rows = await admin.query<{ count: string }>(
        `select count(*)::text as count from outbox.events where idempotency_key=any($1::text[])`, [[refused.idempotencyKey, original.idempotencyKey]]);
      expect(rows.rows[0]!.count).toBe('1');
    } finally {
      await admin.end();
    }
  });

  it('V-04 a later ERROR never regresses ACKED and replayed receipts only append ledger rows (owner and tenant ACK)', async () => {
    const owned = await append(TENANT_A, fact());
    const tenantScoped = await append(TENANT_B, fact());
    await outbox.dispatchEventsDue(50);
    const receipt = (status: 'ACKED' | 'ERROR') => ({ status, rawBody: Buffer.from(`v-04:${status}`), hmacVerified: true });

    await outbox.ackEvent({ tenantId: TENANT_A, eventId: owned.id, ...receipt('ACKED') });
    await outbox.ackEvent({ tenantId: TENANT_A, eventId: owned.id, ...receipt('ERROR') });
    await outbox.ackEvent({ tenantId: TENANT_A, idempotencyKey: owned.idempotencyKey, ...receipt('ACKED') });
    expect(await state(owned)).toEqual({ status: 'ACKED', next_attempt_at: null, acks: ['ACKED', 'ERROR', 'ACKED'] });

    await asTenant(TENANT_B, () => outbox.ackTenantEvent({ eventId: tenantScoped.id, ...receipt('ACKED') }));
    await asTenant(TENANT_B, () => outbox.ackTenantEvent({ idempotencyKey: tenantScoped.idempotencyKey, ...receipt('ERROR') }));
    await asTenant(TENANT_B, () => outbox.ackTenantEvent({ eventId: tenantScoped.id, ...receipt('ACKED') }));
    expect(await state(tenantScoped)).toEqual({ status: 'ACKED', next_attempt_at: null, acks: ['ACKED', 'ERROR', 'ACKED'] });
    await expect(outbox.dispatchEventsDue(50)).resolves.toEqual([]);
  });

  it('V-05 findById of another tenant is null; listSince is strictly after (createdAt,id) and maps entity to event', async () => {
    const foreign = await append(TENANT_B, fact('contract.stream'));
    const scopeA = { tenantId: TENANT_A, actorId: ACTOR };
    await expect(source.findById(foreign.id, scopeA)).resolves.toBe(null);
    await expect(source.findById(foreign.id, { tenantId: TENANT_B, actorId: ACTOR })).resolves.toMatchObject({
      id: foreign.id, event: 'contract.stream', payload: foreign.payload,
    });

    const batch = await asTenant(TENANT_A, () => database.tx((trx) => outbox.appendManyInTransaction(trx, [
      fact('contract.stream'), fact('contract.stream'), fact('contract.stream'),
    ]), { role: 'app', isolation: 'read committed', retry: false, requireActor: true }));
    expect(new Set(batch.map((row) => row.createdAt.getTime())).size).toBe(1);
    const after = await source.listSince({ createdAt: batch[0]!.createdAt, id: batch[0]!.id }, scopeA, 100);
    expect(after.map((row) => row.id)).toEqual([batch[1]!.id, batch[2]!.id]);
    expect(after.every((row) => row.event === 'contract.stream')).toBe(true);
    const fromLast = await source.listSince({ createdAt: batch[2]!.createdAt, id: batch[2]!.id }, scopeA, 100);
    expect(fromLast).toEqual([]);
    const all = await source.listSince({ createdAt: new Date(0), id: '' }, scopeA, 1_000);
    expect(all.some((row) => row.id === foreign.id)).toBe(false);
  });
});
