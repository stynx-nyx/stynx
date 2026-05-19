const redisMock = vi.hoisted(() => {
  const client = {
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    scriptLoad: vi.fn(async () => 'sha-1'),
    evalSha: vi.fn(),
    quit: vi.fn(async () => undefined),
  };
  return {
    client,
    createClient: vi.fn(() => client),
  };
});

vi.mock('redis', () => ({
  createClient: redisMock.createClient,
}));

import { RedisSlidingWindowRateLimitStore } from '../../src/redis-rate-limit.store';
import type { RateLimitDecisionContext } from '../../src/types';

function context(overrides: Partial<RateLimitDecisionContext> = {}): RateLimitDecisionContext {
  return {
    request: { headers: {} },
    bucketKey: 'tenant:route',
    tenantId: 'tenant-1',
    ttlMs: 60_000,
    scope: 'records',
    cost: 2,
    limit: 5,
    bucket: 'tenant',
    ...overrides,
  };
}

describe('RedisSlidingWindowRateLimitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.client.isOpen = true;
  });

  it('does not initialize a Redis client without redis options', async () => {
    const store = new RedisSlidingWindowRateLimitStore();
    await store.onModuleInit();
    await expect(store.consume(context())).rejects.toThrow('not configured');
    await store.onModuleDestroy();
    expect(redisMock.createClient).not.toHaveBeenCalled();
  });

  it('loads the sliding-window script, maps Redis numeric responses, and quits open clients', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    try {
      const store = new RedisSlidingWindowRateLimitStore({
        redis: { url: 'redis://localhost:6379', keyPrefix: 'custom' },
      });
      await store.onModuleInit();
      expect(redisMock.createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
      expect(redisMock.client.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(redisMock.client.connect).toHaveBeenCalled();
      expect(redisMock.client.scriptLoad).toHaveBeenCalledWith(expect.stringContaining('ZRANGEBYSCORE'));

      redisMock.client.evalSha
        .mockResolvedValueOnce([1, '5', 3, '70000', 60, 2])
        .mockResolvedValueOnce([0, 5, 0, 70_000, 60, 7])
        .mockResolvedValueOnce([]);

      await expect(store.consume(context())).resolves.toEqual({
        allowed: true,
        limit: 5,
        remaining: 3,
        resetAtEpochMs: 70_000,
        retryAfterSeconds: 60,
        used: 2,
      });
      expect(redisMock.client.evalSha).toHaveBeenNthCalledWith(1, 'sha-1', {
        keys: [
          'custom:tenant:records:tenant:route:events',
          'custom:tenant:records:tenant:route:weights',
          'custom:tenant:records:tenant:route:total',
        ],
        arguments: ['10000', '60000', '5', '2', '10000:1'],
      });

      await expect(store.consume(context())).resolves.toMatchObject({
        allowed: false,
        used: 7,
      });
      await expect(store.consume(context())).resolves.toMatchObject({
        allowed: false,
        limit: 5,
        remaining: 3,
        resetAtEpochMs: 70_000,
        retryAfterSeconds: 60,
        used: 2,
      });

      await store.onModuleDestroy();
      expect(redisMock.client.quit).toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('skips quit for closed clients', async () => {
    const store = new RedisSlidingWindowRateLimitStore({
      redis: { url: 'redis://localhost:6379' },
    });
    await store.onModuleInit();
    redisMock.client.isOpen = false;
    await store.onModuleDestroy();
    expect(redisMock.client.quit).not.toHaveBeenCalled();
  });
});
