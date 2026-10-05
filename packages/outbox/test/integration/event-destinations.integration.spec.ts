import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import { OutboxEventConflictError } from '../../src/errors';
import { StynxOutboxModule } from '../../src/outbox.module';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxAppendEvent, OutboxDispatcherPort, OutboxEventRow, OutboxRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

// UPS-OBX-07 (#316), with the no-blocking rule of UPS-OBX-11 (#320). Real PostgreSQL, FORCE RLS,
// stynx_app without BYPASSRLS, two tenants.

const ACTOR = 'c7333333-3333-4333-8333-333333333333';
const RENACH = 'dest.renach.exam-result';
const RENAEST_PREFIX = 'dest.renaest.';
const RENAEST_SEND = `${RENAEST_PREFIX}transmissao`;
const RENAEST_FIX = `${RENAEST_PREFIX}retificacao`;
const LOG_RAIT = 'log.rait.updated';
const LOG_PORTAL = 'log.portal.notice';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const destined = (entity: string) => entity === RENACH || entity.startsWith(RENAEST_PREFIX);

describe('UPS-OBX-07 destinations: an event without a destination never becomes a delivery (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  /** Declares RENACH (exact) and RENAEST (prefix) as the only destinations. */
  let outbox: OutboxService;
  /** No declaration: the 1.5.0 behavior. */
  let undeclared: OutboxService;
  /** Empty declaration: a pure event log. */
  let logOnly: OutboxService;
  let source: OutboxEventStreamSource;
  let tenantA: string;
  let tenantB: string;
  const sent: OutboxRow[] = [];
  const dispatcher: OutboxDispatcherPort = {
    send: async () => undefined,
    sendEvent: async (row) => {
      sent.push(row);
      return { provider: 'destination-probe', protocol: 'HTTP', requestBytes: Buffer.from(`request:${row.id}`), responseStatus: 202 };
    },
  };

  const asTenant = <T>(tenantId: string, work: () => Promise<T>) =>
    database.withRequestContext({ tenantId, actorId: ACTOR }, work);
  const fact = (entity: string, entityId = randomUUID()): OutboxAppendEvent => ({
    entity, entityId, idempotencyKey: `dest:${randomUUID()}`, payload: { entityId }, metadata: { source: 'destinations' },
  });
  const appendMany = (service: OutboxService, tenantId: string, events: OutboxAppendEvent[]) =>
    asTenant(tenantId, () => database.tx((trx) => service.appendManyInTransaction(trx, events), {
      role: 'app', isolation: 'read committed', retry: false, requireActor: true,
    }));
  const admin = async <T>(work: (client: Awaited<ReturnType<PostgresTestDatabase['connectAsAdmin']>>) => Promise<T>) => {
    const client = await postgres.connectAsAdmin();
    try { return await work(client); } finally { await client.end(); }
  };
  const deliveries = (events: readonly OutboxEventRow[]) => admin(async (client) => (await client.query<{
    event_id: string; status: string; attempts: number;
  }>(
    `select event_id,status,attempts from outbox.event_delivery where event_id=any($1::uuid[]) order by event_id`,
    [events.map((event) => event.id)],
  )).rows);
  const attemptCount = (events: readonly OutboxEventRow[]) => admin(async (client) => Number((await client.query<{ count: string }>(
    `select count(*)::text as count from outbox.event_attempts where event_id=any($1::uuid[])`, [events.map((event) => event.id)],
  )).rows[0]!.count));
  const sentIds = (events: readonly OutboxEventRow[]) => sent.map((row) => row.id).filter((id) => events.some((event) => event.id === id));
  const ack = (event: OutboxEventRow) => asTenant(event.tenantId, () => outbox.ackTenantEvent({
    eventId: event.id, status: 'ACKED', rawBody: Buffer.from(`ack:${event.id}`), hmacVerified: true,
  }));

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_destinations', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('outbox-dest-owner') },
            app: { connectionString: asRole(postgres.connectionString('outbox-dest-app'), 'stynx_app') },
            reader: { connectionString: asRole(postgres.connectionString('outbox-dest-reader'), 'stynx_reader') },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher,
          dispatchableEntities: { entities: [RENACH], entityPrefixes: [RENAEST_PREFIX] },
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    undeclared = new OutboxService(database, {}, dispatcher);
    logOnly = new OutboxService(database, { dispatchableEntities: {} }, dispatcher);
    source = new OutboxEventStreamSource(database);

    const identity = await moduleRef.get(StynxPoolRegistry).pools.app.query<{
      current_user: string; rolsuper: boolean; rolbypassrls: boolean;
    }>('select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
    expect(identity.rows).toEqual([{ current_user: 'stynx_app', rolsuper: false, rolbypassrls: false }]);
    const forced = await admin((client) => client.query<{ relname: string; forced: boolean }>(
      `select relname,relrowsecurity and relforcerowsecurity as forced from pg_class
        where oid in ('outbox.events'::regclass,'outbox.event_delivery'::regclass,'outbox.event_attempts'::regclass)
        order by relname`,
    ));
    expect(forced.rows).toEqual([
      { relname: 'event_attempts', forced: true }, { relname: 'event_delivery', forced: true }, { relname: 'events', forced: true },
    ]);

    tenantA = randomUUID();
    tenantB = randomUUID();
    await admin((client) => client.query(
      `insert into tenancy.tenants (id,slug,name) values ($1,$3,'Destinations A'),($2,$4,'Destinations B')`,
      [tenantA, tenantB, `dest-a-${tenantA.slice(0, 8)}`, `dest-b-${tenantB.slice(0, 8)}`],
    ));
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('appends topics with and without a destination in one transaction and creates a delivery only for the destined ones, per tenant', async () => {
    const [renach, rait, renaest, portal] = await appendMany(outbox, tenantA, [
      fact(RENACH), fact(LOG_RAIT), fact(RENAEST_SEND), fact(LOG_PORTAL),
    ]);
    const [renachB, raitB] = await appendMany(outbox, tenantB, [fact(RENACH), fact(LOG_RAIT)]);
    const all = [renach!, rait!, renaest!, portal!, renachB!, raitB!];

    // Every event is in the immutable log; only the destined ones have a delivery row.
    const logged = await admin(async (client) => (await client.query<{ id: string }>(
      `select id from outbox.events where id=any($1::uuid[])`, [all.map((event) => event.id)])).rows);
    expect(logged).toHaveLength(6);
    expect(await deliveries(all)).toEqual([renach!, renaest!, renachB!]
      .map((event) => ({ event_id: event.id, status: 'PENDING', attempts: 0 }))
      .sort((left, right) => (left.event_id < right.event_id ? -1 : 1)));

    // Reads under the application role and the context tenant.
    const listed = await asTenant(tenantA, () => outbox.listEvents({ limit: 500 }));
    const mine = listed.items.filter((item) => all.some((event) => event.id === item.id));
    expect(mine.map((item) => [item.entity, item.delivery?.status ?? null]).sort()).toEqual([
      [RENACH, 'PENDING'], [RENAEST_SEND, 'PENDING'], [LOG_PORTAL, null], [LOG_RAIT, null],
    ]);
    await expect(asTenant(tenantA, () => outbox.getEventDelivery(rait!.id))).resolves.toBe(null);
    await expect(asTenant(tenantA, () => outbox.getAggregateDelivery(LOG_RAIT, rait!.entityId))).resolves.toBe(null);
    await expect(asTenant(tenantA, () => outbox.retryEvent(rait!.id, { immediate: true })))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });

    // Queue health counts delivery rows only, so an event without a destination is never counted.
    await expect(asTenant(tenantA, () => outbox.getQueueHealth())).resolves.toMatchObject({
      tenantId: tenantA, total: 2, byStatus: { PENDING: 2 },
    });
    await expect(asTenant(tenantA, () => outbox.getQueueHealth({ entityPrefix: 'log.' }))).resolves.toMatchObject({ total: 0 });
    await expect(asTenant(tenantB, () => outbox.getQueueHealth())).resolves.toMatchObject({ tenantId: tenantB, total: 1 });

    // Idempotency is unchanged: an identical replay returns the logged event and still creates no delivery.
    const [replayed] = await appendMany(outbox, tenantA, [{
      entity: rait!.entity, entityId: rait!.entityId, idempotencyKey: rait!.idempotencyKey,
      payload: { entityId: rait!.entityId }, metadata: { source: 'destinations' },
    }]);
    expect(replayed!.id).toBe(rait!.id);
    await expect(appendMany(outbox, tenantA, [{
      entity: rait!.entity, entityId: rait!.entityId, idempotencyKey: rait!.idempotencyKey, payload: { changed: true },
    }])).rejects.toBeInstanceOf(OutboxEventConflictError);
    expect(await deliveries([rait!])).toEqual([]);

    // The SSE source still reads the whole log of the tenant, in cursor order, and nothing of the other tenant.
    const stream = await source.listSince({ createdAt: new Date(0), id: '' }, { tenantId: tenantA, actorId: ACTOR }, 500);
    const streamed = stream.filter((row) => all.some((event) => event.id === row.id));
    expect(streamed.map((row) => row.event).sort()).toEqual([RENACH, RENAEST_SEND, LOG_PORTAL, LOG_RAIT]);
    await expect(source.findById(rait!.id, { tenantId: tenantA, actorId: ACTOR })).resolves.toMatchObject({ id: rait!.id, event: LOG_RAIT });
    await expect(source.findById(rait!.id, { tenantId: tenantB, actorId: ACTOR })).resolves.toBe(null);

    // RLS: tenant A sees neither the events nor the deliveries of tenant B.
    const visible = await asTenant(tenantA, () => database.tx(async (trx) => (await trx.query<{ events: number; deliveries: number }>(
      `select (select count(*)::integer from outbox.events where id=any($1::uuid[])) as events,
              (select count(*)::integer from outbox.event_delivery where event_id=any($1::uuid[])) as deliveries`,
      [[renachB!.id, raitB!.id]],
    )).rows[0]!, { role: 'app', readonly: true, requireActor: true, retry: false }));
    expect(visible).toEqual({ events: 0, deliveries: 0 });
  });

  it('never claims, sends or records an attempt for an event without a destination, on the owner sweep and on the tenant sweep', async () => {
    const [undestinedA, destinedA] = await appendMany(outbox, tenantA, [fact(LOG_RAIT), fact(RENACH)]);
    const [undestinedB, destinedB] = await appendMany(outbox, tenantB, [fact(LOG_PORTAL), fact(RENAEST_SEND)]);
    const undestinedEvents = [undestinedA!, undestinedB!];

    const outcomes = await outbox.dispatchEventsDue(200);
    expect(outcomes.every((outcome) => destined(outcome.row.entity))).toBe(true);
    expect(outcomes.map((outcome) => outcome.row.id)).toEqual(expect.arrayContaining([destinedA!.id, destinedB!.id]));
    const tenantOutcomes = [
      ...await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200)),
      ...await asTenant(tenantB, () => outbox.dispatchTenantEventsDue(200)),
    ];
    expect(tenantOutcomes.every((outcome) => destined(outcome.row.entity))).toBe(true);

    // The fake dispatcher never received an event without a destination, in this test or any earlier one.
    expect(sent.every((row) => destined(row.entity))).toBe(true);
    expect(sentIds(undestinedEvents)).toEqual([]);
    expect(await deliveries(undestinedEvents)).toEqual([]);
    expect(await attemptCount(undestinedEvents)).toBe(0);
    expect(sentIds([destinedA!, destinedB!]).sort()).toEqual([destinedA!.id, destinedB!.id].sort());
    expect(await attemptCount([destinedA!, destinedB!])).toBe(2);

    // sendEvent receives the log event: its id, tenant, entity, aggregate, key, payload, metadata and attempt ordinal.
    expect(sent.find((row) => row.id === destinedA!.id)).toMatchObject({
      id: destinedA!.id, tenantId: tenantA, entity: RENACH, entityId: destinedA!.entityId,
      idempotencyKey: destinedA!.idempotencyKey, payload: { entityId: destinedA!.entityId },
      metadata: { source: 'destinations' }, status: 'SENT', attempts: 1, createdAt: destinedA!.createdAt.toISOString(),
    });
  });

  it('drains each destination with its own filtered sweep without touching the delivery of the other', async () => {
    const [renachA, sendA, fixA] = await appendMany(outbox, tenantA, [fact(RENACH), fact(RENAEST_SEND), fact(RENAEST_FIX)]);
    const [renachB, sendB] = await appendMany(outbox, tenantB, [fact(RENACH), fact(RENAEST_SEND)]);
    const renaest = [sendA!, fixA!, sendB!];

    // Owner sweep filtered to RENACH: both tenants' RENACH deliveries, no RENAEST delivery.
    const renachSweep = await outbox.dispatchEventsDue(200, { entities: [RENACH] });
    expect(renachSweep.map((outcome) => outcome.row.id).sort()).toEqual([renachA!.id, renachB!.id].sort());
    expect(renachSweep.every((outcome) => outcome.dispatched && outcome.row.entity === RENACH)).toBe(true);
    expect((await deliveries(renaest)).map((row) => [row.status, row.attempts])).toEqual([['PENDING', 0], ['PENDING', 0], ['PENDING', 0]]);
    expect(await attemptCount(renaest)).toBe(0);
    expect(sentIds(renaest)).toEqual([]);

    // Tenant sweep filtered by prefix: only tenant A's RENAEST deliveries; tenant B's stays untouched.
    const renaestSweepA = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { entityPrefixes: [RENAEST_PREFIX] }));
    expect(renaestSweepA.map((outcome) => outcome.row.id).sort()).toEqual([sendA!.id, fixA!.id].sort());
    expect(renaestSweepA.every((outcome) => outcome.row.tenantId === tenantA)).toBe(true);
    expect(await deliveries([sendB!])).toEqual([{ event_id: sendB!.id, status: 'PENDING', attempts: 0 }]);
    expect(sentIds([sendB!])).toEqual([]);

    // A filter that names a different destination claims nothing; the owner prefix sweep then drains tenant B.
    await expect(outbox.dispatchEventsDue(200, { entities: ['dest.other'], entityPrefixes: ['dest.other.'] })).resolves.toEqual([]);
    const renaestSweep = await outbox.dispatchEventsDue(200, { entities: [RENAEST_FIX], entityPrefixes: [RENAEST_SEND] });
    expect(renaestSweep.map((outcome) => outcome.row.id)).toEqual([sendB!.id]);
    expect(sentIds([renachA!, renachB!, ...renaest]).sort()).toEqual([renachA!, renachB!, ...renaest].map((event) => event.id).sort());

    // A malformed filter is refused before any claim.
    const [untouched] = await appendMany(outbox, tenantA, [fact(RENACH)]);
    for (const filter of [{}, { entities: [] }, { entities: [''] }, { entityPrefixes: [7] }, { entities: RENACH }, null] as never[]) {
      await expect(outbox.dispatchEventsDue(200, filter)).rejects.toBeInstanceOf(RangeError);
      await expect(asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, filter))).rejects.toBeInstanceOf(RangeError);
    }
    expect(await deliveries([untouched!])).toEqual([{ event_id: untouched!.id, status: 'PENDING', attempts: 0 }]);
  });

  it('does not let an earlier event without a delivery block a destined event of the same aggregate', async () => {
    // Same (entity, entityId): the first event was appended while the entity had no destination.
    const aggregate = randomUUID();
    const [first] = await appendMany(logOnly, tenantA, [fact(RENACH, aggregate)]);
    const [second] = await appendMany(outbox, tenantA, [fact(RENACH, aggregate)]);
    expect(await deliveries([first!, second!])).toEqual([{ event_id: second!.id, status: 'PENDING', attempts: 0 }]);
    const sweep = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { entities: [RENACH] }));
    expect(sweep.map((outcome) => outcome.row.id)).toContain(second!.id);
    expect(sentIds([first!, second!])).toEqual([second!.id]);

    // Blocking considers existing deliveries only: an earlier event that has one still goes first.
    const ordered = randomUUID();
    const [head] = await appendMany(undeclared, tenantA, [fact(RENACH, ordered)]);
    const [tail] = await appendMany(outbox, tenantA, [fact(RENACH, ordered)]);
    const headSweep = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { entities: [RENACH] }));
    expect(headSweep.map((outcome) => outcome.row.id).filter((id) => id === head!.id || id === tail!.id)).toEqual([head!.id]);
    await ack(head!);
    const tailSweep = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { entities: [RENACH] }));
    expect(tailSweep.map((outcome) => outcome.row.id)).toEqual([tail!.id]);
    expect(sentIds([head!, tail!])).toEqual([head!.id, tail!.id]);
  });

  it('keeps the 1.5.0 behavior without a declaration and logs every event without a delivery under an empty declaration', async () => {
    const [legacyLog, legacyQueue] = await appendMany(undeclared, tenantB, [fact(LOG_RAIT), fact(RENACH)]);
    expect((await deliveries([legacyLog!, legacyQueue!])).map((row) => row.status)).toEqual(['PENDING', 'PENDING']);
    const sweep = await asTenant(tenantB, () => undeclared.dispatchTenantEventsDue(200));
    expect(sweep.map((outcome) => outcome.row.id)).toEqual(expect.arrayContaining([legacyLog!.id, legacyQueue!.id]));
    expect(sentIds([legacyLog!, legacyQueue!]).sort()).toEqual([legacyLog!.id, legacyQueue!.id].sort());

    const [pureLog, pureQueue] = await appendMany(logOnly, tenantB, [fact(LOG_RAIT), fact(RENACH)]);
    expect(await deliveries([pureLog!, pureQueue!])).toEqual([]);
    const pureSweep = await logOnly.dispatchEventsDue(200);
    expect(pureSweep.map((outcome) => outcome.row.id).filter((id) => id === pureLog!.id || id === pureQueue!.id)).toEqual([]);
    expect(sentIds([pureLog!, pureQueue!])).toEqual([]);
  });
});
