import { Pool } from 'pg';
import { pgSchema, text } from 'drizzle-orm/pg-core';
import { StynxPoolRegistry } from '../../src/pools.js';
import { Database } from '../../src/database.js';
import { StynxMigrationRunner } from '../../src/migration-runner.js';
import { isSoftDeletable, makeLiveOnly, softDeletable } from '../../src/table-markers.js';
import * as dataTypes from '../../src/types.js';
import * as publicData from '../../src/index.js';

describe('honest pool lifecycle', () => {
  it('retains an ordinary initially empty mutable role map and absent lookup semantics', async () => {
    const registry = new StynxPoolRegistry(
      { connections: { owner: {}, app: {}, reader: {} } },
      {} as never,
    );
    expect(Object.getPrototypeOf(registry.pools)).toBe(Object.prototype);
    expect(Object.keys(registry.pools)).toEqual([]);
    for (const role of ['owner', 'app', 'reader'] as const)
      expect(registry.get(role)).toBeUndefined();
    expect(registry.get('app', true)).toBeUndefined();
    const app = new Pool();
    const end = vi.spyOn(app, 'end');
    registry.pools.app = app;
    expect(registry.get('app')).toBe(app);
    expect(registry.get('app', true)).toBeUndefined();
    expect(Object.keys(registry.pools)).toEqual(['app']);
    await registry.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('retains partial initialization and cleans up the existing pool after a later secret failure', async () => {
    const failure = new Error('app secret unavailable');
    const getSecretString = vi.fn(async () => {
      throw failure;
    });
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { connectionString: 'postgresql://owner@localhost/unconnected-fixture' },
          app: { secretId: 'unavailable' },
          reader: { secretId: 'not-reached' },
        },
      },
      { getSecretString } as never,
    );
    await expect(registry.onModuleInit()).rejects.toBe(failure);
    expect(Object.keys(registry.pools)).toEqual(['owner']);
    const owner = registry.get('owner');
    expect(owner).toBeInstanceOf(Pool);
    if (!owner) throw new Error('the successful owner construction must remain visible');
    const end = vi.spyOn(owner, 'end');
    expect(registry.get('app')).toBeUndefined();
    expect(registry.get('reader')).toBeUndefined();
    expect(getSecretString).toHaveBeenCalledExactlyOnceWith('unavailable');
    await registry.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe('partial pool dereference boundaries', () => {
  it('preserves app-role verification before the absent selected connection fails', async () => {
    const events: string[] = [];
    const database = new Database(
      {
        hasActiveContext: () => true,
        snapshot: () => ({
          requestId: 'request',
          tenantId: 'tenant',
          actorId: 'actor',
          startedAt: new Date(),
        }),
      } as never,
      {} as never,
      {
        get: () => {
          events.push('select');
          return undefined;
        },
        ensureAppRole: async () => {
          events.push('verify');
        },
      } as never,
      { get: () => undefined, set: () => undefined } as never,
      { connections: { owner: {}, app: {}, reader: {} } },
    );
    const callback = vi.fn(async () => undefined);
    await expect(database.tx(callback)).rejects.toBeInstanceOf(TypeError);
    expect(events).toEqual(['select', 'verify']);
    expect(callback).not.toHaveBeenCalled();
  });

  it('passes a newly checked complete snapshot to custom migration callbacks and never caches it', async () => {
    const registry = new StynxPoolRegistry(
      { connections: { owner: {}, app: {}, reader: {} } },
      {} as never,
    );
    const pools = { owner: new Pool(), app: new Pool(), reader: new Pool() };
    Object.assign(registry.pools, pools);
    const callback = vi.fn(
      async (_selected: Record<'owner' | 'app' | 'reader', Pool>) => undefined,
    );
    const runner = new StynxMigrationRunner(
      {
        connections: { owner: {}, app: {}, reader: {} },
        migrations: { enabled: true, runner: callback },
      },
      registry,
    );
    const platform = vi.spyOn(runner, 'runPlatformMigrations').mockResolvedValue(undefined);
    try {
      await runner.onModuleInit();
      expect(platform).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledExactlyOnceWith(pools);
      expect(callback.mock.calls[0]?.[0]).not.toBe(registry.pools);
      delete registry.pools.app;
      await expect(runner.onModuleInit()).rejects.toBeInstanceOf(TypeError);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0]?.[0].app).toBe(pools.app);
    } finally {
      await Promise.all(Object.values(pools).map((pool) => pool.end()));
    }
  });
});

describe('actual symbol-backed table brands', () => {
  it('exports globally stable marker symbols without fabricating string fields or changing table identity', () => {
    const softSymbol = Reflect.get(dataTypes, 'SOFT_DELETABLE');
    const liveSymbol = Reflect.get(dataTypes, 'LIVE_ONLY');
    expect(softSymbol).toBe(Symbol.for('stynx.data.soft-deletable'));
    expect(liveSymbol).toBe(Symbol.for('stynx.data.live-only'));
    expect(Reflect.get(publicData, 'SOFT_DELETABLE')).toBe(softSymbol);
    expect(Reflect.get(publicData, 'LIVE_ONLY')).toBe(liveSymbol);
    const schema = pgSchema('marker_contract');
    const soft = schema.table('soft', { name: text('name').notNull() });
    const live = schema.table('live', { name: text('name').notNull() });
    const softKeys = Object.keys(soft);
    const liveKeys = Object.keys(live);
    expect(softDeletable(soft)).toBe(soft);
    expect(makeLiveOnly(live)).toBe(live);
    expect(Object.getOwnPropertyDescriptor(soft, Symbol.for('stynx.data.soft-deletable'))).toEqual({
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    expect(Object.getOwnPropertyDescriptor(live, Symbol.for('stynx.data.live-only'))).toEqual({
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    expect(Object.keys(soft)).toEqual(softKeys);
    expect(Object.keys(live)).toEqual(liveKeys);
    expect(soft).not.toHaveProperty('__stynxSoftDeletable');
    expect(live).not.toHaveProperty('__stynxLiveOnly');
    expect(isSoftDeletable(soft)).toBe(true);
    expect(isSoftDeletable(live)).toBe(false);
    expect(softDeletable(soft)).toBe(soft);
    expect(makeLiveOnly(live)).toBe(live);
  });

  it.each([
    null,
    undefined,
    false,
    1,
    'text',
    {},
    { [Symbol.for('stynx.data.soft-deletable')]: false },
    { [Symbol.for('stynx.data.soft-deletable')]: 1 },
    { [Symbol.for('stynx.data.soft-deletable')]: 'true' },
  ])('does not prove an exact marker for unmarked or malformed input %s', (input) => {
    expect(isSoftDeletable(input)).toBe(false);
  });

  it('preserves inherited exact-true marker semantics without claiming table identity', () => {
    const markerOnly = { [Symbol.for('stynx.data.soft-deletable')]: true };
    expect(isSoftDeletable(markerOnly)).toBe(true);
    expect(isSoftDeletable(Object.create(markerOnly))).toBe(true);
    const callableMarker = Object.assign(() => undefined, markerOnly);
    expect(isSoftDeletable(callableMarker)).toBe(true);
    expect(
      isSoftDeletable(Object.create({ [Symbol.for('stynx.data.soft-deletable')]: 'truthy' })),
    ).toBe(false);
  });
});
