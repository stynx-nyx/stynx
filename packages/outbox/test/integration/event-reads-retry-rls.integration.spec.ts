import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import { StynxOutboxModule } from '../../src/outbox.module';
import { OutboxEventNotFailedError, OutboxNotFoundError } from '../../src/errors';
import type { OutboxAppendEvent, OutboxEventRow, OutboxRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const ACTOR = 'c4333333-3333-4333-8333-333333333333';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('UPS-OBX-04/05 tenant event reads and operator retry (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  let outbox: OutboxService;
  const sends = new Map<string, number>();
  const failing = new Set<string>();
  const gates = new Map<string, Promise<void>>();

  const asTenant = <T>(tenantId: string, work: () => Promise<T>) =>
    database.withRequestContext({ tenantId, actorId: ACTOR }, work);

  const appendMany = (tenantId: string, events: OutboxAppendEvent[]) =>
    asTenant(tenantId, () =>
      database.tx((trx) => outbox.appendManyInTransaction(trx, events), {
        role: 'app', isolation: 'read committed', retry: false, requireActor: true,
      }),
    );

  const fact = (entity: string, entityId = randomUUID()): OutboxAppendEvent => ({
    entity, entityId, idempotencyKey: `reads:${randomUUID()}`, payload: { entityId },
    metadata: { source: 'reads-retry' },
  });

  const admin = async <T>(work: (client: Awaited<ReturnType<PostgresTestDatabase['connectAsAdmin']>>) => Promise<T>) => {
    const client = await postgres.connectAsAdmin();
    try {
      await client.query(`set stynx.test_admin = 'on'`);
      return await work(client);
    } finally {
      await client.end();
    }
  };

  const tenants = async (): Promise<[string, string]> => {
    const pair: [string, string] = [randomUUID(), randomUUID()];
    await admin((client) => client.query(
      `insert into tenancy.tenants (id,slug,name) values ($1,$3,'Reads A'),($2,$4,'Reads B')`,
      [pair[0], pair[1], `reads-a-${pair[0].slice(0, 8)}`, `reads-b-${pair[1].slice(0, 8)}`],
    ));
    return pair;
  };

  const delivery = (event: OutboxEventRow) => admin(async (client) => (await client.query<{
    status: string; attempts: number; last_error: string | null; next_attempt_at: Date | null;
    lease_until: Date | null; updated_at: Date;
  }>(
    `select status,attempts,last_error,next_attempt_at,lease_until,updated_at
       from outbox.event_delivery where tenant_id=$1 and event_id=$2`, [event.tenantId, event.id],
  )).rows[0]);

  const attemptCount = (event: OutboxEventRow) => admin(async (client) => Number((await client.query<{ count: string }>(
    `select count(*)::text as count from outbox.event_attempts where tenant_id=$1 and event_id=$2`,
    [event.tenantId, event.id],
  )).rows[0]!.count));

  /** Drives one event to ERROR through a real failed tenant dispatch, then makes it due. */
  const failOnce = async (event: OutboxEventRow, due = false) => {
    failing.add(event.id);
    try {
      const outcomes = await asTenant(event.tenantId, () => outbox.dispatchTenantEventsDue(50));
      expect(outcomes.find((outcome) => outcome.row.id === event.id)).toMatchObject({ dispatched: false, row: { status: 'ERROR' } });
    } finally {
      failing.delete(event.id);
    }
    if (due) {
      await admin((client) => client.query(
        `update outbox.event_delivery set next_attempt_at=clock_timestamp()-interval '1 second'
          where tenant_id=$1 and event_id=$2`, [event.tenantId, event.id],
      ));
    }
  };

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_reads_retry', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('outbox-reads-owner') },
            app: { connectionString: asRole(postgres.connectionString('outbox-reads-app'), 'stynx_app') },
            reader: { connectionString: asRole(postgres.connectionString('outbox-reads-reader'), 'stynx_reader') },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher: {
            send: async () => undefined,
            sendEvent: async (row: OutboxRow) => {
              sends.set(row.id, (sends.get(row.id) ?? 0) + 1);
              await gates.get(row.id);
              if (failing.has(row.id)) {
                throw Object.assign(new Error(`rejected:${row.id}`), {
                  evidence: {
                    provider: 'reads-probe', protocol: 'HTTP', requestBytes: Buffer.from(`request:${row.id}:${row.attempts}`),
                    responseBytes: Buffer.from(`failure:${row.id}`), responseStatus: 503,
                  },
                });
              }
              return {
                provider: 'reads-probe', protocol: 'HTTP', requestBytes: Buffer.from(`request:${row.id}:${row.attempts}`),
                responseBytes: Buffer.from(`response:${row.id}`), responseStatus: 202,
                requestHeaders: { 'content-type': 'application/json' },
              };
            },
          },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);

    const identity = await moduleRef.get(StynxPoolRegistry).pools.app.query<{
      current_user: string; rolsuper: boolean; rolbypassrls: boolean;
    }>('select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
    expect(identity.rows).toEqual([{ current_user: 'stynx_app', rolsuper: false, rolbypassrls: false }]);

    // Every delivery-projection write outside the explicit test-admin session
    // must come from stynx_app under the actor/tenant of the request context.
    await admin((client) => client.query(`
      create function outbox.test_reads_app_boundary() returns trigger
      language plpgsql as $$
      begin
        if current_setting('stynx.test_admin', true) is distinct from 'on' and (
             current_user is distinct from 'stynx_app'
             or current_setting('app.role', true) is distinct from 'app'
             or nullif(current_setting('app.actor_id', true), '')::uuid is distinct from '${ACTOR}'::uuid
             or new.tenant_id is distinct from nullif(current_setting('app.tenant_id', true), '')::uuid) then
          raise exception 'reads_retry_must_use_app_rls' using errcode='STY50';
        end if;
        return new;
      end $$;
      create trigger test_reads_delivery_role before update on outbox.event_delivery
        for each row execute function outbox.test_reads_app_boundary();
    `));
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('lists only the context tenant, newest first with stable same-millisecond ties, filters and keyset pages', async () => {
    const [tenantA, tenantB] = await tenants();
    const namespace = `reads.${randomUUID().slice(0, 8)}`;
    const batch = await appendMany(tenantA, [
      fact(`${namespace}.alpha`), fact(`${namespace}.alpha`), fact(`${namespace}.alphabet`),
      fact(`${namespace}.beta`), fact(`${namespace}.alpha`),
    ]);
    const later = await appendMany(tenantA, [fact(`${namespace}.alpha`)]);
    await appendMany(tenantB, [fact(`${namespace}.alpha`), fact(`${namespace}.beta`)]);
    expect(new Set(batch.map((row) => row.createdAt.getTime())).size).toBe(1);

    const expected = [...batch, ...later]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? 1 : -1))
      .map((row) => row.id);
    const pages: string[][] = [];
    let cursor = null as Awaited<ReturnType<OutboxService['listEvents']>>['nextCursor'];
    do {
      const page = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: namespace, limit: 2, cursor }));
      pages.push(page.items.map((item) => item.id));
      expect(page.items.every((item) => item.tenantId === tenantA && item.delivery?.status === 'PENDING')).toBe(true);
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages).toEqual([expected.slice(0, 2), expected.slice(2, 4), expected.slice(4, 6)]);
    const repeat = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: namespace, limit: 10 }));
    expect(repeat.items.map((item) => item.id)).toEqual(expected);
    expect(repeat.nextCursor).toBe(null);
    expect(repeat.items[0]).toMatchObject({
      entity: `${namespace}.alpha`, metadata: { source: 'reads-retry' },
      delivery: { status: 'PENDING', attempts: 0, lastError: null, nextAttemptAt: null },
    });

    const exact = await asTenant(tenantA, () => outbox.listEvents({ entity: `${namespace}.alpha` }));
    expect(exact.items).toHaveLength(4);
    expect(exact.items.every((item) => item.entity === `${namespace}.alpha`)).toBe(true);
    const prefix = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: `${namespace}.alpha` }));
    expect(prefix.items).toHaveLength(5);
    const wildcard = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: `${namespace}.%` }));
    expect(wildcard.items).toEqual([]);

    const failed = batch[3]!;
    await failOnce(failed);
    const errors = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: namespace, deliveryStatus: 'ERROR' }));
    expect(errors.items.map((item) => item.id)).toEqual([failed.id]);
    expect(errors.items[0]!.delivery).toMatchObject({ status: 'ERROR', attempts: 1, lastError: `rejected:${failed.id}` });
    expect(errors.items[0]!.delivery!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    const either = await asTenant(tenantA, () => outbox.listEvents({ entityPrefix: namespace, deliveryStatus: ['ERROR', 'SENT'] }));
    expect(either.items.map((item) => item.delivery!.status).sort()).toEqual(['ERROR', 'SENT', 'SENT', 'SENT', 'SENT', 'SENT']);

    const foreign = await asTenant(tenantB, () => outbox.listEvents({ entityPrefix: namespace }));
    expect(foreign.items).toHaveLength(2);
    expect(foreign.items.every((item) => item.tenantId === tenantB && item.delivery?.status === 'PENDING')).toBe(true);
  });

  it('reads per-event and per-aggregate delivery and the attempt ledger after failure and success', async () => {
    const [tenantA, tenantB] = await tenants();
    const aggregate = randomUUID();
    const [first, second] = await appendMany(tenantA, [fact('reads.aggregate', aggregate), fact('reads.aggregate', aggregate)]);
    await failOnce(first!, true);
    await asTenant(tenantA, () => outbox.retryEvent(first!.id, { immediate: true }));
    const delivered = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(delivered.map((outcome) => outcome.row.id)).toEqual([first!.id]);

    const attempts = await asTenant(tenantA, () => outbox.listEventAttempts(first!.id));
    expect(attempts).toEqual([
      expect.objectContaining({
        eventId: first!.id, attemptOrdinal: 1, provider: 'reads-probe', protocol: 'HTTP', result: 'ERROR',
        error: `rejected:${first!.id}`, requestSha256: sha256(`request:${first!.id}:1`),
        responseSha256: sha256(`failure:${first!.id}`), responseStatus: 503, requestHeaders: null,
        leasedAt: expect.any(Date), completedAt: expect.any(Date), legacyMessageId: null,
      }),
      expect.objectContaining({
        eventId: first!.id, attemptOrdinal: 2, provider: 'reads-probe', protocol: 'HTTP', result: 'SENT', error: null,
        requestSha256: sha256(`request:${first!.id}:2`), responseSha256: sha256(`response:${first!.id}`),
        responseStatus: 202, requestHeaders: { 'content-type': 'application/json' },
        evidenceState: expect.objectContaining({ requestBytes: 'captured', responseBytes: 'captured' }),
      }),
    ]);
    expect(attempts.every((attempt) => !('requestBytes' in attempt) && !('responseBytes' in attempt))).toBe(true);
    const withBytes = await asTenant(tenantA, () => outbox.listEventAttempts(first!.id, { includeBytes: true }));
    expect(withBytes.map((attempt) => [attempt.requestBytes?.toString(), attempt.responseBytes?.toString()])).toEqual([
      [`request:${first!.id}:1`, `failure:${first!.id}`],
      [`request:${first!.id}:2`, `response:${first!.id}`],
    ]);

    const one = await asTenant(tenantA, () => outbox.getEventDelivery(first!.id));
    expect(one).toMatchObject({ id: first!.id, tenantId: tenantA, entity: 'reads.aggregate', entityId: aggregate,
      delivery: { status: 'SENT', attempts: 2, lastError: `rejected:${first!.id}`, leaseUntil: expect.any(Date) } });
    const state = await asTenant(tenantA, () => outbox.getAggregateDelivery('reads.aggregate', aggregate));
    expect(state).toMatchObject({
      entity: 'reads.aggregate', entityId: aggregate, head: { id: first!.id, delivery: { status: 'SENT' } },
      counts: { PENDING: 1, SENT: 1, SENT_UNRESOLVED: 0, ERROR: 0, ACKED: 0 },
    });
    expect(state!.events.map((event) => event.id)).toEqual([first!.id, second!.id]);
    const limited = await asTenant(tenantA, () => outbox.getAggregateDelivery('reads.aggregate', aggregate, { limit: 1 }));
    expect(limited!.events.map((event) => event.id)).toEqual([first!.id]);

    for (const event of [first!, second!]) {
      await asTenant(tenantA, () => outbox.ackTenantEvent({ eventId: event.id, status: 'ACKED', rawBody: Buffer.from(`ack:${event.id}`), hmacVerified: true }));
      if (event === first) await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    }
    const acked = await asTenant(tenantA, () => outbox.getAggregateDelivery('reads.aggregate', aggregate));
    expect(acked).toMatchObject({ head: null, counts: { ACKED: 2 } });

    // Foreign tenant and no-delivery reads are indistinguishable from absence.
    await expect(asTenant(tenantB, () => outbox.getEventDelivery(first!.id))).resolves.toBe(null);
    await expect(asTenant(tenantB, () => outbox.listEventAttempts(first!.id, { includeBytes: true }))).resolves.toEqual([]);
    await expect(asTenant(tenantB, () => outbox.getAggregateDelivery('reads.aggregate', aggregate))).resolves.toBe(null);
    await expect(asTenant(tenantA, () => outbox.getEventDelivery(randomUUID()))).resolves.toBe(null);
    const orphanId = randomUUID();
    const orphanAggregate = randomUUID();
    await admin((client) => client.query(
      `insert into outbox.events (id,tenant_id,entity,entity_id,idempotency_key,payload,created_at)
       values ($1,$2,'reads.undestined',$3,$4,'{}'::jsonb,clock_timestamp())`,
      [orphanId, tenantA, orphanAggregate, `orphan:${orphanId}`],
    ));
    await expect(asTenant(tenantA, () => outbox.getEventDelivery(orphanId))).resolves.toBe(null);
    await expect(asTenant(tenantA, () => outbox.getAggregateDelivery('reads.undestined', orphanAggregate))).resolves.toBe(null);
    const listed = await asTenant(tenantA, () => outbox.listEvents({ entity: 'reads.undestined' }));
    expect(listed.items).toEqual([expect.objectContaining({ id: orphanId, delivery: null })]);
    await expect(asTenant(tenantA, () => outbox.listEvents({ entity: 'reads.undestined', deliveryStatus: 'PENDING' })))
      .resolves.toEqual({ items: [], nextCursor: null });
    await expect(asTenant(tenantA, () => outbox.getQueueHealth({ entity: 'reads.undestined' }))).resolves.toMatchObject({ total: 0 });
  });

  it('reports per-tenant queue health by delivery status and entity under the app role, never owner', async () => {
    const [tenantA, tenantB] = await tenants();
    const [pending, failed, sent] = await appendMany(tenantA, [fact('health.renach'), fact('health.renach'), fact('health.renaest')]);
    await appendMany(tenantB, [fact('health.renach')]);
    await failOnce(failed!);
    const sentOutcome = await asTenant(tenantA, () => outbox.getEventDelivery(sent!.id));
    expect(sentOutcome!.delivery.status).toBe('SENT');
    expect((await asTenant(tenantA, () => outbox.getEventDelivery(pending!.id)))!.delivery.status).toBe('SENT');

    await asTenant(tenantA, () => outbox.ackTenantEvent({ eventId: sent!.id, status: 'ACKED', rawBody: Buffer.from('ack-health'), hmacVerified: true }));
    const health = await asTenant(tenantA, () => outbox.getQueueHealth());
    expect(health).toEqual({
      tenantId: tenantA, total: 3, byStatus: { PENDING: 0, SENT: 1, SENT_UNRESOLVED: 0, ERROR: 1, ACKED: 1 },
      oldestUnackedCreatedAt: pending!.createdAt,
    });
    await expect(asTenant(tenantA, () => outbox.getQueueHealth({ entity: 'health.renaest' }))).resolves.toMatchObject({
      total: 1, byStatus: { ACKED: 1 }, oldestUnackedCreatedAt: null,
    });
    await expect(asTenant(tenantA, () => outbox.getQueueHealth({ entityPrefix: 'health.rena' }))).resolves.toMatchObject({ total: 3 });
    await expect(asTenant(tenantB, () => outbox.getQueueHealth())).resolves.toMatchObject({
      tenantId: tenantB, total: 1, byStatus: { PENDING: 1, ERROR: 0, SENT: 0 },
    });

    // An owner (system-context) transaction carries no trusted tenant, so the ports refuse before any SQL.
    await expect(asTenant(tenantA, () => database.withSystemContext('owner probe', () =>
      database.tx(() => outbox.getQueueHealth(), { role: 'owner', retry: false }))))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND', context: { reason: 'missing-tenant-context' } });
    await expect(asTenant(tenantA, () => database.withSystemContext('owner probe', () =>
      database.tx(() => outbox.retryEvent(failed!.id), { role: 'owner', retry: false }))))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND', context: { reason: 'missing-tenant-context' } });
    expect((await delivery(failed!))!.status).toBe('ERROR');
    await expect(outbox.getQueueHealth()).rejects.toBeInstanceOf(OutboxNotFoundError);
    await expect(database.withRequestContext({ tenantId: tenantA }, () => outbox.listEvents())).rejects.toMatchObject({ code: 'ACTOR_CONTEXT_MISSING' });

    // Reads compose inside the caller's app transaction.
    const composed = await asTenant(tenantA, () => database.tx(async () => ({
      health: await outbox.getQueueHealth({ entity: 'health.renach' }),
      failed: await outbox.getEventDelivery(failed!.id),
    }), { role: 'app', requireActor: true, retry: false }));
    expect(composed).toMatchObject({ health: { total: 2 }, failed: { id: failed!.id, delivery: { status: 'ERROR' } } });
  });

  it('retries only ERROR deliveries, preserving attempts, last_error and ledgers, then delivers once', async () => {
    const [tenantA, tenantB] = await tenants();
    const [event] = await appendMany(tenantA, [fact('retry.renach')]);
    await failOnce(event!, true);
    const before = await delivery(event!);
    const retried = await asTenant(tenantA, () => outbox.retryEvent(event!.id, { immediate: true }));
    expect(retried).toMatchObject({ id: event!.id, delivery: {
      status: 'PENDING', attempts: 1, lastError: `rejected:${event!.id}`, leaseUntil: null,
    } });
    expect(retried.delivery.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(retried.delivery.updatedAt.getTime()).toBeGreaterThan(before!.updated_at.getTime());
    expect(await attemptCount(event!)).toBe(1);
    await expect(asTenant(tenantA, () => outbox.retryEvent(event!.id))).rejects.toMatchObject({
      code: 'OUTBOX_EVENT_NOT_FAILED', context: { eventId: event!.id, status: 'PENDING' },
    });

    sends.delete(event!.id);
    const outcomes = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(outcomes.map((outcome) => outcome.row.id)).toEqual([event!.id]);
    await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(sends.get(event!.id)).toBe(1);
    expect(await delivery(event!)).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(await attemptCount(event!)).toBe(2);

    // A non-immediate retry takes the earlier of current eligibility and the backoff time: never later.
    const [overdue, distant] = await appendMany(tenantA, [fact('retry.overdue'), fact('retry.distant')]);
    failing.add(distant!.id);
    await failOnce(overdue!, true);
    failing.delete(distant!.id);
    await admin((client) => client.query(
      `update outbox.event_delivery set next_attempt_at=clock_timestamp()+interval '1 day' where tenant_id=$1 and event_id=$2`,
      [tenantA, distant!.id],
    ));
    const overdueBefore = await delivery(overdue!);
    const kept = await asTenant(tenantA, () => outbox.retryEvent(overdue!.id));
    expect(kept.delivery).toMatchObject({ status: 'PENDING', nextAttemptAt: overdueBefore!.next_attempt_at });
    const advanced = await asTenant(tenantA, () => outbox.retryEvent(distant!.id));
    expect(advanced.delivery.nextAttemptAt!.getTime()).toBeLessThan(Date.now() + 16 * 60_000);
    expect(advanced.delivery.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const dueNow = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(dueNow.map((outcome) => outcome.row.id)).toEqual([overdue!.id]);

    // ADR-OUTBOX-0002: a retried later event never passes a non-ACKED predecessor of its aggregate.
    const aggregate = randomUUID();
    const [head, tail] = await appendMany(tenantA, [fact('retry.ordered', aggregate), fact('retry.ordered', aggregate)]);
    await failOnce(head!);
    await admin((client) => client.query(
      `update outbox.event_delivery set status='ERROR',attempts=1,last_error='tail failed',
          next_attempt_at=clock_timestamp()-interval '1 second' where tenant_id=$1 and event_id=$2`,
      [tenantA, tail!.id],
    ));
    sends.delete(head!.id);
    await asTenant(tenantA, () => outbox.retryEvent(tail!.id, { immediate: true }));
    await expect(asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50))).resolves.toEqual([]);
    expect(sends.get(tail!.id)).toBe(undefined);
    await asTenant(tenantA, () => outbox.retryEvent(head!.id, { immediate: true }));
    const headFirst = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(headFirst.map((outcome) => outcome.row.id)).toEqual([head!.id]);
    expect(sends.get(tail!.id)).toBe(undefined);
    await asTenant(tenantA, () => outbox.ackTenantEvent({ eventId: head!.id, status: 'ACKED', rawBody: Buffer.from('ack-head'), hmacVerified: true }));
    const tailNext = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(tailNext.map((outcome) => outcome.row.id)).toEqual([tail!.id]);

    // Foreign, missing and malformed identities are the same not-found; B stays intact.
    const [foreign] = await appendMany(tenantB, [fact('retry.renach')]);
    await failOnce(foreign!);
    const foreignBefore = await delivery(foreign!);
    for (const id of [foreign!.id, randomUUID(), 'not-a-uuid']) {
      await expect(asTenant(tenantA, () => outbox.retryEvent(id, { immediate: true }))).rejects.toMatchObject({
        code: 'OUTBOX_NOT_FOUND', context: { eventId: id },
      });
    }
    expect(await delivery(foreign!)).toEqual(foreignBefore);
  });

  it('refuses each non-ERROR delivery state without any effect', async () => {
    const [tenantA] = await tenants();
    const [pending, sent, unresolved, acked] = await appendMany(tenantA, [
      fact('refuse.pending'), fact('refuse.sent'), fact('refuse.unresolved'), fact('refuse.acked'),
    ]);
    await admin((client) => client.query(
      `update outbox.event_delivery set status=case event_id
          when $2::uuid then 'SENT' when $3::uuid then 'SENT_UNRESOLVED' else 'ACKED' end,
          attempts=1,last_error='kept',lease_until=case when event_id=$2::uuid then clock_timestamp()+interval '1 hour' end
        where tenant_id=$1 and event_id in ($2,$3,$4)`, [tenantA, sent!.id, unresolved!.id, acked!.id],
    ));
    for (const [event, status] of [[pending, 'PENDING'], [sent, 'SENT'], [unresolved, 'SENT_UNRESOLVED'], [acked, 'ACKED']] as const) {
      const before = await delivery(event!);
      const failure = await asTenant(tenantA, () => outbox.retryEvent(event!.id, { immediate: true })).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(OutboxEventNotFailedError);
      expect(failure).toMatchObject({ code: 'OUTBOX_EVENT_NOT_FAILED', status: 409, context: { eventId: event!.id, status } });
      expect(await delivery(event!)).toEqual(before);
      expect(await attemptCount(event!)).toBe(0);
    }
    await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(sends.get(acked!.id)).toBe(undefined);
    expect(sends.get(unresolved!.id)).toBe(undefined);
  });

  it('never duplicates a send when retry holds the row lock or a claim committed first', async () => {
    const [tenantA] = await tenants();
    const [lockedFirst, claimedFirst] = await appendMany(tenantA, [fact('race.retry-first'), fact('race.claim-first')]);
    failing.add(claimedFirst!.id);
    await failOnce(lockedFirst!, true);
    failing.delete(claimedFirst!.id);
    await admin((client) => client.query(
      `update outbox.event_delivery set next_attempt_at=clock_timestamp()-interval '1 second' where tenant_id=$1 and event_id=$2`,
      [tenantA, claimedFirst!.id],
    ));
    expect(await delivery(claimedFirst!)).toMatchObject({ status: 'ERROR', attempts: 1 });
    sends.clear();

    // Retry holds the delivery row lock: a concurrent claim skips it.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => { locked = resolve; });
    const holder = asTenant(tenantA, () => database.tx(async () => {
      const result = await outbox.retryEvent(lockedFirst!.id, { immediate: true });
      locked();
      await gate;
      return result;
    }, { role: 'app', requireActor: true, retry: false }));
    await lockHeld;
    const during = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(1));
    expect(during.map((outcome) => outcome.row.id)).toEqual([claimedFirst!.id]);
    release();
    await expect(holder).resolves.toMatchObject({ delivery: { status: 'PENDING' } });

    // A claim already committed SENT: retry is refused while the send is in flight.
    let releaseSend!: () => void;
    gates.set(lockedFirst!.id, new Promise<void>((resolve) => { releaseSend = resolve; }));
    const inFlight = asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    await vi.waitFor(() => expect(sends.get(lockedFirst!.id)).toBe(1));
    await expect(asTenant(tenantA, () => outbox.retryEvent(lockedFirst!.id, { immediate: true })))
      .rejects.toBeInstanceOf(OutboxEventNotFailedError);
    releaseSend();
    await expect(inFlight).resolves.toMatchObject([{ row: { id: lockedFirst!.id }, dispatched: true }]);
    gates.delete(lockedFirst!.id);
    await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(Object.fromEntries(sends)).toEqual({ [claimedFirst!.id]: 1, [lockedFirst!.id]: 1 });
    expect(await delivery(lockedFirst!)).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('blocks retry on an uncommitted claim transaction, then refuses the committed SENT row and sends once', async () => {
    const [tenantA] = await tenants();
    const [event] = await appendMany(tenantA, [fact('race.uncommitted-claim')]);
    await failOnce(event!, true);
    sends.delete(event!.id);
    const gateKey = 7_316_016;
    // The claim inserts its CLAIMED attempt inside the claim transaction, after it
    // marked the delivery SENT; this trigger parks that transaction uncommitted.
    await admin((client) => client.query(`
      create function outbox.test_park_claim() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock_shared(${gateKey}); return new; end $$;
      create trigger test_park_claim before insert on outbox.event_attempts
        for each row execute function outbox.test_park_claim();
    `));
    const gate = await postgres.connectAsAdmin();
    try {
      await gate.query('select pg_advisory_lock($1)', [gateKey]);
      const waiting = (pattern: string, event: string) => admin(async (client) => Number((await client.query<{ count: string }>(
        `select count(*)::text as count from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock' and wait_event=$2 and query ilike $1`,
        [pattern, event],
      )).rows[0]!.count));
      const claim = asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
      await vi.waitFor(async () => expect(await waiting('%event_attempts%', 'advisory')).toBe(1), { timeout: 10_000 });
      const retry = asTenant(tenantA, () => outbox.retryEvent(event!.id, { immediate: true })).catch((error: unknown) => error);
      await vi.waitFor(async () => expect(await waiting('%for update%', 'transactionid')).toBe(1), { timeout: 10_000 });
      expect(sends.get(event!.id)).toBe(undefined);
      await gate.query('select pg_advisory_unlock($1)', [gateKey]);
      const refused = await retry;
      expect(refused).toBeInstanceOf(OutboxEventNotFailedError);
      expect(refused).toMatchObject({ context: { eventId: event!.id, status: 'SENT' } });
      await expect(claim).resolves.toMatchObject([{ row: { id: event!.id }, dispatched: true }]);
    } finally {
      await gate.end();
      await admin((client) => client.query(
        'drop trigger test_park_claim on outbox.event_attempts; drop function outbox.test_park_claim()',
      ));
    }
    await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(50));
    expect(sends.get(event!.id)).toBe(1);
    expect(await delivery(event!)).toMatchObject({ status: 'SENT', attempts: 2 });
  });
});
