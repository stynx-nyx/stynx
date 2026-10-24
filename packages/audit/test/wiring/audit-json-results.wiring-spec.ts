import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { StynxAuthGuard, PermissionGuard } from '@stynx-nyx/auth';
import request from '../../../core/test/support/request-with-id.js';
import { AuditSqlReader } from '../../src/sql-adapter.js';
import { StynxAuditService } from '../../src/audit.service.js';
import { StynxAuditController } from '../../src/audit.controller.js';

const cases = [
  { name: 'object', value: { nested: { retained: true } } },
  { name: 'array', value: [null, { retained: true }] },
  { name: 'string', value: 'opaque' },
  { name: 'number', value: 12.5 },
  { name: 'boolean', value: false },
  { name: 'null', value: null },
  { name: 'undefined', value: undefined },
];
function row(value: unknown) {
  return { id: '1', occurred_at: '2026-10-24T00:00:00.000Z',
    table_schema: 'app', table_name: 'items', row_id: null, operation: 'INSERT',
    tenant_id: null, actor_id: null, request_id: null, session_id: null,
    tags: value, payload: value, pk: value, metadata: value,
    old_data: value, new_data: value, total: '1' };
}

describe('actual audit JSON result observations', () => {
  let app: INestApplication;
  let service: StynxAuditService;
  let rows: unknown[] = [];
  let failure: Error | undefined;
  const trx = { query: vi.fn(async () => {
    if (failure) throw failure;
    return { rows };
  }) };
  const database = {
    withSystemContext: vi.fn(async <T>(_reason: string, consume: () => Promise<T>) => consume()),
    tx: vi.fn(async <T>(consume: (port: typeof trx) => Promise<T>, _options: unknown) => consume(trx)),
  };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StynxAuditController],
      providers: [
        { provide: Database, useValue: database },
        { provide: StynxAuditService, inject: [ModuleRef], useFactory: (ref: ModuleRef) =>
          new StynxAuditService(ref, {}, { now: () => new Date('2026-10-24T00:00:00Z') }) },
      ],
    }).overrideGuard(StynxAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true }).compile();
    service = moduleRef.get(StynxAuditService);
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { failure = undefined; vi.clearAllMocks(); });

  it.each(cases)('preserves stynx_events raw JSON fields and nullish defaults: $name', async ({ value }) => {
    const physical = row(value);
    const query = vi.fn(async () => ({ rows: [physical] }));
    const reader = new AuditSqlReader({ query }, { mode: 'stynx_events' });
    const result = await reader.list({});
    for (const field of ['pk', 'metadata', 'oldData', 'newData'] as const) {
      expect(result.items[0]?.[field]).toBe(value ?? null);
    }
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
  });

  it.each(cases)('preserves actual legacy listLog values and Nest JSON output: $name', async ({ value }) => {
    rows = [row(value)];
    const direct = await service.listLog({ limit: 1 });
    expect(direct.items).toHaveLength(1);
    if (value == null) {
      expect(direct.items[0]?.tags).toEqual({});
      expect(direct.items[0]?.payload).toEqual({});
      expect(direct.items[0]?.tags).not.toBe(direct.items[0]?.payload);
    } else {
      expect(direct.items[0]?.tags).toBe(value);
      expect(direct.items[0]?.payload).toBe(value);
    }
    const response = await request(app.getHttpServer()).get('/_audit/log?limit=1').expect(200);
    expect(response.body.items[0].tags).toEqual(value ?? {});
    expect(response.body.items[0].payload).toEqual(value ?? {});
    expect(database.withSystemContext).toHaveBeenCalledWith('platform audit log read', expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
    expect(trx.query).toHaveBeenCalledTimes(2);
  });

  it('defaults absent JSON properties without requiring own keys', async () => {
    const { tags: _tags, payload: _payload, pk: _pk, metadata: _metadata, old_data: _oldData, new_data: _newData, ...physical } = row(null);
    rows = [physical];
    const direct = await service.listLog();
    expect(direct.items[0]?.tags).toEqual({});
    expect(direct.items[0]?.payload).toEqual({});
    const reader = new AuditSqlReader({ query: async () => ({ rows }) }, { mode: 'stynx_events' });
    expect((await reader.list({})).items[0]).toMatchObject({ pk: null, metadata: null, oldData: null, newData: null });
  });

  it('preserves opaque nested identity before standard HTTP serialization', async () => {
    const nested = { date: new Date('2026-10-24T00:00:00Z'), absent: undefined, sentinel: Infinity };
    rows = [row(nested)];
    const direct = await service.listLog();
    expect(direct.items[0]?.tags).toBe(nested);
    expect(direct.items[0]?.payload).toBe(nested);
    const response = await request(app.getHttpServer()).get('/_audit/log').expect(200);
    expect(response.body.items[0].tags).toEqual({ date: '2026-10-24T00:00:00.000Z', sentinel: null });
    expect(nested.date).toBeInstanceOf(Date);
    expect(nested.sentinel).toBe(Infinity);
  });

  it('retains driver error identity and ordinary HTTP error handling', async () => {
    failure = new Error('opaque driver failure');
    await expect(service.listLog()).rejects.toBe(failure);
    await request(app.getHttpServer()).get('/_audit/log').expect(500);
    const reader = new AuditSqlReader({ query: async () => { throw failure; } }, { mode: 'stynx_events' });
    await expect(reader.list({})).rejects.toBe(failure);
  });

  it('retains InvalidDate mapper failure before exposing JSON fields', async () => {
    rows = [{ ...row({ retained: true }), occurred_at: new Date(NaN) }];
    await expect(service.listLog()).rejects.toThrow(RangeError);
    await request(app.getHttpServer()).get('/_audit/log').expect(500);
    const reader = new AuditSqlReader({ query: async () => ({ rows }) }, { mode: 'stynx_events' });
    await expect(reader.list({})).rejects.toThrow(RangeError);
  });

  it.each([
    { name: 'omitted', projected: undefined },
    { name: 'null', projected: null },
    { name: 'primitive', projected: 'serialized' },
  ])('defers own toJSON to the actual HTTP serializer: $name', async ({ projected }) => {
    const toJSON = vi.fn(() => projected);
    const opaque = { retained: true, toJSON };
    rows = [row(opaque)];
    const direct = await service.listLog();
    expect(direct.items[0]?.tags).toBe(opaque);
    expect(direct.items[0]?.payload).toBe(opaque);
    expect(Object.hasOwn(direct.items[0] ?? {}, 'tags')).toBe(true);
    expect(Object.hasOwn(direct.items[0] ?? {}, 'payload')).toBe(true);
    expect(toJSON).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer()).get('/_audit/log').expect(200);
    expect(toJSON).toHaveBeenCalledTimes(2);
    if (projected === undefined) {
      expect(Object.hasOwn(response.body.items[0], 'tags')).toBe(false);
      expect(Object.hasOwn(response.body.items[0], 'payload')).toBe(false);
    } else {
      expect(response.body.items[0].tags).toBe(projected);
      expect(response.body.items[0].payload).toBe(projected);
    }
    expect(direct.items[0]?.tags).toBe(opaque);
    expect(direct.items[0]?.payload).toBe(opaque);
  });

  it.each(['cycle', 'bigint'])('retains serializer failure without eager direct validation: %s', async (kind) => {
    const opaque: Record<string, unknown> = {};
    opaque.value = kind === 'cycle' ? opaque : 1n;
    rows = [row(opaque)];
    const direct = await service.listLog();
    expect(direct.items[0]?.tags).toBe(opaque);
    expect(direct.items[0]?.payload).toBe(opaque);
    expect(() => JSON.stringify(direct)).toThrow(TypeError);
    await request(app.getHttpServer()).get('/_audit/log').expect(500);
    expect(direct.items[0]?.tags).toBe(opaque);
    expect(direct.items[0]?.payload).toBe(opaque);
  });

});
