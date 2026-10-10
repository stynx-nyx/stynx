import { STYNX_OUTBOX_DESTINATIONS, STYNX_OUTBOX_DISPATCHER, STYNX_OUTBOX_OPTIONS } from '../../src/constants';
import { StynxOutboxModule } from '../../src/outbox.module';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxDestination, OutboxDispatcherPort, OutboxRow, OutboxSqlExecutor } from '../../src/types';

// UPS-OBX-11 (#320), ADR-OUTBOX-0003 D4: a named destination is sugar over the 1.5.5 entity
// selector. It expands to its entity set in the dispatch sweeps and in queue health, routes
// its claimed events to its own port, and adds no table, column, status or stored state.

const tenant = '11111111-1111-4111-8111-111111111111';
const flat = (sql: unknown) => String(sql).replace(/\s+/gu, ' ').trim();
const RENACH = 'dest.renach';
const RENAEST_PREFIX = 'dest.renaest.';
const OWNER_PREDICATE = "and pd.status<>'ACKED' ) and (e.entity=any($3::text[]) or exists ( select 1 from unnest($4::text[]) as prefix(value) where left(e.entity,length(prefix.value))=prefix.value)) order by e.created_at,e.id limit $1 for update of d skip locked";
const TENANT_PREDICATE = "and pd.status<>'ACKED' ) and (e.entity=any($4::text[]) or exists ( select 1 from unnest($5::text[]) as prefix(value) where left(e.entity,length(prefix.value))=prefix.value)) order by e.created_at,e.id limit $2 for update of d skip locked";
const HEALTH_PREDICATE = "where d.tenant_id=$1::uuid and ($2::text is null or e.entity=$2) and ($3::text is null or left(e.entity,length($3))=$3) and (e.entity=any($4::text[]) or exists ( select 1 from unnest($5::text[]) as prefix(value) where left(e.entity,length(prefix.value))=prefix.value)) group by d.status";

function port(name: string): OutboxDispatcherPort & { sendEvent: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => undefined), sendEvent: vi.fn(async () => ({ provider: name })) };
}

const registry = (): OutboxDestination[] => [
  { name: 'renach', selector: { entities: [RENACH] } },
  { name: 'renaest', selector: { entityPrefixes: [RENAEST_PREFIX] } },
];

const claim = (entity: string, ordinal: number) => ({
  tenant_id: tenant, event_id: `0000000${ordinal}-0000-4000-8000-000000000000`, attempts: 1, status: 'SENT',
  entity, entity_id: `aggregate-${ordinal}`, idempotency_key: `${entity}:${ordinal}`, payload: { ordinal }, metadata: null,
  created_at: new Date(ordinal),
});

/** Database double: the claim query returns `claims`; every other statement returns no rows. */
function dispatchDatabase(claims: ReturnType<typeof claim>[] = []) {
  const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    calls.push({ sql: flat(sql), params });
    return { rows: sql.includes('with due as') ? claims : [] };
  }) as OutboxSqlExecutor['query'];
  const tx = vi.fn(async (fn: (trx: never) => Promise<unknown>) => fn({ role: 'app', query } as never));
  return {
    calls, tx,
    database: { appRoleName: 'stynx_app', currentTenantId: () => tenant, withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()), tx },
  };
}

const entities = (sendEvent: ReturnType<typeof vi.fn>) => sendEvent.mock.calls.map(([row]) => (row as OutboxRow).entity);

describe('UPS-OBX-11 named destination registry validation', () => {
  const database = { appRoleName: 'stynx_app', currentTenantId: () => tenant };
  const construct = (options: Record<string, unknown>) => () => new OutboxService(database as never, options as never);

  it('accepts a well-formed registry, an empty one and none at all', () => {
    expect(construct({ destinations: registry() })).not.toThrow();
    expect(construct({ destinations: [] })).not.toThrow();
    expect(construct({})).not.toThrow();
    expect(construct({
      dispatchableEntities: { entities: [RENACH], entityPrefixes: [RENAEST_PREFIX] },
      destinations: [
        { name: 'renach', selector: { entities: [RENACH] }, dispatcher: port('renach') },
        { name: 'renaest', selector: { entityPrefixes: [`${RENAEST_PREFIX}send.`], entities: [`${RENAEST_PREFIX}fix`] } },
      ],
    })).not.toThrow();
    // Prefix destinations that share no entity are disjoint, whatever their order.
    expect(construct({ destinations: [
      { name: 'send', selector: { entityPrefixes: [`${RENAEST_PREFIX}send.`, 'dest.other.'] } },
      { name: 'fix', selector: { entityPrefixes: [`${RENAEST_PREFIX}fix.`], entities: ['dest.other'] } },
    ] })).not.toThrow();
  });

  it('refuses a malformed registry entry before anything else is read', () => {
    for (const destinations of [
      'renach', {}, [null], ['renach'], [{ selector: { entities: [RENACH] } }], [{ name: '', selector: { entities: [RENACH] } }],
      [{ name: 7, selector: { entities: [RENACH] } }], [{ name: 'renach' }], [{ name: 'renach', selector: null }],
      [{ name: 'renach', selector: {} }], [{ name: 'renach', selector: { entities: [] } }], [{ name: 'renach', selector: { entities: [''] } }],
      [{ name: 'renach', selector: { entityPrefixes: 'dest.' } }],
      [{ name: 'renach', selector: { entities: [RENACH] }, dispatcher: 'http' }],
      [{ name: 'renach', selector: { entities: [RENACH] }, dispatcher: null }],
      [{ name: 'renach', selector: { entities: [RENACH] }, dispatcher: { sendEvent: async () => ({}) } }],
    ]) {
      expect(construct({ destinations })).toThrow(RangeError);
    }
  });

  it('refuses a duplicate destination name', () => {
    expect(construct({ destinations: [
      { name: 'renach', selector: { entities: [RENACH] } }, { name: 'renach', selector: { entities: ['dest.other'] } },
    ] })).toThrow('destinations[1].name "renach" is already registered');
  });

  it('refuses two destinations that could match one entity, in either order', () => {
    const overlapping: Array<[OutboxDestination, OutboxDestination, string]> = [
      // exact = exact
      [{ name: 'a', selector: { entities: [RENACH, 'dest.x'] } }, { name: 'b', selector: { entities: ['dest.y', RENACH] } }, RENACH],
      // exact matched by the other's prefix
      [{ name: 'a', selector: { entities: [`${RENAEST_PREFIX}send`] } }, { name: 'b', selector: { entityPrefixes: [RENAEST_PREFIX] } }, `${RENAEST_PREFIX}send`],
      // one prefix is a prefix of the other
      [{ name: 'a', selector: { entityPrefixes: ['dest.'] } }, { name: 'b', selector: { entityPrefixes: [RENAEST_PREFIX] } }, RENAEST_PREFIX],
      [{ name: 'a', selector: { entityPrefixes: [RENAEST_PREFIX] } }, { name: 'b', selector: { entityPrefixes: [RENAEST_PREFIX] } }, RENAEST_PREFIX],
    ];
    for (const [first, second, entity] of overlapping) {
      expect(construct({ destinations: [first, second] })).toThrow(`destinations "a" and "b" both match entity "${entity}"`);
      expect(construct({ destinations: [second, first] })).toThrow(`destinations "b" and "a" both match entity "${entity}"`);
    }
    // Overlap inside one destination is not a conflict: the entity still has exactly one destination.
    expect(construct({ destinations: [{ name: 'a', selector: { entities: [RENACH], entityPrefixes: ['dest.'] } }] })).not.toThrow();
  });

  it('refuses a destination the dispatchable declaration does not fully cover', () => {
    const dispatchableEntities = { entities: [RENACH], entityPrefixes: [RENAEST_PREFIX] };
    expect(construct({ dispatchableEntities, destinations: [{ name: 'rait', selector: { entities: ['log.rait'] } }] }))
      .toThrow('destinations "rait" names entity "log.rait", which dispatchableEntities does not cover');
    // A prefix is covered only by a dispatchable prefix it extends; an exact dispatchable name never covers a prefix.
    expect(construct({ dispatchableEntities, destinations: [{ name: 'renach', selector: { entityPrefixes: [RENACH] } }] }))
      .toThrow('destinations "renach" names entity prefix "dest.renach", which dispatchableEntities does not cover');
    expect(construct({ dispatchableEntities, destinations: [{ name: 'all', selector: { entityPrefixes: ['dest.'] } }] })).toThrow(RangeError);
    expect(construct({ dispatchableEntities: {}, destinations: registry() })).toThrow(RangeError);
    expect(construct({ dispatchableEntities, destinations: registry() })).not.toThrow();
    expect(construct({ dispatchableEntities, destinations: [{ name: 'send', selector: { entityPrefixes: [`${RENAEST_PREFIX}send`] } }] })).not.toThrow();
  });

  it('prefers a STYNX_OUTBOX_DESTINATIONS provider over the options registry, as the module wires it', async () => {
    const options = { destinations: registry() };
    const module = StynxOutboxModule.forRoot(options);
    expect(module.providers).toEqual(expect.arrayContaining([
      { provide: STYNX_OUTBOX_OPTIONS, useValue: options },
      { provide: STYNX_OUTBOX_DESTINATIONS, useValue: options.destinations },
    ]));
    expect(module.providers!.some((provider) => (provider as { provide?: unknown }).provide === STYNX_OUTBOX_DISPATCHER)).toBe(false);
    expect(StynxOutboxModule.forRoot({}).providers!.some((provider) => (provider as { provide?: unknown }).provide === STYNX_OUTBOX_DESTINATIONS)).toBe(false);

    const { database, calls } = dispatchDatabase();
    const injected: OutboxDestination[] = [{ name: 'injected', selector: { entities: ['dest.injected'] } }];
    const service = new OutboxService(database as never, options, undefined, undefined, undefined, injected);
    await service.dispatchEventsDue(5, { destination: 'injected' });
    expect(calls[0]!.params).toEqual([5, 300_000, ['dest.injected'], []]);
    await expect(service.dispatchEventsDue(5, { destination: 'renach' })).rejects.toBeInstanceOf(RangeError);
  });
});

describe('UPS-OBX-11 destination name as a dispatch filter', () => {
  it('expands a name into the owner claim parameters exactly like its selector', async () => {
    const { database, calls } = dispatchDatabase();
    const service = new OutboxService(database as never, { eventLeaseMs: 1_000, destinations: registry() });
    await service.dispatchEventsDue(5, { destination: 'renach' });
    expect(calls[0]!.sql).toContain(OWNER_PREDICATE);
    expect(calls[0]!.params).toEqual([5, 1_000, [RENACH], []]);
    await service.dispatchEventsDue(5, { destination: 'renaest' });
    expect(calls[1]!.params).toEqual([5, 1_000, [], [RENAEST_PREFIX]]);
    await service.dispatchEventsDue(5, { entities: [RENACH] });
    expect(calls[2]!.params).toEqual([5, 1_000, [RENACH], []]);
    await service.dispatchEventsDue(5);
    expect(calls[3]!.sql).not.toContain('unnest');
    expect(calls[3]!.params).toEqual([5, 1_000]);
    expect(database.withSystemContext).toHaveBeenCalledTimes(4);
  });

  it('expands a name into the tenant claim parameters after the tenant predicates', async () => {
    const { database, calls } = dispatchDatabase();
    const service = new OutboxService(database as never, { destinations: registry() });
    await service.dispatchTenantEventsDue(5, { destination: 'renaest' });
    expect(calls[0]!.sql).toContain('where d.tenant_id=$1::uuid and e.tenant_id=$1::uuid');
    expect(calls[0]!.sql).toContain(TENANT_PREDICATE);
    expect(calls[0]!.params).toEqual([tenant, 5, 300_000, [], [RENAEST_PREFIX]]);
    await service.dispatchTenantEventsDue(5, { destination: 'renach' });
    expect(calls[1]!.params).toEqual([tenant, 5, 300_000, [RENACH], []]);
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it('refuses an unknown or malformed destination name before any transaction, on both sweeps', async () => {
    const { database, tx } = dispatchDatabase();
    const service = new OutboxService(database as never, { destinations: registry() });
    for (const filter of [{ destination: 'portal' }, { destination: '' }, { destination: 7 }, { destination: null }, { destination: RENACH }] as never[]) {
      await expect(service.dispatchEventsDue(5, filter)).rejects.toBeInstanceOf(RangeError);
      await expect(service.dispatchTenantEventsDue(5, filter)).rejects.toBeInstanceOf(RangeError);
    }
    await expect(service.dispatchEventsDue(5, { destination: 'portal' })).rejects.toThrow('filter.destination "portal" is not a registered destination');
    // Without a registry every name is unknown, and the selector form keeps working.
    const bare = new OutboxService(database as never, {});
    await expect(bare.dispatchEventsDue(5, { destination: 'renach' })).rejects.toBeInstanceOf(RangeError);
    await expect(bare.dispatchTenantEventsDue(5, { destination: 'renach' })).rejects.toBeInstanceOf(RangeError);
    expect(tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });
});

describe('UPS-OBX-11 port routing by destination', () => {
  const claims = () => [claim(RENACH, 1), claim(`${RENAEST_PREFIX}send`, 2), claim('log.rait', 3)];

  it('sends each claimed event to its destination port and everything else to the module dispatcher', async () => {
    const renach = port('renach');
    const module = port('module');
    const { database } = dispatchDatabase(claims());
    const service = new OutboxService(database as never, { destinations: [
      { name: 'renach', selector: { entities: [RENACH] }, dispatcher: renach },
      { name: 'renaest', selector: { entityPrefixes: [RENAEST_PREFIX] } },
    ] }, module);

    const owner = await service.dispatchEventsDue(5);
    expect(owner.map((outcome) => [outcome.row.entity, outcome.dispatched])).toEqual([[RENACH, true], [`${RENAEST_PREFIX}send`, true], ['log.rait', true]]);
    expect(entities(renach.sendEvent)).toEqual([RENACH]);
    expect(entities(module.sendEvent)).toEqual([`${RENAEST_PREFIX}send`, 'log.rait']);

    const scoped = await service.dispatchTenantEventsDue(5);
    expect(scoped.map((outcome) => outcome.dispatched)).toEqual([true, true, true]);
    expect(entities(renach.sendEvent)).toEqual([RENACH, RENACH]);
    expect(entities(module.sendEvent)).toEqual([`${RENAEST_PREFIX}send`, 'log.rait', `${RENAEST_PREFIX}send`, 'log.rait']);
    expect(renach.send).not.toHaveBeenCalled();
    expect(module.send).not.toHaveBeenCalled();
  });

  it('uses a destination port that only implements send, and claims without sending when no port applies', async () => {
    const legacyPort: OutboxDispatcherPort = { send: vi.fn(async () => undefined) };
    const { database } = dispatchDatabase(claims());
    const service = new OutboxService(database as never, { destinations: [
      { name: 'renach', selector: { entities: [RENACH] }, dispatcher: legacyPort },
      { name: 'renaest', selector: { entityPrefixes: [RENAEST_PREFIX] } },
    ] });

    const owner = await service.dispatchEventsDue(5);
    expect(owner.map((outcome) => [outcome.row.entity, outcome.dispatched])).toEqual([[RENACH, true], [`${RENAEST_PREFIX}send`, false], ['log.rait', false]]);
    const scoped = await service.dispatchTenantEventsDue(5);
    expect(scoped.map((outcome) => [outcome.row.entity, outcome.dispatched])).toEqual([[RENACH, true], [`${RENAEST_PREFIX}send`, false], ['log.rait', false]]);
    expect((legacyPort.send as ReturnType<typeof vi.fn>).mock.calls.map(([row]) => (row as OutboxRow).entity)).toEqual([RENACH, RENACH]);
  });

  it('routes a destination transport failure through the backoff of that event only', async () => {
    const failing: OutboxDispatcherPort = { send: vi.fn(), sendEvent: vi.fn(async () => { throw new Error('renach offline'); }) };
    const module = port('module');
    const { database } = dispatchDatabase(claims());
    const service = new OutboxService(database as never, { destinations: [
      { name: 'renach', selector: { entities: [RENACH] }, dispatcher: failing },
    ] }, module);
    const owner = await service.dispatchEventsDue(5);
    expect(owner.map((outcome) => [outcome.dispatched, outcome.error])).toEqual([[false, 'renach offline'], [true, undefined], [true, undefined]]);
    const scoped = await service.dispatchTenantEventsDue(5);
    expect(scoped.map((outcome) => [outcome.dispatched, outcome.error])).toEqual([[false, 'renach offline'], [true, undefined], [true, undefined]]);
    expect(entities(module.sendEvent)).toEqual([`${RENAEST_PREFIX}send`, 'log.rait', `${RENAEST_PREFIX}send`, 'log.rait']);
  });
});

describe('UPS-OBX-11 queue health by destination name', () => {
  function healthDatabase(rows: unknown[] = []) {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const options: unknown[] = [];
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => { calls.push({ sql: flat(sql), params }); return { rows }; });
    const tx = vi.fn(async (fn: (trx: never) => Promise<unknown>, txOptions: unknown) => { options.push(txOptions); return fn({ role: 'app', query } as never); });
    return { calls, options, tx, database: { appRoleName: 'stynx_app', currentTenantId: () => tenant, withSystemContext: vi.fn(), tx } };
  }

  it('adds the selector predicate and its two parameters only when a destination is named', async () => {
    const { calls, options, database } = healthDatabase([{ status: 'PENDING', count: 2, oldest: new Date(5) }]);
    const service = new OutboxService(database as never, { destinations: registry() });
    await expect(service.getQueueHealth({ destination: 'renaest' })).resolves.toEqual({
      tenantId: tenant, total: 2, byStatus: { PENDING: 2, SENT: 0, SENT_UNRESOLVED: 0, ERROR: 0, ACKED: 0 }, oldestUnackedCreatedAt: new Date(5),
    });
    expect(calls[0]!.sql).toContain(HEALTH_PREDICATE);
    expect(calls[0]!.params).toEqual([tenant, null, null, [], [RENAEST_PREFIX]]);

    // The name combines with the plain filters, and without a name the 1.5.5 statement is unchanged.
    await service.getQueueHealth({ destination: 'renach', entity: RENACH, entityPrefix: 'dest.' });
    expect(calls[1]!.params).toEqual([tenant, RENACH, 'dest.', [RENACH], []]);
    await service.getQueueHealth({ entityPrefix: 'dest.' });
    expect(calls[2]!.sql).not.toContain('unnest');
    expect(calls[2]!.params).toEqual([tenant, null, 'dest.']);
    expect(options).toEqual(Array(3).fill({ role: 'app', readonly: true, requireActor: true, retry: false }));
  });

  it('refuses an unknown destination name before the read transaction', async () => {
    const { tx, database } = healthDatabase();
    const service = new OutboxService(database as never, { destinations: registry() });
    await expect(service.getQueueHealth({ destination: 'portal' })).rejects.toThrow('destination "portal" is not a registered destination');
    await expect(service.getQueueHealth({ destination: '' })).rejects.toBeInstanceOf(RangeError);
    await expect(new OutboxService(database as never, {}).getQueueHealth({ destination: 'renach' })).rejects.toBeInstanceOf(RangeError);
    expect(tx).not.toHaveBeenCalled();
  });
});
