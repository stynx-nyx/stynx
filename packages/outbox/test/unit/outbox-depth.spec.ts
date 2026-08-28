import { createHmac } from 'node:crypto';
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

function compactSql(value: unknown): string {
  return String(value).replace(/\s+/gu, ' ').trim();
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

  it('preserves zero-valued backoff options and clamps attempts before applying bounded jitter', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const policy = new ExponentialBackoffPolicy({
      baseMs: 100,
      factor: 4,
      maxMs: 1_000,
      jitterMs: 10,
    });

    expect(policy.nextAttemptAt(-4, now).getTime() - now.getTime()).toBe(109);
    expect(policy.nextAttemptAt(4, now).getTime() - now.getTime()).toBe(1_009);
    expect(
      new ExponentialBackoffPolicy({ baseMs: 0, factor: 0, maxMs: 0, jitterMs: 0 })
        .nextAttemptAt(10, now)
        .getTime(),
    ).toBe(now.getTime());
    random.mockRestore();
  });

  it('rejects malformed and content-mismatched acknowledgement signatures', () => {
    const secret = 'ack-secret';
    const body = Buffer.from('expected');
    const valid = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(verifyOutboxAckSignature(secret, body, valid)).toBe(true);
    expect(verifyOutboxAckSignature(secret, Buffer.from('changed'), valid)).toBe(false);
    expect(verifyOutboxAckSignature(secret, body, '')).toBe(false);
    expect(verifyOutboxAckSignature(secret, body, 'sha256=zz')).toBe(false);
    expect(verifyOutboxAckSignature(secret, body, `sha256=${'00'.repeat(31)}`)).toBe(false);
  });

  it('rejects a correctly sized digest carried under a non-governed signature prefix', () => {
    const secret = 'ack-secret';
    const body = Buffer.from('expected');
    const digest = createHmac('sha256', secret).update(body).digest('hex');

    expect(verifyOutboxAckSignature(secret, body, `invalid${digest}`)).toBe(false);
  });

  it('does not consume randomness when jitter is disabled', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const random = vi.spyOn(Math, 'random');

    expect(
      new ExponentialBackoffPolicy({ baseMs: 100, factor: 2, maxMs: 1_000, jitterMs: 0 })
        .nextAttemptAt(2, now)
        .getTime(),
    ).toBe(now.getTime() + 200);
    expect(random).not.toHaveBeenCalled();
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
  it('binds explicit table, acknowledgement table, and injected backoff options', async () => {
    const nextAttemptAt = new Date('2026-08-25T10:00:00.000Z');
    const injectedBackoff = { nextAttemptAt: vi.fn(() => nextAttemptAt) };
    const configuredBackoff = { nextAttemptAt: vi.fn(() => new Date(0)) };
    const reset = { ...row, status: 'PENDING' as const, attempts: 2 };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [reset] });
    const { service } = createService(query, {
      backoff: injectedBackoff,
      module: {
        table: 'custom.messages',
        ackTable: 'custom.acks',
        backoffPolicy: configuredBackoff,
      },
    });

    await expect(service.retry(row.id)).resolves.toEqual(reset);
    expect(query.mock.calls[0]?.[0]).toContain('from custom.messages');
    expect(query.mock.calls[1]?.[0]).toContain('update custom.messages');
    expect(injectedBackoff.nextAttemptAt).toHaveBeenCalledWith(2, expect.any(Date));
    expect(configuredBackoff.nextAttemptAt).not.toHaveBeenCalled();
    expect(query.mock.calls[1]?.[1]).toEqual([row.id, 2, nextAttemptAt]);

    expect(() => createService(vi.fn(), { module: { table: 'unsafe;table' } })).toThrow(
      'Invalid SQL identifier for table',
    );
    expect(() => createService(vi.fn(), { module: { ackTable: 'unsafe ack' } })).toThrow(
      'Invalid SQL identifier for ackTable',
    );
  });

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

  it('reads by the exact tenant-governed entity key and binds only its public identifiers', async () => {
    const query = vi.fn(async () => ({ rows: [row] }));
    const { database, service } = createService(query);

    await expect(service.getOne(row.entity, row.entityId)).resolves.toEqual(row);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain(
      'from outbox.messages where entity = $1 and entity_id = $2',
    );
    expect(query.mock.calls[0]?.[0]).toContain('tenant_id as "tenantId"');
    expect(query.mock.calls[0]?.[1]).toEqual([row.entity, row.entityId]);
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'reader',
      readonly: true,
    });
    expect(compactSql(query.mock.calls[0]?.[0])).toBe(
      compactSql(
        `select ${outboxColumns()} from outbox.messages where entity = $1 and entity_id = $2`,
      ),
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
    expect(query.mock.calls[0]?.[0]).toContain(
      "nullif(current_setting('app.tenant_id', true), '')::uuid",
    );
    expect(query.mock.calls[0]?.[0]).toContain('on conflict (tenant_id, entity, entity_id)');
    expect(query.mock.calls[0]?.[0]).toContain(
      'do update set updated_at = now(), idempotency_key = excluded.idempotency_key',
    );
    expect(compactSql(query.mock.calls[0]?.[0])).toBe(
      compactSql(`insert into outbox.messages (id, tenant_id, entity, entity_id, payload, metadata, status, idempotency_key, next_attempt_at)
        values (
          gen_random_uuid(),
          nullif(current_setting('app.tenant_id', true), '')::uuid,
          $1, $2, $3::jsonb, $4::jsonb, 'PENDING', $5, null
        )
        on conflict (tenant_id, entity, entity_id)
        do update set updated_at = now(), idempotency_key = excluded.idempotency_key
        returning ${outboxColumns()}`),
    );
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

  it('claims with exact ordering, limit, state reset, and owner transaction semantics', async () => {
    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const query = vi.fn(async () => ({ rows: [sent] }));
    const { database, service } = createService(query);

    await expect(service.dispatchDue(0)).resolves.toEqual([{ row: sent, dispatched: false }]);
    expect(database.withSystemContext).toHaveBeenCalledWith('outbox claim', expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
    });
    expect(query.mock.calls[0]?.[0]).toContain('coalesce(next_attempt_at, created_at) <= now()');
    expect(query.mock.calls[0]?.[0]).toContain('order by created_at asc');
    expect(query.mock.calls[0]?.[0]).toContain('attempts = attempts + 1');
    expect(query.mock.calls[0]?.[0]).toContain('last_error = null');
    expect(query.mock.calls[0]?.[0]).toContain('next_attempt_at = null');
    expect(query.mock.calls[0]?.[1]).toEqual([0]);
    expect(compactSql(query.mock.calls[0]?.[0])).toBe(
      compactSql(`with due as (
        select id from outbox.messages
        where status in ('PENDING', 'ERROR')
          and coalesce(next_attempt_at, created_at) <= now()
        order by created_at asc
        limit $1
        for update skip locked
      )
      update outbox.messages o
      set status = 'SENT', attempts = attempts + 1, last_error = null,
          next_attempt_at = null, updated_at = now()
      from due where o.id = due.id returning ${outboxColumns('o')}`),
    );
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

  it('truncates persisted dispatch errors and binds the current attempt to backoff', async () => {
    const sent = { ...row, status: 'SENT' as const, attempts: 4 };
    const failed = { ...sent, status: 'ERROR' as const };
    const longMessage = 'x'.repeat(4_100);
    const nextAttemptAt = new Date('2026-08-25T11:00:00.000Z');
    const backoff = { nextAttemptAt: vi.fn(() => nextAttemptAt) };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [failed] });
    const { database, service } = createService(query, {
      backoff,
      dispatcher: { send: vi.fn(async () => Promise.reject(new Error(longMessage))) },
    });

    await expect(service.dispatchDue(1)).resolves.toEqual([
      { row: failed, dispatched: false, error: longMessage },
    ]);
    expect(backoff.nextAttemptAt).toHaveBeenCalledWith(4, expect.any(Date));
    expect(query.mock.calls[1]?.[1]).toEqual([row.id, 'x'.repeat(4_000), nextAttemptAt]);
    expect(database.withSystemContext).toHaveBeenNthCalledWith(
      2,
      'outbox dispatch failure',
      expect.any(Function),
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

  it('uses owner system context for immediate retry without consulting backoff', async () => {
    const reset = { ...row, status: 'PENDING' as const, attempts: 8 };
    const backoff = { nextAttemptAt: vi.fn(() => new Date(0)) };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 7 }] })
      .mockResolvedValueOnce({ rows: [reset] });
    const { database, service } = createService(query, { backoff });

    await expect(service.retry(row.id, { immediate: true })).resolves.toEqual(reset);
    expect(backoff.nextAttemptAt).not.toHaveBeenCalled();
    expect(database.withSystemContext).toHaveBeenCalledWith('outbox retry', expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
    });
    expect(query.mock.calls[1]?.[0]).toContain("status = 'PENDING'");
    expect(query.mock.calls[1]?.[0]).toContain('last_error = null');
    expect(compactSql(query.mock.calls[0]?.[0])).toBe(
      'select attempts from outbox.messages where id = $1',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([row.id]);
    expect(compactSql(query.mock.calls[1]?.[0])).toBe(
      compactSql(`update outbox.messages
        set attempts = $2, status = 'PENDING', last_error = null,
            next_attempt_at = $3, updated_at = now()
        where id = $1 returning ${outboxColumns()}`),
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

  it('records a successful acknowledgement and receipt with exact owner-scoped bindings', async () => {
    const acked = { ...row, status: 'ACKED' as const };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [acked] })
      .mockResolvedValueOnce({ rows: [] });
    const { database, service } = createService(query);

    await expect(
      service.ack({ entity: row.entity, entityId: row.entityId, status: 'ACKED' }),
    ).resolves.toEqual(acked);
    expect(query.mock.calls[0]?.[1]).toEqual([row.entity, row.entityId]);
    expect(query.mock.calls[1]?.[1]).toEqual([row.id, 'ACKED', null]);
    expect(query.mock.calls[1]?.[0]).toContain('status = $2::outbox.message_status');
    expect(query.mock.calls[1]?.[0]).toContain('ack_time = now()');
    expect(query.mock.calls[1]?.[0]).toContain(
      "case when $2::text = 'ERROR' then $3 else null end",
    );
    expect(query.mock.calls[1]?.[0]).toContain('where id = $1');
    expect(query.mock.calls[2]?.[1]).toEqual([row.tenantId, row.id, 'ACKED', null]);
    expect(query.mock.calls[2]?.[0]).toContain('insert into outbox.acknowledgements');
    expect(query.mock.calls[2]?.[0]).toContain('values (gen_random_uuid(), $1, $2, $3, $4, now())');
    expect(query.mock.calls[2]?.[0]).toContain('on conflict (message_id) do nothing');
    expect(compactSql(query.mock.calls[0]?.[0])).toBe(
      'select id, tenant_id as "tenantId" from outbox.messages where entity = $1 and entity_id = $2',
    );
    expect(compactSql(query.mock.calls[1]?.[0])).toBe(
      compactSql(`update outbox.messages
        set status = $2::outbox.message_status, ack_time = now(),
            last_error = case when $2::text = 'ERROR' then $3 else null end,
            updated_at = now()
        where id = $1 returning ${outboxColumns()}`),
    );
    expect(compactSql(query.mock.calls[2]?.[0])).toBe(
      compactSql(`insert into outbox.acknowledgements
        (id, tenant_id, message_id, ack_status, ack_message, ack_time)
        values (gen_random_uuid(), $1, $2, $3, $4, now())
        on conflict (message_id) do nothing`),
    );
    expect(database.withSystemContext).toHaveBeenCalledWith('outbox ack', expect.any(Function));
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
    });
  });

  it('preserves typed error contexts across enqueue, read, dispatch, retry, and acknowledgement failures', async () => {
    const duplicateQuery = vi.fn(async () => {
      throw { code: '23505' };
    });
    await expect(
      createService(duplicateQuery).service.enqueue({ query: duplicateQuery } as never, {
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
        idempotencyKey: 'duplicate-key',
      }),
    ).rejects.toMatchObject({
      context: {
        entity: row.entity,
        entityId: row.entityId,
        idempotencyKey: 'duplicate-key',
      },
    });

    const emptyEnqueueQuery = vi.fn(async () => ({ rows: [] }));
    await expect(
      createService(emptyEnqueueQuery).service.enqueue(
        { query: emptyEnqueueQuery } as OutboxSqlExecutor,
        { entity: row.entity, entityId: row.entityId, payload: row.payload },
      ),
    ).rejects.toMatchObject({ context: { entity: row.entity, entityId: row.entityId } });

    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.getOne(row.entity, row.entityId),
    ).rejects.toMatchObject({ context: { entity: row.entity, entityId: row.entityId } });

    const sent = { ...row, status: 'SENT' as const, attempts: 1 };
    const dispatchQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [sent] })
      .mockResolvedValueOnce({ rows: [] });
    const dispatch = createService(dispatchQuery, {
      dispatcher: { send: vi.fn(async () => Promise.reject(new Error('offline'))) },
    });
    await expect(dispatch.service.dispatchDue()).rejects.toMatchObject({ context: { id: row.id } });
    expect(dispatch.database.tx).toHaveBeenNthCalledWith(2, expect.any(Function), {
      role: 'owner',
      readonly: false,
    });

    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.retry(row.id),
    ).rejects.toMatchObject({ context: { id: row.id } });
    const vanishedRetry = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(createService(vanishedRetry).service.retry(row.id)).rejects.toMatchObject({
      context: { id: row.id },
    });

    await expect(
      createService(vi.fn(async () => ({ rows: [] }))).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ACKED',
      }),
    ).rejects.toMatchObject({ context: { entity: row.entity, entityId: row.entityId } });

    const vanishedAck = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: row.id, tenantId: row.tenantId }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      createService(vanishedAck).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ACKED',
      }),
    ).rejects.toMatchObject({ context: { entity: row.entity, entityId: row.entityId } });

    const ambiguousAck = vi.fn(async () => ({
      rows: [
        { id: 'message-a', tenantId: row.tenantId },
        { id: 'message-b', tenantId: '22222222-2222-2222-2222-222222222222' },
      ],
    }));
    await expect(
      createService(ambiguousAck).service.ack({
        entity: row.entity,
        entityId: row.entityId,
        status: 'ACKED',
      }),
    ).rejects.toMatchObject({
      context: { entity: row.entity, entityId: row.entityId, matches: 2 },
    });
  });
});
