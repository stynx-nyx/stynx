// vi.hoisted: see note in packages/core/test/unit/config-ssm.spec.ts
const mockCreateClient = vi.hoisted(() => vi.fn());

vi.mock('redis', () => ({
  createClient: mockCreateClient,
}));

import { RedisSessionStore } from '../../src/redis-session-store';
import type { SessionRecord } from '../../src/types';
import { resolveSessionsOptions } from '../../src/types';

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = new Date('2026-05-18T12:00:00.000Z').toISOString();
  return {
    sid: 'sid-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    cognitoSub: 'cognito-1',
    refreshFamilyId: 'family-1',
    refreshTokenHash: 'hash-1',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    expiresAt: new Date('2026-05-18T13:00:00.000Z').toISOString(),
    idleExpiresAt: new Date('2026-05-18T12:30:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeClient() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const multiCalls: string[] = [];
  const multiTx = {
    set: vi.fn((key: string, value: string) => {
      multiCalls.push(`set:${key}`);
      values.set(key, value);
      return multiTx;
    }),
    expireAt: vi.fn(() => multiTx),
    sAdd: vi.fn((key: string, value: string) => {
      const bucket = sets.get(key) ?? new Set<string>();
      bucket.add(value);
      sets.set(key, bucket);
      return multiTx;
    }),
    sRem: vi.fn((key: string, value: string | string[]) => {
      for (const item of Array.isArray(value) ? value : [value]) {
        sets.get(key)?.delete(item);
      }
      return multiTx;
    }),
    del: vi.fn((key: string) => {
      values.delete(key);
      return multiTx;
    }),
    exec: vi.fn(async () => undefined),
  };
  const client = {
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    multi: vi.fn(() => multiTx),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    sMembers: vi.fn(async (key: string) => [...(sets.get(key) ?? new Set<string>())]),
    exists: vi.fn(async (key: string) => values.has(key) ? 1 : 0),
    sRem: vi.fn(async (key: string, valuesToRemove: string[]) => {
      for (const value of valuesToRemove) sets.get(key)?.delete(value);
    }),
    publish: vi.fn(async () => 1),
    values,
    sets,
    multiTx,
    multiCalls,
  };
  mockCreateClient.mockReturnValue(client);
  return client;
}

function makeStore() {
  return new RedisSessionStore(resolveSessionsOptions({
    issuer: 'https://sessions.test',
    redis: {
      url: 'redis://127.0.0.1:6379',
      keyPrefix: 'test',
      invalidateChannel: 'invalidate',
    },
    jwt: {
      keySet: { currentKid: 'kid', keys: [] },
    },
  }));
}

describe('RedisSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires initialization and closes only open clients', async () => {
    const store = makeStore();
    await expect(store.getSession('sid-1')).rejects.toThrow('RedisSessionStore has not been initialized');

    const client = makeClient();
    await store.onModuleInit();
    expect(mockCreateClient).toHaveBeenCalledWith({ url: 'redis://127.0.0.1:6379' });
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    (client.on.mock.calls[0]?.[1] as () => void)();
    await store.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);

    client.isOpen = false;
    await store.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('creates, rotates, touches, revokes, indexes, and publishes sessions', async () => {
    const client = makeClient();
    const store = makeStore();
    await store.onModuleInit();
    await store.createSession(record());

    await expect(store.getSession('sid-1')).resolves.toMatchObject({ sid: 'sid-1' });
    await expect(store.lookupRefreshToken('hash-1')).resolves.toMatchObject({ sid: 'sid-1', state: 'active' });
    await expect(store.rotateRefreshToken('sid-1', 'wrong', 'hash-2', '2026-05-18T12:40:00.000Z', '2026-05-18T12:01:00.000Z')).resolves.toBeNull();
    await expect(store.rotateRefreshToken('sid-1', 'hash-1', 'hash-2', '2026-05-18T12:40:00.000Z', '2026-05-18T12:01:00.000Z')).resolves.toMatchObject({
      refreshTokenHash: 'hash-2',
    });
    await expect(store.touchSession('missing', '2026-05-18T12:50:00.000Z', '2026-05-18T12:02:00.000Z')).resolves.toBeNull();
    await expect(store.touchSession('sid-1', '2026-05-18T12:50:00.000Z', '2026-05-18T12:02:00.000Z')).resolves.toMatchObject({
      idleExpiresAt: '2026-05-18T12:50:00.000Z',
    });
    await expect(store.listSessionIdsByUser('user-1')).resolves.toEqual(['sid-1']);
    await expect(store.listSessionIdsByTenant('tenant-1')).resolves.toEqual(['sid-1']);
    await expect(store.revokeSession('missing', '2026-05-18T12:03:00.000Z', 'revoked')).resolves.toBeNull();
    await expect(store.revokeSession('sid-1', '2026-05-18T12:03:00.000Z', 'revoked')).resolves.toMatchObject({
      status: 'revoked',
    });
    await store.publishInvalidation('user-1:tenant-1');

    expect(client.publish).toHaveBeenCalledWith('invalidate', 'user-1:tenant-1');
    expect(client.multiTx.exec).toHaveBeenCalled();
  });

  it('prunes stale ids from indexes', async () => {
    const client = makeClient();
    const store = makeStore();
    await store.onModuleInit();
    client.sets.set('test:sessions_by_user:user-1', new Set(['active', 'stale']));
    client.values.set('test:session:active', JSON.stringify(record({ sid: 'active' })));

    await expect(store.listSessionIdsByUser('user-1')).resolves.toEqual(['active']);
    expect(client.sRem).toHaveBeenCalledWith('test:sessions_by_user:user-1', ['stale']);
  });
});
