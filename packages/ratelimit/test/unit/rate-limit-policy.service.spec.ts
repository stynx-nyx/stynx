import { DatabaseRateLimitPolicyResolver } from '../../src/rate-limit-policy.service';
import type { RateLimitMetadata } from '../../src/types';
import type { RequestLike } from '../../src/request-context';
import type { Mock } from 'vitest';

interface FakeTrx {
  query: Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
}

function makeDatabase(rowsByCall: Array<unknown[]>) {
  const trx: FakeTrx = {
    query: vi.fn(),
  };
  let callIdx = 0;
  trx.query.mockImplementation(async () => ({ rows: rowsByCall[callIdx++] ?? [] }));
  return {
    db: {
      withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
      tx: vi.fn(async (fn: (t: FakeTrx) => Promise<unknown>) => fn(trx)),
    },
    trx,
  };
}

const request: RequestLike = { headers: {}, tenantId: 'tenant-1' } as never;
const metadata: RateLimitMetadata = {
  bucket: 'tenant',
  scope: 'documents.write',
  cost: 2,
};

describe('DatabaseRateLimitPolicyResolver', () => {
  it('uses explicit metadata.limit and metadata.windowSeconds without touching the DB', async () => {
    const { db } = makeDatabase([]);
    const resolver = new DatabaseRateLimitPolicyResolver({}, db as never);
    const resolved = await resolver.resolve(request, {
      ...metadata,
      limit: 999,
      windowSeconds: 30,
    });
    expect(resolved.limit).toBe(999);
    expect(resolved.windowSeconds).toBe(30);
    expect(resolved.cost).toBe(2);
    expect(db.tx).not.toHaveBeenCalledTimes(1);
  });

  it('falls back to per-scope defaults from options when DB returns no rows', async () => {
    const { db } = makeDatabase([[], [], [], []]);
    const resolver = new DatabaseRateLimitPolicyResolver(
      { defaults: { 'documents.write': { limit: 50, windowSeconds: 15 } } },
      db as never,
    );
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(50);
    expect(resolved.windowSeconds).toBe(15);
    expect(db.tx).toHaveBeenNthCalledWith(1, expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
  });

  it('falls back to defaultLimit / defaultWindowSeconds when no per-scope default', async () => {
    const { db } = makeDatabase([[], [], [], []]);
    const resolver = new DatabaseRateLimitPolicyResolver(
      { defaultLimit: 7, defaultWindowSeconds: 11 },
      db as never,
    );
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(7);
    expect(resolved.windowSeconds).toBe(11);
  });

  it('falls back to the hardcoded 120 / 60 when no defaults are configured', async () => {
    const { db } = makeDatabase([[], [], [], []]);
    const resolver = new DatabaseRateLimitPolicyResolver({}, db as never);
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(120);
    expect(resolved.windowSeconds).toBe(60);
  });

  it('uses tenant override when present', async () => {
    const { db } = makeDatabase([
      [{ limit_value: 33, window_seconds: 7 }], // lookupLimit -> override
      [{ limit_value: 33, window_seconds: 7 }], // lookupWindow -> override
    ]);
    const resolver = new DatabaseRateLimitPolicyResolver({}, db as never);
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(33);
    expect(resolved.windowSeconds).toBe(7);
    expect(db.withSystemContext).toHaveBeenNthCalledWith(
      1,
      'rate limit policy override lookup',
      expect.any(Function),
    );
    expect(db.tx).toHaveBeenNthCalledWith(1, expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
  });

  it('falls back to platform config (core.config) when no override', async () => {
    const { db } = makeDatabase([
      [], // lookupLimit -> no override
      [{ value: { limit: 88, windowSeconds: 22 } }], // lookupPlatformConfig
      [], // lookupWindow -> no override
      [{ value: { limit: 88, windowSeconds: 22 } }],
    ]);
    const resolver = new DatabaseRateLimitPolicyResolver({}, db as never);
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(88);
    expect(resolved.windowSeconds).toBe(22);
    expect(db.withSystemContext).toHaveBeenNthCalledWith(
      2,
      'rate limit platform config lookup',
      expect.any(Function),
    );
    expect(db.tx).toHaveBeenNthCalledWith(2, expect.any(Function), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
  });

  it('tries the colon platform config key when the dot key is not present', async () => {
    const { db, trx } = makeDatabase([
      [], // lookupLimit -> no override
      [], // lookupLimit -> ratelimit.documents.write
      [{ value: { limit: 44 } }], // lookupLimit -> ratelimit:documents.write
      [], // lookupWindow -> no override
      [], // lookupWindow -> ratelimit.documents.write
      [{ value: { windowSeconds: 12 } }], // lookupWindow -> ratelimit:documents.write
    ]);
    const resolver = new DatabaseRateLimitPolicyResolver({}, db as never);

    const resolved = await resolver.resolve(request, metadata);

    expect(resolved.limit).toBe(44);
    expect(resolved.windowSeconds).toBe(12);
    expect(trx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('from core.config'),
      ['ratelimit.documents.write'],
    );
    expect(trx.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('from core.config'),
      ['ratelimit:documents.write'],
    );
  });

  it('skips override lookup when tenantId is undefined', async () => {
    const { db, trx } = makeDatabase([[]]);
    const resolver = new DatabaseRateLimitPolicyResolver({ defaultLimit: 9, defaultWindowSeconds: 9 }, db as never);
    const resolved = await resolver.resolve({ headers: {} } as never, metadata);
    expect(resolved.limit).toBe(9);
    expect(resolved.windowSeconds).toBe(9);
    // Override lookup is skipped (no tenant); platform config runs once per
    // {lookupLimit, lookupWindow} and tries 2 key variants each = 4 queries.
    expect(trx.query).toHaveBeenCalledTimes(4);
  });

  it('returns nulls (then falls back) when no Database is wired', async () => {
    const resolver = new DatabaseRateLimitPolicyResolver({ defaultLimit: 4, defaultWindowSeconds: 5 });
    const resolved = await resolver.resolve(request, metadata);
    expect(resolved.limit).toBe(4);
    expect(resolved.windowSeconds).toBe(5);
  });

  it('defaults cost to 1 when metadata.cost is undefined', async () => {
    const resolver = new DatabaseRateLimitPolicyResolver({ defaultLimit: 1, defaultWindowSeconds: 1 });
    const resolved = await resolver.resolve(request, { bucket: 'tenant', scope: 's' });
    expect(resolved.cost).toBe(1);
  });
});
