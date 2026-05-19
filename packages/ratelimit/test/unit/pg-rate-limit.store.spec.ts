import { PgRateLimitStore } from '../../src/pg-rate-limit.store';
import type { RateLimitDecisionContext, RateLimitSqlExecutor } from '../../src/types';

function context(overrides: Partial<RateLimitDecisionContext> = {}): RateLimitDecisionContext {
  return {
    request: { headers: {} },
    bucketKey: 'tenant:route',
    tenantId: '00000000-0000-0000-0000-000000000001',
    ttlMs: 60_000,
    scope: 'records',
    cost: 2,
    limit: 5,
    bucket: 'tenant',
    ...overrides,
  };
}

describe('PgRateLimitStore', () => {
  it('validates configured SQL identifiers', () => {
    expect(() => new PgRateLimitStore({
      executor: { query: vi.fn() },
      bucketColumn: 'bad-column',
    })).toThrow('Invalid SQL identifier');
  });

  it('returns an allowed local decision without a tenant', async () => {
    const executor: RateLimitSqlExecutor = { query: vi.fn() };
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    try {
      await expect(new PgRateLimitStore({ executor }).consume(context({
        tenantId: undefined,
      }))).resolves.toEqual({
        allowed: true,
        limit: 5,
        remaining: 3,
        resetAtEpochMs: 70_000,
        retryAfterSeconds: 60,
        used: 2,
      });
      expect(executor.query).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('upserts distributed windows and maps allowed and blocked decisions', async () => {
    const executor: RateLimitSqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ hitCount: 4 }] })
        .mockResolvedValueOnce([{ hitCount: 7 }]),
    };
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(65_000);
    try {
      const store = new PgRateLimitStore({ executor, table: 'custom.rate_windows' });
      await expect(store.consume(context())).resolves.toMatchObject({
        allowed: true,
        remaining: 1,
        resetAtEpochMs: 120_000,
        retryAfterSeconds: 55,
        used: 4,
      });
      await expect(store.consume(context())).resolves.toMatchObject({
        allowed: false,
        remaining: 0,
        used: 7,
      });
      expect(executor.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO custom.rate_windows'),
        expect.arrayContaining(['tenant:route', 2]),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
