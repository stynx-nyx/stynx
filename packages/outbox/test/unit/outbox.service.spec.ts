import { createHmac } from 'node:crypto';
import { FixedIntervalBackoffPolicy } from '../../src/backoff';
import { signOutboxAckPayload, verifyOutboxAckSignature } from '../../src/ack-signature';
import { OutboxAmbiguousAckError } from '../../src/errors';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxDispatcherPort, OutboxRow, OutboxSqlExecutor } from '../../src/types';

const row: OutboxRow = {
  id: 'message-1',
  tenantId: '11111111-1111-1111-1111-111111111111',
  entity: 'renach.encounter',
  entityId: 'encounter-1',
  payload: { encounterId: 'encounter-1' },
  metadata: null,
  status: 'PENDING',
  attempts: 0,
  lastError: null,
  ackTime: null,
  nextAttemptAt: null,
  idempotencyKey: 'renach.encounter:encounter-1',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

function createService(
  query: OutboxSqlExecutor['query'],
  options: { dispatcher?: OutboxDispatcherPort; backoffMs?: number } = {},
) {
  const executor = { query } as OutboxSqlExecutor;
  const database = {
    tx: vi.fn(async (fn: (trx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor)),
    withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
  };
  return {
    database,
    service: new OutboxService(
      database as never,
      {},
      options.dispatcher,
      new FixedIntervalBackoffPolicy(options.backoffMs),
    ),
  };
}

describe('OutboxService', () => {
  it('uses the caller transaction and the tenant GUC for enqueue', async () => {
    const query = vi.fn(async () => ({ rows: [row] }));
    const { database, service } = createService(query);
    const callerTransaction = { query } as OutboxSqlExecutor;

    await expect(
      service.enqueue(callerTransaction, {
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
      }),
    ).resolves.toEqual(row);

    expect(database.tx).not.toHaveBeenCalled();
    expect(query.mock.calls[0]?.[0]).toContain("nullif(current_setting('app.tenant_id', true), '')::uuid");
    expect(query.mock.calls[0]?.[0]).toContain('on conflict (tenant_id, entity, entity_id)');
    expect(query.mock.calls[0]?.[1]).toEqual([
      row.entity,
      row.entityId,
      JSON.stringify(row.payload),
      null,
      row.idempotencyKey,
    ]);
  });

  it('claims due rows using the SKIP LOCKED CTE and dispatches each row', async () => {
    const query = vi.fn(async () => ({ rows: [{ ...row, status: 'SENT', attempts: 1 }] }));
    const dispatcher: OutboxDispatcherPort = { send: vi.fn(async () => undefined) };
    const { database, service } = createService(query, { dispatcher });

    const outcome = await service.dispatchDue(7);

    expect(outcome).toEqual([{ row: { ...row, status: 'SENT', attempts: 1 }, dispatched: true }]);
    expect(database.withSystemContext).toHaveBeenCalledWith('outbox claim', expect.any(Function));
    expect(query.mock.calls[0]?.[0]).toContain('for update skip locked');
    expect(query.mock.calls[0]?.[0]).toContain("status in ('PENDING', 'ERROR')");
    expect(query.mock.calls[0]?.[0]).toContain("set status = 'SENT'");
    expect(query.mock.calls[0]?.[1]).toEqual([7]);
    expect(dispatcher.send).toHaveBeenCalledWith({ ...row, status: 'SENT', attempts: 1 });
  });

  it('records an ERROR and schedules backoff when dispatch fails', async () => {
    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const failed = {
      ...sent,
      status: 'ERROR' as const,
      lastError: 'transport unavailable',
      nextAttemptAt: '2026-08-24T00:15:00.000Z',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [failed] });
    const dispatcher: OutboxDispatcherPort = { send: vi.fn(async () => { throw new Error('transport unavailable'); }) };
    const { database, service } = createService(query, { dispatcher, backoffMs: 15 * 60_000 });

    await expect(service.dispatchDue()).resolves.toEqual([
      { row: failed, dispatched: false, error: 'transport unavailable' },
    ]);

    expect(database.withSystemContext).toHaveBeenCalledWith('outbox dispatch failure', expect.any(Function));
    expect(query.mock.calls[1]?.[0]).toContain("set status = 'ERROR'");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(row.id);
    expect(query.mock.calls[1]?.[1]?.[1]).toBe('transport unavailable');
    expect(query.mock.calls[1]?.[1]?.[2]).toBeInstanceOf(Date);
  });

  it('fails closed when an ACK target is ambiguous across tenants', async () => {
    const query = vi.fn(async () => ({
      rows: [
        { id: 'message-a', tenantId: '11111111-1111-1111-1111-111111111111' },
        { id: 'message-b', tenantId: '22222222-2222-2222-2222-222222222222' },
      ],
    }));
    const { service } = createService(query);

    await expect(
      service.ack({ entity: row.entity, entityId: row.entityId, status: 'ACKED' }),
    ).rejects.toBeInstanceOf(OutboxAmbiguousAckError);
  });

  it('verifies HMAC ACK signatures in constant-time-compatible header form', () => {
    const secret = 'ack-secret';
    const rawBody = Buffer.from('{"entity":"renach.encounter"}');
    const signature = signOutboxAckPayload(secret, rawBody);

    expect(signature).toBe(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    expect(verifyOutboxAckSignature(secret, rawBody, signature)).toBe(true);
    expect(verifyOutboxAckSignature(secret, rawBody, 'sha256=00')).toBe(false);
    expect(verifyOutboxAckSignature(secret, rawBody, 'invalid')).toBe(false);
  });
});
