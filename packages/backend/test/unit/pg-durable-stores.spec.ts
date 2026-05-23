import { PgIdempotencyStore } from '../../src/idempotency/pg-idempotency.store';
import type { IdempotencyDecisionContext, IdempotencySqlExecutor } from '../../src/idempotency/types';
import { PgRateLimitStore } from '../../src/rate-limit/pg-rate-limit.store';
import type { RateLimitDecisionContext, RateLimitSqlExecutor } from '../../src/rate-limit/types';

function idempotencyContext(
  overrides: Partial<IdempotencyDecisionContext> = {},
): IdempotencyDecisionContext {
  return {
    request: { headers: {} },
    idempotencyKey: 'k1',
    requestFingerprint: 'fp-1',
    tenantId: '00000000-0000-0000-0000-000000000001',
    ttlMs: 3000,
    ...overrides,
  };
}

function rateLimitContext(overrides: Partial<RateLimitDecisionContext> = {}): RateLimitDecisionContext {
  return {
    request: { headers: {} },
    bucketKey: 'ip:GET:/items',
    tenantId: '00000000-0000-0000-0000-000000000001',
    ttlMs: 60_000,
    ...overrides,
  };
}

describe('backend durable stores', () => {
  it('covers backend PgIdempotencyStore query branches', async () => {
    expect(() => new PgIdempotencyStore({
      executor: { query: vi.fn() },
      keyColumn: 'bad-key',
    })).toThrow('Invalid SQL identifier');

    const executor: IdempotencySqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce([{ requestFingerprint: 'fp-1', statusCode: null, responseBody: { pending: true }, expiresAt: '2026-01-01T00:00:00.000Z' }])
        .mockResolvedValueOnce({ rows: [{ requestFingerprint: 'fp-1', statusCode: 202, responseBody: { ok: true }, expiresAt: '2026-01-01T00:00:00.000Z' }] })
        .mockResolvedValueOnce({ rows: [{ reserved: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]),
    };
    const store = new PgIdempotencyStore({ executor, table: 'custom.idempotency' });

    await expect(store.lookup(idempotencyContext({ tenantId: undefined }))).resolves.toBe(null);
    await expect(store.reserve(idempotencyContext({ tenantId: undefined }))).resolves.toBe(false);
    await expect(store.persistResponse(idempotencyContext({ tenantId: undefined }), 200, {})).resolves.toBe(false);
    await expect(store.clearReservation(idempotencyContext({ tenantId: undefined }))).resolves.toBe(undefined);
    await expect(store.lookup(idempotencyContext())).resolves.toBe(null);
    await expect(store.lookup(idempotencyContext())).resolves.toMatchObject({
      statusCode: 200,
      body: null,
    });
    await expect(store.lookup(idempotencyContext())).resolves.toMatchObject({
      statusCode: 202,
      body: { ok: true },
    });
    await expect(store.reserve(idempotencyContext())).resolves.toBe(true);
    await expect(store.persistResponse(idempotencyContext(), 204, undefined)).resolves.toBe(true);
    await expect(store.clearReservation(idempotencyContext())).resolves.toBe(undefined);
    expect(executor.query).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM custom.idempotency'),
      expect.arrayContaining(['k1', 'fp-1']),
    );
  });

  it('describes branch: PgIdempotencyStore handles sparse rows and array row counts', async () => {
    const executor: IdempotencySqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce([undefined])
        .mockResolvedValueOnce([{ updated: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ rows: [] }),
    };
    const store = new PgIdempotencyStore({ executor });
    await expect(store.lookup(idempotencyContext())).resolves.toBe(null);
    await expect(store.persistResponse(idempotencyContext(), 201, { ok: true })).resolves.toBe(true);
    await expect(store.persistResponse(idempotencyContext(), 201, { ok: true })).resolves.toBe(false);
    await expect(store.persistResponse(idempotencyContext(), 201, { ok: true })).resolves.toBe(false);
  });

  it('covers backend PgRateLimitStore query branches', async () => {
    expect(() => new PgRateLimitStore({
      executor: { query: vi.fn() },
      table: 'bad-table-name',
    })).toThrow('Invalid SQL identifier');

    const executor: RateLimitSqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ hitCount: 2 }] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(61_000);
    try {
      const store = new PgRateLimitStore({ executor, table: 'custom.rate_windows' });
      await expect(store.increment(rateLimitContext({ tenantId: undefined }))).resolves.toBe(null);
      await expect(store.cleanup(rateLimitContext({ tenantId: undefined }))).resolves.toBe(undefined);
      await expect(store.increment(rateLimitContext())).resolves.toBe(2);
      await expect(store.increment(rateLimitContext())).resolves.toBe(null);
      await expect(store.cleanup(rateLimitContext())).resolves.toBe(undefined);
      expect(executor.query).toHaveBeenLastCalledWith(
        expect.stringContaining('DELETE FROM custom.rate_windows'),
        ['00000000-0000-0000-0000-000000000001'],
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('describes branch: PgRateLimitStore uses default SQL identifiers', async () => {
    const executor: RateLimitSqlExecutor = {
      query: vi.fn(async () => ({ rows: [{ hitCount: 1 }] })),
    };
    const store = new PgRateLimitStore({ executor });
    await expect(store.increment(rateLimitContext())).resolves.toBe(1);
    expect(executor.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO integration.rate_limit_windows'),
      expect.any(Array),
    );
  });
});
