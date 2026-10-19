import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import type { Client } from 'pg';
import { OutboxEventStreamSource } from '../../src/event-stream-source.js';
import { StynxOutboxModule } from '../../src/outbox.module.js';
import { OutboxService } from '../../src/outbox.service.js';
import type { OutboxAppendEvent, OutboxEventRow } from '../../src/types.js';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';

const ACTOR = 'e3333333-3333-4333-8333-333333333333';
const OTHER_ACTOR = 'e4444444-4444-4444-8444-444444444444';
const reason = 'Destination retired; retain original event and provider evidence.';
const asRole = (url: string, role: string) =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

// INV-TENANCY-001; ADR-OUTBOX-0004 D1-D3. Actual restricted-login PostgreSQL,
// fresh platform migrations, FORCE RLS and independent tenants. No transport
// attempt is invented by retirement and a terminal row never returns to work.
describe('terminal outbox retirement (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  let source: OutboxEventStreamSource;
  const sent: string[] = [];
  const fail = new Set<string>();
  const gates = new Map<string, { started: () => void; wait: Promise<void> }>();

  async function admin<T>(work: (client: Client) => Promise<T>): Promise<T> {
    const client = await postgres.connectAsAdmin();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }
  const scope = <T>(tenantId: string, work: () => Promise<T>, actorId = ACTOR) =>
    database.withRequestContext({ tenantId, actorId }, work);
  async function tenants(): Promise<[string, string]> {
    const pair: [string, string] = [randomUUID(), randomUUID()];
    await admin((client) =>
      client.query(
        `insert into tenancy.tenants(id,slug,name) values ($1,$3,'Retirement A'),($2,$4,'Retirement B')`,
        [pair[0], pair[1], `retirement-a-${pair[0]}`, `retirement-b-${pair[1]}`],
      ),
    );
    return pair;
  }
  const fact = (entity: string, entityId = randomUUID()): OutboxAppendEvent => ({
    entity,
    entityId,
    idempotencyKey: `event:${randomUUID()}`,
    payload: { entityId },
    metadata: { source: 'retirement-regression' },
  });
  const append = (tenantId: string, events: OutboxAppendEvent[]) =>
    scope(tenantId, () =>
      database.tx((trx) => outbox.appendManyInTransaction(trx, events), {
        role: 'app',
        requireActor: true,
        retry: false,
        isolation: 'read committed',
      }),
    );
  const retire = (event: OutboxEventRow, key = `retire:${event.id}`, why = reason, actor = ACTOR) =>
    scope(
      event.tenantId,
      () => outbox.retireEvent(event.id, { idempotencyKey: key, reason: why }),
      actor,
    );
  const snapshot = (event: OutboxEventRow) =>
    admin(async (client) => ({
      event: (
        await client.query('select * from outbox.events where tenant_id=$1 and id=$2', [
          event.tenantId,
          event.id,
        ])
      ).rows,
      attempts: (
        await client.query(
          'select * from outbox.event_attempts where tenant_id=$1 and event_id=$2 order by id',
          [event.tenantId, event.id],
        )
      ).rows,
      acks: (
        await client.query(
          'select * from outbox.event_acks where tenant_id=$1 and event_id=$2 order by id',
          [event.tenantId, event.id],
        )
      ).rows,
    }));

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_retirement', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('retirement-owner') },
            app: { connectionString: postgres.appConnectionString('retirement-app') },
            reader: {
              connectionString: asRole(
                postgres.connectionString('retirement-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher: {
            send: async () => undefined,
            sendEvent: async (row) => {
              sent.push(row.id);
              const gate = gates.get(row.id);
              gate?.started();
              await gate?.wait;
              if (fail.has(row.id)) throw new Error(`provider-failure:${row.id}`);
              return {
                provider: 'retirement-probe',
                protocol: 'HTTP',
                requestBytes: Buffer.from(`request:${row.id}`),
                responseBytes: Buffer.from(`accepted:${row.id}`),
                responseStatus: 202,
              };
            },
          },
        }),
      ],
    }).compile();
    await moduleRef.init();
    // On an empty cluster the migration creates the role after the test helper.
    await postgres.ensureRoleLogin('stynx_app');
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    source = new OutboxEventStreamSource(database);
    const identity = await moduleRef
      .get(StynxPoolRegistry)
      .pools.app.query(
        'select current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user',
      );
    expect(identity.rows).toEqual([
      {
        current_user: 'stynx_app',
        session_user: 'stynx_app',
        rolsuper: false,
        rolbypassrls: false,
      },
    ]);
    const rls = await admin((client) =>
      client.query(
        `select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in
       ('outbox.events'::regclass,'outbox.event_delivery'::regclass,'outbox.event_attempts'::regclass,'outbox.event_retirements'::regclass) order by relname`,
      ),
    );
    expect(rls.rows).toEqual(
      ['event_attempts', 'event_delivery', 'event_retirements', 'events'].map((relname) => ({
        relname,
        relrowsecurity: true,
        relforcerowsecurity: true,
      })),
    );
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('records a trusted actor once, preserves all prior evidence and reads the exact receipt', async () => {
    const [tenantA, tenantB] = await tenants();
    const [event] = await append(tenantA, [fact(`retirement.history.${randomUUID()}`)]);
    fail.add(event!.id);
    try {
      await scope(tenantA, () => outbox.dispatchTenantEventsDue(50));
    } finally {
      fail.delete(event!.id);
    }
    const before = await snapshot(event!);
    const projection = await scope(tenantA, () => outbox.getEventDelivery(event!.id));
    expect(projection!.delivery.status).toBe('ERROR');
    expect(before.attempts).toHaveLength(1);
    const receipt = await retire(event!);
    expect(receipt).toMatchObject({
      tenantId: tenantA,
      eventId: event!.id,
      idempotencyKey: `retire:${event!.id}`,
      actorId: ACTOR,
      reason,
      previousStatus: 'ERROR',
      retiredAt: expect.any(Date),
    });
    expect(receipt.id).toEqual(expect.any(String));
    await expect(retire(event!)).resolves.toEqual(receipt);
    await expect(scope(tenantA, () => outbox.getEventRetirement(event!.id))).resolves.toEqual(
      receipt,
    );
    await expect(scope(tenantB, () => outbox.getEventRetirement(event!.id))).resolves.toBe(null);
    await expect(
      scope(tenantB, () => outbox.retireEvent(event!.id, { idempotencyKey: 'foreign', reason })),
    ).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(scope(tenantA, () => outbox.getEventRetirement(randomUUID()))).resolves.toBe(null);
    const after = await scope(tenantA, () => outbox.getEventDelivery(event!.id));
    expect(after!.delivery).toMatchObject({
      status: 'RETIRED',
      attempts: projection!.delivery.attempts,
      lastError: projection!.delivery.lastError,
      leaseUntil: null,
      nextAttemptAt: null,
      retirement: receipt,
    });
    expect(await snapshot(event!)).toEqual(before);
    const stored = await admin((client) =>
      client.query(
        'select count(*)::int as count from outbox.event_retirements where tenant_id=$1 and event_id=$2',
        [tenantA, event!.id],
      ),
    );
    expect(stored.rows).toEqual([{ count: 1 }]);
    await expect(
      source.findById(event!.id, { tenantId: tenantA, actorId: ACTOR }),
    ).resolves.toMatchObject({ id: event!.id, createdAt: event!.createdAt });
  });

  it('conflicting actor, reason, key and cross-event key reuse do not change the original operation', async () => {
    const [tenantA] = await tenants();
    const [first, second] = await append(tenantA, [
      fact('retirement.conflict'),
      fact('retirement.conflict'),
    ]);
    const receipt = await retire(first!, 'shared-operation');
    for (const work of [
      () => retire(first!, 'shared-operation', 'Changed reason'),
      () => retire(first!, 'shared-operation', reason, OTHER_ACTOR),
      () => retire(first!, 'another-operation'),
      () => retire(second!, 'shared-operation'),
    ])
      await expect(work()).rejects.toMatchObject({
        code: 'OUTBOX_RETIREMENT_CONFLICT',
        status: 409,
      });
    await expect(scope(tenantA, () => outbox.getEventRetirement(first!.id))).resolves.toEqual(
      receipt,
    );
    await expect(scope(tenantA, () => outbox.getEventRetirement(second!.id))).resolves.toBe(null);
    await expect(scope(tenantA, () => outbox.getEventDelivery(second!.id))).resolves.toMatchObject({
      delivery: { status: 'PENDING' },
    });
  });

  it('requires the trusted actor and refuses live SQL identity tampering before retirement', async () => {
    const [tenantA] = await tenants();
    const [event] = await append(tenantA, [fact('retirement.actor')]);
    await expect(retire(event!, 'missing-actor', reason, '')).rejects.toMatchObject({
      code: 'ACTOR_CONTEXT_MISSING',
    });
    await expect(
      scope(tenantA, () =>
        database.tx(
          async (trx) => {
            await trx.query(`select set_config('app.actor_id',$1,true)`, [OTHER_ACTOR]);
            return outbox.retireEvent(event!.id, { idempotencyKey: 'tampered-actor', reason });
          },
          { role: 'app', requireActor: true, retry: false },
        ),
      ),
    ).rejects.toMatchObject({ code: 'TRANSACTION_IDENTITY_MISMATCH' });
    await expect(scope(tenantA, () => outbox.getEventRetirement(event!.id))).resolves.toBe(null);
    await expect(scope(tenantA, () => outbox.getEventDelivery(event!.id))).resolves.toMatchObject({
      delivery: { status: 'PENDING' },
    });
  });

  it('samples lease expiry after acquiring the delivery row lock', async () => {
    const [tenantA] = await tenants();
    const [event] = await append(tenantA, [fact('retirement.lock-clock')]);
    const blocker = await postgres.connectAsAdmin();
    let pending: Promise<unknown> | undefined;
    try {
      // Commit the live lease first, so the waiting SELECT can see it before
      // this independent transaction takes the row lock.
      await blocker.query(
        `update outbox.event_delivery set lease_until=clock_timestamp()+interval '300 milliseconds' where tenant_id=$1 and event_id=$2`,
        [tenantA, event!.id],
      );
      await blocker.query('begin');
      await blocker.query(
        'select event_id from outbox.event_delivery where tenant_id=$1 and event_id=$2 for update',
        [tenantA, event!.id],
      );
      pending = retire(event!);
      let observed = { blocked: false, live: false };
      for (let check = 0; check < 20; check++) {
        observed = (
          await blocker.query<{ blocked: boolean; live: boolean }>(
            `select exists(select 1 from pg_stat_activity where application_name='retirement-app' and wait_event_type='Lock') as blocked,
            lease_until>clock_timestamp() as live from outbox.event_delivery where tenant_id=$1 and event_id=$2`,
            [tenantA, event!.id],
          )
        ).rows[0]!;
        if (observed.blocked) break;
        await blocker.query('select pg_sleep(0.005)');
      }
      expect(observed).toEqual({ blocked: true, live: true });
      // A server-side wait spans the actual lease while the operation waits on
      // this row. A clock sampled before the lock would incorrectly refuse it.
      await blocker.query('select pg_sleep(0.4)');
      await blocker.query('commit');
      await expect(pending).resolves.toMatchObject({
        eventId: event!.id,
        previousStatus: 'PENDING',
      });
    } finally {
      await blocker.query('rollback');
      await pending?.catch(() => undefined);
      await blocker.end();
    }
  });

  it('arbitrates concurrent operation-key reuse per tenant without retiring both events', async () => {
    const [tenantA, tenantB] = await tenants();
    const [first, second] = await append(tenantA, [
      fact('retirement.key-race'),
      fact('retirement.key-race'),
    ]);
    const results = await Promise.allSettled([
      retire(first!, 'racing-key'),
      retire(second!, 'racing-key'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: 'OUTBOX_RETIREMENT_CONFLICT', context: { reason: 'operation-conflict' } },
    });
    const statuses = await Promise.all(
      [first!, second!].map((event) => scope(tenantA, () => outbox.getEventDelivery(event.id))),
    );
    expect(statuses.map((row) => row!.delivery.status).sort()).toEqual(['PENDING', 'RETIRED']);
    const [foreign] = await append(tenantB, [fact('retirement.key-race')]);
    await expect(retire(foreign!, 'racing-key')).resolves.toMatchObject({
      tenantId: tenantB,
      eventId: foreign!.id,
    });
  });

  it('refuses every unexpired lease and ACKED without creating a receipt or changing evidence', async () => {
    const [tenantA] = await tenants();
    const events = await append(
      tenantA,
      ['PENDING', 'ERROR', 'SENT_UNRESOLVED', 'SENT', 'ACKED'].map((status) =>
        fact(`retirement.refuse.${status}`),
      ),
    );
    for (const [index, status] of [
      'PENDING',
      'ERROR',
      'SENT_UNRESOLVED',
      'SENT',
      'ACKED',
    ].entries()) {
      const event = events[index]!;
      await admin((client) =>
        client.query(
          `update outbox.event_delivery set status=$3,lease_until=case when $3='ACKED' then null else clock_timestamp()+interval '1 hour' end where tenant_id=$1 and event_id=$2`,
          [tenantA, event.id, status],
        ),
      );
      const before = await scope(tenantA, () => outbox.getEventDelivery(event.id));
      await expect(retire(event)).rejects.toMatchObject({
        code: 'OUTBOX_RETIREMENT_CONFLICT',
        status: 409,
        context: { reason: status === 'ACKED' ? 'already-acked' : 'active-lease' },
      });
      await expect(scope(tenantA, () => outbox.getEventDelivery(event.id))).resolves.toEqual(
        before,
      );
      await expect(scope(tenantA, () => outbox.getEventRetirement(event.id))).resolves.toBe(null);
    }
  });

  it('accepts eligible states with expired leases, including exact UTF-8 bounds', async () => {
    const [tenantA] = await tenants();
    for (const status of ['PENDING', 'ERROR', 'SENT_UNRESOLVED', 'SENT']) {
      const [event] = await append(tenantA, [fact(`retirement.eligible.${status}`)]);
      await admin((client) =>
        client.query(
          `update outbox.event_delivery set status=$3,lease_until=clock_timestamp()-interval '1 second' where tenant_id=$1 and event_id=$2`,
          [tenantA, event!.id, status],
        ),
      );
      const key = `é`.repeat(127) + 'x';
      const boundedKey = status === 'PENDING' ? key : `eligible:${event!.id}`;
      const receipt = await retire(event!, boundedKey, 'é'.repeat(1024));
      expect(receipt).toMatchObject({
        previousStatus: status,
        reason: 'é'.repeat(1024),
        idempotencyKey: boundedKey,
      });
    }
  });

  it('unblocks the next aggregate fact, excludes retirement from claims/retry and reports truthful history/health', async () => {
    const [tenantA, tenantB] = await tenants();
    const entity = `retirement.order.${randomUUID()}`;
    const aggregate = randomUUID();
    const [first, second] = await append(tenantA, [
      fact(entity, aggregate),
      fact(entity, aggregate),
    ]);
    const [foreign] = await append(tenantB, [fact(entity, aggregate)]);
    const receipt = await retire(first!);
    const health = await scope(tenantA, () => outbox.getQueueHealth({ entity }));
    expect(health).toMatchObject({
      total: 2,
      byStatus: { RETIRED: 1, PENDING: 1, ACKED: 0 },
      oldestUnackedCreatedAt: second!.createdAt,
    });
    const aggregateView = await scope(tenantA, () =>
      outbox.getAggregateDelivery(entity, aggregate),
    );
    expect(aggregateView).toMatchObject({
      head: { id: second!.id },
      counts: { RETIRED: 1, PENDING: 1 },
    });
    const listed = await scope(tenantA, () =>
      outbox.listEvents({ entity, deliveryStatus: 'RETIRED' }),
    );
    expect(listed.items).toMatchObject([
      { id: first!.id, delivery: { status: 'RETIRED', retirement: receipt } },
    ]);
    await expect(
      scope(tenantA, () => outbox.retryEvent(first!.id, { immediate: true })),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_NOT_FAILED', status: 409 });
    const outcomes = await scope(tenantA, () =>
      outbox.dispatchTenantEventsDue(50, { entities: [entity] }),
    );
    expect(outcomes.map((outcome) => outcome.row.id)).toEqual([second!.id]);
    expect(sent).not.toContain(first!.id);
    expect(sent).not.toContain(foreign!.id);
    await retire(second!).then(
      () => {
        throw new Error('active SENT lease must refuse retirement');
      },
      (error: unknown) => {
        expect(error).toMatchObject({
          code: 'OUTBOX_RETIREMENT_CONFLICT',
          context: { reason: 'active-lease' },
        });
      },
    );
    await admin((client) =>
      client.query(
        `update outbox.event_delivery set lease_until=clock_timestamp()-interval '1 second' where tenant_id=$1 and event_id=$2`,
        [tenantA, second!.id],
      ),
    );
    await retire(second!);
    await expect(scope(tenantA, () => outbox.getQueueHealth({ entity }))).resolves.toMatchObject({
      total: 2,
      byStatus: { RETIRED: 2 },
      oldestUnackedCreatedAt: null,
    });
    await expect(
      scope(tenantA, () => outbox.getAggregateDelivery(entity, aggregate)),
    ).resolves.toMatchObject({ head: null, counts: { RETIRED: 2 } });
    await expect(outbox.dispatchEventsDue(50, { entities: [entity] })).resolves.toMatchObject([
      { row: { id: foreign!.id } },
    ]);
    expect(sent.filter((id) => id === first!.id)).toHaveLength(0);
  });

  it('keeps retirement terminal on late tenant and owner ACKs while retaining genuine ACK bytes', async () => {
    const [tenantA] = await tenants();
    const [event] = await append(tenantA, [fact(`retirement.late.${randomUUID()}`)]);
    const receipt = await retire(event!);
    const before = await scope(tenantA, () => outbox.getEventDelivery(event!.id));
    const rawA = Buffer.from(`late-error:${event!.id}`);
    const rawB = Buffer.from(`late-ack:${event!.id}`);
    await scope(tenantA, () =>
      outbox.ackTenantEvent({
        eventId: event!.id,
        status: 'ERROR',
        rawBody: rawA,
        hmacVerified: true,
      }),
    );
    await outbox.ackEvent({
      tenantId: tenantA,
      eventId: event!.id,
      status: 'ACKED',
      rawBody: rawB,
      hmacVerified: true,
    });
    await expect(scope(tenantA, () => outbox.getEventDelivery(event!.id))).resolves.toEqual(before);
    await expect(scope(tenantA, () => outbox.getEventRetirement(event!.id))).resolves.toEqual(
      receipt,
    );
    const evidence = await snapshot(event!);
    expect(evidence.attempts).toHaveLength(0);
    expect(evidence.acks.map((row) => (row.raw_body as Buffer).toString()).sort()).toEqual(
      [rawA.toString(), rawB.toString()].sort(),
    );
    expect(evidence.acks.every((row) => row.hmac_verified && row.identity_verified)).toBe(true);
  });

  it.each([false, true])(
    'preserves a retirement when an already-started send completes (failure=%s)',
    async (fails) => {
      const [tenantA] = await tenants();
      const entity = `retirement.send-race.${randomUUID()}`;
      const [event] = await append(tenantA, [fact(entity)]);
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      gates.set(event!.id, { started, wait: waiting });
      if (fails) fail.add(event!.id);
      const dispatch = scope(tenantA, () =>
        outbox.dispatchTenantEventsDue(1, { entities: [entity] }),
      );
      try {
        await entered;
        await expect(retire(event!)).rejects.toMatchObject({
          code: 'OUTBOX_RETIREMENT_CONFLICT',
          context: { reason: 'active-lease' },
        });
        // Model lease expiry on the server while the real provider call remains in flight.
        await admin((client) =>
          client.query(
            `update outbox.event_delivery set lease_until=clock_timestamp()-interval '1 second' where tenant_id=$1 and event_id=$2`,
            [tenantA, event!.id],
          ),
        );
        const receipt = await retire(event!);
        const retired = await scope(tenantA, () => outbox.getEventDelivery(event!.id));
        release();
        await dispatch;
        await expect(scope(tenantA, () => outbox.getEventDelivery(event!.id))).resolves.toEqual(
          retired,
        );
        await expect(scope(tenantA, () => outbox.getEventRetirement(event!.id))).resolves.toEqual(
          receipt,
        );
        const attempts = await scope(tenantA, () =>
          outbox.listEventAttempts(event!.id, { includeBytes: true }),
        );
        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toMatchObject({
          result: fails ? 'ERROR' : 'SENT',
          completedAt: expect.any(Date),
        });
        if (fails) expect(attempts[0]!.error).toContain(`provider-failure:${event!.id}`);
        else expect(attempts[0]!.responseBytes).toEqual(Buffer.from(`accepted:${event!.id}`));
        await expect(
          scope(tenantA, () => outbox.dispatchTenantEventsDue(1, { entities: [entity] })),
        ).resolves.toEqual([]);
      } finally {
        release();
        await dispatch.catch(() => undefined);
        gates.delete(event!.id);
        fail.delete(event!.id);
      }
    },
  );

  it('serializes concurrent identical retirements and forbids direct receipt mutation/deletion', async () => {
    const [tenantA, tenantB] = await tenants();
    const [event] = await append(tenantA, [fact('retirement.concurrent')]);
    const results = await Promise.all([retire(event!), retire(event!)]);
    expect(results[0]).toEqual(results[1]);
    const client = await moduleRef.get(StynxPoolRegistry).pools.app.connect();
    try {
      await client.query('begin');
      await client.query(
        `select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)`,
        [tenantB, ACTOR],
      );
      const hidden = await client.query(
        'select * from outbox.event_retirements where event_id=$1',
        [event!.id],
      );
      expect(hidden.rows).toEqual([]);
      await client.query('rollback');
      for (const sql of [
        'update outbox.event_retirements set reason=$2 where event_id=$1',
        'delete from outbox.event_retirements where event_id=$1 and reason<>$2',
      ]) {
        await client.query('begin');
        await client.query(
          `select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)`,
          [tenantA, ACTOR],
        );
        await expect(client.query(sql, [event!.id, 'tamper'])).rejects.toMatchObject({
          code: '42501',
        });
        await client.query('rollback');
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
    await admin(async (owner) => {
      await expect(
        owner.query('update outbox.event_retirements set reason=$2 where event_id=$1', [
          event!.id,
          'maintenance tamper',
        ]),
      ).rejects.toMatchObject({ code: 'STY43' });
      await expect(
        owner.query('delete from outbox.event_retirements where event_id=$1', [event!.id]),
      ).rejects.toMatchObject({ code: 'STY43' });
    });
    await expect(scope(tenantA, () => outbox.getEventRetirement(event!.id))).resolves.toEqual(
      results[0],
    );
  });
});
