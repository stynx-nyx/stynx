import { QueryRowValidationError } from '@stynx-nyx/data';
import { PgRateLimitStore } from '../../src/pg-rate-limit.store.js';
import type { RateLimitDecisionContext, RateLimitSqlExecutor } from '../../src/types.js';

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
      expect(executor.query).not.toHaveBeenCalledTimes(1);
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
        expect.stringContaining('INSERT INTO "custom"."rate_windows"'),
        expect.arrayContaining(['tenant:route', 2]),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('falls back to request cost when the upsert returns no rows', async () => {
    const executor: RateLimitSqlExecutor = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(61_000);
    try {
      await expect(new PgRateLimitStore({ executor }).consume(context())).resolves.toMatchObject({
        allowed: true,
        remaining: 3,
        resetAtEpochMs: 120_000,
        retryAfterSeconds: 59,
        used: 2,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it.each([{}, { hitCount: '2' }, { hitCount: null }, { hitCount: 1.5 }, { hitCount: Number.NaN }, { hitCount: 2147483648 }])(
    'rejects malformed populated hit counts without treating them as an allowed decision: %j', async (row) => {
      const query = vi.fn(async () => ({ rows: [row] }));
      await expect(new PgRateLimitStore({ executor: { query } }).consume(context()))
        .rejects.toBeInstanceOf(QueryRowValidationError);
      expect(query).toHaveBeenCalledTimes(1);
    });

  it('preserves default and long custom names, folds unquoted case and binds hostile bucket values', async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ hitCount: 2 }] }));
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(65_000);
    const bucket = "bucket'); DROP TABLE windows; --";
    try {
      await new PgRateLimitStore({ executor: { query } }).consume(context({ bucketKey: bucket }));
      expect(query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('INSERT INTO "integration"."rate_limit_windows"'),
        [context().tenantId, bucket, '1970-01-01T00:01:00.000Z', 2, '1970-01-01T00:03:00.000Z']);
      const longName = 'W'.repeat(70);
      await new PgRateLimitStore({ executor: { query }, table: `Custom.${longName}`,
        tenantColumn: 'TenantId', bucketColumn: 'BucketKey', hitsColumn: 'Hits',
      }).consume(context({ bucketKey: bucket }));
      const sql = query.mock.calls[1]?.[0];
      expect(sql).toContain(`INSERT INTO "custom"."${longName.toLowerCase()}"`);
      expect(sql).toContain('"tenantid"');
      expect(sql).toContain('"bucketkey"');
      expect(sql).toContain('"hits"');
      expect(sql).not.toContain(bucket);
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

});
