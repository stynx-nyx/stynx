import { createClient } from 'redis';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend.js';
import type { Mock } from 'vitest';

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

function makeOptions(redis?: { url: string; invalidateChannel: string; keyPrefix: string }) {
  return {
    redis,
  } as never;
}

function makeMulti() {
  const ops: Array<{ op: string; args: unknown[] }> = [];
  const multi: Record<string, Mock> = {};
  for (const op of ['set', 'sAdd', 'expire', 'del', 'sRem']) {
    multi[op] = vi.fn((...args: unknown[]) => {
      ops.push({ op, args });
      return multi;
    });
  }
  multi.exec = vi.fn(async () => undefined);
  return { multi, ops };
}

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isOpen: true,
    get: vi.fn(async () => null),
    sMembers: vi.fn(async () => []),
    publish: vi.fn(async () => undefined),
    scanIterator: vi.fn(),
    multi: vi.fn(),
    ...overrides,
  };
}

function attachClient(backend: RedisPermissionCacheBackend, client: ReturnType<typeof makeClient>) {
  Object.defineProperty(backend, 'client', { value: client, writable: true });
  return client;
}

function attachSubscriber(backend: RedisPermissionCacheBackend, subscriber: Record<string, unknown>) {
  Object.defineProperty(backend, 'subscriber', { value: subscriber, writable: true });
  return subscriber;
}

describe('RedisPermissionCacheBackend', () => {
  const redisOpts = {
    url: 'redis://localhost:6379',
    invalidateChannel: 'permission-invalidation',
    keyPrefix: 'auth',
  };

  it('onModuleInit is a no-op when redis options are absent', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.onModuleInit()).resolves.toBe(undefined);
  });

  it('onModuleInit does not reconnect when both redis clients are already open', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ isOpen: true, connect: vi.fn() }));
    const sub = attachSubscriber(backend, { isOpen: true, connect: vi.fn() });
    await backend.onModuleInit();
    expect((sub.connect as Mock | undefined)).not.toHaveBeenCalledTimes(1);
  });

  it('onModuleInit creates, connects, subscribes, and forwards invalidation messages', async () => {
    const handler = vi.fn(async () => undefined);
    let subscribed: ((message: string) => void) | undefined;
    const subscriber = {
      isOpen: false,
      on: vi.fn(),
      connect: vi.fn(async () => {
        subscriber.isOpen = true;
      }),
      subscribe: vi.fn(async (_channel: string, callback: (message: string) => void) => {
        subscribed = callback;
      }),
    };
    const client = {
      isOpen: false,
      on: vi.fn(),
      connect: vi.fn(async () => {
        client.isOpen = true;
      }),
      duplicate: vi.fn(() => subscriber),
    };
    vi.mocked(createClient).mockReturnValue(client as never);
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await backend.subscribe(handler);

    await backend.onModuleInit();
    subscribed?.('u-1:t-1');

    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379', RESP: 2 });
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(subscriber.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith('permission-invalidation', expect.any(Function));
    expect(handler).toHaveBeenCalledWith('u-1:t-1');
  });

  it('swallows redis error events emitted by the client and subscriber created on init', async () => {
    const clientHandlers = new Map<string, (error: unknown) => unknown>();
    const subscriberHandlers = new Map<string, (error: unknown) => unknown>();
    const subscriber = {
      isOpen: false,
      on: vi.fn((event: string, handler: (error: unknown) => unknown) => {
        subscriberHandlers.set(event, handler);
      }),
      connect: vi.fn(async () => {
        subscriber.isOpen = true;
      }),
      subscribe: vi.fn(async () => undefined),
    };
    const client = {
      isOpen: false,
      on: vi.fn((event: string, handler: (error: unknown) => unknown) => {
        clientHandlers.set(event, handler);
      }),
      connect: vi.fn(async () => {
        client.isOpen = true;
      }),
      duplicate: vi.fn(() => subscriber),
    };
    vi.mocked(createClient).mockReturnValue(client as never);
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));

    await backend.onModuleInit();

    expect([...clientHandlers.keys()]).toEqual(['error']);
    expect([...subscriberHandlers.keys()]).toEqual(['error']);
    expect(clientHandlers.get('error')?.(new Error('client connection lost'))).toBe(undefined);
    expect(subscriberHandlers.get('error')?.(new Error('subscriber connection lost'))).toBe(undefined);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(0);
  });

  it('onModuleInit reuses an already-open client and only creates and connects the subscriber', async () => {
    const subscriber = {
      isOpen: false,
      on: vi.fn(),
      connect: vi.fn(async () => {
        subscriber.isOpen = true;
      }),
      subscribe: vi.fn(async () => undefined),
    };
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = attachClient(
      backend,
      makeClient({
        isOpen: true,
        on: vi.fn(),
        connect: vi.fn(async () => undefined),
        duplicate: vi.fn(() => subscriber),
      }),
    );

    await backend.onModuleInit();

    expect(client.duplicate).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(0);
    expect(subscriber.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(0);
    expect((backend as unknown as { subscriber?: unknown }).subscriber).toBe(subscriber);
  });

  it('onModuleInit reuses an already-open subscriber and only connects the client', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = attachClient(
      backend,
      makeClient({
        isOpen: false,
        on: vi.fn(),
        connect: vi.fn(async () => {
          client.isOpen = true;
        }),
        duplicate: vi.fn(),
      }),
    );
    let subscribed: ((message: string) => void) | undefined;
    const subscriber = attachSubscriber(backend, {
      isOpen: true,
      on: vi.fn(),
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async (_channel: string, callback: (message: string) => void) => {
        subscribed = callback;
      }),
    });
    const handler = vi.fn(async () => undefined);
    (backend as unknown as { onMessage?: unknown }).onMessage = handler;

    await backend.onModuleInit();
    subscribed?.('u-3:t-3');

    expect(client.duplicate).toHaveBeenCalledTimes(0);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.connect).toHaveBeenCalledTimes(0);
    expect(subscriber.subscribe).toHaveBeenCalledWith('permission-invalidation', expect.any(Function));
    expect(handler).toHaveBeenCalledWith('u-3:t-3');
  });

  it('subscribes immediately when a subscriber client is already attached', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    let callback: ((message: string) => void) | undefined;
    const subscriber = attachSubscriber(backend, {
      subscribe: vi.fn(async (_channel: string, cb: (message: string) => void) => {
        callback = cb;
      }),
    });
    const handler = vi.fn(async () => undefined);

    await backend.subscribe(handler);
    callback?.('u-2:t-2');

    expect(subscriber.subscribe).toHaveBeenCalledWith('permission-invalidation', expect.any(Function));
    expect(handler).toHaveBeenCalledWith('u-2:t-2');
  });

  it('get returns null when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.get('sid-1')).resolves.toBe(null);
  });

  it('get parses JSON value when present', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u', tenantId: 't', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    attachClient(backend, makeClient({ get: vi.fn(async () => JSON.stringify(record)) }));
    await expect(backend.get('sid-1')).resolves.toEqual(record);
  });

  it('get returns null when redis returns nothing', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ get: vi.fn(async () => null) }));
    await expect(backend.get('sid-1')).resolves.toBe(null);
  });

  it.each([null, '', 'null'])('get retains missing/empty/JSON-null result %s', async (raw) => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = attachClient(backend, makeClient({ get: vi.fn(async () => raw) }));
    await expect(backend.get('sid-1')).resolves.toBeNull();
    expect(client.multi).not.toHaveBeenCalled();
  });

  it('get retains JSON syntax failure and read-only behavior', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = attachClient(backend, makeClient({ get: vi.fn(async () => '{secret') }));
    await expect(backend.get('sid-1')).rejects.toBeInstanceOf(SyntaxError);
    expect(client.multi).not.toHaveBeenCalled();
  });

  it.each(['sid', 'userId', 'tenantId', 'membershipId', 'hash', 'generation', 'computedAt', 'permissions'])(
      'get refuses missing or malformed %s with redacted error and no writes', async (field) => {
      const valid: Record<string, unknown> = { sid: 's', userId: 'u', tenantId: 't', membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, permissions: ['read'] };
      const missing = { ...valid }; delete missing[field];
      for (const value of [missing, { ...valid, [field]: { secret: 'do-not-expose' } }]) {
        const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
        const client = attachClient(backend, makeClient({ get: vi.fn(async () => JSON.stringify(value)) }));
        await expect(backend.get('s')).rejects.toEqual(new TypeError('Invalid permission cache record'));
        expect(client.multi).not.toHaveBeenCalled();
      }
    });

  it.each([[], ['read', 1], ['read', null], new Array(1)].map((permissions) => ({ permissions })))('get validates permission population $permissions', async ({ permissions }) => {
    const record = { sid: 's', userId: 'u', tenantId: 't', membershipId: 'm', hash: 'h', generation: 1, computedAt: 0, permissions };
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ get: vi.fn(async () => JSON.stringify(record)) }));
    if (permissions.length === 0) await expect(backend.get('s')).resolves.toEqual(record);
    else await expect(backend.get('s')).rejects.toEqual(new TypeError('Invalid permission cache record'));
  });

  it.each(['9007199254740993', 9007199254740992, ''])('retains allowed generation %s and opaque extension values', async (generation) => {
    const record = { sid: '', userId: '', tenantId: '', membershipId: '', hash: '', generation, computedAt: -0.5, permissions: ['', 'read'], extension: { nested: [null, 1] } };
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ get: vi.fn(async () => JSON.stringify(record)) }));
    await expect(backend.get('s')).resolves.toEqual(record);
  });

  it('set is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(
      backend.set(
        { sid: 's', userId: 'u', tenantId: 't', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 } as never,
        60,
      ),
    ).resolves.toBe(undefined);
  });

  it('set writes record + user/tenant indexes with TTL', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    attachClient(backend, makeClient({ multi: vi.fn(() => multi) }));
    await backend.set(
      { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 } as never,
      60,
    );
    const opNames = ops.map((o) => o.op);
    expect(opNames).toEqual(['set', 'sAdd', 'sAdd', 'expire', 'expire']);
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('delete is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.delete('sid-1')).resolves.toBe(undefined);
  });

  it('delete removes record and (when known) sids from user/tenant indexes', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    const record = { sid: 'sid-1', userId: 'u', tenantId: 't', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    attachClient(
      backend,
      makeClient({
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.delete('sid-1');
    const opNames = ops.map((o) => o.op);
    expect(opNames).toEqual(['del', 'sRem', 'sRem']);
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('delete only deletes the record when no record exists in the index', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    attachClient(
      backend,
      makeClient({ get: vi.fn(async () => null), multi: vi.fn(() => multi) }),
    );
    await backend.delete('sid-1');
    expect(ops.map((o) => o.op)).toEqual(['del']);
  });

  it('invalidateScope is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.invalidateScope('u:t')).resolves.toBe(undefined);
  });

  it('invalidateScope ignores malformed messages without both parts', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient());
    await expect(backend.invalidateScope('')).resolves.toBe(undefined);
    await expect(backend.invalidateScope('only-one')).resolves.toBe(undefined);
  });

  it('invalidateScope handles per-user scope by listing user sids', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    const { multi } = makeMulti();
    attachClient(
      backend,
      makeClient({
        sMembers: vi.fn(async () => ['sid-1']),
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('u-1:t-1');
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('invalidateScope leaves user-indexed records alone when tenant does not match', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi } = makeMulti();
    attachClient(
      backend,
      makeClient({
        sMembers: vi.fn(async () => ['sid-1']),
        get: vi.fn(async () => JSON.stringify({
          sid: 'sid-1',
          userId: 'u-1',
          tenantId: 'other-tenant',
          permissions: [],
          membershipId: 'm', hash: 'h', generation: '1', computedAt: 0,
          expiresAt: 0,
        })),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('u-1:t-1');
    expect(multi.exec).not.toHaveBeenCalledTimes(1);
  });

  it('invalidateScope handles tenant-wide scope (userId=*)', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    const { multi } = makeMulti();
    attachClient(
      backend,
      makeClient({
        sMembers: vi.fn(async () => ['sid-1']),
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:t-1');
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('invalidateScope handles global scope (*:*) by scanning keys', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    const { multi } = makeMulti();

    async function* scanGen() {
      yield ['auth:perms:sid-1'];
    }

    attachClient(
      backend,
      makeClient({
        scanIterator: vi.fn(() => scanGen()) as never,
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:*');
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('invalidateScope accepts scanIterator string keys as well as key arrays', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-2', userId: 'u-2', tenantId: 't-2', permissions: [], membershipId: 'm', hash: 'h', generation: '1', computedAt: 0, expiresAt: 0 };
    const { multi } = makeMulti();

    async function* scanGen() {
      yield 'auth:perms:sid-2';
    }

    attachClient(
      backend,
      makeClient({
        scanIterator: vi.fn(() => scanGen()) as never,
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:*');
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('invalidateScope skips scanned keys that carry no sid suffix', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi } = makeMulti();

    async function* scanGen() {
      yield ['auth:perms:'];
    }

    const client = attachClient(
      backend,
      makeClient({
        scanIterator: vi.fn(() => scanGen()) as never,
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:*');

    expect(client.scanIterator).toHaveBeenCalledWith({ MATCH: 'auth:perms:*' });
    expect(client.get).toHaveBeenCalledTimes(0);
    expect(client.multi).toHaveBeenCalledTimes(0);
    expect(multi.exec).toHaveBeenCalledTimes(0);
  });

  it('subscribe records the handler and re-subscribes when subscriber is present', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const sub = { subscribe: vi.fn(async () => undefined) };
    attachSubscriber(backend, sub);
    const handler = vi.fn(async () => undefined);
    await backend.subscribe(handler);
    expect(sub.subscribe).toHaveBeenCalledWith(
      'permission-invalidation',
      expect.any(Function),
    );
  });

  it('subscribe only records the handler when redis subscriber or options are absent', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    const handler = vi.fn(async () => undefined);
    await backend.subscribe(handler);
    expect((backend as unknown as { onMessage?: unknown }).onMessage).toBe(handler);
  });

  it('publish forwards messages on the configured invalidate channel', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = makeClient();
    attachClient(backend, client);
    await backend.publish('u-1:t-1');
    expect(client.publish).toHaveBeenCalledWith('permission-invalidation', 'u-1:t-1');
  });

  it('publish is a no-op without redis options or without a client', async () => {
    const withoutOptions = new RedisPermissionCacheBackend(makeOptions());
    attachClient(withoutOptions, makeClient());
    await expect(withoutOptions.publish('u-1:t-1')).resolves.toBe(undefined);

    const withoutClient = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await expect(withoutClient.publish('u-1:t-1')).resolves.toBe(undefined);
  });

  it('close quits both client and subscriber when open', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = { isOpen: true, quit: vi.fn(async () => undefined) };
    const sub = { isOpen: true, quit: vi.fn(async () => undefined) };
    Object.defineProperty(backend, 'client', { value: client, writable: true });
    attachSubscriber(backend, sub);
    await backend.close();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(sub.quit).toHaveBeenCalledTimes(1);
  });

  it('close skips quit calls when clients are already closed', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = { isOpen: false, quit: vi.fn(async () => undefined) };
    const sub = { isOpen: false, quit: vi.fn(async () => undefined) };
    Object.defineProperty(backend, 'client', { value: client, writable: true });
    attachSubscriber(backend, sub);
    await backend.close();
    expect(client.quit).not.toHaveBeenCalledTimes(1);
    expect(sub.quit).not.toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy delegates to close', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await expect(backend.onModuleDestroy()).resolves.toBe(undefined);
  });
});
