import { ExponentialBackoffPolicy, FixedIntervalBackoffPolicy } from '../../src/backoff';
import { verifyOutboxAckSignature } from '../../src/ack-signature';
import {
  OutboxAlreadyEnqueuedError,
  OutboxAmbiguousAckError,
  OutboxNotFoundError,
} from '../../src/errors';
import { HttpOutboxDispatcher } from '../../src/http-outbox-dispatcher';
import { InMemoryOutboxMetrics } from '../../src/metrics';
import { OutboxService } from '../../src/outbox.service';
import {
  assertQualifiedIdentifier,
  errorMessage,
  isPgError,
  isUniqueViolation,
  outboxColumns,
  toRows,
} from '../../src/row-mapper';
import type {
  OutboxBackoffPolicy,
  OutboxDispatcherPort,
  OutboxMetricsSink,
  OutboxModuleOptions,
  OutboxRow,
  OutboxSqlExecutor,
} from '../../src/types';

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
  options: {
    dispatcher?: OutboxDispatcherPort;
    backoff?: OutboxBackoffPolicy;
    metrics?: OutboxMetricsSink;
    module?: OutboxModuleOptions;
  } = {},
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
      options.module ?? {},
      options.dispatcher,
      options.backoff,
      options.metrics,
    ),
  };
}

describe('outbox supporting behavior', () => {
  it('computes fixed and capped exponential retry times, including deterministic jitter', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    expect(new FixedIntervalBackoffPolicy().nextAttemptAt(99, now).toISOString()).toBe(
      '2026-08-25T00:15:00.000Z',
    );
    expect(new FixedIntervalBackoffPolicy(125).nextAttemptAt(1, now).getTime()).toBe(
      now.getTime() + 125,
    );

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(new ExponentialBackoffPolicy().nextAttemptAt(1, now).getTime()).toBe(
      now.getTime() + 32_500,
    );
    expect(
      new ExponentialBackoffPolicy({ baseMs: 100, factor: 3, maxMs: 500, jitterMs: 0 })
        .nextAttemptAt(0, now)
        .getTime(),
    ).toBe(now.getTime() + 100);
    expect(
      new ExponentialBackoffPolicy({ baseMs: 100, factor: 3, maxMs: 500, jitterMs: 0 })
        .nextAttemptAt(5, now)
        .getTime(),
    ).toBe(now.getTime() + 500);
    random.mockRestore();
  });

  it('exposes typed failures with stable status, code, and context', () => {
    const notFound = new OutboxNotFoundError({ id: 'missing' });
    const duplicate = new OutboxAlreadyEnqueuedError({ idempotencyKey: 'duplicate' });
    const ambiguous = new OutboxAmbiguousAckError({ matches: 2 });

    expect(notFound).toMatchObject({ code: 'OUTBOX_NOT_FOUND', status: 404 });
    expect(duplicate).toMatchObject({ code: 'OUTBOX_ALREADY_ENQUEUED', status: 409 });
    expect(ambiguous).toMatchObject({ code: 'OUTBOX_AMBIGUOUS_ACK', status: 409 });
  });

  it('normalizes SQL results and rejects unsafe identifiers and error shapes', () => {
    expect(toRows([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(toRows({ rows: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(outboxColumns('message')).toContain('message.tenant_id as "tenantId"');
    expect(outboxColumns()).toContain('tenant_id as "tenantId"');
    expect(assertQualifiedIdentifier('outbox.messages', 'table')).toBe('outbox.messages');
    expect(() => assertQualifiedIdentifier('outbox.messages;drop', 'table')).toThrow(
      'Invalid SQL identifier for table',
    );
    expect(isPgError({ code: '23505' })).toBe(true);
    expect(isPgError(null)).toBe(false);
    expect(isPgError('23505')).toBe(false);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '40001' })).toBe(false);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage({ reason: 'boom' })).toBe('[object Object]');
    expect(verifyOutboxAckSignature('secret', Buffer.from('body'), 'sha256=')).toBe(false);
  });

  it('counts enqueued, dispatched, and acknowledged outcomes independently', () => {
    const metrics = new InMemoryOutboxMetrics();
    metrics.incrementEnqueued('job');
    metrics.incrementEnqueued('job');
    metrics.incrementDispatched('job', 'sent');
    metrics.incrementDispatched('job', 'error');
    metrics.incrementAcked('job', 'acked');
    metrics.incrementAcked('job', 'error');

    expect(metrics.snapshot()).toEqual({
      enqueued: { job: 2 },
      dispatched: { 'job:sent': 1, 'job:error': 1 },
      acked: { 'job:acked': 1, 'job:error': 1 },
    });
  });

  it('dispatches HTTP using static defaults and derived options, and rejects non-2xx', async () => {
    const staticFetch = vi.fn(async () => ({ ok: true, status: 202 })) as never;
    await new HttpOutboxDispatcher({
      url: 'https://example.invalid/outbox',
      fetchImpl: staticFetch,
      timeoutMs: 50,
    }).send(row);
    expect(staticFetch).toHaveBeenCalledWith(
      'https://example.invalid/outbox',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row.payload),
        signal: expect.any(AbortSignal),
      }),
    );

    const derivedFetch = vi.fn(async () => ({ ok: false, status: 503 })) as never;
    const derived = new HttpOutboxDispatcher({
      url: (message) => `https://example.invalid/${message.entity}`,
      headers: (message) => ({ 'x-message-id': message.id }),
      method: 'PUT',
      fetchImpl: derivedFetch,
    });
    await expect(derived.send(row)).rejects.toThrow(
      'Outbox dispatch to https://example.invalid/renach.encounter failed with HTTP 503',
    );
    expect(derivedFetch).toHaveBeenCalledWith(
      'https://example.invalid/renach.encounter',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-message-id': row.id },
      }),
    );

    const globalFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    await new HttpOutboxDispatcher({ url: 'https://example.invalid/global' }).send(row);
    expect(globalFetch).toHaveBeenCalledOnce();
    globalFetch.mockRestore();
  });
});

describe('OutboxService depth', () => {
  it('reads one row and fails closed when it is absent', async () => {
    const found = createService(vi.fn(async () => ({ rows: [row] })));
    await expect(found.service.getOne(row.entity, row.entityId)).resolves.toEqual(row);
    expect(found.database.tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'reader',
      readonly: true,
    });

    const missing = createService(vi.fn(async () => ({ rows: [] })));
    await expect(missing.service.getOne(row.entity, row.entityId)).rejects.toBeInstanceOf(
      OutboxNotFoundError,
    );
  });

  it('enqueues optional metadata and metrics, maps duplicate keys, and preserves other errors', async () => {
    const metrics = {
      incrementEnqueued: vi.fn(),
      incrementDispatched: vi.fn(),
      incrementAcked: vi.fn(),
    };
    const query = vi.fn(async () => [row] as never);
    const { service } = createService(query, { metrics });
    await service.enqueue({ query } as OutboxSqlExecutor, {
      entity: row.entity,
      entityId: row.entityId,
      payload: row.payload,
      metadata: { source: 'test' },
      idempotencyKey: 'explicit-key',
    });
    expect(query.mock.calls[0]?.[1]).toEqual([
      row.entity,
      row.entityId,
      JSON.stringify(row.payload),
      JSON.stringify({ source: 'test' }),
      'explicit-key',
    ]);
    expect(metrics.incrementEnqueued).toHaveBeenCalledWith(row.entity);

    const emptyPayloadQuery = vi.fn(async () => ({ rows: [row] }));
    await createService(emptyPayloadQuery).service.enqueue(
      { query: emptyPayloadQuery } as OutboxSqlExecutor,
      { entity: row.entity, entityId: row.entityId, payload: undefined } as never,
    );
    expect(emptyPayloadQuery.mock.calls[0]?.[1]?.[2]).toBe('{}');

    const duplicate = createService(
      vi.fn(async () => {
        throw { code: '23505' };
      }),
    );
    await expect(
      duplicate.service.enqueue(
        {
          query: vi.fn(async () => {
            throw { code: '23505' };
          }),
        } as never,
        {
          entity: row.entity,
          entityId: row.entityId,
          payload: row.payload,
        },
      ),
    ).rejects.toBeInstanceOf(OutboxAlreadyEnqueuedError);

    const failure = new Error('database unavailable');
    const failingQuery = vi.fn(async () => {
      throw failure;
    });
    await expect(
      createService(failingQuery).service.enqueue({ query: failingQuery } as never, {
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
      }),
    ).rejects.toBe(failure);

    const emptyQuery = vi.fn(async () => ({ rows: [] }));
    await expect(
      createService(emptyQuery).service.enqueue({ query: emptyQuery } as never, {
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
      }),
    ).rejects.toBeInstanceOf(OutboxNotFoundError);
  });

  it('returns empty and dispatcher-free claims without transport calls', async () => {
    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.dispatchDue(),
    ).resolves.toEqual([]);

    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const query = vi.fn(async () => ({ rows: [sent] }));
    await expect(
      createService(query, { module: { dispatchBatchSize: 3 } }).service.dispatchDue(),
    ).resolves.toEqual([{ row: sent, dispatched: false }]);
    expect(query.mock.calls[0]?.[1]).toEqual([3]);
  });

  it('records a non-Error dispatcher failure and fails closed if persistence returns no row', async () => {
    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const dispatcher = {
      send: vi.fn(async () => {
        throw 'offline';
      }),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(createService(query, { dispatcher }).service.dispatchDue()).rejects.toBeInstanceOf(
      OutboxNotFoundError,
    );
  });

  it('records both dispatcher metric outcomes', async () => {
    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const failed = { ...sent, status: 'ERROR' as const, lastError: 'offline' };
    const metrics = {
      incrementEnqueued: vi.fn(),
      incrementDispatched: vi.fn(),
      incrementAcked: vi.fn(),
    };
    const successQuery = vi.fn(async () => ({ rows: [sent] }));
    await createService(successQuery, {
      dispatcher: { send: vi.fn(async () => undefined) },
      metrics,
    }).service.dispatchDue();
    expect(metrics.incrementDispatched).toHaveBeenCalledWith(row.entity, 'sent');

    const failureQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [failed] });
    await createService(failureQuery, {
      dispatcher: {
        send: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
      metrics,
    }).service.dispatchDue();
    expect(metrics.incrementDispatched).toHaveBeenCalledWith(row.entity, 'error');
  });

  it('retries immediately or with the policy and rejects absent or vanished rows', async () => {
    const reset = { ...row, status: 'PENDING' as const, attempts: 3 };
    const immediateQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 2 }] })
      .mockResolvedValueOnce({ rows: [reset] });
    await expect(
      createService(immediateQuery).service.retry(row.id, { immediate: true }),
    ).resolves.toEqual(reset);
    expect(immediateQuery.mock.calls[1]?.[1]?.[1]).toBe(3);
    expect(immediateQuery.mock.calls[1]?.[1]?.[2]).toBeInstanceOf(Date);

    const nextAttemptAt = new Date('2026-08-25T10:00:00.000Z');
    const backoff = { nextAttemptAt: vi.fn(() => nextAttemptAt) };
    const delayedQuery = vi
      .fn()
      .mockResolvedValueOnce([{ attempts: 0 }])
      .mockResolvedValueOnce([reset]);
    await createService(delayedQuery, { backoff }).service.retry(row.id);
    expect(backoff.nextAttemptAt).toHaveBeenCalledWith(1, expect.any(Date));
    expect(delayedQuery.mock.calls[1]?.[1]?.[2]).toBe(nextAttemptAt);

    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.retry(row.id),
    ).rejects.toBeInstanceOf(OutboxNotFoundError);
    const vanished = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(createService(vanished).service.retry(row.id)).rejects.toBeInstanceOf(
      OutboxNotFoundError,
    );
  });

  it('acknowledges with tenant disambiguation, records metrics, and tolerates duplicate receipt storage', async () => {
    const acked = { ...row, status: 'ACKED' as const };
    const metrics = {
      incrementEnqueued: vi.fn(),
      incrementDispatched: vi.fn(),
      incrementAcked: vi.fn(),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [acked] })
      .mockRejectedValueOnce({ code: '23505' });
    await expect(
      createService(query, { metrics }).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        tenantId: row.tenantId,
        status: 'ACKED',
      }),
    ).resolves.toEqual(acked);
    expect(query.mock.calls[0]?.[0]).toContain('tenant_id = $3::uuid');
    expect(query.mock.calls[0]?.[1]).toEqual([row.entity, row.entityId, row.tenantId]);
    expect(metrics.incrementAcked).toHaveBeenCalledWith(row.entity, 'acked');
  });

  it('records ERROR detail, rejects nonunique receipt failures, missing targets, and vanished updates', async () => {
    const errored = { ...row, status: 'ERROR' as const };
    const metrics = {
      incrementEnqueued: vi.fn(),
      incrementDispatched: vi.fn(),
      incrementAcked: vi.fn(),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [errored] })
      .mockResolvedValueOnce({ rows: [] });
    await createService(query, { metrics }).service.ack({
      entity: row.entity,
      entityId: row.entityId,
      status: 'ERROR',
      detail: 'rejected',
    });
    expect(query.mock.calls[1]?.[1]).toEqual([row.id, 'ERROR', 'rejected']);
    expect(metrics.incrementAcked).toHaveBeenCalledWith(row.entity, 'error');

    const receiptFailure = new Error('receipt unavailable');
    const receiptQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [errored] })
      .mockRejectedValueOnce(receiptFailure);
    await expect(
      createService(receiptQuery).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ERROR',
      }),
    ).rejects.toBe(receiptFailure);

    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ACKED',
      }),
    ).rejects.toBeInstanceOf(OutboxNotFoundError);

    const vanished = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      createService(vanished).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ACKED',
      }),
    ).rejects.toBeInstanceOf(OutboxNotFoundError);
  });
});
