import { PgIdempotencyStore } from '../../src/pg-idempotency.store';
import type { IdempotencyDecisionContext, IdempotencySqlExecutor } from '../../src/types';

function context(overrides: Partial<IdempotencyDecisionContext> = {}): IdempotencyDecisionContext {
  return {
    request: { headers: {} },
    compositeKey: 'tenant-1:k1',
    headerName: 'Idempotency-Key',
    headerValue: 'k1',
    requestFingerprint: 'fp-1',
    tenantId: '00000000-0000-0000-0000-000000000001',
    routeKey: 'POST:/items',
    ttlMs: 2500,
    ...overrides,
  };
}

describe('PgIdempotencyStore', () => {
  it('validates configured SQL identifiers', () => {
    expect(() => new PgIdempotencyStore({
      executor: { query: vi.fn() },
      table: 'bad-name',
    })).toThrow('Invalid SQL identifier');
  });

  it('returns null or false for tenantless contexts without querying', async () => {
    const executor: IdempotencySqlExecutor = { query: vi.fn() };
    const store = new PgIdempotencyStore({ executor });
    const tenantless = context({ tenantId: undefined });

    await expect(store.lookup(tenantless)).resolves.toBeNull();
    await expect(store.reserve(tenantless)).resolves.toBe(false);
    await expect(store.persistResponse(tenantless, 200, {})).resolves.toBe(false);
    await expect(store.clearReservation(tenantless)).resolves.toBeUndefined();
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('maps lookup rows for pending, completed, empty, and array result shapes', async () => {
    const executor: IdempotencySqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce([undefined])
        .mockResolvedValueOnce([{ requestFingerprint: 'fp-1', statusCode: null, responseBody: { ignored: true }, expiresAt: '2026-01-01T00:00:00.000Z' }])
        .mockResolvedValueOnce({ rows: [{ requestFingerprint: 'fp-1', statusCode: 201, responseBody: { ok: true }, expiresAt: '2026-01-01T00:00:00.000Z' }] }),
    };
    const store = new PgIdempotencyStore({ executor });

    await expect(store.lookup(context())).resolves.toBeNull();
    await expect(store.lookup(context())).resolves.toBeNull();
    await expect(store.lookup(context())).resolves.toMatchObject({
      requestFingerprint: 'fp-1',
      statusCode: 200,
      body: null,
      headers: {},
      status: 'pending',
    });
    await expect(store.lookup(context())).resolves.toMatchObject({
      statusCode: 201,
      body: { ok: true },
      status: 'completed',
    });
  });

  it('reserves, persists, and clears rows with expected parameters', async () => {
    const executor: IdempotencySqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ reserved: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]),
    };
    const store = new PgIdempotencyStore({
      executor,
      table: 'custom.idempotency',
      tenantColumn: 'tenant_id',
    });

    await expect(store.reserve(context())).resolves.toBe(true);
    await expect(store.persistResponse(context(), 204, undefined)).resolves.toBe(true);
    await expect(store.clearReservation(context())).resolves.toBeUndefined();

    expect(executor.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO custom.idempotency'),
      expect.arrayContaining(['tenant-1:k1', 'fp-1', 2]),
    );
    expect(executor.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE custom.idempotency'),
      expect.arrayContaining([204, 'null', 2]),
    );
    expect(executor.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('DELETE FROM custom.idempotency'),
      expect.arrayContaining(['tenant-1:k1', 'fp-1']),
    );
  });

  it('persists defined bodies and maps alternate executor result shapes', async () => {
    const executor: IdempotencySqlExecutor = {
      query: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([{ updated: 1 }]),
    };
    const store = new PgIdempotencyStore({ executor });

    await expect(store.reserve(context())).resolves.toBe(false);
    await expect(store.persistResponse(context(), 200, { ok: true })).resolves.toBe(false);
    expect(executor.query).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.arrayContaining(['{"ok":true}']),
    );
    await expect(store.persistResponse(context(), 200, { ok: true })).resolves.toBe(true);
  });
});
