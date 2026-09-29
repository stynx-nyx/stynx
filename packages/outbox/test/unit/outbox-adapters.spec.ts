import { HttpOutboxDispatcher } from '../../src/http-outbox-dispatcher';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import {
  OutboxAckQuarantineUnavailableError,
  OutboxClockAdmissionTimeoutError,
  OutboxClockAmbientTransactionError,
  OutboxCutoverAuditedTableError,
  OutboxCustomTableCutoverUnsupportedError,
  OutboxEventConflictError,
  OutboxEventTransactionError,
  OutboxLegacyCutoverError,
  OutboxOwnershipContentionError,
} from '../../src/errors';
import type { OutboxRow, OutboxSqlExecutor } from '../../src/types';

const row: OutboxRow = {
  id: 'message-1', tenantId: '11111111-1111-1111-1111-111111111111',
  entity: 'record.changed', entityId: 'record-1', payload: { id: 'record-1' }, metadata: null,
  status: 'SENT', attempts: 1, lastError: null, ackTime: null, nextAttemptAt: null,
  idempotencyKey: 'record.changed:record-1', createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

function executor(query: OutboxSqlExecutor['query']): OutboxSqlExecutor {
  return { query } as OutboxSqlExecutor;
}

describe('outbox adapter edge behavior', () => {
  it('captures HTTP event evidence, redacts sensitive headers, and records error responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 502,
      arrayBuffer: async () => Buffer.from('upstream failure'),
    })) as never;
    const dispatcher = new HttpOutboxDispatcher({
      url: (message) => `https://user:secret@example.invalid/${message.entity}?token=private`,
      headers: { Authorization: 'bearer-secret', 'X-OUTBOX-EVENT-ID': 'spoofed', 'X-Trace': 'secret' },
      method: 'PUT', fetchImpl,
    });
    const error = await dispatcher.sendEvent(row).catch((value: unknown) => value as Error & { evidence: unknown });
    expect(error.message).toContain('https://example.invalid/record.changed failed with HTTP 502');
    expect(error.message).not.toContain('secret');
    expect(error.evidence).toMatchObject({
      provider: 'https://example.invalid/record.changed',
      protocol: 'HTTP', responseStatus: 502, requestTransmission: 'response-received',
      requestHeaders: {
        authorization: '[redacted]', 'x-outbox-event-id': row.id,
        'x-outbox-idempotency-key': row.idempotencyKey, 'x-trace': '[redacted]',
      },
    });
    expect((error.evidence as { responseBytes: Buffer }).responseBytes.toString()).toBe('upstream failure');
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));
  });

  it('sanitizes option failures that happen before starting the legacy HTTP request', async () => {
    const dispatcher = new HttpOutboxDispatcher({ url: () => { throw new Error('private token in URL'); } });
    await expect(dispatcher.send(row)).rejects.toThrow('Outbox dispatch to [unavailable] failed before an HTTP response');
  });

  it('returns successful event evidence and attaches evidence to pre-response failures', async () => {
    const okFetch = vi.fn(async () => ({ ok: true, status: 202, arrayBuffer: async () => new Uint8Array([1, 2]) })) as never;
    const sent = await new HttpOutboxDispatcher({ url: 'https://provider.invalid/hook', fetchImpl: okFetch }).sendEvent(row);
    expect(sent).toMatchObject({ protocol: 'HTTP', provider: 'https://provider.invalid/hook', responseStatus: 202,
      requestTransmission: 'response-received', requestBytes: Buffer.from(JSON.stringify(row.payload)),
      responseBytes: Buffer.from([1, 2]) });

    const network = new HttpOutboxDispatcher({ url: () => 'bad-url', fetchImpl: vi.fn(async () => { throw new Error('contains private url'); }) as never });
    const failed = await network.sendEvent(row).catch((value: unknown) => value as Error & { evidence: unknown });
    expect(failed.message).toContain('[invalid-url]');
    expect(failed.message).not.toContain('private');
    expect(failed.evidence).toMatchObject({ protocol: 'HTTP', provider: '[invalid-url]', requestTransmission: 'constructed-not-confirmed' });
  });

  it('supports derived event headers, default fetch, and errors before a request starts', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    try {
      const sent = await new HttpOutboxDispatcher({
        url: 'https://provider.invalid/event',
        headers: (message) => ({ 'X-Trace-ID': message.id }),
      }).sendEvent(row);
      expect(sent.requestHeaders).toMatchObject({ 'x-trace-id': '[redacted]' });
      expect(globalFetch).toHaveBeenCalledOnce();
    } finally {
      globalFetch.mockRestore();
    }

    const rejectedBody = new HttpOutboxDispatcher({
      url: 'https://provider.invalid/event',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new Error('bad body'); } })) as never,
    });
    const bodyError = await rejectedBody.sendEvent(row).catch((value: unknown) => value as Error & { evidence: unknown });
    expect(bodyError.message).toContain('HTTP 200');
    expect(bodyError.evidence).toMatchObject({ responseStatus: 200, requestTransmission: 'response-received' });

    const urlError = new HttpOutboxDispatcher({ url: () => { throw new Error('secret url'); } });
    const beforeRequest = await urlError.sendEvent(row).catch((value: unknown) => value as Error & { evidence: unknown });
    expect(beforeRequest.message).toContain('[unavailable]');
    expect(beforeRequest.message).not.toContain('secret');
    expect(beforeRequest.evidence).toMatchObject({ protocol: 'HTTP', requestTransmission: 'constructed-not-confirmed' });
  });

  it('covers event-stream clock guards, scoped reads, cursor validation, and database role checks', async () => {
    const streamRow = { id: '11111111-1111-4111-8111-111111111111', createdAt: new Date(1), event: 'updated', payload: { x: 1 } };
    const makeDatabase = (query: OutboxSqlExecutor['query'], held = false) => {
      const trx = executor(query);
      return {
        hasHeldConnection: () => held,
        currentTenantId: () => '11111111-1111-1111-1111-111111111111',
        withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
        tx: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(trx),
        txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(trx),
      };
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_is_in_recovery')) return { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] };
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '1700000000000' }] };
      if (sql.includes('from outbox.events')) return { rows: [streamRow] };
      return { rows: [] };
    });
    const source = new OutboxEventStreamSource(makeDatabase(query) as never);
    await expect(source.now({ tenantId: 't', actorId: 'a' })).resolves.toEqual(new Date(1_700_000_000_000));
    await expect(source.findById('not-a-uuid', { tenantId: 't', actorId: 'a' })).resolves.toStrictEqual(null);
    await expect(source.findById(streamRow.id, { tenantId: 't', actorId: 'a' })).resolves.toEqual(streamRow);
    const emptyRead = new OutboxEventStreamSource(makeDatabase(vi.fn(async (sql: string) =>
      sql.includes('pg_is_in_recovery') ? { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] } : { rows: [] })) as never);
    await expect(emptyRead.findById(streamRow.id, { tenantId: 't', actorId: 'a' })).resolves.toStrictEqual(null);
    await expect(source.listSince({ createdAt: new Date(0), id: '' }, { tenantId: 't', actorId: 'a' }, 3)).resolves.toEqual([streamRow]);

    const held = new OutboxEventStreamSource(makeDatabase(query, true) as never);
    await expect(held.now({ tenantId: 't', actorId: 'a' })).rejects.toBeInstanceOf(OutboxClockAmbientTransactionError);

    const replicaQuery = vi.fn(async () => ({ rows: [{ recovery: true, role: 'app', sql_role: 'stynx_app' }] }));
    const replica = new OutboxEventStreamSource(makeDatabase(replicaQuery) as never);
    await expect(replica.findById(streamRow.id, { tenantId: 't', actorId: 'a' })).rejects.toBeInstanceOf(OutboxEventTransactionError);
    await expect(replica.listSince({ createdAt: new Date(0), id: '' }, { tenantId: 't', actorId: 'a' }, 1)).rejects.toBeInstanceOf(OutboxEventTransactionError);
    await expect(replica.now({ tenantId: 't', actorId: 'a' })).rejects.toBeInstanceOf(OutboxEventTransactionError);
  });

  it('rejects event-stream reads executed with an untrusted application role', async () => {
    const db = {
      hasHeldConnection: () => false,
      withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
      tx: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor(async () => ({ rows: [{ recovery: false, role: 'owner', sql_role: 'stynx_owner' }] }))),
    };
    await expect(new OutboxEventStreamSource(db as never).findById('11111111-1111-4111-8111-111111111111', { tenantId: 't', actorId: 'a' })).rejects.toBeInstanceOf(OutboxEventTransactionError);
  });

  it('admits one tenant clock preflight at a time and releases the slot after timeout', async () => {
    let entered!: () => void;
    const atClock = new Promise<void>((resolve) => { entered = resolve; });
    let unlock!: () => void;
    const blocked = new Promise<void>((resolve) => { unlock = resolve; });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_is_in_recovery')) return { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] };
      if (sql.includes('returning last_ms')) {
        entered();
        await blocked;
        return { rows: [{ last_ms: '10' }] };
      }
      return { rows: [] };
    });
    const database = {
      hasHeldConnection: () => false,
      withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
      txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor(query)),
    };
    const source = new OutboxEventStreamSource(database as never, { lockTimeoutMs: 2 });
    const first = source.now({ tenantId: 'tenant', actorId: 'actor' });
    await atClock;
    await expect(source.now({ tenantId: 'tenant', actorId: 'actor' })).rejects.toBeInstanceOf(OutboxClockAdmissionTimeoutError);
    unlock();
    await expect(first).resolves.toEqual(new Date(10));
    await expect(source.now({ tenantId: 'tenant', actorId: 'actor' })).resolves.toEqual(new Date(10));
  });

  it('waits for an existing same-tenant clock preflight and clears its admission timer', async () => {
    let entered!: () => void;
    const atClock = new Promise<void>((resolve) => { entered = resolve; });
    let unlock!: () => void;
    const blocked = new Promise<void>((resolve) => { unlock = resolve; });
    let firstQuery = true;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_is_in_recovery')) return { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] };
      if (sql.includes('returning last_ms') && firstQuery) {
        firstQuery = false;
        entered();
        await blocked;
      }
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '15' }] };
      return { rows: [] };
    });
    const database = {
      hasHeldConnection: () => false,
      withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
      txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor(query)),
    };
    const source = new OutboxEventStreamSource(database as never, { lockTimeoutMs: 500 });
    const first = source.now({ tenantId: 'same', actorId: 'actor' });
    await atClock;
    const timer = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(undefined as never);
    const second = source.now({ tenantId: 'same', actorId: 'actor' });
    unlock();
    await expect(first).resolves.toEqual(new Date(15));
    await expect(second).resolves.toEqual(new Date(15));
    timer.mockRestore();
  });

  it('rejects a waiter whose admission deadline expires before waiting on the holder', async () => {
    let entered!: () => void;
    const atClock = new Promise<void>((resolve) => { entered = resolve; });
    let unlock!: () => void;
    const blocked = new Promise<void>((resolve) => { unlock = resolve; });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_is_in_recovery')) return { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] };
      if (sql.includes('returning last_ms')) { entered(); await blocked; return { rows: [{ last_ms: '20' }] }; }
      return { rows: [] };
    });
    const database = {
      hasHeldConnection: () => false,
      withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
      txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor(query)),
    };
    const source = new OutboxEventStreamSource(database as never, { lockTimeoutMs: 1 });
    const first = source.now({ tenantId: 'deadline', actorId: 'actor' });
    await atClock;
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(102);
    await expect(source.now({ tenantId: 'deadline', actorId: 'actor' })).rejects.toBeInstanceOf(OutboxClockAdmissionTimeoutError);
    clock.mockRestore();
    unlock();
    await expect(first).resolves.toEqual(new Date(20));
  });

  it('preserves a replacement tenant admission marker during cleanup', async () => {
    let entered!: () => void;
    const atClock = new Promise<void>((resolve) => { entered = resolve; });
    let unlock!: () => void;
    const blocked = new Promise<void>((resolve) => { unlock = resolve; });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_is_in_recovery')) return { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] };
      if (sql.includes('returning last_ms')) { entered(); await blocked; return { rows: [{ last_ms: '25' }] }; }
      return { rows: [] };
    });
    const database = {
      hasHeldConnection: () => false,
      withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
      txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(executor(query)),
    };
    const source = new OutboxEventStreamSource(database as never);
    const first = source.now({ tenantId: 'replacement', actorId: 'actor' });
    await atClock;
    const registry = (source as unknown as { preflights: Map<string, Promise<void>> }).preflights;
    const replacement = Promise.resolve();
    registry.set('replacement', replacement);
    unlock();
    await expect(first).resolves.toEqual(new Date(25));
    expect(registry.get('replacement')).toBe(replacement);
    registry.delete('replacement');
  });

  it('aborts an event request after its timeout and clears the timer', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('raw network detail')));
      })) as never;
      const pending = new HttpOutboxDispatcher({ url: 'https://provider.invalid/hook', timeoutMs: 12, fetchImpl }).sendEvent(row);
      const rejected = expect(pending).rejects.toThrow('Outbox request aborted');
      await vi.advanceTimersByTimeAsync(12);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes stable error types for guarded outbox paths', () => {
    for (const error of [
      new OutboxAckQuarantineUnavailableError(), new OutboxClockAdmissionTimeoutError(),
      new OutboxClockAmbientTransactionError(), new OutboxCutoverAuditedTableError(),
      new OutboxCustomTableCutoverUnsupportedError(), new OutboxEventConflictError(),
      new OutboxEventTransactionError(), new OutboxLegacyCutoverError(), new OutboxOwnershipContentionError(),
    ]) expect(error).toBeInstanceOf(Error);
  });
});
