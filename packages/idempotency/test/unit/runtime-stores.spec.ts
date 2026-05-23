const redisMock = vi.hoisted(() => {
  const client = {
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
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

import { DatabaseIdempotencyStore } from '../../src/database-idempotency.store';
import { RedisIdempotencyBackend } from '../../src/redis-idempotency.backend';
import type { IdempotencyDecisionContext } from '../../src/types';

function context(overrides: Partial<IdempotencyDecisionContext> = {}): IdempotencyDecisionContext {
  return {
    request: { headers: {} },
    compositeKey: 'tenant-1:k1',
    headerName: 'Idempotency-Key',
    headerValue: 'k1',
    requestFingerprint: 'fp-1',
    tenantId: 'tenant-1',
    routeKey: 'POST:/items',
    ttlMs: 2500,
    ...overrides,
  };
}

function databaseWithRows(rows: unknown[], rowCount = rows.length) {
  const query = vi.fn(async () => ({ rows, rowCount }));
  const tx = vi.fn(async (callback: (trx: { query: typeof query }) => Promise<unknown>) =>
    callback({ query }));
  const withSystemContext = vi.fn(async (_label: string, callback: () => Promise<unknown>) =>
    callback());
  return {
    database: { withSystemContext, tx },
    query,
    tx,
    withSystemContext,
  };
}

describe('DatabaseIdempotencyStore', () => {
  it('returns null/false/noop without a configured database', async () => {
    const store = new DatabaseIdempotencyStore(undefined, { ttlMs: 10_000 });
    await expect(store.lookup(context())).resolves.toBe(null);
    await expect(store.reserve(context())).resolves.toBe(false);
    await expect(store.persistResponse(context(), 200, {}, {})).resolves.toBe(false);
    await expect(store.clearReservation(context())).resolves.toBe(undefined);
  });

  it('maps lookup rows and fallback expiry values inside system transactions', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const empty = databaseWithRows([]);
      await expect(new DatabaseIdempotencyStore(empty.database as never).lookup(context())).resolves.toBe(null);

      const completed = databaseWithRows([{
        request_fingerprint: 'fp-1',
        response: { statusCode: 201, body: { ok: true } },
        response_headers: { 'x-test': '1' },
        status: 'completed',
        expires_at: null,
      }]);
      await expect(new DatabaseIdempotencyStore(completed.database as never, {
        ttlMs: 5000,
      }).lookup(context())).resolves.toEqual({
        requestFingerprint: 'fp-1',
        statusCode: 201,
        body: { ok: true },
        headers: { 'x-test': '1' },
        expiresAt: 3500,
        status: 'completed',
      });
      expect(completed.tx).toHaveBeenCalledWith(expect.any(Function), {
        role: 'owner',
        readonly: true,
        replica: false,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('maps null durable row fields and default expiry fallbacks', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2000);
    try {
      const pending = databaseWithRows([{
        request_fingerprint: null,
        response: null,
        response_headers: null,
        status: 'pending',
        expires_at: '2026-01-01T00:00:00.000Z',
      }]);
      await expect(new DatabaseIdempotencyStore(pending.database as never).lookup(context({
        tenantId: undefined,
      }))).resolves.toMatchObject({
        requestFingerprint: '',
        statusCode: null,
        body: null,
        headers: {},
        expiresAt: Date.parse('2026-01-01T00:00:00.000Z'),
        status: 'pending',
      });
      expect(pending.query).toHaveBeenCalledWith(expect.any(String), [null, 'tenant-1:k1']);

      const defaultTtl = databaseWithRows([{
        request_fingerprint: 'fp-1',
        response: {},
        response_headers: {},
        status: 'completed',
        expires_at: null,
      }]);
      await expect(new DatabaseIdempotencyStore(defaultTtl.database as never).lookup(context({
        ttlMs: undefined as never,
      }))).resolves.toMatchObject({
        expiresAt: 86_402_000,
      });

      const defaultOptionsTtl = databaseWithRows([{
        request_fingerprint: 'fp-1',
        response: {},
        response_headers: {},
        status: 'completed',
        expires_at: null,
      }]);
      await expect(new DatabaseIdempotencyStore(defaultOptionsTtl.database as never, {}).lookup(context({
        ttlMs: undefined as never,
      }))).resolves.toMatchObject({
        expiresAt: 86_402_000,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('reserves, persists bigint-safe responses, and clears reservations', async () => {
    const reserved = databaseWithRows([{ reserved: 1 }], 1);
    const store = new DatabaseIdempotencyStore(reserved.database as never);
    await expect(store.reserve(context())).resolves.toBe(true);
    expect(reserved.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into core.idempotency_keys'),
      expect.arrayContaining(['tenant-1:k1', 'fp-1', 2]),
    );

    const persisted = databaseWithRows([], 1);
    await expect(new DatabaseIdempotencyStore(persisted.database as never).persistResponse(
      context(),
      202,
      { id: 1n },
      { replay: 'true' },
    )).resolves.toBe(true);
    expect(persisted.query).toHaveBeenCalledWith(
      expect.stringContaining('update core.idempotency_keys'),
      expect.arrayContaining(['{"statusCode":202,"body":{"id":"1"}}', '{"replay":"true"}']),
    );

    const cleared = databaseWithRows([], 0);
    await expect(new DatabaseIdempotencyStore(cleared.database as never).clearReservation(context())).resolves.toBe(undefined);
    expect(cleared.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from core.idempotency_keys'),
      expect.arrayContaining(['tenant-1:k1']),
    );
  });

  it('returns false for skipped durable writes and uses null tenant parameters', async () => {
    const unreserved = databaseWithRows([], 0);
    await expect(new DatabaseIdempotencyStore(unreserved.database as never).reserve(context({
      tenantId: undefined,
      ttlMs: 0,
    }))).resolves.toBe(false);
    expect(unreserved.query).toHaveBeenCalledWith(expect.any(String), [
      null,
      'tenant-1:k1',
      'fp-1',
      1,
    ]);

    const notPersisted = databaseWithRows([], undefined);
    await expect(new DatabaseIdempotencyStore(notPersisted.database as never).persistResponse(
      context({ tenantId: undefined, ttlMs: 0 }),
      200,
      { ok: true },
    )).resolves.toBe(false);
    expect(notPersisted.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
      null,
      'tenant-1:k1',
      1,
    ]));

    const persisted = databaseWithRows([], 1);
    await expect(new DatabaseIdempotencyStore(persisted.database as never).persistResponse(
      context(),
      200,
      { ok: true },
    )).resolves.toBe(true);

    const nullRowCount = databaseWithRows([], null as never);
    await expect(new DatabaseIdempotencyStore(nullRowCount.database as never).persistResponse(
      context(),
      200,
      { ok: true },
    )).resolves.toBe(false);

    const cleared = databaseWithRows([], 0);
    await new DatabaseIdempotencyStore(cleared.database as never).clearReservation(context({
      tenantId: undefined,
    }));
    expect(cleared.query).toHaveBeenCalledWith(expect.any(String), [null, 'tenant-1:k1']);
  });
});

describe('RedisIdempotencyBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.client.isOpen = true;
  });

  it('is inert without redis options', async () => {
    const backend = new RedisIdempotencyBackend();
    await backend.onModuleInit();
    await expect(backend.get(context())).resolves.toBe(null);
    await expect(backend.acquireLock(context(), 'token')).resolves.toBe(false);
    await expect(backend.isLocked(context())).resolves.toBe(false);
    await expect(backend.set(context(), {
      requestFingerprint: 'fp-1',
      statusCode: 200,
      body: {},
      headers: {},
      expiresAt: 1,
      status: 'completed',
    })).resolves.toBe(undefined);
    await expect(backend.releaseLock(context(), 'token')).resolves.toBe(undefined);
    await backend.onModuleDestroy();
    expect(redisMock.createClient).not.toHaveBeenCalledTimes(1);
  });

  it('stores entries, manages locks, and closes open redis clients', async () => {
    const backend = new RedisIdempotencyBackend({
      redis: { url: 'redis://localhost:6379', keyPrefix: 'custom' },
    });
    await backend.onModuleInit();
    expect(redisMock.createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(redisMock.client.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(redisMock.client.connect).toHaveBeenCalledTimes(1);

    redisMock.client.get.mockResolvedValueOnce(JSON.stringify({
      requestFingerprint: 'fp-1',
      statusCode: 200,
      body: { ok: true },
      headers: {},
      expiresAt: 1,
      status: 'completed',
    }));
    await expect(backend.get(context())).resolves.toMatchObject({ body: { ok: true } });
    await backend.set(context(), {
      requestFingerprint: 'fp-1',
      statusCode: 200,
      body: { id: 1n },
      headers: {},
      expiresAt: 1,
      status: 'completed',
    });
    expect(redisMock.client.set).toHaveBeenCalledWith(
      'custom:entry:tenant-1:k1',
      expect.stringContaining('"id":"1"'),
      { PX: 2500 },
    );

    redisMock.client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    await expect(backend.acquireLock(context(), 'token')).resolves.toBe(true);
    await expect(backend.acquireLock(context(), 'token')).resolves.toBe(false);

    redisMock.client.get.mockResolvedValueOnce('other').mockResolvedValueOnce('token');
    await backend.releaseLock(context(), 'token');
    expect(redisMock.client.del).not.toHaveBeenCalledTimes(1);
    await backend.releaseLock(context(), 'token');
    expect(redisMock.client.del).toHaveBeenCalledWith('custom:lock:tenant-1:k1');

    redisMock.client.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(backend.isLocked(context())).resolves.toBe(true);
    await expect(backend.isLocked(context())).resolves.toBe(false);

    await backend.onModuleDestroy();
    expect(redisMock.client.quit).toHaveBeenCalledTimes(1);
  });

  it('returns null cache misses and uses the default redis prefix', async () => {
    const backend = new RedisIdempotencyBackend({
      redis: { url: 'redis://localhost:6379' },
    });
    await backend.onModuleInit();

    redisMock.client.get.mockResolvedValueOnce(null);
    await expect(backend.get(context())).resolves.toBe(null);
    expect(redisMock.client.get).toHaveBeenCalledWith('stynx:idempotency:entry:tenant-1:k1');

    redisMock.client.set.mockResolvedValueOnce('OK');
    await expect(backend.acquireLock(context(), 'token')).resolves.toBe(true);
    expect(redisMock.client.set).toHaveBeenCalledWith('stynx:idempotency:lock:tenant-1:k1', 'token', {
      PX: 2500,
      NX: true,
    });
  });
});
