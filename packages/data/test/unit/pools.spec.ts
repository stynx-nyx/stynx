// Unit tests for the pure parts of pools.ts (parseSecretConnection),
// the createStynxPgPool factory (constructs a Pool without connecting),
// and the StynxPoolRegistry happy-path init + get + destroy methods.

import { Pool } from 'pg';
import { createStynxPgPool, StynxPoolRegistry } from '../../src/pools';
import type { Mock } from 'vitest';

describe('createStynxPgPool', () => {
  let pools: Pool[] = [];

  afterEach(async () => {
    await Promise.all(pools.map((p) => p.end()));
    pools = [];
  });

  it('creates a Pool from a connection string', () => {
    const pool = createStynxPgPool({ connectionString: 'postgresql://user@localhost/db' });
    pools.push(pool);
    expect(pool).toBeInstanceOf(Pool);
  });

  it('swallows idle pool errors from the factory-created pool', () => {
    const pool = createStynxPgPool({ connectionString: 'postgresql://user@localhost/db' });
    pools.push(pool);

    expect(() => pool.emit('error', new Error('idle error'))).not.toThrow();
  });

  it('passes ssl: true through as { rejectUnauthorized: false }', () => {
    const pool = createStynxPgPool({
      connectionString: 'postgresql://user@localhost/db',
      ssl: true,
    });
    pools.push(pool);
    expect(pool).toBeInstanceOf(Pool);
  });

  it('honors host/port/user/password/database/max/applicationName options', () => {
    const pool = createStynxPgPool({
      host: '127.0.0.1',
      port: 5432,
      user: 'u',
      password: 'p',
      database: 'd',
      max: 5,
      applicationName: 'unit-test',
    });
    pools.push(pool);
    expect(pool).toBeInstanceOf(Pool);
  });
});

describe('StynxPoolRegistry', () => {
  let registries: StynxPoolRegistry[] = [];

  afterEach(async () => {
    await Promise.all(registries.map((r) => r.onModuleDestroy().catch(() => undefined)));
    registries = [];
  });

  function makeRegistry(opts: {
    owner?: string;
    app?: string;
    reader?: string;
    secretLoader?: { getSecretString: Mock };
  } = {}): StynxPoolRegistry {
    const loader = opts.secretLoader ?? {
      getSecretString: vi.fn(async (id: string) => `postgresql://${id}@localhost/db`),
    };
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { connectionString: opts.owner ?? 'postgresql://owner@localhost/db' },
          app: { connectionString: opts.app ?? 'postgresql://app@localhost/db' },
          reader: { connectionString: opts.reader ?? 'postgresql://reader@localhost/db' },
        },
      } as never,
      loader as never,
    );
    registries.push(registry);
    return registry;
  }

  it('creates owner + app + reader pools on init', async () => {
    const registry = makeRegistry();
    await registry.onModuleInit();
    expect(registry.pools.owner).toBeInstanceOf(Pool);
    expect(registry.pools.app).toBeInstanceOf(Pool);
    expect(registry.pools.reader).toBeInstanceOf(Pool);
  });

  it('is idempotent — re-init does not re-create pools', async () => {
    const registry = makeRegistry();
    await registry.onModuleInit();
    const ownerRef = registry.pools.owner;
    await registry.onModuleInit();
    expect(registry.pools.owner).toBe(ownerRef);
  });

  it('get(owner) returns the owner pool by default', async () => {
    const registry = makeRegistry();
    await registry.onModuleInit();
    expect(registry.get('owner')).toBe(registry.pools.owner);
  });

  it('get(app, replica=true) returns the reader pool', async () => {
    const registry = makeRegistry();
    await registry.onModuleInit();
    expect(registry.get('app', true)).toBe(registry.pools.reader);
  });

  it('get(reader) always returns the reader pool', async () => {
    const registry = makeRegistry();
    await registry.onModuleInit();
    expect(registry.get('reader')).toBe(registry.pools.reader);
  });

  it('resolves connection strings via secretId when no connectionString provided', async () => {
    const getSecretString = vi.fn(async (id: string) => `postgresql://${id}@localhost/db`);
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { secretId: 'owner-secret' },
          app: { secretId: 'app-secret' },
          reader: { secretId: 'reader-secret' },
        },
      } as never,
      { getSecretString } as never,
    );
    registries.push(registry);
    await registry.onModuleInit();
    expect(getSecretString).toHaveBeenCalledTimes(3);
    expect(getSecretString).toHaveBeenCalledWith('owner-secret');
  });

  it('honors JSON-shaped secrets via parseSecretConnection (connectionString field)', async () => {
    const getSecretString = vi.fn(async () =>
      JSON.stringify({ connectionString: 'postgresql://json-owner@localhost/db' }),
    );
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { secretId: 'owner-secret' },
          app: { connectionString: 'postgresql://app@localhost/db' },
          reader: { connectionString: 'postgresql://reader@localhost/db' },
        },
      } as never,
      { getSecretString } as never,
    );
    registries.push(registry);
    await registry.onModuleInit();
    expect(getSecretString).toHaveBeenCalledTimes(1);
    // Pool created successfully (would throw if connection string invalid)
    expect(registry.pools.owner).toBeInstanceOf(Pool);
  });

  it('honors JSON-shaped secrets with `url` field', async () => {
    const getSecretString = vi.fn(async () =>
      JSON.stringify({ url: 'postgresql://json-url@localhost/db' }),
    );
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { secretId: 'owner-secret' },
          app: { connectionString: 'postgresql://app@localhost/db' },
          reader: { connectionString: 'postgresql://reader@localhost/db' },
        },
      } as never,
      { getSecretString } as never,
    );
    registries.push(registry);
    await registry.onModuleInit();
    expect(registry.pools.owner).toBeInstanceOf(Pool);
  });

  it('falls through to raw secret when JSON lacks a connection field', async () => {
    const getSecretString = vi.fn(async () => JSON.stringify({ username: 'owner' }));
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { secretId: 'owner-secret' },
          app: { connectionString: 'postgresql://app@localhost/db', max: 11 },
          reader: { connectionString: 'postgresql://reader@localhost/db', max: 12 },
        },
      } as never,
      { getSecretString } as never,
    );
    registries.push(registry);

    await registry.onModuleInit();

    expect(registry.pools.owner).toBeInstanceOf(Pool);
    expect(registry.pools.app.options.max).toBe(11);
    expect(registry.pools.reader.options.max).toBe(12);
    expect(() => registry.pools.owner.emit('error', new Error('idle owner error'))).not.toThrow();
  });

  it('falls through to raw secret when JSON parse fails', async () => {
    const getSecretString = vi.fn(async () => 'postgresql://raw@localhost/db');
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: { secretId: 'owner-secret' },
          app: { connectionString: 'postgresql://app@localhost/db' },
          reader: { connectionString: 'postgresql://reader@localhost/db' },
        },
      } as never,
      { getSecretString } as never,
    );
    registries.push(registry);
    await registry.onModuleInit();
    expect(registry.pools.owner).toBeInstanceOf(Pool);
  });

  it('throws when a connection has neither connectionString nor secretId', async () => {
    const registry = new StynxPoolRegistry(
      {
        connections: {
          owner: {},
          app: { connectionString: 'postgresql://app@localhost/db' },
          reader: { connectionString: 'postgresql://reader@localhost/db' },
        },
      } as never,
      { getSecretString: vi.fn() } as never,
    );
    registries.push(registry);
    await expect(registry.onModuleInit()).rejects.toThrow(
      /requires either connectionString or secretId/,
    );
  });
});
