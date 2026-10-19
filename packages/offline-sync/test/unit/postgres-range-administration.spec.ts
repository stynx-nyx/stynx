import { describe, expect, it, vi } from 'vitest';
import { fixtureDigest } from '../support/offline-import-fixtures.js';
import type { Database } from '@stynx-nyx/data';
import {
  pgCreateNumberingRange,
  pgGetNumberingRange,
  pgListNumberingRanges,
} from '../../src/postgres-ranges.js';
import { rangeInput, RANGE_AT, RANGE_TENANT_A } from '../support/range-administration-contract.js';

const scope = { tenantId: RANGE_TENANT_A, actorId: 'audit-actor' };
const id = '10000000-0000-4000-8000-0000000000a5';
function database(query: ReturnType<typeof vi.fn>) {
  const tx = vi.fn(async (operation: (trx: { query: typeof query }) => Promise<unknown>) =>
    operation({ query }),
  );
  return { database: { tx } as unknown as Database, tx };
}

describe('PostgreSQL range administration database refusal and read boundaries', () => {
  it.each(['42703', '42P01'])(
    'identifies required0007 for schema failure %s without leaking raw SQL diagnostics',
    async (code) => {
      const raw = Object.assign(new Error('private SQL diagnostics'), { code });
      const { database: db } = database(
        vi.fn(async () => {
          throw raw;
        }),
      );
      await expect(pgGetNumberingRange(db, scope, id)).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_UPGRADE_REQUIRED',
        message: 'Offline-sync migration 0007 is required.',
      });
    },
  );

  it.each([
    [
      'numbering_ranges_tenant_creation_key_uq',
      'OFFLINE_SYNC_RANGE_IDEMPOTENCY_CONFLICT',
      'Range creation key was already used with a different request.',
    ],
    [
      'numbering_ranges_tenant_id_org_unit_id_entity_type_series_key',
      'OFFLINE_SYNC_RANGE_CONFLICT',
      'A numbering range already exists for this organizational unit, entity and series.',
    ],
  ])(
    'translates exact unique constraint %s to its nonretryable public409',
    async (constraint, code, message) => {
      const raw = Object.assign(new Error('private duplicate details'), {
        code: '23505',
        constraint,
      });
      const { database: db } = database(
        vi.fn(async () => {
          throw raw;
        }),
      );
      const failure = await pgCreateNumberingRange(db, scope, rangeInput('unique'), RANGE_AT).catch(
        (error) => error,
      );
      expect(failure.getStatus()).toBe(409);
      expect(failure.getResponse()).toEqual({
        statusCode: 409,
        errorCode: code,
        message,
        retryable: false,
      });
    },
  );

  it.each([{ code: '23505', constraint: 'unrelated_constraint' }, { code: '08006' }])(
    'preserves unclassified database failure %j rather than fabricating an application conflict',
    async (properties) => {
      const raw = Object.assign(new Error('original failure'), properties);
      const { database: db } = database(
        vi.fn(async () => {
          throw raw;
        }),
      );
      await expect(pgCreateNumberingRange(db, scope, rangeInput('unknown'), RANGE_AT)).rejects.toBe(
        raw,
      );
    },
  );

  it('reads only through caller transaction with bound tenant/filter/cursor and fail-closed actor admission', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { database: db, tx } = database(query);
    expect(await pgGetNumberingRange(db, scope, id)).toBe(null);
    expect(
      await pgListNumberingRanges(db, scope, {
        orgUnitId: 'org-a',
        entityType: 'citation',
        series: 'A',
        status: 'cancelled',
        cursor: id,
        limit: 200,
      }),
    ).toEqual({ items: [], nextCursor: null });
    for (const call of tx.mock.calls)
      expect(call[1]).toEqual({
        readonly: true,
        isolation: 'read committed',
        requireActor: true,
        retry: false,
      });
    expect(query.mock.calls[0]![1]).toEqual([RANGE_TENANT_A, id]);
    expect(query.mock.calls[1]![1]).toEqual([
      RANGE_TENANT_A,
      'org-a',
      'citation',
      'A',
      'cancelled',
      id,
      201,
    ]);
    expect(query.mock.calls.every(([sql]) => /^\s*select\b/iu.test(sql))).toBe(true);
  });

  it('refuses a nonfinite historical database timestamp instead of inventing a returned instant', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id,
          tenant_id: RANGE_TENANT_A,
          org_unit_id: 'org',
          entity_type: 'citation',
          series: 'A',
          start_number: 1,
          end_number: 2,
          next_number: 1,
          status: 'active',
          consumer_attributes: null,
          created_by: null,
          created_at: 'infinity',
          updated_at: null,
          cancelled_by: null,
          cancelled_at: null,
          cancellation_reason: null,
        },
      ],
    }));
    const { database: db } = database(query);
    await expect(pgGetNumberingRange(db, scope, id)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    });
    expect(query).toHaveBeenCalledOnce();
  });
});

it('refuses a keyed creation receipt with a valid captured instant but forged initial snapshot without performing another write', async () => {
  const input = rangeInput('invalid-imported-snapshot', { idempotencyKey: 'original-key' });
  const request = {
    tenantId: scope.tenantId,
    orgUnitId: input.orgUnitId,
    entityType: input.entityType,
    series: input.series,
    startNumber: input.startNumber,
    endNumber: input.endNumber,
  };
  const receipt = {
    id,
    ...request,
    nextNumber: 11,
    status: 'active',
    createdAt: RANGE_AT,
    createdBy: 'original-actor',
  };
  const captured = {
    id,
    tenant_id: scope.tenantId,
    org_unit_id: input.orgUnitId,
    entity_type: input.entityType,
    series: input.series,
    start_number: input.startNumber,
    end_number: input.endNumber,
    next_number: 20,
    status: 'active',
    consumer_attributes: null,
    created_by: 'original-actor',
    created_at: RANGE_AT,
    created_us: String(BigInt(Date.parse(RANGE_AT)) * 1000n),
    creation_key: 'original-key',
    creation_fingerprint: fixtureDigest(request),
    creation_receipt: receipt,
  };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('from offline.numbering_ranges') ? [captured] : [],
  }));
  const { database: db } = database(query);
  await expect(
    pgCreateNumberingRange(db, scope, input, 'invalid-new-clock-not-needed-on-replay'),
  ).rejects.toMatchObject({
    code: 'OFFLINE_SYNC_CONFIGURATION_ERROR',
    message: expect.stringContaining('rangeCreationReceipt'),
  });
  expect(query.mock.calls.every(([sql]) => /^\s*select\b/iu.test(sql))).toBe(true);
});
