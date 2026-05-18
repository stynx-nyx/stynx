import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';
import type { Mock } from 'vitest';

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
    await expect(backend.onModuleInit()).resolves.toBeUndefined();
  });

  it('onModuleInit does not reconnect when both redis clients are already open', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ isOpen: true, connect: vi.fn() }));
    const sub = attachSubscriber(backend, { isOpen: true, connect: vi.fn() });
    await backend.onModuleInit();
    expect((sub.connect as Mock | undefined)).not.toHaveBeenCalled();
  });

  it('get returns null when no client is configured', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions());
    await expect(backend.get('sid-1')).resolves.toBeNull();
  });

  it('get parses JSON value when present', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u', tenantId: 't', permissions: [], expiresAt: 0 };
    attachClient(backend, makeClient({ get: vi.fn(async () => JSON.stringify(record)) }));
    await expect(backend.get('sid-1')).resolves.toEqual(record);
  });

  it('get returns null when redis returns nothing', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    attachClient(backend, makeClient({ get: vi.fn(async () => null) }));
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
    attachClient(backend, makeClient({ multi: vi.fn(() => multi) }));
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
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
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
      makeClient({ get: vi.fn(async () => null), multi: vi.fn(() => multi) }),
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
        sMembers: vi.fn(async () => ['sid-1']),
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('u-1:t-1');
    expect(multi.exec).toHaveBeenCalled();
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
          expiresAt: 0,
        })),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('u-1:t-1');
    expect(multi.exec).not.toHaveBeenCalled();
  });

  it('invalidateScope handles tenant-wide scope (userId=*)', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-1', userId: 'u-1', tenantId: 't-1', permissions: [], expiresAt: 0 };
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
        scanIterator: vi.fn(() => scanGen()) as never,
        get: vi.fn(async () => JSON.stringify(record)),
        multi: vi.fn(() => multi),
      }),
    );
    await backend.invalidateScope('*:*');
    expect(multi.exec).toHaveBeenCalled();
  });

  it('invalidateScope accepts scanIterator string keys as well as key arrays', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const record = { sid: 'sid-2', userId: 'u-2', tenantId: 't-2', permissions: [], expiresAt: 0 };
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
    expect(multi.exec).toHaveBeenCalled();
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
    await expect(withoutOptions.publish('u-1:t-1')).resolves.toBeUndefined();

    const withoutClient = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await expect(withoutClient.publish('u-1:t-1')).resolves.toBeUndefined();
  });

  it('close quits both client and subscriber when open', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = { isOpen: true, quit: vi.fn(async () => undefined) };
    const sub = { isOpen: true, quit: vi.fn(async () => undefined) };
    Object.defineProperty(backend, 'client', { value: client, writable: true });
    attachSubscriber(backend, sub);
    await backend.close();
    expect(client.quit).toHaveBeenCalled();
    expect(sub.quit).toHaveBeenCalled();
  });

  it('close skips quit calls when clients are already closed', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    const client = { isOpen: false, quit: vi.fn(async () => undefined) };
    const sub = { isOpen: false, quit: vi.fn(async () => undefined) };
    Object.defineProperty(backend, 'client', { value: client, writable: true });
    attachSubscriber(backend, sub);
    await backend.close();
    expect(client.quit).not.toHaveBeenCalled();
    expect(sub.quit).not.toHaveBeenCalled();
  });

  it('onModuleDestroy delegates to close', async () => {
    const backend = new RedisPermissionCacheBackend(makeOptions(redisOpts));
    await expect(backend.onModuleDestroy()).resolves.toBeUndefined();
  });
});
