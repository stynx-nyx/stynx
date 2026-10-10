import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { StynxOutboxModule } from '../../src/outbox.module';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxAppendEvent, OutboxDispatcherPort, OutboxEventRow, OutboxRow } from '../../src/types';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

// UPS-OBX-11 (#320), ADR-OUTBOX-0003 D4. Real PostgreSQL, FORCE RLS, stynx_app without BYPASSRLS,
// two tenants, two named destinations: RENACH with its own port and RENAEST on the module dispatcher.

const ACTOR = 'c7444444-4444-4444-8444-444444444444';
const RENACH = 'dest.renach.exam-result';
const RENAEST_PREFIX = 'dest.renaest.';
const RENAEST_SEND = `${RENAEST_PREFIX}transmissao`;
const RENAEST_FIX = `${RENAEST_PREFIX}retificacao`;
const LOG_RAIT = 'log.rait.updated';
const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

function probe(provider: string) {
  const sent: OutboxRow[] = [];
  const port: OutboxDispatcherPort = {
    send: async () => undefined,
    sendEvent: async (row) => {
      sent.push(row);
      return { provider, protocol: 'HTTP', requestBytes: Buffer.from(`${provider}:${row.id}`), responseStatus: 202 };
    },
  };
  return { sent, port };
}

describe('UPS-OBX-11 named destinations over the entity selector (PostgreSQL/FORCE RLS)', () => {
  let postgres: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let database: Database;
  /** Registry: `renach` (exact, own port) and `renaest` (prefix, module dispatcher). */
  let outbox: OutboxService;
  /** No registry and no declaration: the 1.5.5 behavior on the same database. */
  let bare: OutboxService;
  let tenantA: string;
  let tenantB: string;
  const renachProbe = probe('renach-port');
  const moduleProbe = probe('module-port');

  const asTenant = <T>(tenantId: string, work: () => Promise<T>) =>
    database.withRequestContext({ tenantId, actorId: ACTOR }, work);
  const fact = (entity: string, entityId = randomUUID()): OutboxAppendEvent => ({
    entity, entityId, idempotencyKey: `named:${randomUUID()}`, payload: { entityId }, metadata: { source: 'named-destinations' },
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
  const pending = (events: readonly OutboxEventRow[]) => events
    .map((event) => ({ event_id: event.id, status: 'PENDING', attempts: 0 }))
    .sort((left, right) => (left.event_id < right.event_id ? -1 : 1));
  const attemptCount = (events: readonly OutboxEventRow[]) => admin(async (client) => Number((await client.query<{ count: string }>(
    `select count(*)::text as count from outbox.event_attempts where event_id=any($1::uuid[])`, [events.map((event) => event.id)],
  )).rows[0]!.count));
  const sentIds = (sent: readonly OutboxRow[], events: readonly OutboxEventRow[]) =>
    sent.map((row) => row.id).filter((id) => events.some((event) => event.id === id)).sort();
  const ids = (events: readonly OutboxEventRow[]) => events.map((event) => event.id).sort();
  const outcomeIds = (outcomes: readonly { row: OutboxRow }[]) => outcomes.map((outcome) => outcome.row.id).sort();

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_outbox_named_destinations', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('outbox-named-owner') },
            app: { connectionString: postgres.appConnectionString('outbox-named-app') },
            reader: { connectionString: asRole(postgres.connectionString('outbox-named-reader'), 'stynx_reader') },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxOutboxModule.forRoot({
          dispatcher: moduleProbe.port,
          dispatchableEntities: { entities: [RENACH], entityPrefixes: [RENAEST_PREFIX] },
          destinations: [
            { name: 'renach', selector: { entities: [RENACH] }, dispatcher: renachProbe.port },
            { name: 'renaest', selector: { entityPrefixes: [RENAEST_PREFIX] } },
          ],
        }),
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(Database);
    outbox = moduleRef.get(OutboxService);
    bare = new OutboxService(database, {}, moduleProbe.port);

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
      `insert into tenancy.tenants (id,slug,name) values ($1,$3,'Named A'),($2,$4,'Named B')`,
      [tenantA, tenantB, `named-a-${tenantA.slice(0, 8)}`, `named-b-${tenantB.slice(0, 8)}`],
    ));
  }, 90_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('dispatches destination A by name without claiming, counting or sending a delivery of destination B, in both tenants', async () => {
    const [renachA, sendA, fixA] = await appendMany(outbox, tenantA, [fact(RENACH), fact(RENAEST_SEND), fact(RENAEST_FIX)]);
    const [renachB, sendB] = await appendMany(outbox, tenantB, [fact(RENACH), fact(RENAEST_SEND)]);
    const renach = [renachA!, renachB!];
    const renaest = [sendA!, fixA!, sendB!];
    expect(await deliveries([...renach, ...renaest])).toEqual(pending([...renach, ...renaest]));

    // Owner sweep by name: both tenants' RENACH deliveries, through the RENACH port only.
    const renachSweep = await outbox.dispatchEventsDue(200, { destination: 'renach' });
    expect(outcomeIds(renachSweep)).toEqual(ids(renach));
    expect(renachSweep.every((outcome) => outcome.dispatched && outcome.row.entity === RENACH)).toBe(true);
    expect(sentIds(renachProbe.sent, renach)).toEqual(ids(renach));
    expect(sentIds(moduleProbe.sent, renach)).toEqual([]);
    expect(await deliveries(renaest)).toEqual(pending(renaest));
    expect(await attemptCount(renaest)).toBe(0);
    expect(sentIds(moduleProbe.sent, renaest)).toEqual([]);
    expect(sentIds(renachProbe.sent, renaest)).toEqual([]);

    // Tenant sweep by name: only tenant A's RENAEST deliveries, through the module dispatcher; tenant B's stays untouched.
    const renaestSweepA = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { destination: 'renaest' }));
    expect(outcomeIds(renaestSweepA)).toEqual(ids([sendA!, fixA!]));
    expect(renaestSweepA.every((outcome) => outcome.dispatched && outcome.row.tenantId === tenantA)).toBe(true);
    expect(await deliveries([sendB!])).toEqual(pending([sendB!]));
    expect(await attemptCount([sendB!])).toBe(0);
    expect(sentIds(moduleProbe.sent, [sendA!, fixA!])).toEqual(ids([sendA!, fixA!]));
    expect(sentIds(renachProbe.sent, renaest)).toEqual([]);

    // The owner sweep by name then drains tenant B's RENAEST delivery; a second RENACH sweep finds nothing due.
    expect(outcomeIds(await outbox.dispatchEventsDue(200, { destination: 'renaest' }))).toEqual([sendB!.id]);
    expect(await outbox.dispatchEventsDue(200, { destination: 'renach' })).toEqual([]);
    expect(sentIds(moduleProbe.sent, renaest)).toEqual(ids(renaest));
    expect(await attemptCount([...renach, ...renaest])).toBe(5);

    // The attempt ledger carries each port's evidence: the port of the destination, never the other one.
    const attempts = await asTenant(tenantA, async () => [
      ...await outbox.listEventAttempts(renachA!.id), ...await outbox.listEventAttempts(sendA!.id),
    ]);
    expect(attempts.map((attempt) => [attempt.eventId, attempt.provider, attempt.result])).toEqual([
      [renachA!.id, 'renach-port', 'SENT'], [sendA!.id, 'module-port', 'SENT'],
    ]);
  });

  it('every port receives only the entities of its destination, and the module dispatcher never sees a RENACH event', async () => {
    expect(renachProbe.sent.length).toBeGreaterThan(0);
    expect(moduleProbe.sent.length).toBeGreaterThan(0);
    expect(renachProbe.sent.every((row) => row.entity === RENACH)).toBe(true);
    expect(moduleProbe.sent.every((row) => row.entity.startsWith(RENAEST_PREFIX))).toBe(true);
  });

  it('reports queue health by destination name per tenant, combined with the plain filters', async () => {
    const appended = await appendMany(outbox, tenantA, [fact(RENACH), fact(RENAEST_SEND), fact(RENAEST_FIX)]);
    const [renachB] = await appendMany(outbox, tenantB, [fact(RENACH)]);
    await asTenant(tenantA, () => outbox.ackTenantEvent({ eventId: appended[2]!.id, status: 'ACKED', rawBody: Buffer.from('ack'), hmacVerified: true }));

    const healthA = await asTenant(tenantA, async () => ({
      renach: await outbox.getQueueHealth({ destination: 'renach' }),
      renaest: await outbox.getQueueHealth({ destination: 'renaest' }),
      renaestSend: await outbox.getQueueHealth({ destination: 'renaest', entity: RENAEST_SEND }),
      renaestOther: await outbox.getQueueHealth({ destination: 'renaest', entityPrefix: 'dest.renach' }),
    }));
    // Only the deliveries of this test are PENDING in tenant A; the earlier ones are SENT or ACKED.
    expect(healthA.renach).toMatchObject({ tenantId: tenantA, byStatus: { PENDING: 1 } });
    expect(healthA.renach.byStatus.PENDING + healthA.renach.byStatus.SENT + healthA.renach.byStatus.ACKED).toBe(healthA.renach.total);
    expect(healthA.renaest).toMatchObject({ tenantId: tenantA, byStatus: { PENDING: 1, ACKED: 1 } });
    expect(healthA.renaestSend).toMatchObject({ byStatus: { PENDING: 1, ACKED: 0 } });
    expect(healthA.renaestOther).toMatchObject({ total: 0 });
    expect(healthA.renaest.oldestUnackedCreatedAt).not.toBe(null);

    await expect(asTenant(tenantB, () => outbox.getQueueHealth({ destination: 'renach' }))).resolves.toMatchObject({
      tenantId: tenantB, byStatus: { PENDING: 1 },
    });
    await expect(asTenant(tenantB, () => outbox.getQueueHealth({ destination: 'portal' }))).rejects.toBeInstanceOf(RangeError);
    expect(await deliveries([renachB!])).toEqual(pending([renachB!]));
  });

  it('refuses an unknown destination name before any claim and leaves the queue untouched', async () => {
    const [untouched] = await appendMany(outbox, tenantA, [fact(RENACH)]);
    for (const filter of [{ destination: 'portal' }, { destination: '' }, { destination: RENACH }] as never[]) {
      await expect(outbox.dispatchEventsDue(200, filter)).rejects.toBeInstanceOf(RangeError);
      await expect(asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, filter))).rejects.toBeInstanceOf(RangeError);
    }
    expect(await deliveries([untouched!])).toEqual(pending([untouched!]));
    expect(await attemptCount([untouched!])).toBe(0);
    // The selector form still drains it, through the destination port.
    expect(outcomeIds(await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { entities: [RENACH] })))).toContain(untouched!.id);
    expect(sentIds(renachProbe.sent, [untouched!])).toEqual([untouched!.id]);
  });

  it('still creates no delivery for an event without a destination and never lets it block its aggregate', async () => {
    const aggregate = randomUUID();
    const [rait, first] = await appendMany(outbox, tenantA, [fact(LOG_RAIT, aggregate), fact(RENACH, aggregate)]);
    const logged = await admin(async (client) => (await client.query<{ id: string }>(
      `select id from outbox.events where id=any($1::uuid[])`, [[rait!.id, first!.id]])).rows);
    expect(logged).toHaveLength(2);
    expect(await deliveries([rait!, first!])).toEqual(pending([first!]));

    const sweep = await asTenant(tenantA, () => outbox.dispatchTenantEventsDue(200, { destination: 'renach' }));
    expect(outcomeIds(sweep)).toContain(first!.id);
    expect(sentIds(renachProbe.sent, [rait!, first!])).toEqual([first!.id]);
    expect(sentIds(moduleProbe.sent, [rait!, first!])).toEqual([]);
    expect(await attemptCount([rait!])).toBe(0);
    await expect(asTenant(tenantA, () => outbox.getQueueHealth({ destination: 'renach', entity: LOG_RAIT }))).resolves.toMatchObject({ total: 0 });
  });

  it('keeps the 1.5.5 behavior without a registry: every event is queued to the module dispatcher and no name resolves', async () => {
    const [log, queue] = await appendMany(bare, tenantB, [fact(LOG_RAIT), fact(RENACH)]);
    expect(await deliveries([log!, queue!])).toEqual(pending([log!, queue!]));
    await expect(asTenant(tenantB, () => bare.dispatchTenantEventsDue(200, { destination: 'renach' }))).rejects.toBeInstanceOf(RangeError);
    await expect(asTenant(tenantB, () => bare.getQueueHealth({ destination: 'renach' }))).rejects.toBeInstanceOf(RangeError);
    const sweep = await asTenant(tenantB, () => bare.dispatchTenantEventsDue(200));
    expect(outcomeIds(sweep)).toEqual(expect.arrayContaining(ids([log!, queue!])));
    expect(sentIds(moduleProbe.sent, [log!, queue!])).toEqual(ids([log!, queue!]));
    expect(sentIds(renachProbe.sent, [log!, queue!])).toEqual([]);
  });

  it('refuses to boot a registry whose destinations overlap or exceed the dispatchable declaration', () => {
    const dispatchableEntities = { entities: [RENACH], entityPrefixes: [RENAEST_PREFIX] };
    expect(() => new OutboxService(database, { dispatchableEntities, destinations: [
      { name: 'renach', selector: { entities: [RENACH] } }, { name: 'all', selector: { entityPrefixes: ['dest.'] } },
    ] }, moduleProbe.port)).toThrow(RangeError);
    expect(() => new OutboxService(database, { dispatchableEntities, destinations: [
      { name: 'rait', selector: { entities: [LOG_RAIT] } },
    ] }, moduleProbe.port)).toThrow(RangeError);
    expect(() => new OutboxService(database, { dispatchableEntities, destinations: [
      { name: 'renach', selector: { entities: [RENACH] } }, { name: 'renach', selector: { entityPrefixes: [RENAEST_PREFIX] } },
    ] }, moduleProbe.port)).toThrow(RangeError);
  });
});
