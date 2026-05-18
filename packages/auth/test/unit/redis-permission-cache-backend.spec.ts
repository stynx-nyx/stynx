import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';

function makeOptions(redis?: { url: string; invalidateChannel: string; keyPrefix: string }) {
  return {
    redis,
  } as never;
}

function makeMulti() {
  const ops: Array<{ op: string; args: unknown[] }> = [];
  const multi: Record<string, jest.Mock> = {};
  for (const op of ['set', 'sAdd', 'expire', 'del', 'sRem']) {
    multi[op] = jest.fn((...args: unknown[]) => {
      ops.push({ op, args });
      return multi;
    });
  }
  multi.exec = jest.fn(async () => undefined);
  return { multi, ops };
}

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isOpen: true,
    get: jest.fn(async () => null),
    sMembers: jest.fn(async () => []),
    publish: jest.fn(async () => undefined),
    scanIterator: jest.fn(),
    multi: jest.fn(),
    ...overrides,
  };
}

function attachClient(backend: RedisPermissionCacheBackend, client: ReturnType<typeof makeClient>) {
  Object.defineProperty(backend, 'client', { value: client, writable: true });
  return client;
}

describe('RedisPermissionCacheBackend', () => {
  const redisOpts = {
    url: 'redis://localhost:6379',
    invalidateChannel: 'permission-invalidation',
    keyPrefix: 'auth',
  };

  it('onModuleInit is a no-op when redis options are absent', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.onModuleInit()).resolves.toBeUndefined();
  });

  it('get returns null when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.get('sid-1')).resolves.toBeNull();
  });

  it('get parses JSON value when present', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u', tenantId: 't', permissions: [], expiresAt: 0 };
    attachClient(backend, makeClient({ get: jest.fn(async () => JSON.stringify(record)) }));
    await expect(backend.get('sid-1')).resolves.toEqual(record);
  });

  it('get returns null when redis returns nothing', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ get: jest.fn(async () => null) }));
    await expect(backend.get('sid-1')).resolves.toBeNull();
  });

  it('set is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(
      backend.set(
        { sid: 's', userId: 'u', tenantId: 't', permissions: [], expiresAt: 0 } as never,
        60,
      ),
    ).resolves.toBeUndefined();
  });

  it('set writes record + user/tenant indexes with TTL', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    attachClient(backend, makeClient({ multi: jest.fn(() => multi) }));
    await backend.set(
      { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], expiresAt: 0 } as never,
      60,
    );
    const opNames = ops.map((o) => o.op);
    expect(opNames).toEqual(['set', 'sAdd', 'sAdd', 'expire', 'expire']);
    expect(multi.exec).toHaveBeenCalled();
  });

  it('delete is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.delete('sid-1')).resolves.toBeUndefined();
  });

  it('delete removes record and (when known) sids from user/tenant indexes', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    const record = { sid: 'sid-1', userId: 'u', tenantId: 't', permissions: [], expiresAt: 0 };
    attachClient(
      backend,
      makeClient({
        get: jest.fn(async () => JSON.stringify(record)),
        multi: jest.fn(() => multi),
      }),
    );
    await backend.delete('sid-1');
    const opNames = ops.map((o) => o.op);
    expect(opNames).toEqual(['del', 'sRem', 'sRem']);
    expect(multi.exec).toHaveBeenCalled();
  });

  it('delete only deletes the record when no record exists in the index', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const { multi, ops } = makeMulti();
    attachClient(
      backend,
      makeClient({ get: jest.fn(async () => null), multi: jest.fn(() => multi) }),
    );
    await backend.delete('sid-1');
    expect(ops.map((o) => o.op)).toEqual(['del']);
  });

  it('invalidateScope is a no-op when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.invalidateScope('u:t')).resolves.toBeUndefined();
  });

  it('invalidateScope ignores malformed messages without both parts', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient());
    await expect(backend.invalidateScope('')).resolves.toBeUndefined();
    await expect(backend.invalidateScope('only-one')).resolves.toBeUndefined();
  });

  it('invalidateScope handles per-user scope by listing user sids', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], expiresAt: 0 };
    const { multi } = makeMulti();
    attachClient(
      backend,
      makeClient({
        sMembers: jest.fn(async () => ['sid-1']),
        get: jest.fn(async () => JSON.stringify(record)),
        multi: jest.fn(() => multi),
      }),
    );
    await backend.invalidateScope('u-1:t-1');
    expect(multi.exec).toHaveBeenCalled();
  });

  it('invalidateScope handles tenant-wide scope (userId=*)', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], expiresAt: 0 };
    const { multi } = makeMulti();
    attachClient(
      backend,
      makeClient({
        sMembers: jest.fn(async () => ['sid-1']),
        get: jest.fn(async () => JSON.stringify(record)),
        multi: jest.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:t-1');
    expect(multi.exec).toHaveBeenCalled();
  });

  it('invalidateScope handles global scope (*:*) by scanning keys', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], expiresAt: 0 };
    const { multi } = makeMulti();

    async function* scanGen() {
      yield ['auth:perms:sid-1'];
    }

    attachClient(
      backend,
      makeClient({
        scanIterator: jest.fn(() => scanGen()) as never,
        get: jest.fn(async () => JSON.stringify(record)),
        multi: jest.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:*');
    expect(multi.exec).toHaveBeenCalled();
  });

  it('subscribe records the handler and re-subscribes when subscriber is present', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const sub = { subscribe: jest.fn(async () => undefined) };
    Object.defineProperty(backend, 'subscriber', { value: sub, writable: true });
    const handler = jest.fn(async () => undefined);
    await backend.subscribe(handler);
    expect(sub.subscribe).toHaveBeenCalledWith(
      'permission-invalidation',
      expect.any(Function),
    );
  });

  it('publish forwards messages on the configured invalidate channel', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = makeClient();
    attachClient(backend, client);
    await backend.publish('u-1:t-1');
    expect(client.publish).toHaveBeenCalledWith('permission-invalidation', 'u-1:t-1');
  });

  it('close quits both client and subscriber when open', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = { isOpen: true, quit: jest.fn(async () => undefined) };
    const sub = { isOpen: true, quit: jest.fn(async () => undefined) };
    Object.defineProperty(backend, 'client', { value: client, writable: true });
    Object.defineProperty(backend, 'subscriber', { value: sub, writable: true });
    await backend.close();
    expect(client.quit).toHaveBeenCalled();
    expect(sub.quit).toHaveBeenCalled();
  });

  it('onModuleDestroy delegates to close', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await expect(backend.onModuleDestroy()).resolves.toBeUndefined();
  });
});
