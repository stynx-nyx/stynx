import { PermissionCache } from '../../src/permission-cache';
import { PermissionCacheMetrics } from '../../src/permission-cache-metrics';
import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';
import type { PermissionQueryService } from '../../src/permission-query.service';

describe('PermissionCache', () => {
  it('serves a matching in-memory record without recomputing and records the in-memory metric', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn().mockResolvedValue({ hash: 'hash-read', generation: 1 }),
    } as unknown as PermissionQueryService;
    const metrics = new PermissionCacheMetrics();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      metrics,
    );

    await cache.prime(
      {
        sid: 'sid-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        permissions: ['document:read:*'],
        hash: 'hash-read',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );

    const record = await cache.getForSession({
      sid: 'sid-1',
      sub: 'user-1',
      tenantId: 'tenant-1',
      permsHash: 'hash-read',
      claims: {},
    });

    expect(record.permissions).toEqual(['document:read:*']);
    expect(queries.resolveForUser).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toEqual({ in_memory: 1, redis: 0, db: 0 });
  });

  it('hydrates from the backend when the in-memory entry is absent and records the redis metric', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn().mockResolvedValue({ hash: 'hash-read', generation: 1 }),
    } as unknown as PermissionQueryService;
    const metrics = new PermissionCacheMetrics();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      metrics,
    );

    await backend.set({
      sid: 'sid-redis',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      permissions: ['document:read:*'],
      hash: 'hash-read',
      generation: 1,
      computedAt: Date.now(),
    });

    const record = await cache.getForSession({
      sid: 'sid-redis',
      sub: 'user-1',
      tenantId: 'tenant-1',
      permsHash: 'hash-read',
      claims: {},
    });

    expect(record.permissions).toEqual(['document:read:*']);
    expect(queries.resolveForUser).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toEqual({ in_memory: 0, redis: 1, db: 0 });
    await expect(cache.inspectSid('sid-redis')).resolves.toMatchObject({ sid: 'sid-redis' });
  });

  it('invalidates fan-out for 100 sessions in the same tenant', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn().mockResolvedValue({ hash: 'hash', generation: 1 }),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      new PermissionCacheMetrics(),
    );

    await cache.onModuleInit();
    for (let index = 0; index < 100; index += 1) {
      await cache.prime(
        {
          sid: `sid-${index}`,
          userId: `user-${index}`,
          tenantId: 'tenant-1',
          membershipId: `membership-${index}`,
          permissions: ['document:read:*'],
          hash: 'hash-read',
          generation: 1,
          computedAt: Date.now(),
        },
        new Date(Date.now() + 60_000).toISOString(),
      );
    }

    await cache.publishInvalidation('*:tenant-1');

    for (let index = 0; index < 100; index += 1) {
      await expect(cache.inspectSid(`sid-${index}`)).resolves.toBeNull();
    }
  });

  it('falls back to DB resolution when the backend is unavailable and records the db tier metric', async () => {
    const backend = {
      get: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateScope: jest.fn(),
      subscribe: jest.fn(),
      publish: jest.fn(),
      close: jest.fn(),
    };
    const queries = {
      resolveForUser: jest.fn().mockResolvedValue({
        membershipId: 'membership-1',
        permissions: ['document:read:*'],
        hash: 'hash-read',
        generation: 2,
      }),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const metrics = new PermissionCacheMetrics();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      metrics,
    );

    const record = await cache.getForSession({
      sid: 'sid-1',
      sub: 'user-1',
      tenantId: 'tenant-1',
      permsHash: 'stale-hash',
      claims: {},
    });

    expect(record.permissions).toEqual(['document:read:*']);
    expect(metrics.snapshot().db).toBe(1);
  });

  it('rethrows backend failures when DB fallback is disabled', async () => {
    const backend = {
      get: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateScope: jest.fn(),
      subscribe: jest.fn(),
      publish: jest.fn(),
      close: jest.fn(),
    };
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: false },
      },
      backend,
      queries,
      new PermissionCacheMetrics(),
    );

    await expect(
      cache.getForSession({
        sid: 'sid-1',
        sub: 'user-1',
        tenantId: 'tenant-1',
        permsHash: 'hash-read',
        claims: {},
      }),
    ).rejects.toThrow('redis unavailable');
  });

  it('recomputes when cached permissions do not match the token hash', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const queries = {
      resolveForUser: jest.fn().mockResolvedValue({
        membershipId: 'membership-1',
        permissions: ['document:write:*'],
        hash: 'fresh-hash',
        generation: 2,
      }),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const metrics = new PermissionCacheMetrics();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      metrics,
    );

    await cache.prime(
      {
        sid: 'sid-stale',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        permissions: ['document:read:*'],
        hash: 'stale-hash',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );

    await expect(
      cache.getForSession({
        sid: 'sid-stale',
        sub: 'user-1',
        tenantId: 'tenant-1',
        permsHash: 'fresh-hash',
        claims: {},
      }),
    ).resolves.toMatchObject({
      permissions: ['document:write:*'],
      hash: 'fresh-hash',
    });
    expect(queries.resolveForUser).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(metrics.snapshot()).toEqual({ in_memory: 0, redis: 0, db: 1 });
  });

  it('invalidates a single sid in memory and backend storage', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const deleteSpy = jest.spyOn(backend, 'delete');
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      { resolveForUser: jest.fn(), probeHash: jest.fn() } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );

    await cache.prime(
      {
        sid: 'sid-delete',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        permissions: ['document:read:*'],
        hash: 'hash',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );

    await cache.invalidateSid('sid-delete');

    expect(deleteSpy).toHaveBeenCalledWith('sid-delete');
    await expect(cache.inspectSid('sid-delete')).resolves.toBeNull();
  });

  it('clears all cached sessions on global invalidation and ignores malformed invalidation messages', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const invalidateScope = jest.spyOn(backend, 'invalidateScope');
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn().mockResolvedValue({ hash: 'hash', generation: 1 }),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      new PermissionCacheMetrics(),
    );

    await cache.onModuleInit();
    await cache.prime(
      {
        sid: 'sid-a',
        userId: 'user-a',
        tenantId: 'tenant-a',
        membershipId: 'membership-a',
        permissions: ['document:read:*'],
        hash: 'hash',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );
    await cache.prime(
      {
        sid: 'sid-b',
        userId: 'user-b',
        tenantId: 'tenant-b',
        membershipId: 'membership-b',
        permissions: ['document:read:*'],
        hash: 'hash',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );

    await cache.publishInvalidation('malformed-message');
    await expect(cache.inspectSid('sid-a')).resolves.toMatchObject({ sid: 'sid-a' });
    expect(invalidateScope).not.toHaveBeenCalled();

    await cache.publishInvalidation('*:*');

    expect(invalidateScope).toHaveBeenCalledWith('*:*');
    await expect(cache.inspectSid('sid-a')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-b')).resolves.toBeNull();
  });

  it('invalidates only matching sessions for user and tenant scoped messages', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      {
        resolveForUser: jest.fn(),
        probeHash: jest.fn().mockResolvedValue({ hash: 'hash', generation: 1 }),
      } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );

    await cache.onModuleInit();
    for (const record of [
      { sid: 'sid-a', userId: 'user-a', tenantId: 'tenant-a' },
      { sid: 'sid-b', userId: 'user-b', tenantId: 'tenant-a' },
      { sid: 'sid-c', userId: 'user-a', tenantId: 'tenant-b' },
    ]) {
      await cache.prime(
        {
          ...record,
          membershipId: `${record.sid}-membership`,
          permissions: ['document:read:*'],
          hash: 'hash',
          generation: 1,
          computedAt: Date.now(),
        },
        new Date(Date.now() + 60_000).toISOString(),
      );
    }

    await cache.publishInvalidation('user-a:tenant-a');

    await expect(cache.inspectSid('sid-a')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-b')).resolves.toMatchObject({ sid: 'sid-b' });
    await expect(cache.inspectSid('sid-c')).resolves.toMatchObject({ sid: 'sid-c' });
  });

  it('expires in-memory entries and clamps backend ttl to at least one second', async () => {
    const startedAt = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(startedAt);
    const backend = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateScope: jest.fn(),
      subscribe: jest.fn(),
      publish: jest.fn(),
      close: jest.fn(),
    };
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      { resolveForUser: jest.fn(), probeHash: jest.fn() } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );
    const record = {
      sid: 'sid-expiring',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      permissions: ['document:read:*'],
      hash: 'hash',
      generation: 1,
      computedAt: startedAt,
    };

    await cache.prime(record, new Date(startedAt + 60_000).toISOString());
    expect(backend.set).toHaveBeenLastCalledWith(record, 60);
    await expect(cache.inspectSid('sid-expiring')).resolves.toMatchObject({ sid: 'sid-expiring' });

    await cache.prime(record, new Date(startedAt - 1).toISOString());
    expect(backend.set).toHaveBeenCalledWith(record, 1);
    await expect(cache.inspectSid('sid-expiring')).resolves.toMatchObject({ sid: 'sid-expiring' });

    nowSpy.mockReturnValue(startedAt + 5_000);
    backend.get.mockResolvedValue(null);
    await expect(cache.inspectSid('sid-expiring')).resolves.toBeNull();
    nowSpy.mockRestore();
  });

  it('evicts the oldest in-memory entry when the local cache reaches capacity', async () => {
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      null,
      { resolveForUser: jest.fn(), probeHash: jest.fn() } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );
    const internalCache = (cache as unknown as { inMemory: { constructor: new (ttlMs: number, maxSize: number) => unknown } }).inMemory;
    (cache as unknown as { inMemory: unknown }).inMemory = new internalCache.constructor(60_000, 2);

    for (const sid of ['sid-a', 'sid-b', 'sid-c']) {
      await cache.prime(
        {
          sid,
          userId: sid,
          tenantId: 'tenant-1',
          membershipId: `${sid}-membership`,
          permissions: ['document:read:*'],
          hash: 'hash',
          generation: 1,
          computedAt: Date.now(),
        },
        new Date(Date.now() + 60_000).toISOString(),
      );
    }

    await expect(cache.inspectSid('sid-a')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-b')).resolves.toMatchObject({ sid: 'sid-b' });
    await expect(cache.inspectSid('sid-c')).resolves.toMatchObject({ sid: 'sid-c' });
  });

  it('writes recomputed records to the backend with the one-day fallback ttl', async () => {
    const backend = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateScope: jest.fn(),
      subscribe: jest.fn(),
      publish: jest.fn(),
      close: jest.fn(),
    };
    const queries = {
      resolveForUser: jest.fn().mockResolvedValue({
        membershipId: 'membership-db',
        permissions: ['document:read:*'],
        hash: 'hash-db',
        generation: 9,
      }),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      queries,
      new PermissionCacheMetrics(),
    );

    await expect(
      cache.getForSession({
        sid: 'sid-db',
        sub: 'user-db',
        tenantId: 'tenant-db',
        permsHash: 'hash-token',
        claims: {},
      }),
    ).resolves.toMatchObject({ sid: 'sid-db', hash: 'hash-db' });
    expect(backend.set).toHaveBeenCalledWith(expect.objectContaining({ sid: 'sid-db' }), 24 * 60 * 60);
  });

  it('keeps a cached record when the drift probe has no active membership hash', async () => {
    const startedAt = 2_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(startedAt);
    const queries = {
      resolveForUser: jest.fn(),
      probeHash: jest.fn().mockResolvedValue({ hash: null, generation: 0 }),
    } as unknown as PermissionQueryService;
    const metrics = new PermissionCacheMetrics();
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      null,
      queries,
      metrics,
    );

    await cache.prime(
      {
        sid: 'sid-no-drift',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        permissions: ['document:read:*'],
        hash: 'hash',
        generation: 1,
        computedAt: startedAt,
      },
      new Date(startedAt + 60_000).toISOString(),
    );
    nowSpy.mockReturnValue(startedAt + 1_001);

    await expect(
      cache.getForSession({
        sid: 'sid-no-drift',
        sub: 'user-1',
        tenantId: 'tenant-1',
        claims: {},
      }),
    ).resolves.toMatchObject({ sid: 'sid-no-drift', hash: 'hash' });
    expect(queries.probeHash).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(queries.resolveForUser).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toEqual({ in_memory: 1, redis: 0, db: 0 });
    nowSpy.mockRestore();
  });

  it('recomputes when the cached hash probe detects drift before querying the database again', async () => {
    const queries = {
      resolveForUser: jest.fn().mockResolvedValue({
        membershipId: 'membership-fresh',
        permissions: ['document:write:*'],
        hash: 'fresh-hash',
        generation: 2,
      }),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      null,
      queries,
      new PermissionCacheMetrics(),
    );
    await cache.prime(
      {
        sid: 'sid-drift',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-old',
        permissions: ['document:read:*'],
        hash: 'old-hash',
        generation: 1,
        computedAt: Date.now(),
      },
      new Date(Date.now() + 60_000).toISOString(),
    );
    (cache as unknown as { hashProbe: { set(key: string, value: unknown): void } }).hashProbe.set('user-1:tenant-1', {
      hash: 'fresh-hash',
      generation: 2,
    });

    await expect(
      cache.getForSession({
        sid: 'sid-drift',
        sub: 'user-1',
        tenantId: 'tenant-1',
        claims: {},
      }),
    ).resolves.toMatchObject({ hash: 'fresh-hash', permissions: ['document:write:*'] });
    expect(queries.probeHash).not.toHaveBeenCalled();
    expect(queries.resolveForUser).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('keeps wildcard invalidations scoped to the requested user or tenant', async () => {
    let subscriber: ((message: string) => Promise<void>) | undefined;
    const backend = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateScope: jest.fn(),
      subscribe: jest.fn(async (handler: (message: string) => Promise<void>) => {
        subscriber = handler;
      }),
      publish: jest.fn(async (message: string) => {
        await subscriber?.(message);
      }),
      close: jest.fn(),
    };
    const invalidateScope = backend.invalidateScope;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      {
        resolveForUser: jest.fn(),
        probeHash: jest.fn().mockResolvedValue({ hash: 'hash', generation: 1 }),
      } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );
    await cache.onModuleInit();
    for (const record of [
      { sid: 'sid-a1', userId: 'user-a', tenantId: 'tenant-a' },
      { sid: 'sid-a2', userId: 'user-b', tenantId: 'tenant-a' },
      { sid: 'sid-b1', userId: 'user-a', tenantId: 'tenant-b' },
      { sid: 'sid-b2', userId: 'user-b', tenantId: 'tenant-b' },
    ]) {
      await cache.prime(
        {
          ...record,
          membershipId: `${record.sid}-membership`,
          permissions: ['document:read:*'],
          hash: 'hash',
          generation: 1,
          computedAt: Date.now(),
        },
        new Date(Date.now() + 60_000).toISOString(),
      );
    }

    await cache.publishInvalidation('*:tenant-a');

    await expect(cache.inspectSid('sid-a1')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-a2')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-b1')).resolves.toMatchObject({ sid: 'sid-b1' });
    await expect(cache.inspectSid('sid-b2')).resolves.toMatchObject({ sid: 'sid-b2' });
    expect(invalidateScope).toHaveBeenLastCalledWith('*:tenant-a');

    await cache.publishInvalidation('user-a:*');

    await expect(cache.inspectSid('sid-b1')).resolves.toBeNull();
    await expect(cache.inspectSid('sid-b2')).resolves.toMatchObject({ sid: 'sid-b2' });
    expect(invalidateScope).toHaveBeenLastCalledWith('user-a:*');
  });

  it('closes the backend on module destroy', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const closeSpy = jest.spyOn(backend, 'close');
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: { dbFallbackOnRedisDown: true },
      },
      backend,
      { resolveForUser: jest.fn(), probeHash: jest.fn() } as unknown as PermissionQueryService,
      new PermissionCacheMetrics(),
    );

    await cache.onModuleDestroy();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('proactively re-syncs stale in-memory permission entries', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));

    const backend = new InMemoryPermissionCacheBackend();
    const queries = {
      resolveForUser: jest.fn().mockResolvedValue({
        membershipId: 'membership-fresh',
        permissions: ['document:write:*'],
        hash: 'fresh-hash',
        generation: 2,
      }),
      probeHash: jest.fn(),
    } as unknown as PermissionQueryService;
    const cache = new PermissionCache(
      {
        stynx: { issuer: 'https://stynx.test' },
        permissions: {
          dbFallbackOnRedisDown: true,
          driftResyncIntervalMs: 100,
        },
      },
      backend,
      queries,
      new PermissionCacheMetrics(),
    );

    try {
      await cache.prime(
        {
          sid: 'sid-resync',
          userId: 'user-1',
          tenantId: 'tenant-1',
          membershipId: 'membership-stale',
          permissions: ['document:read:*'],
          hash: 'stale-hash',
          generation: 1,
          computedAt: Date.now() - 200,
        },
        new Date(Date.now() + 60_000).toISOString(),
      );

      await cache.onModuleInit();
      await jest.advanceTimersByTimeAsync(100);

      expect(queries.resolveForUser).toHaveBeenCalledWith('user-1', 'tenant-1');
      await expect(cache.inspectSid('sid-resync')).resolves.toMatchObject({
        membershipId: 'membership-fresh',
        permissions: ['document:write:*'],
        hash: 'fresh-hash',
        generation: 2,
        computedAt: Date.now(),
      });
    } finally {
      await cache.onModuleDestroy();
      jest.useRealTimers();
    }
  });
});
