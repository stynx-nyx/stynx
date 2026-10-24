import { executeConfiguredQuery, type ConfiguredSqlExecutor } from '../../src/checked-executor.js';
import { QueryCardinalityError, QueryRowValidationError } from '../../src/errors.js';

const tenant = '11111111-1111-1111-1111-111111111111';
const idempotencyIdentifiers = {
  table: 'integration.idempotency_keys',
  tenantColumn: 'tenant_id',
  keyColumn: 'idem_key',
  fingerprintColumn: 'request_fingerprint',
  statusCodeColumn: 'status_code',
  bodyColumn: 'response_body',
  expiresAtColumn: 'expires_at',
};
const commands = [
  {
    name: 'idempotency.clear',
    run: (client: ConfiguredSqlExecutor) =>
      executeConfiguredQuery(client, 'idempotency.clear', idempotencyIdentifiers, [tenant, 'key', 'fingerprint']),
  },
  {
    name: 'ratelimit.cleanup',
    run: (client: ConfiguredSqlExecutor) =>
      executeConfiguredQuery(client, 'ratelimit.cleanup', {
        table: 'integration.rate_limits', tenantColumn: 'tenant_id', bucketColumn: 'bucket',
        windowStartColumn: 'window_start', hitsColumn: 'hits', expiresAtColumn: 'expires_at',
      }, [tenant]),
  },
  {
    name: 'audit.partition-detach',
    run: (client: ConfiguredSqlExecutor) =>
      executeConfiguredQuery(client, 'audit.partition-detach', { partition: 'log_2026_01' }, []),
  },
  {
    name: 'audit.partition-drop',
    run: (client: ConfiguredSqlExecutor) =>
      executeConfiguredQuery(client, 'audit.partition-drop', { partition: 'log_2026_01' }, []),
  },
];

describe.each(commands)('$name configured command metadata', ({ run }) => {
  it.each([
    { driver: [], count: null },
    { driver: {}, count: null },
    { driver: { rows: [] }, count: null },
    { driver: { rows: [], rowCount: null }, count: null },
    { driver: { rows: [], rowCount: 0 }, count: 0 },
    { driver: { rows: [], rowCount: 7 }, count: 7 },
    { driver: { rowCount: 3 }, count: 3 },
  ])('retains only actual driver counts: $count', async ({ driver, count }) => {
    const query = vi.fn(async () => driver);
    await expect(run({ query })).resolves.toEqual({ rows: [], rowCount: count });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ unexpected: 'private-driver-value' }],
    { rows: [{ unexpected: 'private-driver-value' }], rowCount: 9 },
  ].map((driver) => [driver]))('rejects populated results instead of inventing affected counts', async (driver) => {
    const query = vi.fn(async () => driver);
    const error = await run({ query }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryCardinalityError);
    expect(JSON.stringify(error)).not.toContain('private-driver-value');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { rows: 'private-driver-value', rowCount: 1 },
    { rows: [], rowCount: -1 },
    { rows: [], rowCount: 1.5 },
    { rows: [], rowCount: 'private-driver-value' },
  ])('rejects malformed result envelopes without retaining driver data', async (driver) => {
    const query = vi.fn(async () => driver);
    const error = await run({ query }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(JSON.stringify(error)).not.toContain('private-driver-value');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('idempotency completion historical metadata exception', () => {
  it.each([[], [{ updated: 1 }], [{ updated: 1 }, { updated: 1 }]].map((driver) => [driver]))(
    'retains legacy array length only for completion', async (driver) => {
      const query = vi.fn(async () => driver);
      await expect(executeConfiguredQuery({ query }, 'idempotency.complete', idempotencyIdentifiers, [
        tenant, 'key', 'fingerprint', 204, 'null', 2,
      ])).resolves.toEqual({ rows: [], rowCount: driver.length });
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
});
