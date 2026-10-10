import { OutboxService } from '../../src/outbox.service';
import { OutboxEventNotFailedError, OutboxNotFoundError } from '../../src/errors';
import type { OutboxSqlExecutor } from '../../src/types';

const tenant = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const summary = {
  id: eventId, tenantId: tenant, entity: 'renach.item', entityId: 'item-1', idempotencyKey: 'item-1:v1',
  metadata: { source: 'unit' }, createdAt: new Date(20),
};
const deliveryColumns = {
  status: 'ERROR', attempts: 2, lastError: 'offline', nextAttemptAt: new Date(30), leaseUntil: null, updatedAt: new Date(25),
};
const deliveryRow = { ...summary, ...deliveryColumns };
const expectedDelivery = { ...summary, delivery: deliveryColumns };

type Calls = Array<{ sql: string; params: readonly unknown[] | undefined }>;

function harness(route: (sql: string, params: readonly unknown[] | undefined) => unknown[] | undefined, tenantId: string | null = tenant) {
  const calls: Calls = [];
  const options: unknown[] = [];
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    calls.push({ sql, params });
    return { rows: route(sql, params) ?? [] };
  }) as OutboxSqlExecutor['query'];
  const database = {
    appRoleName: 'stynx_app',
    currentTenantId: () => tenantId ?? undefined,
    withSystemContext: vi.fn(),
    tx: vi.fn(async (fn: (trx: never) => Promise<unknown>, txOptions: unknown) => {
      options.push(txOptions);
      return fn({ role: 'app', query } as never);
    }),
  };
  return { calls, options, database };
}

const flat = (sql: string) => sql.replace(/\s+/gu, ' ').trim();
const appRead = { role: 'app', readonly: true, requireActor: true, retry: false };

describe('OutboxService tenant event reads (UPS-OBX-04)', () => {
  it('requires a trusted context tenant before any read or retry transaction', async () => {
    const { database } = harness(() => [], null);
    const service = new OutboxService(database as never, {});
    for (const read of [
      () => service.listEvents(), () => service.getEventDelivery(eventId), () => service.getAggregateDelivery('e', 'id'),
      () => service.listEventAttempts(eventId), () => service.getQueueHealth(), () => service.retryEvent(eventId),
    ]) {
      await expect(read()).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND', context: { reason: 'missing-tenant-context' } });
    }
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it('lists newest first with keyset cursor, filters and the app read transaction', async () => {
    const pending = { ...summary, id: otherId, status: null, attempts: null, lastError: null, nextAttemptAt: null, leaseUntil: null, updatedAt: null };
    const { calls, options, database } = harness(() => [deliveryRow, pending]);
    const service = new OutboxService(database as never, {});
    const page = await service.listEvents({ limit: 1, deliveryStatus: 'ERROR', entity: 'renach.item', entityPrefix: 'renach.' });
    expect(page).toEqual({ items: [expectedDelivery], nextCursor: { createdAt: summary.createdAt, id: eventId } });
    expect(options).toEqual([appRead]);
    expect(flat(calls[0]!.sql)).toContain('from outbox.events e left join outbox.event_delivery d on d.tenant_id=$1::uuid');
    expect(flat(calls[0]!.sql)).toContain('(e.created_at,e.id)<($5::timestamptz,$6::uuid)) order by e.created_at desc,e.id desc limit $7');
    expect(flat(calls[0]!.sql)).toContain('left(e.entity,length($4))=$4');
    expect(calls[0]!.params).toEqual([tenant, ['ERROR'], 'renach.item', 'renach.', null, null, 2]);

    const last = await service.listEvents({ cursor: { createdAt: new Date(40), id: otherId }, deliveryStatus: ['PENDING', 'SENT'] });
    expect(last).toEqual({ items: [expectedDelivery, { ...summary, id: otherId, delivery: null }], nextCursor: null });
    expect(calls[1]!.params).toEqual([tenant, ['PENDING', 'SENT'], null, null, new Date(40), otherId, 51]);
    await service.listEvents({ cursor: null });
    expect(calls[2]!.params).toEqual([tenant, null, null, null, null, null, 51]);
  });

  it('rejects malformed list and health filters before reading', async () => {
    const { database } = harness(() => []);
    const service = new OutboxService(database as never, {});
    for (const limit of [0, 501, 1.5]) await expect(service.listEvents({ limit })).rejects.toThrow('limit must be an integer from 1 to 500');
    await expect(service.listEvents({ deliveryStatus: [] })).rejects.toThrow('deliveryStatus must name event delivery states');
    await expect(service.listEvents({ deliveryStatus: 'DONE' as never })).rejects.toThrow('deliveryStatus must name event delivery states');
    for (const deliveryStatus of [7, { 0: 'ERROR' }, null, new Set(['ERROR'])]) {
      await expect(service.listEvents({ deliveryStatus: deliveryStatus as never })).rejects.toThrow(RangeError);
    }
    await expect(service.listEvents({ entity: '' })).rejects.toThrow('entity must be a non-empty string');
    await expect(service.listEvents({ entityPrefix: 7 as never })).rejects.toThrow('entityPrefix must be a non-empty string');
    for (const cursor of [{ createdAt: new Date(Number.NaN), id: eventId }, { createdAt: '2026-01-01' as never, id: eventId },
      { createdAt: new Date(1), id: 'not-a-uuid' }]) {
      await expect(service.listEvents({ cursor })).rejects.toThrow('cursor must be a listEvents nextCursor');
    }
    await expect(service.getQueueHealth({ entity: '' })).rejects.toThrow('entity must be a non-empty string');
    await expect(service.getAggregateDelivery('e', 'id', { limit: 1001 })).rejects.toThrow('limit must be an integer from 1 to 1000');
    await expect(service.getAggregateDelivery('e', 'id', { limit: 0 })).rejects.toThrow('limit must be an integer from 1 to 1000');
    expect(database.tx).not.toHaveBeenCalled();
  });

  it('reads one event delivery and returns null for malformed, absent, foreign or undelivered identities', async () => {
    let rows: unknown[] = [deliveryRow];
    const { calls, options, database } = harness(() => rows);
    const service = new OutboxService(database as never, {});
    await expect(service.getEventDelivery(eventId)).resolves.toEqual(expectedDelivery);
    expect(flat(calls[0]!.sql)).toContain('from outbox.events e join outbox.event_delivery d on d.tenant_id=$1::uuid');
    expect(flat(calls[0]!.sql)).toContain('where e.tenant_id=$1::uuid and e.id=$2::uuid');
    expect(calls[0]!.params).toEqual([tenant, eventId]);
    expect(options).toEqual([appRead]);
    rows = [];
    await expect(service.getEventDelivery(otherId)).resolves.toBe(null);
    await expect(service.getEventDelivery('not-a-uuid')).resolves.toBe(null);
    expect(calls).toHaveLength(2);
  });

  it('summarizes one aggregate from one snapshot with head, zero-filled counts and bounded ascending events', async () => {
    const acked = { ...deliveryRow, id: otherId, status: 'ACKED' };
    let rows: unknown[] = [
      { ...acked, position: 1, statusRank: 1, statusCount: 2 },
      { ...deliveryRow, position: 3, statusRank: 1, statusCount: 1 },
    ];
    const { calls, options, database } = harness(() => rows);
    const service = new OutboxService(database as never, {});
    const aggregate = await service.getAggregateDelivery('renach.item', 'item-1', { limit: 1 });
    expect(aggregate).toEqual({
      entity: 'renach.item', entityId: 'item-1', head: expectedDelivery,
      counts: { PENDING: 0, SENT: 0, SENT_UNRESOLVED: 0, ERROR: 1, ACKED: 2 },
      events: [{ ...expectedDelivery, id: otherId, delivery: { ...deliveryColumns, status: 'ACKED' } }],
    });
    expect(calls).toHaveLength(1);
    expect(options).toEqual([appRead]);
    expect(calls[0]!.params).toEqual([tenant, 'renach.item', 'item-1', 1]);
    expect(flat(calls[0]!.sql)).toContain('row_number() over (partition by d.status order by e.created_at,e.id)::integer as "statusRank"');
    expect(flat(calls[0]!.sql)).toContain('where e.tenant_id=$1::uuid and e.entity=$2 and e.entity_id=$3 ) ranked where "position"<=$4 or "statusRank"=1 order by "position"');
    rows = [{ ...acked, position: 1, statusRank: 1, statusCount: 1 }];
    await expect(service.getAggregateDelivery('renach.item', 'item-1')).resolves.toMatchObject({
      head: null, counts: { ACKED: 1, ERROR: 0 }, events: [{ id: otherId }],
    });
    expect(calls[1]!.params).toEqual([tenant, 'renach.item', 'item-1', 100]);
    rows = [];
    await expect(service.getAggregateDelivery('renach.item', 'other')).resolves.toBe(null);
    expect(calls).toHaveLength(3);
  });

  it('reads the attempt ledger by ordinal and selects raw bytes only on explicit request', async () => {
    const attempt = { id: otherId, eventId, attemptOrdinal: 1, result: 'SENT' };
    const { calls, options, database } = harness(() => [attempt]);
    const service = new OutboxService(database as never, {});
    await expect(service.listEventAttempts(eventId)).resolves.toEqual([attempt]);
    expect(calls[0]!.sql).not.toContain('request_bytes');
    expect(flat(calls[0]!.sql)).toContain('request_sha256 as "requestSha256",response_sha256 as "responseSha256"');
    expect(flat(calls[0]!.sql)).toContain('where tenant_id=$1::uuid and event_id=$2::uuid order by attempt_ordinal,id');
    expect(calls[0]!.params).toEqual([tenant, eventId]);
    await service.listEventAttempts(eventId, { includeBytes: true });
    expect(calls[1]!.sql).toContain('request_bytes as "requestBytes",response_bytes as "responseBytes"');
    await service.listEventAttempts(eventId, { includeBytes: false });
    expect(calls[2]!.sql).not.toContain('request_bytes');
    await expect(service.listEventAttempts('bad')).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
    expect(options).toEqual([appRead, appRead, appRead]);
  });

  it('counts tenant queue health by status and reports the oldest unacknowledged delivery', async () => {
    let rows: unknown[] = [
      { status: 'PENDING', count: 3, oldest: new Date(50) }, { status: 'ERROR', count: 1, oldest: new Date(10) },
      { status: 'ACKED', count: 4, oldest: null }, { status: 'SENT', count: 2, oldest: new Date(30) },
    ];
    const { calls, options, database } = harness(() => rows);
    const service = new OutboxService(database as never, {});
    await expect(service.getQueueHealth({ entity: 'renach.item', entityPrefix: 'renach.' })).resolves.toEqual({
      tenantId: tenant, total: 10, byStatus: { PENDING: 3, SENT: 2, SENT_UNRESOLVED: 0, ERROR: 1, ACKED: 4 },
      oldestUnackedCreatedAt: new Date(10),
    });
    expect(calls[0]!.params).toEqual([tenant, 'renach.item', 'renach.']);
    expect(flat(calls[0]!.sql)).toContain('from outbox.event_delivery d join outbox.events e on e.tenant_id=$1::uuid');
    rows = [];
    await expect(service.getQueueHealth()).resolves.toEqual({
      tenantId: tenant, total: 0, byStatus: { PENDING: 0, SENT: 0, SENT_UNRESOLVED: 0, ERROR: 0, ACKED: 0 }, oldestUnackedCreatedAt: null,
    });
    expect(calls[1]!.params).toEqual([tenant, null, null]);
    expect(options).toEqual([appRead, appRead]);
  });
});

describe('OutboxService operator event retry (UPS-OBX-05)', () => {
  const appWrite = { role: 'app', requireActor: true, retry: false };

  it('locks the tenant delivery, resets ERROR to PENDING now, and returns the preserved projection', async () => {
    const reset = { ...deliveryRow, status: 'PENDING', nextAttemptAt: new Date(35) };
    const { calls, options, database } = harness((sql) => {
      if (sql.includes('for update')) return [{ status: 'ERROR', attempts: 2 }];
      if (sql.includes('update outbox.event_delivery')) return [{ event_id: eventId }];
      return [reset];
    });
    const backoff = { nextAttemptAt: vi.fn(() => new Date(99)) };
    const service = new OutboxService(database as never, {}, undefined, backoff);
    await expect(service.retryEvent(eventId, { immediate: true })).resolves.toEqual({
      ...summary, delivery: { ...deliveryColumns, status: 'PENDING', nextAttemptAt: new Date(35) },
    });
    expect(backoff.nextAttemptAt).not.toHaveBeenCalled();
    expect(options).toEqual([appWrite]);
    expect(flat(calls[0]!.sql)).toBe('select status,attempts from outbox.event_delivery where tenant_id=$1::uuid and event_id=$2::uuid for update');
    expect(flat(calls[1]!.sql)).toBe("update outbox.event_delivery set status='PENDING',next_attempt_at=case when $3::timestamptz is null then clock_timestamp() else least(coalesce(next_attempt_at,clock_timestamp()),$3::timestamptz) end, lease_until=null,updated_at=clock_timestamp() where tenant_id=$1::uuid and event_id=$2::uuid and status='ERROR' returning event_id");
    expect(calls[1]!.params).toEqual([tenant, eventId, null]);
    expect(calls.some((call) => /event_attempts|event_acks|last_error=|attempts=/u.test(call.sql))).toBe(false);

    await service.retryEvent(eventId);
    expect(backoff.nextAttemptAt).toHaveBeenCalledWith(2, expect.any(Date));
    expect(calls[4]!.params).toEqual([tenant, eventId, new Date(99)]);
  });

  it('refuses malformed, absent, foreign and non-ERROR deliveries with typed errors and no update', async () => {
    let current: unknown[] = [];
    let updated: unknown[] = [];
    const { calls, database } = harness((sql) => sql.includes('for update') ? current : (sql.includes('update ') ? updated : []));
    const service = new OutboxService(database as never, {});
    await expect(service.retryEvent('not-a-uuid')).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND', context: { eventId: 'not-a-uuid' } });
    expect(calls).toHaveLength(0);
    await expect(service.retryEvent(eventId)).rejects.toBeInstanceOf(OutboxNotFoundError);
    for (const status of ['PENDING', 'SENT', 'SENT_UNRESOLVED', 'ACKED']) {
      current = [{ status, attempts: 1 }];
      await expect(service.retryEvent(eventId, { immediate: true })).rejects.toMatchObject({
        code: 'OUTBOX_EVENT_NOT_FAILED', status: 409, context: { eventId, status },
      });
    }
    expect(calls.every((call) => call.sql.includes('for update'))).toBe(true);
    current = [{ status: 'ERROR', attempts: 1 }];
    updated = [];
    await expect(service.retryEvent(eventId, { immediate: true })).rejects.toBeInstanceOf(OutboxEventNotFailedError);
  });
});
