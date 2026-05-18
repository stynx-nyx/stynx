import { ModuleRef } from '@nestjs/core';
import { StynxAuditService } from '../../src/audit.service';

interface FakeTrx {
  query: jest.Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
}

function makeDatabase(rowsByCall: Array<unknown[]>) {
  let callIdx = 0;
  const trx: FakeTrx = {
    query: jest.fn(async () => ({ rows: rowsByCall[callIdx++] ?? [] })),
  };
  return {
    trx,
    db: {
      withSystemContext: jest.fn((_reason: string, fn: () => unknown) => fn()),
      tx: jest.fn(async (fn: (t: FakeTrx) => unknown) => fn(trx)),
    },
  };
}

function makeService(
  database: { withSystemContext: jest.Mock; tx: jest.Mock } | null,
  overrides: {
    dumpRunner?: { dumpPartition: jest.Mock };
    archiveStore?: { uploadFile: jest.Mock };
    options?: Record<string, unknown>;
    now?: Date;
  } = {},
) {
  const moduleRef = {
    get: jest.fn(() => database),
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
    expect(page.nextCursor).toBeDefined();
  });

  it('omits nextCursor when no tail row', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    const page = await service.listLog();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
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
});

describe('StynxAuditService.runDailyDetachJob', () => {
  it('runs detach but logs nothing when nothing detached', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    await expect(service.runDailyDetachJob()).resolves.toBeUndefined();
  });
});

describe('StynxAuditService.verifyChain', () => {
  it('clamps limit to [1, 10000]', async () => {
    const { db, trx } = makeDatabase([[]]);
    const service = makeService(db);
    await service.verifyChain('tenant', 999_999);
    const params = trx.query.mock.calls[0]?.[1] as unknown[];
    expect(params[1]).toBe(10_000);

    await service.verifyChain('tenant', -5);
    const params2 = trx.query.mock.calls[1]?.[1] as unknown[];
    expect(params2[1]).toBe(1);
  });

  it('returns valid=true with totalChecked=0 when no rows', async () => {
    const { db } = makeDatabase([[]]);
    const service = makeService(db);
    const result = await service.verifyChain('tenant');
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
    const result = await service.verifyChain('tenant');
    expect(result).toMatchObject({ valid: false, firstBrokenEventId: 'e-1' });
  });
});
