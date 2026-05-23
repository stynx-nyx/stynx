import {
  AuditSqlReader,
  AuditSqlSink,
} from '../../../packages/audit/src/index';

describe('AuditSqlSink parity', () => {
  it('writes using audit.write function mode', async () => {
    const query = vi.fn(
      async (_sql: string, _params?: ReadonlyArray<unknown>) => ({ rows: [] }),
    );
    const sink = new AuditSqlSink(
      { query },
      { mode: 'audit_write_function' },
    );

    await sink.write({
      occurredAt: '2026-04-24T00:00:00.000Z',
      action: 'UPDATE',
      entity: 'auth.user',
      entityId: 'u-1',
      tenantId: 'tenant-a',
      actorId: 'actor-1',
      actorRole: 'admin',
      requestId: 'req-1',
      oldData: { status: 'OLD' },
      newData: { status: 'NEW' },
      pk: { id: 'u-1' },
      metadata: { source: 'test' },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const firstCall = query.mock.calls[0];
    if (!firstCall) {
      throw new Error('Missing query call');
    }
    const sql = firstCall[0];
    const params = (firstCall[1] ?? []) as unknown[];
    expect(sql).toContain('SELECT audit.write');
    expect(params[3]).toBe('UPDATE');
    expect(params[4]).toBe('auth.user');
    expect(params[5]).toBe('u-1');
    expect(params[12]).toBe(JSON.stringify({ id: 'u-1' }));
  });

  it('writes using table sink mode', async () => {
    const query = vi.fn(
      async (_sql: string, _params?: ReadonlyArray<unknown>) => ({ rows: [] }),
    );
    const sink = new AuditSqlSink(
      { query },
      { mode: 'audit_event_table', schema: 'public', table: 'audit_event' },
    );

    await sink.write({
      occurredAt: '2026-04-24T00:00:00.000Z',
      action: 'DELETE',
      entity: 'docs.file',
      entityId: 'd-1',
      actorId: 'actor-1',
      requestId: 'req-2',
      metadata: { source: 'test' },
      oldData: { a: 1 },
      newData: { a: 2 },
      pk: { id: 'd-1' },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const firstCall = query.mock.calls[0];
    if (!firstCall) {
      throw new Error('Missing query call');
    }
    const sql = firstCall[0];
    const params = (firstCall[1] ?? []) as unknown[];
    expect(sql).toContain('INSERT INTO public.audit_event');
    const metadata = JSON.parse(String(params[7]));
    expect(metadata.pk).toEqual({ id: 'd-1' });
    expect(metadata.oldData).toEqual({ a: 1 });
    expect(metadata.newData).toEqual({ a: 2 });
  });
});

describe('AuditSqlReader parity', () => {
  it('maps stynx_events shape', async () => {
    const query = vi.fn(async (_sql: string, _params?: ReadonlyArray<unknown>) => ({
      rows: [
        {
          occurred_at: '2026-04-24T00:00:00.000Z',
          tenancy_id: 'tenant-a',
          actor_id: 'actor-1',
          actor_role: 'admin',
          operation: 'UPDATE',
          entity: 'auth.user',
          entity_id: 'u-1',
          pk: { id: 'u-1' },
          request_id: 'req-1',
          ip_address: '127.0.0.1',
          metadata: { source: 'test' },
          old_data: { status: 'OLD' },
          new_data: { status: 'NEW' },
          previous_hash: 'hash-previous',
          row_hash: 'hash-current',
          total: 1,
        },
      ],
    }));
    const reader = new AuditSqlReader(
      { query },
      { mode: 'stynx_events' },
    );

    const result = await reader.list({ tenantId: 'tenant-a', limit: 10, offset: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      operation: 'UPDATE',
      entity: 'auth.user',
      entityId: 'u-1',
      pk: { id: 'u-1' },
      oldData: { status: 'OLD' },
      newData: { status: 'NEW' },
      previousHash: 'hash-previous',
      rowHash: 'hash-current',
    });
  });

  it('maps porm_logged_actions shape', async () => {
    const query = vi.fn(async (_sql: string, _params?: ReadonlyArray<unknown>) => ({
      rows: [
        {
          occurred_at: '2026-04-24T00:00:00.000Z',
          op: 'INSERT',
          schema_name: 'public',
          table_name: 'users',
          old_data: null,
          new_data: { id: 'u-1' },
          request_id: 'req-1',
          total: 1,
        },
      ],
    }));
    const reader = new AuditSqlReader(
      { query },
      { mode: 'porm_logged_actions' },
    );

    const result = await reader.list({ operation: 'INSERT' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      operation: 'INSERT',
      entity: 'public.users',
      newData: { id: 'u-1' },
    });
  });
});
