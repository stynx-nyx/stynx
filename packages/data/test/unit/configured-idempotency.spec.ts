import { executeConfiguredQuery, type ConfiguredSqlExecutor } from '../../src/checked-executor.js';
import {
  QueryArgumentError,
  QueryCardinalityError,
  QueryRowValidationError,
} from '../../src/errors.js';

const identifiers = {
  table: 'integration.idempotency_keys',
  tenantColumn: 'tenant_id',
  keyColumn: 'idem_key',
  fingerprintColumn: 'request_fingerprint',
  statusCodeColumn: 'status_code',
  bodyColumn: 'response_body',
  expiresAtColumn: 'expires_at',
};
const tenant = '11111111-1111-1111-1111-111111111111';
const row = {
  requestFingerprint: 'fingerprint',
  statusCode: 201,
  responseBody: { opaque: [null, true, { nested: 'preserved' }] },
  expiresAt: '2026-01-01T00:00:00.000Z',
};
function connection(result: unknown) {
  const query = vi.fn(async (_text: string, _params?: unknown[]) => result);
  return { query, client: { query } as ConfiguredSqlExecutor };
}

describe('closed configured idempotency operations', () => {
  it('quotes default identifiers and keeps hostile values exclusively in bound parameters', async () => {
    const hostileKey = "key'); DROP TABLE audit.log; --";
    const { client, query } = connection({ rows: [row], rowCount: 1 });
    await expect(
      executeConfiguredQuery(client, 'idempotency.lookup', identifiers, [tenant, hostileKey]),
    ).resolves.toEqual({ rows: [row], rowCount: 1 });
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('FROM "integration"."idempotency_keys"'),
      [tenant, hostileKey],
    );
    const text = query.mock.calls[0]?.[0];
    expect(text).toContain('"tenant_id"::text = $1');
    expect(text).toContain('"idem_key" = $2');
    expect(text).not.toContain(hostileKey);
  });

  it('preserves PostgreSQL folding and long names for previously accepted unquoted custom bindings', async () => {
    const { client, query } = connection({ rows: [] });
    await executeConfiguredQuery(
      client,
      'idempotency.lookup',
      {
        ...identifiers,
        table: 'Custom.Idempotency',
        tenantColumn: 'TenantId',
        keyColumn: 'IdemKey',
      },
      [tenant, 'key'],
    );
    expect(query.mock.calls[0]?.[0]).toContain('FROM "custom"."idempotency"');
    expect(query.mock.calls[0]?.[0]).toContain('"tenantid"::text = $1');
    expect(query.mock.calls[0]?.[0]).toContain('"idemkey" = $2');
    const longName = 'A'.repeat(70);
    await executeConfiguredQuery(
      client,
      'idempotency.lookup',
      { ...identifiers, table: `Custom.${longName}`, keyColumn: longName },
      [tenant, 'key'],
    );
    expect(query.mock.calls[1]?.[0]).toContain(`FROM "custom"."${longName.toLowerCase()}"`);
    expect(query.mock.calls[1]?.[0]).toContain(`"${longName.toLowerCase()}" = $2`);
  });

  it.each([
    'table; DROP TABLE x',
    'table where true',
    'table || expression',
    'schema..table',
    '"unterminated',
    'table\0suffix',
  ])('refuses SQL fragments or malformed identifier %s before any execution', async (table) => {
    const { client, query } = connection({ rows: [] });
    await expect(
      executeConfiguredQuery(client, 'idempotency.lookup', { ...identifiers, table }, [
        tenant,
        'key',
      ]),
    ).rejects.toBeInstanceOf(TypeError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unknown operation IDs, extra SQL slots and mismatched parameter tuples before execution', async () => {
    const { client, query } = connection({ rows: [] });
    for (const operation of ['unknown', '__proto__', 'idempotency.lookup;drop']) {
      await expect(
        executeConfiguredQuery(client, operation as never, identifiers, []),
      ).rejects.toBeInstanceOf(TypeError);
    }
    await expect(
      executeConfiguredQuery(
        client,
        'idempotency.lookup',
        { ...identifiers, sql: 'select secret' } as never,
        [tenant, 'key'],
      ),
    ).rejects.toBeInstanceOf(QueryArgumentError);
    await expect(
      executeConfiguredQuery(client, 'idempotency.lookup', identifiers, [
        tenant,
        'key',
        'extra',
      ] as never),
    ).rejects.toBeInstanceOf(QueryArgumentError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([[], [undefined], { rows: [] }])(
    'retains the established empty lookup shape %s',
    async (empty) => {
      const { client } = connection(empty);
      await expect(
        executeConfiguredQuery(client, 'idempotency.lookup', identifiers, [tenant, 'key']),
      ).resolves.toMatchObject({ rows: [] });
    },
  );

  it.each([
    { ...row, requestFingerprint: 42 },
    { ...row, statusCode: '201' },
    { ...row, expiresAt: 'driver-secret-invalid-date' },
    { ...row, responseBody: { invalid: Number.NaN } },
  ])('rejects malformed populated lookup rows without leaking driver values', async (invalid) => {
    const { client, query } = connection({ rows: [invalid] });
    const error = await executeConfiguredQuery(client, 'idempotency.lookup', identifiers, [
      tenant,
      'key',
    ]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(JSON.stringify(error)).not.toContain('driver-secret-invalid-date');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('checks lookup cardinality and the fixed reservation result', async () => {
    await expect(
      executeConfiguredQuery(
        connection({ rows: [row, row] }).client,
        'idempotency.lookup',
        identifiers,
        [tenant, 'key'],
      ),
    ).rejects.toBeInstanceOf(QueryCardinalityError);
    await expect(
      executeConfiguredQuery(
        connection({ rows: [{ reserved: 'yes' }] }).client,
        'idempotency.reserve',
        identifiers,
        [tenant, 'key', 'fingerprint', 2],
      ),
    ).rejects.toBeInstanceOf(QueryRowValidationError);
  });

  it.each([[{ updated: 1 }], { rowCount: 1 }, {}, []])(
    'keeps legacy completion metadata distinct from application rows: %s',
    async (metadata) => {
      const { client, query } = connection(metadata);
      const expectedCount = Array.isArray(metadata)
        ? metadata.length
        : 'rowCount' in metadata
          ? metadata.rowCount
          : null;
      await expect(
        executeConfiguredQuery(client, 'idempotency.complete', identifiers, [
          tenant,
          'key',
          'fingerprint',
          204,
          'null',
          2,
        ]),
      ).resolves.toEqual({ rows: [], rowCount: expectedCount });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('UPDATE "integration"."idempotency_keys"'),
        [tenant, 'key', 'fingerprint', 204, 'null', 2],
      );
      expect(query.mock.calls[0]?.[0]).not.toMatch(/returning/i);
    },
  );
});
