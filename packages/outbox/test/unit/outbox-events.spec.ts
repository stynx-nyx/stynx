import { AuditChainKeyMismatchError } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service';
import {
  OutboxAckQuarantineUnavailableError,
  OutboxCustomTableCutoverUnsupportedError,
  OutboxCutoverAuditedTableError,
  OutboxEventConflictError,
  OutboxEventTransactionError,
  OutboxLegacyCutoverError,
  OutboxOwnershipContentionError,
} from '../../src/errors';
import { IndependentTransactionConnectionError } from '@stynx-nyx/data';
import type { OutboxAppendEvent, OutboxSqlExecutor } from '../../src/types';

const tenant = '11111111-1111-4111-8111-111111111111';
const event: OutboxAppendEvent = {
  entity: 'record.changed', entityId: 'record-1', idempotencyKey: 'record-1:v1',
  payload: { version: 1 }, metadata: { actorId: 'actor-1' },
};
const eventRow = { ...event, id: '22222222-2222-4222-8222-222222222222', tenantId: tenant, createdAt: new Date(10) };

function databaseFor(query: OutboxSqlExecutor['query'], tenantId: string | null = tenant) {
  const trx = { role: 'app', query };
  return {
    currentTenantId: () => tenantId,
    withSystemContext: async (_reason: string, fn: () => Promise<unknown>) => fn(),
    tx: async (fn: (transaction: never) => Promise<unknown>) => fn(trx as never),
    txIndependent: async (fn: (transaction: never) => Promise<unknown>) => fn(trx as never),
  };
}

function expectAckQueryBatch(
  query: OutboxSqlExecutor['query'],
  start: number,
  lookup: readonly unknown[],
  status: 'ACKED' | 'ERROR',
  rawBody: Buffer,
): void {
  expect(query).toHaveBeenCalledTimes(start + 4);
  const calls = query.mock.calls.slice(start);
  expect(calls.map(([sql]) => String(sql).trim().replace(/\s+/gu, ' '))).toEqual([
    expect.stringContaining('select id from outbox.events'),
    expect.stringContaining('select attempts from outbox.event_delivery'),
    expect.stringContaining("update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,updated_at=clock_timestamp()"),
    expect.stringContaining('insert into outbox.event_acks'),
  ]);
  expect(calls.map(([, params]) => params)).toEqual([
    lookup,
    [tenant, eventRow.id],
    [tenant, eventRow.id, status, status === 'ERROR' ? expect.any(Date) : null],
    [tenant, eventRow.id, status, rawBody, expect.stringMatching(/^[0-9a-f]{64}$/u)],
  ]);
}

function appendQuery(overrides: { duplicate?: boolean; conflict?: boolean; invalid?: boolean; ownershipCode?: string } = {}) {
  return vi.fn(async (sql: string) => {
    if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{
      tenant_id: tenant, role: overrides.invalid ? 'owner' : 'app', sql_role: 'stynx_app',
      isolation: 'read committed', read_only: 'off', recovery: false,
    }] };
    if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '7s' }] };
    if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: null }] };
    if (sql.includes('from outbox.legacy_ownership')) {
      if (overrides.ownershipCode) throw Object.assign(new Error('locked'), { code: overrides.ownershipCode });
      return { rows: [{ state: 'LEGACY' }] };
    }
    if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '10' }] };
    if (sql.includes('insert into outbox.events')) return { rows: overrides.duplicate || overrides.conflict ? [] : [eventRow] };
    if (sql.includes('from outbox.events where tenant_id=$1::uuid')) return { rows: overrides.conflict ? [] : [eventRow] };
    return { rows: [] };
  }) as OutboxSqlExecutor['query'];
}

describe('OutboxService event append contract', () => {
  it('validates positive option bounds and SQL identifiers at construction', () => {
    for (const [key, value] of [['eventLeaseMs', 0], ['lockTimeoutMs', 2_147_483_648], ['failurePersistenceDeadlineMs', 1.5]] as const) {
      expect(() => new OutboxService(databaseFor(vi.fn()) as never, { [key]: value })).toThrow(RangeError);
    }
    expect(() => new OutboxService(databaseFor(vi.fn()) as never, { table: 'unsafe;table' })).toThrow('Invalid SQL identifier');
  });

  it('validates app transaction identity and tenant binding before inserting events', async () => {
    const query = appendQuery({ invalid: true });
    const service = new OutboxService(databaseFor(query) as never, {});
    await expect(service.appendInTransaction({ role: 'app', query } as never, event)).rejects.toBeInstanceOf(OutboxEventTransactionError);
    const tenantQuery = appendQuery();
    const mismatch = new OutboxService(databaseFor(tenantQuery, 'different-tenant') as never, {});
    await expect(mismatch.appendInTransaction({ role: 'app', query: tenantQuery } as never, event)).rejects.toBeInstanceOf(AuditChainKeyMismatchError);
  });

  it('appends atomically with monotonic tenant time and restores the caller lock timeout', async () => {
    const query = appendQuery();
    const service = new OutboxService(databaseFor(query) as never, { lockTimeoutMs: 250 });
    const trx = { role: 'app', strictItemMode: true, query };
    await expect(service.appendInTransaction(trx as never, event)).resolves.toEqual(eventRow);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('set_config(\'lock_timeout\',$1,true)'), ['250']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('set_config(\'lock_timeout\',$1,true)'), ['7s']);
    expect(query).toHaveBeenCalledWith('set local transaction_read_only = on');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it('returns an identical idempotent append and rejects content reuse', async () => {
    const duplicate = appendQuery({ duplicate: true });
    await expect(new OutboxService(databaseFor(duplicate) as never, {}).appendInTransaction(
      { role: 'app', query: duplicate } as never, event,
    )).resolves.toEqual(eventRow);

    const conflict = appendQuery({ conflict: true });
    await expect(new OutboxService(databaseFor(conflict) as never, {}).appendInTransaction(
      { role: 'app', query: conflict } as never, event,
    )).rejects.toBeInstanceOf(OutboxEventConflictError);

    const withoutMetadata = appendQuery({ duplicate: true });
    await expect(new OutboxService(databaseFor(withoutMetadata) as never, {}).appendInTransaction(
      { role: 'app', query: withoutMetadata } as never, { ...event, metadata: undefined },
    )).resolves.toEqual(eventRow);
  });

  it('accepts an existing tenant audit key and restores the previous lock timeout after validation failure', async () => {
    const matching = vi.fn(async (sql: string) => {
      if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false }] };
      if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '3s' }] };
      if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: tenant }] };
      if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '11' }] };
      if (sql.includes('insert into outbox.events')) return { rows: [eventRow] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(matching) as never, {}).appendInTransaction(
      { role: 'app', query: matching } as never, event,
    )).resolves.toEqual(eventRow);
    expect(matching.mock.calls.some(([sql]) => String(sql).includes('for share nowait'))).toBe(true);

    const mismatchedKey = appendQuery();
    mismatchedKey.mockImplementation(async (sql: string) => {
      if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false }] };
      if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '3s' }] };
      if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: '22222222-2222-4222-8222-222222222222' }] };
      return { rows: [{ state: 'LEGACY' }] };
    });
    await expect(new OutboxService(databaseFor(mismatchedKey) as never, {}).appendInTransaction(
      { role: 'app', query: mismatchedKey } as never, event,
    )).rejects.toBeInstanceOf(AuditChainKeyMismatchError);

    const restoreFailure = appendQuery();
    let lockCalls = 0;
    restoreFailure.mockImplementation(async (sql: string) => {
      if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false }] };
      if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '3s' }] };
      if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: null }] };
      if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
      if (sql.includes('set_config(\'lock_timeout\'')) {
        lockCalls += 1;
        if (lockCalls === 2) throw new Error('transaction already aborted');
      }
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '11' }] };
      return { rows: [] };
    });
    await expect(new OutboxService(databaseFor(restoreFailure) as never, {}).appendInTransaction(
      { role: 'app', query: restoreFailure } as never, event,
    )).rejects.toThrow('transaction already aborted');
  });

  it('skips empty appends, validates required event identity, and maps ownership lock contention', async () => {
    const emptyQuery = appendQuery();
    await expect(new OutboxService(databaseFor(emptyQuery) as never, {}).appendManyInTransaction(
      { role: 'app', query: emptyQuery } as never, [],
    )).resolves.toEqual([]);
    expect(emptyQuery).not.toHaveBeenCalled();

    const invalid = appendQuery();
    await expect(new OutboxService(databaseFor(invalid) as never, {}).appendManyInTransaction(
      { role: 'app', query: invalid } as never, [{ ...event, entityId: '' }],
    )).rejects.toBeInstanceOf(OutboxEventTransactionError);

    const locked = appendQuery({ ownershipCode: '55P03' });
    await expect(new OutboxService(databaseFor(locked) as never, {}).appendInTransaction(
      { role: 'app', query: locked } as never, event,
    )).rejects.toBeInstanceOf(OutboxOwnershipContentionError);

    const absent = vi.fn(async (sql: string) => {
      if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false }] };
      if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '1s' }] };
      if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: null }] };
      if (sql.includes('from outbox.legacy_ownership')) return { rows: [] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(absent) as never, {}).appendInTransaction(
      { role: 'app', query: absent } as never, event,
    )).rejects.toBeInstanceOf(OutboxOwnershipContentionError);
  });
});

describe('OutboxService legacy cutover', () => {
  it('requires the platform tables and recognizes an already completed migration', async () => {
    const unsupported = new OutboxService(databaseFor(vi.fn()) as never, { table: 'tenant.events' });
    await expect(unsupported.cutoverLegacyMessages()).rejects.toBeInstanceOf(OutboxCustomTableCutoverUnsupportedError);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select state,generation')) return { rows: [{ state: 'NEW', generation: '4' }] };
      if (sql.includes('count(*)')) return { rows: [{ count: '12' }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const result = await new OutboxService(databaseFor(query) as never, {}).cutoverLegacyMessages();
    expect(result).toEqual({ migrated: 12, generation: 4 });
  });

  it('rejects audited cutover targets before reading legacy message content', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select state,generation')) return { rows: [{ state: 'LEGACY', generation: '0' }] };
      if (sql.includes('select distinct c.relname')) return { rows: [{ relname: 'messages' }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(query) as never, {}).cutoverLegacyMessages()).rejects.toBeInstanceOf(OutboxCutoverAuditedTableError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('from outbox.messages order by'))).toBe(false);
  });

  it('migrates messages, attempt history, and prior acknowledgements with one generation', async () => {
    const legacy = {
      id: '33333333-3333-4333-8333-333333333333', tenant_id: tenant,
      entity: 'record.changed', entity_id: 'record-1', payload: { value: 1 }, metadata: null,
      idempotency_key: 'record-1:v1', status: 'SENT', attempts: 2,
      next_attempt_at: null, last_error: 'old failure', created_at: new Date(1), updated_at: new Date(2),
    };
    const fresh = { ...legacy, id: '66666666-6666-4666-8666-666666666666', status: 'PENDING', attempts: 0,
      metadata: { source: 'existing' } };
    let eventIndex = 0;
    let ackLookup = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select state,generation')) return { rows: [{ state: 'LEGACY', generation: '4' }] };
      if (sql.includes('select distinct c.relname')) return { rows: [] };
      if (sql.includes('from outbox.messages order by')) return { rows: [legacy, fresh] };
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '10' }] };
      if (sql.includes('insert into outbox.events')) return { rows: [{ id: ++eventIndex === 1 ? '44444444-4444-4444-8444-444444444444' : '77777777-7777-4777-8777-777777777777' }] };
      if (sql.includes('from outbox.acknowledgements')) return ++ackLookup === 1
        ? { rows: [{ id: '55555555-5555-4555-8555-555555555555', ack_status: 'ACKED', ack_message: 'done', ack_time: new Date(3) }] }
        : { rows: [] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(query) as never, {}).cutoverLegacyMessages())
      .resolves.toEqual({ migrated: 2, generation: 5 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into outbox.event_attempts'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into outbox.event_acks'))).toBe(true);
    expect(query.mock.calls.some(([, params]) => (params as unknown[] | undefined)?.includes('SENT_UNRESOLVED'))).toBe(true);
    expect(query.mock.calls.some(([, params]) => (params as unknown[] | undefined)?.includes('PENDING'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("state='NEW'"))).toBe(true);
  });
});

describe('OutboxService tenant event ACK', () => {
  it('rejects invalid identity before reading or mutating event rows', async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => { calls.push(sql); return { rows: [] }; }) as OutboxSqlExecutor['query'];
    const db = databaseFor(query) as ReturnType<typeof databaseFor> & { hasHeldConnection: () => boolean };
    db.hasHeldConnection = () => false;
    const service = new OutboxService(db as never, {});
    await expect(service.ackTenantEvent({ eventId: 'bad', rawBody: Buffer.from('x'), status: 'ACKED', hmacVerified: true }))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(calls).toHaveLength(0);
    expect(calls.some((sql) => sql.includes('from outbox.events'))).toBe(false);
  });

  it('requires trusted tenant and verifies tenant-owned delivery before appending ACK evidence', async () => {
    const missingTenant = new OutboxService(databaseFor(vi.fn(), null) as never, {});
    await expect(missingTenant.ackTenantEvent({ idempotencyKey: 'key', rawBody: Buffer.from('ack'), status: 'ACKED', hmacVerified: true }))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from outbox.events')) return { rows: [{ id: eventRow.id }] };
      if (sql.includes('from outbox.event_delivery')) return { rows: [{ attempts: 3 }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const service = new OutboxService(databaseFor(query) as never, {});
    const ackBody = Buffer.from('ack');
    await service.ackTenantEvent({ idempotencyKey: 'key', rawBody: ackBody, status: 'ERROR', hmacVerified: true });
    expectAckQueryBatch(query, 0, [tenant, null, 'key'], 'ERROR', ackBody);

    const unknown = vi.fn(async () => ({ rows: [] })) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(unknown) as never, {}).ackTenantEvent({
      idempotencyKey: 'missing', rawBody: Buffer.from('ack'), status: 'ACKED', hmacVerified: true,
    })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    const noDelivery = vi.fn(async (sql: string) => sql.includes('from outbox.events')
      ? { rows: [{ id: eventRow.id }] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(noDelivery) as never, {}).ackTenantEvent({
      idempotencyKey: 'key', rawBody: Buffer.from('ack'), status: 'ACKED', hmacVerified: true,
    })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(new OutboxService(databaseFor(query) as never, {}).ackTenantEvent({
      tenantId: tenant, idempotencyKey: 'key', rawBody: Buffer.from('ack'), status: 'ACKED', hmacVerified: true,
    } as never)).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    const keyAckStart = query.mock.calls.length;
    await new OutboxService(databaseFor(query) as never, {}).ackTenantEvent({
      idempotencyKey: 'key', rawBody: ackBody, status: 'ACKED', hmacVerified: true,
    });
    expectAckQueryBatch(query, keyAckStart, [tenant, null, 'key'], 'ACKED', ackBody);
    // Event ID is a supported exclusive identity, with no idempotency key.
    const eventAckStart = query.mock.calls.length;
    await new OutboxService(databaseFor(query) as never, {}).ackTenantEvent({
      eventId: eventRow.id, rawBody: ackBody, status: 'ACKED', hmacVerified: true,
    });
    expectAckQueryBatch(query, eventAckStart, [tenant, eventRow.id, null], 'ACKED', ackBody);
  });

  it('quarantines unverified request ACKs and remaps held-connection failures', async () => {
    const query = vi.fn(async () => ({ rows: [] })) as OutboxSqlExecutor['query'];
    const db = databaseFor(query) as ReturnType<typeof databaseFor> & { txIndependent: (fn: (tx: never) => Promise<unknown>) => Promise<unknown> };
    const service = new OutboxService(db as never, {});
    await expect(service.ackTenantEvent({ idempotencyKey: 'key', rawBody: Buffer.from('bad'), status: 'ACKED' }))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('outbox.ack_quarantine'))).toBe(true);

    db.txIndependent = async () => { throw new IndependentTransactionConnectionError(); };
    await expect(service.recordUnboundAck(Buffer.from('bad'), 'invalid-hmac')).rejects.toBeInstanceOf(OutboxAckQuarantineUnavailableError);
    db.txIndependent = async () => { throw new Error('storage unavailable'); };
    await expect(service.recordUnboundAck(Buffer.from('bad'), 'invalid-hmac')).rejects.toThrow('storage unavailable');
  });
});

describe('OutboxService verified owner event ACK', () => {
  const valid = { tenantId: tenant, eventId: eventRow.id, rawBody: Buffer.from('ack'), status: 'ERROR' as const, hmacVerified: true };

  it('quarantines malformed identity, unknown event, and invalid HMAC', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('from outbox.events') ? { rows: [] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const service = new OutboxService(databaseFor(query) as never, {});
    await expect(service.ackEvent({ ...valid, tenantId: 'bad' })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(service.ackEvent({ ...valid, eventId: 'bad', idempotencyKey: undefined })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(service.ackEvent({ ...valid, eventId: undefined, idempotencyKey: undefined })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(service.ackEvent({ ...valid, idempotencyKey: 'both-identifiers' })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(service.ackEvent(valid)).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    await expect(service.ackEvent({ ...valid, hmacVerified: false })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('outbox.ack_quarantine'))).toBe(true);
  });

  it('writes verified ACK evidence and rejects a missing delivery row', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from outbox.events')) return { rows: [{ id: eventRow.id }] };
      if (sql.includes('from outbox.event_delivery')) return { rows: [{ attempts: 4 }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const service = new OutboxService(databaseFor(query) as never, {});
    await service.ackEvent(valid);
    expectAckQueryBatch(query, 0, [tenant, eventRow.id, null], 'ERROR', valid.rawBody);

    const missingDelivery = vi.fn(async (sql: string) => sql.includes('from outbox.events')
      ? { rows: [{ id: eventRow.id }] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(missingDelivery) as never, {}).ackEvent(valid))
      .rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });

    const ackedStart = query.mock.calls.length;
    await new OutboxService(databaseFor(query) as never, {}).ackEvent({ ...valid, status: 'ACKED' });
    expectAckQueryBatch(query, ackedStart, [tenant, eventRow.id, null], 'ACKED', valid.rawBody);
  });

  it('quarantines a found event with an invalid signature using idempotency identity', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('from outbox.events')
      ? { rows: [{ id: eventRow.id }] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(query) as never, {}).ackEvent({
      ...valid, eventId: undefined, idempotencyKey: event.idempotencyKey, hmacVerified: false,
    })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('outbox.ack_quarantine'))).toBe(true);
  });

  it('retries transient owner transaction conflicts and maps exhausted lock contention', async () => {
    let attempts = 0;
    const emptyQuery = vi.fn(async () => ({ rows: [] })) as OutboxSqlExecutor['query'];
    const transient = databaseFor(emptyQuery) as ReturnType<typeof databaseFor>;
    transient.tx = async (fn) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('deadlock'), { context: { originalCode: '40P01' } });
      return fn({ role: 'owner', query: emptyQuery } as never);
    };
    await expect(new OutboxService(transient as never, {}).dispatchEventsDue()).resolves.toEqual([]);
    expect(attempts).toBe(2);

    const locked = databaseFor(emptyQuery) as ReturnType<typeof databaseFor>;
    locked.tx = async () => { throw Object.assign(new Error('locked'), { code: '55P03' }); };
    await expect(new OutboxService(locked as never, {}).dispatchEventsDue()).rejects.toBeInstanceOf(OutboxOwnershipContentionError);
  });
});

describe('OutboxService owner event dispatch', () => {
  const claim = {
    tenant_id: tenant, event_id: eventRow.id, attempts: 1, status: 'SENT', entity: event.entity,
    entity_id: event.entityId, idempotency_key: event.idempotencyKey,
    payload: event.payload, metadata: event.metadata, created_at: new Date(10),
  };

  it('records successful sends with an empty evidence record and leaves unconfigured sends pending', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('with due as') ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const pending = await new OutboxService(databaseFor(query) as never, {}).dispatchEventsDue(1);
    expect(pending).toMatchObject([{ dispatched: false, row: { id: claim.event_id, status: 'SENT' } }]);

    const db = databaseFor(query) as ReturnType<typeof databaseFor>;
    let txCount = 0;
    db.tx = async (fn) => {
      txCount += 1;
      return fn({ role: 'owner', query } as never);
    };
    const result = await new OutboxService(db as never, {}, { send: async () => undefined }).dispatchEventsDue(1);
    expect(result).toMatchObject([{ dispatched: true, row: { id: claim.event_id } }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='SENT'"))).toBe(true);
    expect(txCount).toBe(2);

    const evidenceQuery = vi.fn(async (sql: string) => sql.includes('due as') ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const detailed = await new OutboxService(databaseFor(evidenceQuery) as never, {}, {
      sendEvent: async () => ({ provider: 'provider', protocol: 'HTTP', requestBytes: Buffer.from('r'),
        responseBytes: Buffer.from('s'), requestHeaders: { 'x-safe': '[redacted]' }, responseStatus: 202,
        requestTransmission: 'response-received' }),
    }).dispatchEventsDue(1);
    expect(detailed).toMatchObject([{ dispatched: true }]);
    expect(evidenceQuery.mock.calls.some(([, params]) => JSON.stringify(params).includes('captured'))).toBe(true);

    const noEvidenceQuery = vi.fn(async (sql: string) => sql.includes('due as') ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await new OutboxService(databaseFor(noEvidenceQuery) as never, {}, {
      sendEvent: async () => undefined as never,
    }).dispatchEventsDue(1);
  });

  it('records failed sends with retry evidence and marks persistence failures unresolved', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: [claim] };
      if (sql.includes("set status='ERROR'")) return { rows: [{ event_id: claim.event_id }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const error = Object.assign(new Error('provider failed'), { evidence: {
      provider: 'provider', protocol: 'HTTP', requestBytes: Buffer.from('request'),
      responseBytes: Buffer.from('response'), requestHeaders: { authorization: '[redacted]' }, responseStatus: 503,
    } });
    const failed = await new OutboxService(databaseFor(query) as never, {}, { sendEvent: async () => { throw error; } }).dispatchEventsDue(1);
    expect(failed).toMatchObject([{ dispatched: false, error: 'provider failed', row: { status: 'ERROR' } }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='ERROR'"))).toBe(true);

    let txCount = 0;
    const broken = databaseFor(query) as ReturnType<typeof databaseFor>;
    broken.tx = async (fn) => {
      txCount += 1;
      if (txCount === 2) throw new Error('persistence failed');
      return fn({ role: 'owner', query } as never);
    };
    const unresolved = await new OutboxService(broken as never, {}, { send: async () => undefined }).dispatchEventsDue(1);
    expect(unresolved).toMatchObject([{ dispatched: true, reconciliationRequired: true, error: expect.stringContaining('persistence failed') }]);

    let failedTxCount = 0;
    const persistenceUnavailable = databaseFor(query) as ReturnType<typeof databaseFor>;
    persistenceUnavailable.tx = async (fn) => {
      failedTxCount += 1;
      if (failedTxCount === 2) throw new Error('failure persistence failed');
      return fn({ role: 'owner', query } as never);
    };
    const unresolvedFailure = await new OutboxService(persistenceUnavailable as never, {}, {
      send: async () => { throw new Error('provider failed'); },
    }).dispatchEventsDue(1);
    expect(unresolvedFailure).toMatchObject([{ dispatched: false, reconciliationRequired: true,
      error: expect.stringContaining('failure persistence failed') }]);

    const staleQuery = vi.fn(async (sql: string) => sql.includes('due as') ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const staleFailure = await new OutboxService(databaseFor(staleQuery) as never, {}, {
      sendEvent: async () => { throw new Error('late provider failure'); },
    }).dispatchEventsDue(1);
    expect(staleFailure).toMatchObject([{ dispatched: false, error: 'late provider failure', row: { status: 'SENT' } }]);
  });
});

describe('OutboxService legacy message reconciliation', () => {
  it('returns reconciliation-required when a custom-table failure row disappeared', async () => {
    const claimed = { id: eventRow.id, tenant_id: tenant, entity: event.entity, entity_id: event.entityId,
      status: 'SENT', attempts: 1, last_error: null, ack_time: null, next_attempt_at: null,
      created_at: new Date(10), updated_at: new Date(10) };
    const query = vi.fn(async (sql: string) => sql.includes('due as') ? { rows: [claimed] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const outcome = await new OutboxService(databaseFor(query) as never, { table: 'custom.messages' }, {
      send: async () => { throw new Error('provider failed'); },
    }).dispatchDue(1);
    expect(outcome).toMatchObject([{ dispatched: false, reconciliationRequired: true,
      error: expect.stringContaining('Outbox message not found') }]);
  });

  it('maps claim contention and records a legacy delivery failure against the migrated event', async () => {
    const failedRow = { ...eventRow, id: '88888888-8888-4888-8888-888888888888', status: 'ERROR', attempts: 2 };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('due as')) return { rows: [{ ...failedRow, status: 'SENT' }] };
      if (sql.includes("set status = 'ERROR'")) return { rows: [failedRow] };
      if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
      if (sql.includes('select tenant_id,migrated_event_id')) return { rows: [{ tenant_id: tenant, migrated_event_id: eventRow.id }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const db = databaseFor(query) as ReturnType<typeof databaseFor>;
    db.withSystemContext = async (_reason, fn) => fn();
    const outcome = await new OutboxService(db as never, {}, { send: async () => { throw new Error('network down'); } })
      .dispatchDue(1);
    expect(outcome).toMatchObject([{ dispatched: false, error: 'network down', row: { status: 'ERROR' } }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into outbox.event_attempts'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status='SENT_UNRESOLVED'"))).toBe(true);

    const locked = databaseFor(vi.fn() as OutboxSqlExecutor['query']) as ReturnType<typeof databaseFor>;
    locked.withSystemContext = async () => { throw Object.assign(new Error('locked'), { code: '55P03' }); };
    await expect(new OutboxService(locked as never, {}).dispatchDue()).rejects.toMatchObject({ code: 'OUTBOX_OWNERSHIP_CONTENTION' });
  });

  it('retries transient failure persistence before returning a durable error row', async () => {
    const sent = { ...eventRow, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'SENT' as const, attempts: 1 };
    const failed = { ...sent, status: 'ERROR' as const, lastError: 'offline' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('due as')) return { rows: [sent] };
      if (sql.includes("set status = 'ERROR'")) return { rows: [failed] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const db = databaseFor(query) as ReturnType<typeof databaseFor>;
    let txCalls = 0;
    db.tx = async (fn) => {
      txCalls += 1;
      if (txCalls === 2) throw Object.assign(new Error('deadlock'), { code: '40P01' });
      return fn({ role: 'owner', query } as never);
    };
    const result = await new OutboxService(db as never, { failurePersistenceDeadlineMs: 500 }, {
      send: async () => { throw new Error('offline'); },
    }).dispatchDue(1);
    expect(result).toMatchObject([{ dispatched: false, error: 'offline', row: { status: 'ERROR' } }]);
    expect(txCalls).toBe(3);
  });

  it('does not allow retry of a message already migrated to event delivery', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('select attempts')
      ? { rows: [{ attempts: 1, migrated_event_id: eventRow.id }] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const db = databaseFor(query) as ReturnType<typeof databaseFor>;
    await expect(new OutboxService(db as never, {}).retry('legacy-id')).rejects.toBeInstanceOf(OutboxLegacyCutoverError);
  });

  it('mirrors manual ACKs for migrated legacy messages into event ledgers', async () => {
    const target = { id: '99999999-9999-4999-8999-999999999999', tenantId: tenant,
      migratedEventId: eventRow.id, attempts: 2 };
    const updated = { ...eventRow, id: target.id, status: 'ACKED' as const };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('where entity = $1 and entity_id = $2')) return { rows: [target] };
      if (sql.includes('update outbox.messages')) return { rows: [updated] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(query) as never, {}).ack({
      entity: event.entity, entityId: event.entityId, tenantId: tenant, status: 'ACKED',
    })).resolves.toEqual(updated);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into outbox.event_acks'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('update outbox.event_delivery'))).toBe(true);
  });
});

describe('OutboxService custom table compatibility', () => {
  it('keeps claim, failure, retry, and ACK SQL independent of platform cutover tables', async () => {
    const pending = { ...eventRow, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'SENT' as const, attempts: 1 };
    const failed = { ...pending, status: 'ERROR' as const, lastError: 'offline' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('due as')) return { rows: [pending] };
      if (sql.includes('update tenant.messages') && sql.includes("status = 'ERROR'")) return { rows: [failed] };
      if (sql.includes('select attempts')) return { rows: [{ attempts: 1 }] };
      if (sql.includes('where entity = $1')) return { rows: [{ id: pending.id, tenantId: tenant, attempts: 1, migratedEventId: null }] };
      if (sql.includes('update tenant.messages')) return { rows: [failed] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const service = new OutboxService(databaseFor(query) as never, {
      table: 'tenant.messages', ackTable: 'tenant.acks', dispatchBatchSize: 4,
    }, { send: async () => { throw new Error('offline'); } });
    await expect(service.dispatchDue()).resolves.toMatchObject([{ dispatched: false, row: { status: 'ERROR' } }]);
    expect(query.mock.calls[0]?.[0]).toContain('with due as');
    expect(String(query.mock.calls[0]?.[0])).not.toContain('ownership');
    await expect(service.ack({ entity: event.entity, entityId: event.entityId, tenantId: tenant, status: 'ACKED' }))
      .resolves.toMatchObject({ id: pending.id });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('null::uuid as "migratedEventId"'))).toBe(true);
    await expect(service.cutoverLegacyMessages()).rejects.toBeInstanceOf(OutboxCustomTableCutoverUnsupportedError);
  });
});

describe('OutboxService tenant event dispatch', () => {
  const claim = {
    tenant_id: tenant, event_id: eventRow.id, attempts: 2, entity: event.entity,
    entity_id: event.entityId, idempotency_key: event.idempotencyKey,
    payload: event.payload, metadata: event.metadata, created_at: new Date(10),
  };

  it('validates tenant and limit, then returns claims without a dispatcher', async () => {
    const noTenant = new OutboxService(databaseFor(vi.fn(), null) as never, {});
    await expect(noTenant.dispatchTenantEventsDue()).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    const db = databaseFor(vi.fn(async () => ({ rows: [] })) as OutboxSqlExecutor['query']);
    const service = new OutboxService(db as never, {});
    await expect(service.dispatchTenantEventsDue(0)).rejects.toThrow('limit must be a positive integer');
    const claimed = { tenant_id: tenant, event_id: eventRow.id, attempts: 1, entity: event.entity,
      entity_id: event.entityId, idempotency_key: event.idempotencyKey, payload: event.payload,
      metadata: null, created_at: new Date(10) };
    const claimQuery = vi.fn(async (sql: string) => sql.includes('with due as') ? { rows: [claimed] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await expect(new OutboxService(databaseFor(claimQuery) as never, {}).dispatchTenantEventsDue(2))
      .resolves.toMatchObject([{ dispatched: false, row: { status: 'SENT' } }]);
  });

  it('claims due events, records transport evidence, and leaves no dispatcher outcomes pending', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: [claim] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const dispatcher = { sendEvent: vi.fn(async () => ({
      provider: 'https://provider.invalid', protocol: 'HTTP', requestBytes: Buffer.from('request'),
      responseBytes: Buffer.from('response'), requestHeaders: { authorization: '[redacted]' },
      responseStatus: 202, requestTransmission: 'response-received' as const,
    })) };
    const result = await new OutboxService(databaseFor(query) as never, { eventLeaseMs: 12 }, dispatcher)
      .dispatchTenantEventsDue();
    expect(result).toMatchObject([{ row: { id: claim.event_id }, dispatched: true }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='SENT'"))).toBe(true);
    expect(query.mock.calls[0]?.[1]).toEqual([tenant, 25, 12]);

    const emptyEvidenceQuery = vi.fn(async (sql: string) => sql.includes('with due as') ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const emptyEvidence = await new OutboxService(databaseFor(emptyEvidenceQuery) as never, {}, {
      sendEvent: async () => undefined as never,
    }).dispatchTenantEventsDue(1);
    expect(emptyEvidence).toMatchObject([{ dispatched: true }]);
    expect(emptyEvidenceQuery.mock.calls[0]?.[1]).toEqual([tenant, 1, 300_000]);
  });

  it('captures failed transport evidence and distinguishes a stale delivery from persistence failure', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: [claim] };
      if (sql.includes("set status='ERROR'")) return { rows: [{ event_id: claim.event_id }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const failed = Object.assign(new Error('provider offline'), {
      evidence: { provider: 'provider', requestBytes: Buffer.from('r'), responseStatus: 503 },
    });
    const dispatcher = { sendEvent: async () => { throw failed; } };
    const changed = await new OutboxService(databaseFor(query) as never, {}, dispatcher).dispatchTenantEventsDue(1);
    expect(changed).toMatchObject([{ dispatched: false, error: 'provider offline', row: { status: 'ERROR', lastError: 'provider offline' } }]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='ERROR'"))).toBe(true);

    const completeFailureEvidence = Object.assign(new Error('provider offline with response'), {
      evidence: { responseBytes: Buffer.from('response'), requestHeaders: { 'x-request': '[redacted]' } },
    });
    const completeEvidenceQuery = vi.fn(async (sql: string) => sql.includes('with due as')
      ? { rows: [claim] } : { rows: [] }) as OutboxSqlExecutor['query'];
    await new OutboxService(databaseFor(completeEvidenceQuery) as never, {}, {
      sendEvent: async () => { throw completeFailureEvidence; },
    }).dispatchTenantEventsDue(1);

    const staleQuery = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: [claim] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const stale = await new OutboxService(databaseFor(staleQuery) as never, {}, { send: async () => { throw 'offline'; } })
      .dispatchTenantEventsDue(1);
    expect(stale).toMatchObject([{ dispatched: false, error: 'offline', row: { status: 'SENT' } }]);

    const persistenceDb = databaseFor(query) as ReturnType<typeof databaseFor>;
    let transactionCount = 0;
    persistenceDb.tx = async (fn) => {
      transactionCount += 1;
      if (transactionCount > 1) throw new Error('write unavailable');
      return fn({ role: 'app', query } as never);
    };
    const unresolved = await new OutboxService(persistenceDb as never, {}, { send: async () => undefined })
      .dispatchTenantEventsDue(1);
    expect(unresolved).toMatchObject([{ dispatched: true, reconciliationRequired: true }]);

    let failureTransactions = 0;
    const failedPersistence = databaseFor(query) as ReturnType<typeof databaseFor>;
    failedPersistence.tx = async (fn) => {
      failureTransactions += 1;
      if (failureTransactions === 2) throw new Error('failure ledger unavailable');
      return fn({ role: 'app', query } as never);
    };
    const failedUnresolved = await new OutboxService(failedPersistence as never, {}, {
      send: async () => { throw new Error('provider rejected'); },
    }).dispatchTenantEventsDue(1);
    expect(failedUnresolved).toMatchObject([{ dispatched: false, reconciliationRequired: true,
      error: expect.stringContaining('failure ledger unavailable') }]);
  });
});
