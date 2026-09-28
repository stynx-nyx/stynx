import { SerializationFailureError } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxRow, OutboxSqlExecutor } from '../../src/types';

const tenant = '11111111-1111-4111-8111-111111111111';
const createdAt = '2026-08-24T00:00:00.000Z';
const sent = (id: string): OutboxRow => ({
  id,
  tenantId: tenant,
  entity: 'ctg9.persistence',
  entityId: id,
  payload: { id },
  metadata: null,
  status: 'SENT',
  attempts: 1,
  lastError: null,
  ackTime: null,
  nextAttemptAt: null,
  idempotencyKey: id,
  createdAt,
  updatedAt: createdAt,
});

describe('CTG9 wrapped SQL persistence errors', () => {
  it('keeps a legacy 40P01 failure unresolved and continues a later claimed row', async () => {
    const first = sent('11111111-1111-4111-8111-111111111112');
    const second = sent('11111111-1111-4111-8111-111111111113');
    const failedSecond = { ...second, status: 'ERROR' as const, lastError: 'offline' };
    let sending = '';
    const send = vi.fn(async (row: OutboxRow) => {
      sending = row.id;
      throw new Error('offline');
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with ownership as materialized') && sql.includes('due as')) {
        return { rows: [first, second] };
      }
      if (sql.includes('update outbox.messages') && sql.includes("status = 'ERROR'")) {
        return { rows: [failedSecond] };
      }
      return { rows: [] };
    });
    const executor = { query } as unknown as OutboxSqlExecutor;
    const database = {
      tx: vi.fn(async (fn: (trx: OutboxSqlExecutor) => Promise<unknown>) => {
        if (sending === first.id) throw new SerializationFailureError({ code: '40P01' });
        return fn(executor);
      }),
      withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
    };
    const service = new OutboxService(
      database as never,
      { failurePersistenceDeadlineMs: 1, lockTimeoutMs: 10 },
      { send },
    );

    const outcomes = await service.dispatchDue(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({
      row: first,
      dispatched: false,
      reconciliationRequired: true,
      error: expect.stringContaining('persistence unresolved'),
    });
    expect(outcomes[1]).toMatchObject({
      row: failedSecond,
      dispatched: false,
      error: 'offline',
    });
    expect(
      query.mock.calls.some(
        ([sql]) => sql.includes('update outbox.messages') && sql.includes("status = 'ERROR'"),
      ),
    ).toBe(true);
    expect(
      database.tx.mock.calls.filter(
        ([, options]) => (options as { lockTimeoutMs?: number } | undefined)?.lockTimeoutMs === 10,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('keeps an event 40P01 failure unresolved and continues a later claimed event', async () => {
    const first = sent('22222222-2222-4222-8222-222222222223');
    const second = sent('22222222-2222-4222-8222-222222222224');
    const claims = [first, second].map((item) => ({
      tenant_id: tenant,
      event_id: item.id,
      attempts: 1,
      status: 'SENT',
      entity: item.entity,
      entity_id: item.entityId,
      idempotency_key: item.idempotencyKey,
      payload: item.payload,
      metadata: null,
      created_at: new Date(createdAt),
    }));
    let sending = '';
    const send = vi.fn(async (row: OutboxRow) => {
      sending = row.id;
      throw new Error('offline');
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: claims };
      if (sql.includes('update outbox.event_delivery') && sql.includes('returning event_id')) {
        return { rows: [{ event_id: second.id }] };
      }
      return { rows: [] };
    });
    const executor = { query } as unknown as OutboxSqlExecutor;
    const database = {
      tx: vi.fn(async (fn: (trx: OutboxSqlExecutor) => Promise<unknown>) => {
        if (sending === first.id) throw new SerializationFailureError({ code: '40P01' });
        return fn(executor);
      }),
      withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
    };
    const service = new OutboxService(database as never, {}, { send });

    const outcomes = await service.dispatchEventsDue(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({
      row: { id: first.id },
      dispatched: false,
      reconciliationRequired: true,
      error: expect.stringContaining('attempt persistence unresolved'),
    });
    expect(outcomes[1]).toMatchObject({
      row: { id: second.id, status: 'ERROR' },
      dispatched: false,
      error: 'offline',
    });
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes('update outbox.event_delivery') && sql.includes('returning event_id'),
      ),
    ).toBe(true);
  });
});
