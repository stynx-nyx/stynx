import { AuditSqlReader, AuditSqlSink } from '../../src/sql-adapter';

function makeExecutor(responses: unknown[] = []) {
  let i = 0;
  const query = vi.fn(async () => responses[i++] ?? { rows: [] });
  return { query };
}

describe('AuditSqlSink', () => {
  describe('mode: audit_write_function', () => {
    it('calls SELECT audit.write with the 13 expected params', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: '2026-05-18T00:00:00Z',
        action: 'document.created',
        entity: 'document',
        entityId: 'doc-1',
        tenantId: 't-1',
        actorId: 'u-1',
        actorRole: 'admin',
        requestId: 'req-1',
        ipAddress: '1.2.3.4',
        metadata: { foo: 'bar' },
        oldData: { v: 1 },
        newData: { v: 2 },
      });
      expect(executor.query).toHaveBeenCalledTimes(1);
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('SELECT audit.write');
      expect(params).toHaveLength(13);
      expect((params as unknown[])[0]).toBe('t-1');
      expect((params as unknown[])[3]).toBe('document.created');
      expect((params as unknown[])[4]).toBe('document');
      // metadata, oldData, newData get stringified
      expect((params as unknown[])[6]).toBe(JSON.stringify({ foo: 'bar' }));
      expect((params as unknown[])[10]).toBe(JSON.stringify({ v: 1 }));
      expect((params as unknown[])[11]).toBe(JSON.stringify({ v: 2 }));
    });

    it('synthesizes pk from entityId when pk not provided', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: 'now',
        action: 'a',
        entity: 'e',
        entityId: 'eid-1',
      });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[12]).toBe(JSON.stringify({ id: 'eid-1' }));
    });

    it('passes pk through when provided explicitly', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: 'now',
        action: 'a',
        entity: 'e',
        pk: { schema_id: 's-1', table_id: 't-2' },
      });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[12]).toBe(JSON.stringify({ schema_id: 's-1', table_id: 't-2' }));
    });

    it('uses correlationId when requestId is absent', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: 'now',
        action: 'a',
        entity: 'e',
        correlationId: 'corr-1',
      });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[9]).toBe('corr-1');
    });

    it('sends nulls for absent fields', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({ occurredAt: 'now', action: 'a', entity: 'e' });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[0]).toBeNull();
      expect((params as unknown[])[1]).toBeNull();
      expect((params as unknown[])[10]).toBeNull();
      expect((params as unknown[])[11]).toBeNull();
      expect((params as unknown[])[12]).toBeNull();
    });
  });

  describe('mode: audit_event_table', () => {
    it('INSERTs into the default audit_event table with the expected 8 params', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_event_table' });
      await sink.write({
        occurredAt: '2026-05-18T00:00:00Z',
        action: 'a',
        entity: 'e',
        entityId: 'eid-1',
        tenantId: 't-1',
        actorId: 'u-1',
        actorRole: 'admin',
        correlationId: 'corr-1',
        requestId: 'req-1',
        ipAddress: '1.2.3.4',
        metadata: { foo: 'bar' },
        oldData: { v: 1 },
        newData: { v: 2 },
        pk: { id: 'eid-1' },
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO public.audit_event');
      expect(params).toHaveLength(8);
      const meta = JSON.parse((params as string[])[7]);
      expect(meta.tenantId).toBe('t-1');
      expect(meta.actorRole).toBe('admin');
      expect(meta.correlationId).toBe('corr-1');
      expect(meta.pk).toEqual({ id: 'eid-1' });
      expect(meta.oldData).toEqual({ v: 1 });
      expect(meta.newData).toEqual({ v: 2 });
      expect(meta.foo).toBe('bar');
    });

    it('honors custom schema + table options', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, {
        mode: 'audit_event_table',
        schema: 'my_schema',
        table: 'my_table',
      });
      await sink.write({ occurredAt: 'now', action: 'a', entity: 'e' });
      const [sql] = executor.query.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO my_schema.my_table');
    });
  });
});

describe('AuditSqlReader.list', () => {
  describe('mode: audit_log', () => {
    function reader(executor: ReturnType<typeof makeExecutor>) {
      return new AuditSqlReader(executor, { mode: 'audit_log' });
    }

    it('queries audit.log with no filters when query is empty', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      const result = await reader(executor).list();
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM audit.log');
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([100, 0]); // limit, offset
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies tenantId / entity / operation / actorId / requestId / from / to filters', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await reader(executor).list({
        tenantId: 't-1',
        entity: 'app.users',
        operation: 'INSERT',
        actorId: 'u-1',
        requestId: 'req-1',
        from: '2026-01-01',
        to: '2026-12-31',
        limit: 50,
        offset: 20,
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('WHERE tenant_id::text = $1');
      expect(sql).toContain("(table_schema || '.' || table_name) = $2");
      expect(sql).toContain('operation = $3');
      expect(sql).toContain('actor_id::text = $4');
      expect(sql).toContain('request_id = $5');
      expect(sql).toContain('occurred_at >= $6::timestamptz');
      expect(sql).toContain('occurred_at <= $7::timestamptz');
      expect(params).toEqual([
        't-1',
        'app.users',
        'INSERT',
        'u-1',
        'req-1',
        '2026-01-01',
        '2026-12-31',
        50, // sanitized limit
        20, // sanitized offset
      ]);
    });

    it('maps row shape into AuditSqlListItem (audit_log mode)', async () => {
      const executor = makeExecutor([
        {
          rows: [
            {
              occurred_at: new Date('2026-05-18T00:00:00Z'),
              tenant_id: 't-1',
              actor_id: 'u-1',
              operation: 'INSERT',
              table_schema: 'app',
              table_name: 'users',
              row_id: 'row-1',
              request_id: 'req-1',
              tags: { x: 1 },
              payload: { old: { a: 1 }, new: { a: 2 } },
              total: 17,
            },
          ],
        },
      ]);
      const result = await reader(executor).list();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        occurredAt: '2026-05-18T00:00:00.000Z',
        entity: 'app.users',
        operation: 'INSERT',
        oldData: { a: 1 },
        newData: { a: 2 },
      });
      expect(result.total).toBe(17);
    });

    it('passes through string occurredAt unchanged', async () => {
      const executor = makeExecutor([
        {
          rows: [
            {
              occurred_at: '2026-05-18T00:00:00Z',
              table_schema: 's',
              table_name: 't',
              operation: 'INSERT',
              total: 1,
            },
          ],
        },
      ]);
      const result = await reader(executor).list();
      expect(result.items[0].occurredAt).toBe('2026-05-18T00:00:00Z');
    });

    it('sanitizes invalid limit/offset (negative, NaN, oversize) to safe defaults', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await reader(executor).list({ limit: -5, offset: -10 });
      const params1 = executor.query.mock.calls[0]![1];
      expect(params1).toEqual([100, 0]);

      const executor2 = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor2, { mode: 'audit_log' }).list({ limit: 999_999, offset: 5 });
      const params2 = executor2.query.mock.calls[0]![1];
      expect(params2).toEqual([500, 5]); // clamped to 500
    });

    it('honors custom schema + table options', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, {
        mode: 'audit_log',
        schema: 'my_audit',
        table: 'my_log',
      }).list();
      const [sql] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM my_audit.my_log');
    });

    it('accepts array-shaped executor results (no .rows wrapper)', async () => {
      const executor = {
        query: vi.fn(async () => [
          {
            occurred_at: '2026',
            table_schema: 's',
            table_name: 't',
            operation: 'UPDATE',
            total: 3,
          },
        ]),
      };
      const result = await new AuditSqlReader(executor as never, { mode: 'audit_log' }).list();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
    });

    it('treats non-array rows wrappers as empty results', async () => {
      const executor = makeExecutor([{ rows: null }]);
      const result = await reader(executor).list();
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('maps audit log rows with missing optional fields to public defaults', async () => {
      const executor = makeExecutor([
        {
          rows: [{ occurred_at: '2026-05-18T00:00:00Z', total: 1 }],
        },
      ]);
      const result = await reader(executor).list();
      expect(result.items[0]).toMatchObject({
        actorId: null,
        operation: 'UNKNOWN',
        entity: 'unknown.unknown',
        entityId: null,
      });
    });
  });

  describe('mode: stynx_events', () => {
    it('queries stynx_events with full filter set', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'stynx_events' }).list({
        tenantId: 't',
        entity: 'doc',
        operation: 'UPDATE',
        actorId: 'u',
        requestId: 'r',
        from: 'f',
        to: 't',
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM audit.events');
      expect(sql).toContain('tenancy_id::text = $1');
      expect(sql).toContain('entity = $2');
      expect(params).toEqual(['t', 'doc', 'UPDATE', 'u', 'r', 'f', 't', 100, 0]);
    });

    it('maps row shape into AuditSqlListItem with metadata + previousHash + rowHash', async () => {
      const executor = makeExecutor([
        {
          rows: [
            {
              occurred_at: new Date('2026-05-18T00:00:00Z'),
              tenancy_id: 't-1',
              actor_id: 'u-1',
              actor_role: 'admin',
              operation: 'INSERT',
              entity: 'doc',
              entity_id: 'd-1',
              pk: { id: 'd-1' },
              request_id: 'r-1',
              ip_address: '1.2.3.4',
              metadata: { a: 1 },
              old_data: { o: 1 },
              new_data: { n: 1 },
              previous_hash: 'prev',
              row_hash: 'curr',
              total: 5,
            },
          ],
        },
      ]);
      const result = await new AuditSqlReader(executor, { mode: 'stynx_events' }).list();
      expect(result.items[0]).toMatchObject({
        operation: 'INSERT',
        entity: 'doc',
        previousHash: 'prev',
        rowHash: 'curr',
        pk: { id: 'd-1' },
        ipAddress: '1.2.3.4',
      });
      expect(result.total).toBe(5);
    });

    it('uses defaults for missing operation/entity/tenancy fields', async () => {
      const executor = makeExecutor([
        {
          rows: [{ occurred_at: 'now', total: 1 }],
        },
      ]);
      const result = await new AuditSqlReader(executor, { mode: 'stynx_events' }).list();
      expect(result.items[0].operation).toBe('UNKNOWN');
      expect(result.items[0].entity).toBe('unknown');
    });
  });

  describe('mode: porm_logged_actions', () => {
    it('queries porm logged_actions with entity/operation/requestId/from/to filters', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list({
        entity: 'public.users',
        operation: 'D',
        requestId: 'r',
        from: 'f',
        to: 't',
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM audit.logged_actions');
      expect(sql).toContain("(schema_name || '.' || table_name) = $1");
      expect(sql).toContain('op = $2');
      expect(params).toEqual(['public.users', 'D', 'r', 'f', 't', 100, 0]);
    });

    it('maps PORM rows into AuditSqlListItem shape', async () => {
      const executor = makeExecutor([
        {
          rows: [
            {
              occurred_at: '2026-05-18T00:00:00Z',
              op: 'U',
              schema_name: 'public',
              table_name: 'users',
              old_data: { o: 1 },
              new_data: { n: 1 },
              request_id: 'r-1',
              total: 2,
            },
          ],
        },
      ]);
      const result = await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list();
      expect(result.items[0]).toMatchObject({
        operation: 'U',
        entity: 'public.users',
        oldData: { o: 1 },
        newData: { n: 1 },
        requestId: 'r-1',
      });
      expect(result.total).toBe(2);
    });

    it('maps PORM rows with missing optional fields to public defaults', async () => {
      const executor = makeExecutor([
        {
          rows: [{ occurred_at: '2026-05-18T00:00:00Z', total: 1 }],
        },
      ]);
      const result = await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list();
      expect(result.items[0]).toMatchObject({
        operation: 'UNKNOWN',
        entity: 'unknown.unknown',
        requestId: null,
        oldData: null,
        newData: null,
      });
    });
  });
});
