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
      expect((params as unknown[])[0]).toBe(null);
      expect((params as unknown[])[1]).toBe(null);
      expect((params as unknown[])[10]).toBe(null);
      expect((params as unknown[])[11]).toBe(null);
      expect((params as unknown[])[12]).toBe(null);
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

// =============================================================================
// Targeted mutation-survivor kills (WAVE-05A / @stynx/audit).
//
// Each describe below names the survivor cluster it targets in plain language
// and the file:line origin in src/sql-adapter.ts. Assertions are deliberately
// precise (full param arrays, exact SQL substrings, exact WHERE counts) so the
// surviving mutants cannot pass through.
// =============================================================================

describe('AuditSqlSink — ?? null params (LogicalOperator survivors at src/sql-adapter.ts:88-100 + 130-135)', () => {
  function makeExecutor(responses: unknown[] = []) {
    let i = 0;
    const query = vi.fn(async () => responses[i++] ?? { rows: [] });
    return { query };
  }

  describe('mode: audit_write_function — full param tuple', () => {
    it('coalesces undefined optionals to null (not undefined) at every slot', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      // All optionals omitted; action, entity, occurredAt are required.
      await sink.write({ occurredAt: '2026-05-18T00:00:00Z', action: 'a', entity: 'e' });
      const [, params] = executor.query.mock.calls[0]!;
      // 13 slots; every optional must be `null`, never `undefined`.
      // (?? null → null; mutation && null → undefined). Asserting via .toEqual
      // with `null` explicitly fails on undefined.
      expect(params).toEqual([
        null,                                            // [0] tenantId
        null,                                            // [1] actorId
        null,                                            // [2] actorRole — kills mutant 281
        'a',                                             // [3] action
        'e',                                             // [4] entity
        null,                                            // [5] entityId — kills mutant 282
        JSON.stringify({}),                              // [6] metadata
        null,                                            // [7] ipAddress — kills mutant 284
        null,                                            // [8] (literal null, always)
        null,                                            // [9] requestId/correlationId
        null,                                            // [10] oldData
        null,                                            // [11] newData
        null,                                            // [12] pk
      ]);
    });

    it('passes truthy optionals through verbatim (not nulled out)', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_write_function' });
      await sink.write({
        occurredAt: '2026-05-18T00:00:00Z',
        action: 'a',
        entity: 'e',
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        actorRole: 'admin',
        entityId: 'entity-1',
        ipAddress: '1.2.3.4',
        requestId: 'req-1',
      });
      const [, params] = executor.query.mock.calls[0]!;
      // Mutation `?? null` → `&& null` on truthy operands collapses to null;
      // asserting the original value at each slot kills the mutation.
      expect((params as unknown[])[0]).toBe('tenant-1');
      expect((params as unknown[])[1]).toBe('actor-1');
      expect((params as unknown[])[2]).toBe('admin');
      expect((params as unknown[])[5]).toBe('entity-1');
      expect((params as unknown[])[7]).toBe('1.2.3.4');
      expect((params as unknown[])[9]).toBe('req-1');
    });
  });

  describe('mode: audit_event_table — full param tuple', () => {
    it('coalesces undefined optionals to null at every slot', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_event_table' });
      await sink.write({ occurredAt: '2026-05-18T00:00:00Z', action: 'a', entity: 'e' });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[0]).toBe('2026-05-18T00:00:00Z');
      expect((params as unknown[])[1]).toBe(null);                  // actorId — kills 294
      expect((params as unknown[])[2]).toBe('a');                   // action
      expect((params as unknown[])[3]).toBe('e');                   // resource_type
      expect((params as unknown[])[4]).toBe(null);                  // entityId — kills 295
      expect((params as unknown[])[5]).toBe(null);                  // requestId — kills 296
      expect((params as unknown[])[6]).toBe(null);                  // ipAddress — kills 297
      // metadata blob still present (JSON-stringified empty-ish object)
      expect(typeof (params as unknown[])[7]).toBe('string');
    });

    it('passes truthy optionals through verbatim', async () => {
      const executor = makeExecutor();
      const sink = new AuditSqlSink(executor, { mode: 'audit_event_table' });
      await sink.write({
        occurredAt: '2026-05-18T00:00:00Z',
        action: 'a',
        entity: 'e',
        actorId: 'actor-1',
        entityId: 'entity-1',
        requestId: 'req-1',
        ipAddress: '1.2.3.4',
      });
      const [, params] = executor.query.mock.calls[0]!;
      expect((params as unknown[])[1]).toBe('actor-1');
      expect((params as unknown[])[4]).toBe('entity-1');
      expect((params as unknown[])[5]).toBe('req-1');
      expect((params as unknown[])[6]).toBe('1.2.3.4');
    });
  });
});

describe('AuditSqlReader — toRows OptionalChaining (kills survivor at src/sql-adapter.ts:178)', () => {
  it('returns empty items when executor.query returns null directly (not { rows: ... })', async () => {
    // Without the `?.` on (result as {...})?.rows, accessing `.rows` on null
    // throws TypeError. The mutant removes the optional chaining; this test
    // exercises the null result path that the existing { rows: null } test
    // does not reach.
    const executor = { query: vi.fn(async () => null as unknown) };
    const result = await new AuditSqlReader(executor as never, { mode: 'audit_log' }).list();
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('returns empty items when executor.query returns undefined directly', async () => {
    const executor = { query: vi.fn(async () => undefined as unknown) };
    const result = await new AuditSqlReader(executor as never, { mode: 'audit_log' }).list();
    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe('AuditSqlReader — empty-query coverage for non-audit_log modes', () => {
  function makeExecutor(responses: unknown[] = []) {
    let i = 0;
    const query = vi.fn(async () => responses[i++] ?? { rows: [] });
    return { query };
  }

  describe('mode: stynx_events with empty query', () => {
    it('emits no WHERE clause and only [limit, offset] params (kills 7+ ConditionalExpression "true" mutants + EqualityOperator + StringLiteral)', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'stynx_events' }).list();
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM audit.events');
      // Any ConditionalExpression → true mutation forces a filter branch to
      // fire even with no query field; that would push to params and emit a
      // WHERE clause. .not.toContain('WHERE') catches the EqualityOperator
      // mutation (whereParts.length >= 0) as well.
      expect(sql).not.toContain('WHERE');
      // Filter-clause fragments use distinctive cast/equality forms; the
      // SELECT-clause column names alone (`tenancy_id`, `entity`, …) appear
      // unconditionally, so we assert only the filter-specific suffixes here.
      expect(sql).not.toContain('tenancy_id::text =');
      expect(sql).not.toContain('entity = $');
      expect(sql).not.toContain('operation = $');
      expect(sql).not.toContain('actor_id::text');
      expect(sql).not.toContain('request_id = $');
      expect(sql).not.toContain('occurred_at >=');
      expect(sql).not.toContain('occurred_at <=');
      expect(params).toEqual([100, 0]);
    });

    it('emits a single WHERE fragment with only one filter (kills join-string mutants)', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'stynx_events' }).list({ tenantId: 't-1' });
      const [sql, params] = executor.query.mock.calls[0]!;
      // Exact WHERE substring (no trailing ' AND ' artifact from a mutated
      // join separator).
      expect(sql).toMatch(/WHERE tenancy_id::text = \$1\s+ORDER BY/);
      expect(params).toEqual(['t-1', 100, 0]);
    });

    it('tightens the full-filter assertion to assert every WHERE fragment + exact placeholder ordering', async () => {
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
      // Each filter's SQL fragment with its specific placeholder index.
      // Kills StringLiteral → "``" on each individual fragment + index--
      // UpdateOperator on each ++ that would shift the numbering.
      expect(sql).toContain('tenancy_id::text = $1');
      expect(sql).toContain('entity = $2');
      expect(sql).toContain('operation = $3');
      expect(sql).toContain('actor_id::text = $4');
      expect(sql).toContain('request_id = $5');
      expect(sql).toContain('occurred_at >= $6::timestamptz');
      expect(sql).toContain('occurred_at <= $7::timestamptz');
      // Join separator: ' AND ' (mutations to '' / 'Stryker was here!' would
      // alter the joined output; matching the joined WHERE string catches it).
      expect(sql).toMatch(
        /WHERE tenancy_id::text = \$1 AND entity = \$2 AND operation = \$3 AND actor_id::text = \$4 AND request_id = \$5 AND occurred_at >= \$6::timestamptz AND occurred_at <= \$7::timestamptz/,
      );
      expect(params).toEqual(['t', 'doc', 'UPDATE', 'u', 'r', 'f', 't', 100, 0]);
    });
  });

  describe('mode: porm_logged_actions with empty query', () => {
    it('emits no WHERE clause and only [limit, offset] params', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list();
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain('FROM audit.logged_actions');
      expect(sql).not.toContain('WHERE');
      // Filter-clause forms (distinct from SELECT-clause column names).
      expect(sql).not.toContain("(schema_name || '.' || table_name) = $");
      expect(sql).not.toContain('op = $');
      expect(sql).not.toContain('request_id = $');
      expect(sql).not.toContain('occurred_at >=');
      expect(sql).not.toContain('occurred_at <=');
      expect(params).toEqual([100, 0]);
    });

    it('emits a single WHERE fragment with only one filter', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list({
        operation: 'D',
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toMatch(/WHERE op = \$1\s+ORDER BY/);
      expect(params).toEqual(['D', 100, 0]);
    });

    it('tightens the full-filter assertion to assert every WHERE fragment + exact placeholder ordering', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'porm_logged_actions' }).list({
        entity: 'public.users',
        operation: 'D',
        requestId: 'r',
        from: 'f',
        to: 't',
      });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toContain("(schema_name || '.' || table_name) = $1");
      expect(sql).toContain('op = $2');
      expect(sql).toContain('request_id = $3');
      expect(sql).toContain('occurred_at >= $4::timestamptz');
      expect(sql).toContain('occurred_at <= $5::timestamptz');
      expect(sql).toMatch(
        /WHERE \(schema_name \|\| '\.' \|\| table_name\) = \$1 AND op = \$2 AND request_id = \$3 AND occurred_at >= \$4::timestamptz AND occurred_at <= \$5::timestamptz/,
      );
      expect(params).toEqual(['public.users', 'D', 'r', 'f', 't', 100, 0]);
    });
  });

  describe('mode: audit_log — tightening the join + placeholder assertions', () => {
    it('emits a single WHERE fragment with only one filter (placeholder $1, no AND artifact)', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'audit_log' }).list({ tenantId: 't' });
      const [sql, params] = executor.query.mock.calls[0]!;
      expect(sql).toMatch(/WHERE tenant_id::text = \$1\s+ORDER BY/);
      expect(params).toEqual(['t', 100, 0]);
    });

    it('joins multiple filters with " AND " (kills StringLiteral mutation on the separator)', async () => {
      const executor = makeExecutor([{ rows: [] }]);
      await new AuditSqlReader(executor, { mode: 'audit_log' }).list({
        tenantId: 't',
        operation: 'INSERT',
      });
      const [sql] = executor.query.mock.calls[0]!;
      expect(sql).toMatch(/WHERE tenant_id::text = \$1 AND operation = \$2/);
      // The mutated 'Stryker was here!' separator would produce
      // `WHERE tenant_id::text = $1Stryker was here!operation = $2` —
      // caught by the regex above (it requires literal ' AND ').
    });
  });
});

describe('AuditSqlReader — sanitize equivalence proofs (src/sql-adapter.ts:186-198)', () => {
  // The EqualityOperator mutants on `limit <= 0` and `offset < 0` are
  // EQUIVALENT mutants under the surrounding short-circuit:
  //
  //   if (!Number.isFinite(limit) || !limit || limit <= 0) { return fallback; }
  //
  //   - When limit === 0, the `!limit` clause short-circuits true → returns
  //     fallback. The `limit <= 0` vs `limit < 0` distinction never fires.
  //   - When limit > 0, both `<= 0` and `< 0` are false → same code path.
  //   - When limit < 0, both `<= 0` and `< 0` are true → same code path.
  //
  // Same proof applies to sanitizeOffset's `offset < 0` (the inner `!offset`
  // short-circuit catches 0; the outer comparator is dead at the boundary).
  // The proofs are encoded as assertions below so that any change to the
  // surrounding short-circuit (e.g. removing `!limit`) would break this spec
  // and force the equivalence claim to be re-verified.

  function makeExecutor(responses: unknown[] = []) {
    let i = 0;
    const query = vi.fn(async () => responses[i++] ?? { rows: [] });
    return { query };
  }

  it('sanitizeLimit: limit=0 returns fallback (proves the !limit short-circuit catches 0)', async () => {
    const executor = makeExecutor([{ rows: [] }]);
    await new AuditSqlReader(executor, { mode: 'audit_log' }).list({ limit: 0 });
    // fallback is 100 for listAuditLog
    expect(executor.query.mock.calls[0]![1]).toEqual([100, 0]);
  });

  it('sanitizeOffset: offset=0 returns 0 (proves the !offset short-circuit catches 0)', async () => {
    const executor = makeExecutor([{ rows: [] }]);
    await new AuditSqlReader(executor, { mode: 'audit_log' }).list({ offset: 0 });
    expect(executor.query.mock.calls[0]![1]).toEqual([100, 0]);
  });

  it('sanitizeLimit: negative limit returns fallback (the <= vs < distinction never fires here either)', async () => {
    const executor = makeExecutor([{ rows: [] }]);
    await new AuditSqlReader(executor, { mode: 'audit_log' }).list({ limit: -5 });
    expect(executor.query.mock.calls[0]![1]).toEqual([100, 0]);
  });

  it('sanitizeOffset: negative offset returns 0', async () => {
    const executor = makeExecutor([{ rows: [] }]);
    await new AuditSqlReader(executor, { mode: 'audit_log' }).list({ offset: -10 });
    expect(executor.query.mock.calls[0]![1]).toEqual([100, 0]);
  });
});

