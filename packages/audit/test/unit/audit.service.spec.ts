import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { ModuleRef } from '@nestjs/core';
import { executeTypedQuery, QueryArgumentError, QueryRowValidationError, type ResultOf, type TypedQuery } from '@stynx-nyx/data';
import type { z } from 'zod';
import { StynxAuditService } from '../../src/audit.service.js';
import type { Mock } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

interface FakeTrx {
  run<Q extends TypedQuery>(definition: Q, params: z.input<Q['params']>): Promise<ResultOf<Q>>;
  query: Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
}

function makeDatabase(rowsByCall: Array<unknown[]>) {
  let callIdx = 0;
  const trx: FakeTrx = {
    query: vi.fn(async () => ({ rows: rowsByCall[callIdx++] ?? [] })),
    run: (definition, params) => executeTypedQuery(trx, definition, params),
  };
  return {
    trx,
    db: {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn(async (fn: (t: FakeTrx) => unknown) => fn(trx)),
    },
  };
}

function timestampRow(occurredAt: unknown, id: string | number = 1) {
  return {
    id, occurred_at: occurredAt, table_schema: 'app', table_name: 'users',
    row_id: null, operation: 'INSERT', tenant_id: null, actor_id: null,
    request_id: null, session_id: null, tags: null, payload: null,
  };
}

function makeService(
  database: { withSystemContext: Mock; tx: Mock } | null,
  overrides: {
    dumpRunner?: { dumpPartition: Mock };
    archiveStore?: { uploadFile: Mock };
    options?: Record<string, unknown>;
    now?: Date;
  } = {},
) {
  const moduleRef = {
    get: vi.fn(() => database),
  } as unknown as ModuleRef;
  return new StynxAuditService(
    moduleRef,
    { keyPrefix: 'audit', ...(overrides.options ?? {}) } as never,
    { now: () => overrides.now ?? new Date('2026-05-18T00:00:00Z') },
    overrides.dumpRunner as never,
    overrides.archiveStore as never,
  );
}

describe('StynxAuditService.listLog', () => {
  it('queries audit.log with no filters and clamps limit to [1, 200]', async () => {
    const { db, trx } = makeDatabase([[]]);
    const service = makeService(db);
    await service.listLog({ limit: 500 });
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params[params.length - 1]).toBe(201); // limit + 1 with cap at 200
  });

  it('returns nextCursor when there is a tail row beyond the limit', async () => {
    const rows = [
      { id: 1, occurred_at: '2026-05-18T01:00:00Z', table_schema: 'app', table_name: 'users', row_id: 'r1', operation: 'INSERT', tenant_id: 't', actor_id: 'u', request_id: null, session_id: null, tags: null, payload: null },
      { id: 2, occurred_at: '2026-05-18T00:30:00Z', table_schema: 'app', table_name: 'users', row_id: 'r2', operation: 'UPDATE', tenant_id: 't', actor_id: 'u', request_id: null, session_id: null, tags: null, payload: null },
    ];
    const { db } = makeDatabase([rows]);
    const service = makeService(db);
    const page = await service.listLog({ limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.anything());
  });

  it('omits nextCursor when no tail row', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    const page = await service.listLog();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBe(undefined);
  });

  it('maps Date occurred_at values to ISO strings', async () => {
    const { db } = makeDatabase([[
      {
        id: 1,
        occurred_at: new Date('2026-05-18T01:00:00Z'),
        table_schema: 'app',
        table_name: 'users',
        row_id: null,
        operation: 'INSERT',
        tenant_id: null,
        actor_id: null,
        request_id: null,
        session_id: null,
        tags: null,
        payload: null,
      },
    ]]);
    const service = makeService(db);
    const page = await service.listLog();
    expect(page.items[0]?.occurredAt).toBe('2026-05-18T01:00:00.000Z');
  });

  it.each([
    { value: new Date('2026-05-18T01:00:00.789Z'), expected: '2026-05-18T01:00:00.789Z' },
    { value: 'custom-parser-timestamp', expected: 'custom-parser-timestamp' },
    { value: Number.POSITIVE_INFINITY, expected: Number.POSITIVE_INFINITY },
    { value: Number.NEGATIVE_INFINITY, expected: Number.NEGATIVE_INFINITY },
  ])('retains existing timestamp mapping and opaque payloads: $expected', async ({ value, expected }) => {
    const opaque = { extension: [null, true, { nested: 'preserved' }] };
    const { db, trx } = makeDatabase([[{
      id: '9007199254740993', occurred_at: value, table_schema: 'app', table_name: 'users',
      row_id: null, operation: 'INSERT', tenant_id: null, actor_id: null,
      request_id: null, session_id: null, tags: opaque, payload: opaque,
    }]]);
    const page = await makeService(db).listLog();
    expect(page.items[0]?.occurredAt).toBe(expected);
    expect(page.items[0]?.id).toBe(Number('9007199254740993'));
    expect(page.items[0]?.tags).toBe(opaque);
    expect(page.items[0]?.payload).toBe(opaque);
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it('preserves InvalidDate RangeError after query execution', async () => {
    const { db, trx } = makeDatabase([[timestampRow(new Date(Number.NaN))]]);
    await expect(makeService(db).listLog()).rejects.toBeInstanceOf(RangeError);
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'preserves non-finite tail cursor serialization and subsequent null SQL parameter: %s', async (value) => {
      const { db, trx } = makeDatabase([[
        timestampRow('2026-05-18T01:00:00Z', 2),
        timestampRow(value, '9007199254740993'),
      ], []]);
      const service = makeService(db);
      const first = await service.listLog({ limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(typeof first.nextCursor).toBe('string');
      if (!first.nextCursor) throw new Error('Expected the existing tail cursor');
      expect(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'))).toEqual({
        occurredAt: null, id: Number('9007199254740993'),
      });
      await expect(service.listLog({ limit: 1, cursor: first.nextCursor })).resolves.toEqual({ items: [] });
      expect(trx.query).toHaveBeenCalledTimes(2);
      expect(trx.query.mock.calls[1]?.[0]).toContain('(occurred_at, id) < ($1::timestamptz, $2::bigint)');
      expect(trx.query.mock.calls[1]?.[1]).toEqual([null, Number('9007199254740993'), 2]);
    },
  );

  it.each([
    { value: new Date('2026-05-18T01:00:00.789Z'), expected: '2026-05-18T01:00:00.789Z' },
    { value: 'custom-parser-timestamp', expected: 'custom-parser-timestamp' },
  ])('preserves Date conversion and parser strings in tail cursors: $expected', async ({ value, expected }) => {
    const { db, trx } = makeDatabase([[
      timestampRow('2026-05-18T02:00:00Z', 2), timestampRow(value),
    ], []]);
    const service = makeService(db);
    const first = await service.listLog({ limit: 1 });
    if (!first.nextCursor) throw new Error('Expected the existing tail cursor');
    expect(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'))).toEqual({
      occurredAt: expected, id: 1,
    });
    await service.listLog({ limit: 1, cursor: first.nextCursor });
    expect(trx.query.mock.calls[1]?.[1]).toEqual([expected, 1, 2]);
    expect(trx.query).toHaveBeenCalledTimes(2);
  });

  it('retains InvalidDate failure in a tail row before returning a cursor', async () => {
    const { db, trx } = makeDatabase([[
      timestampRow('2026-05-18T02:00:00Z', 2), timestampRow(new Date(Number.NaN)),
    ]]);
    await expect(makeService(db).listLog({ limit: 1 })).rejects.toBeInstanceOf(RangeError);
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it.each([null, false, 0, ''])('preserves falsy decoded cursor behavior: %s', async (decoded) => {
    const { db, trx } = makeDatabase([[]]);
    const cursor = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    await expect(makeService(db).listLog({ cursor })).resolves.toEqual({ items: [] });
    expect(trx.query).toHaveBeenCalledTimes(1);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).not.toContain('(occurred_at, id) <');
    expect(params).toEqual([51]);
  });

  it.each([true, 1, 'text', [], {}])('preserves property reads on truthy non-cursor JSON: %j', async (decoded) => {
    const { db, trx } = makeDatabase([[]]);
    const cursor = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    await expect(makeService(db).listLog({ cursor })).resolves.toEqual({ items: [] });
    expect(trx.query).toHaveBeenCalledTimes(1);
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain('(occurred_at, id) < ($1::timestamptz, $2::bigint)');
    expect(params).toEqual([undefined, undefined, 51]);
  });

  it('retains malformed cursor JSON SyntaxError before starting database context', async () => {
    const { db, trx } = makeDatabase([[]]);
    const cursor = Buffer.from('{', 'utf8').toString('base64url');
    await expect(makeService(db).listLog({ cursor })).rejects.toBeInstanceOf(SyntaxError);
    expect(db.withSystemContext).not.toHaveBeenCalled();
    expect(trx.query).not.toHaveBeenCalled();
  });

  it('applies all filters and the cursor when set', async () => {
    const { db, trx } = makeDatabase([[]]);
    const service = makeService(db);
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: '2026-05-18T00:00:00Z', id: 100 }),
      'utf8',
    ).toString('base64url');
    await service.listLog({
      tenantId: 't',
      actorId: 'u',
      tableSchema: 'app',
      tableName: 'users',
      rowId: 'r',
      from: 'f',
      to: 't',
      cursor,
      limit: 25,
    });
    const [sql, params] = trx.query.mock.calls[0]!;
    expect(sql).toContain('tenant_id::text = $1');
    expect(sql).toContain('actor_id::text = $2');
    expect(sql).toContain('table_schema = $3');
    expect(sql).toContain('table_name = $4');
    expect(sql).toContain('row_id = $5');
    expect(sql).toContain('occurred_at >= $6::timestamptz');
    expect(sql).toContain('occurred_at <= $7::timestamptz');
    expect(sql).toContain('(occurred_at, id) < ($8::timestamptz, $9::bigint)');
    expect((params as unknown[])[(params as unknown[]).length - 1]).toBe(26);
  });

  it('throws when Database provider is unavailable', async () => {
    const service = makeService(null);
    await expect(service.listLog()).rejects.toThrow(/Database provider is unavailable/);
  });
});

describe('StynxAuditService.dryRunDetachEligible', () => {
  it('skips partitions whose name does not match log_YYYY_MM', async () => {
    const { db } = makeDatabase([
      [{ partition_name: 'not_a_log_partition' }],
    ]);
    const service = makeService(db);
    const plans = await service.dryRunDetachEligible(new Date('2026-12-01'));
    expect(plans).toEqual([]);
  });
});

describe('StynxAuditService.detachEligible', () => {
  it('returns [] when there are no eligible plans', async () => {
    const { db } = makeDatabase([[]]); // partitions query returns nothing
    const service = makeService(db);
    const plans = await service.detachEligible(new Date('2026-12-01'));
    expect(plans).toEqual([]);
  });

  it('throws when partitions exist but no bucket/dumpRunner/archive are configured', async () => {
    // Manually simulate the dryRun-returned plan by having the partitions
    // and keepLonger queries return shapes consistent with retention plan.
    const { db } = makeDatabase([
      [{ partition_name: 'log_2025_01' }],
      [{ keep_longer: false }],
    ]);
    const service = makeService(db, {
      now: new Date('2026-12-01T00:00:00Z'),
    });
    await expect(service.detachEligible()).rejects.toThrow(
      /Audit detach requires bucket, dump runner, and archive store/,
    );
  });

  it('dumps, uploads, detaches, and drops eligible partitions', async () => {
    const { db, trx } = makeDatabase([
      [{ partition_name: 'log_2025_01' }],
      [{ keep_longer: false }],
      [],
      [],
    ]);
    const dumpRunner = { dumpPartition: vi.fn(async () => undefined) };
    const archiveStore = { uploadFile: vi.fn(async () => undefined) };
    const service = makeService(db, {
      now: new Date('2026-12-01T00:00:00Z'),
      options: { bucket: 'audit-bucket' },
      dumpRunner,
      archiveStore,
    });

    const plans = await service.detachEligible();
    expect(plans).toHaveLength(1);
    expect(dumpRunner.dumpPartition).toHaveBeenCalledWith(expect.objectContaining({
      schema: 'audit',
      table: 'log_2025_01',
    }));
    expect(archiveStore.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'audit-bucket',
      key: plans[0]?.objectKey,
      contentType: 'application/gzip',
    }));
    expect(trx.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('alter table audit.log detach partition audit."log_2025_01"'),
      expect.stringContaining('drop table audit."log_2025_01"'),
    ]));
  });

  it('swallows temp dump cleanup failures after a partition is archived', async () => {
    const { db } = makeDatabase([
      [{ partition_name: 'log_2025_01' }],
      [{ keep_longer: false }],
      [],
      [],
    ]);
    const dumpRunner = { dumpPartition: vi.fn(async () => undefined) };
    const archiveStore = { uploadFile: vi.fn(async () => undefined) };
    const service = makeService(db, {
      now: new Date('2026-12-01T00:00:00Z'),
      options: { bucket: 'audit-bucket' },
      dumpRunner,
      archiveStore,
    });
    vi.mocked(rm).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const plans = await service.detachEligible();

    expect(plans).toHaveLength(1);
    expect(plans[0]?.partitionName).toBe('log_2025_01');
    expect(rm).toHaveBeenCalledWith(expect.stringMatching(/log_2025_01\.sql\.gz$/), { force: true });
  });

  it('uses the default archive key prefix when module options omit keyPrefix', async () => {
    const { db } = makeDatabase([
      [{ partition_name: 'log_2025_01' }],
      [{ keep_longer: false }],
    ]);
    const service = makeService(db, {
      now: new Date('2026-12-01T00:00:00Z'),
      options: { keyPrefix: undefined },
    });

    await expect(service.dryRunDetachEligible()).resolves.toEqual([
      expect.objectContaining({ objectKey: 'audit/2025-01.sql.gz' }),
    ]);
  });
});

describe('StynxAuditService.runDailyDetachJob', () => {
  it('runs detach but logs nothing when nothing detached', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    await expect(service.runDailyDetachJob()).resolves.toBe(undefined);
  });

  it('logs when the daily detach job detaches partitions', async () => {
    const { db } = makeDatabase([
      [{ partition_name: 'log_2025_01' }],
      [{ keep_longer: false }],
      [],
      [],
    ]);
    const service = makeService(db, {
      now: new Date('2026-12-01T00:00:00Z'),
      options: { bucket: 'audit-bucket' },
      dumpRunner: { dumpPartition: vi.fn(async () => undefined) },
      archiveStore: { uploadFile: vi.fn(async () => undefined) },
    });
    const logger = service as unknown as { logger: { log: Mock } };
    logger.logger.log = vi.fn();

    await service.runDailyDetachJob();
    expect(logger.logger.log).toHaveBeenCalledWith('Detached 1 audit partition(s)');
  });
});

describe('StynxAuditService.verifyChain', () => {
  const tenant = '11111111-1111-1111-1111-111111111111';
  it('rejects malformed UUID parameters before querying', async () => {
    const { db, trx } = makeDatabase([[]]);
    await expect(makeService(db).verifyChain('not-a-uuid')).rejects.toBeInstanceOf(QueryArgumentError);
    expect(trx.query).not.toHaveBeenCalled();
  });

  it('rejects malformed physical chain rows after exactly one query', async () => {
    const { db, trx } = makeDatabase([[{ event_id: 'private-invalid-row' }]]);
    const result = makeService(db).verifyChain(tenant);
    await expect(result).rejects.toBeInstanceOf(QueryRowValidationError);
    await expect(result).rejects.not.toThrow('private-invalid-row');
    expect(trx.query).toHaveBeenCalledTimes(1);
  });

  it('clamps limit to [1, 10000]', async () => {
    const { db, trx } = makeDatabase([[]]);
    const service = makeService(db);
    await service.verifyChain(tenant, 999_999);
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params[1]).toBe(10_000);

    await service.verifyChain(tenant, -5);
    const params2 = trx.query.mock.calls[1]?.[1] as unknown[];
    expect(params2[1]).toBe(1);
  });

  it('returns valid=true with totalChecked=0 when no rows', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    const result = await service.verifyChain(tenant);
    expect(result).toEqual({ valid: true, totalChecked: 0 });
  });

  it('rejects a chain whose first row has a non-null previous_hash', async () => {
    const rows = [
      {
        event_id: 'e-1',
        occurred_at_text: '2026',
        tenancy_id_text: 't',
        actor_id_text: 'u',
        entity: 'doc',
        entity_id: 'd-1',
        operation_text: 'INSERT',
        old_data_text: null,
        new_data_text: '{}',
        previous_hash: 'orphan-hash', // genesis must be null
        row_hash: 'doesnt-matter',
      },
    ];
    const { db } = makeDatabase([rows]);
    const service = makeService(db);
    const result = await service.verifyChain(tenant);
    expect(result).toMatchObject({ valid: false, firstBrokenEventId: 'e-1' });
  });

  it('rejects a chain whose previous_hash points at the wrong predecessor', async () => {
    const row1 = {
      event_id: 'e-1',
      occurred_at_text: '2026',
      tenancy_id_text: 't',
      actor_id_text: 'u',
      entity: 'doc',
      entity_id: 'd-1',
      operation_text: 'INSERT',
      old_data_text: null,
      new_data_text: '{}',
      previous_hash: null,
      row_hash: '',
    };
    const row2 = {
      ...row1,
      event_id: 'e-2',
      previous_hash: 'wrong-hash',
    };
    const { db } = makeDatabase([[row1, row2]]);
    const service = makeService(db);
    row1.row_hash = (service as unknown as { hashAuditEventRow: (row: unknown) => string }).hashAuditEventRow(row1);
    row2.row_hash = (service as unknown as { hashAuditEventRow: (row: unknown) => string }).hashAuditEventRow(row2);

    const result = await service.verifyChain(tenant);
    expect(result).toMatchObject({ valid: false, totalChecked: 2, firstBrokenEventId: 'e-1' });
  });

  it('accepts a valid two-event chain', async () => {
    const row1 = {
      event_id: 'e-1',
      occurred_at_text: '2026',
      tenancy_id_text: 't',
      actor_id_text: 'u',
      entity: 'doc',
      entity_id: 'd-1',
      operation_text: 'INSERT',
      old_data_text: null,
      new_data_text: '{}',
      previous_hash: null,
      row_hash: '',
    };
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    row1.row_hash = (service as unknown as { hashAuditEventRow: (row: unknown) => string }).hashAuditEventRow(row1);
    const row2 = {
      ...row1,
      event_id: 'e-2',
      operation_text: 'UPDATE',
      previous_hash: row1.row_hash,
      row_hash: '',
    };
    row2.row_hash = (service as unknown as { hashAuditEventRow: (row: unknown) => string }).hashAuditEventRow(row2);
    const live = makeService(makeDatabase([[row1, row2]]).db);

    await expect(live.verifyChain(tenant)).resolves.toEqual({ valid: true, totalChecked: 2 });
  });

  it('accepts chain rows with nullable audit payload fields and hashes empty defaults', async () => {
    const row = {
      event_id: 'e-nullable',
      occurred_at_text: null,
      tenancy_id_text: null,
      actor_id_text: null,
      entity: null,
      entity_id: null,
      operation_text: null,
      old_data_text: null,
      new_data_text: null,
      previous_hash: null,
      row_hash: '',
    };
    row.row_hash = createHash('sha256')
      .update('e-nullable|||||||||GENESIS')
      .digest('hex');
    const service = makeService(makeDatabase([[row]]).db);

    await expect(service.verifyChain(tenant)).resolves.toEqual({ valid: true, totalChecked: 1 });
  });
});
