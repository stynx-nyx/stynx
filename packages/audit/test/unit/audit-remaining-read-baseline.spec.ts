import { executeGuardedQueryRows, executeTypedQuery, QueryRowValidationError, type Transaction } from '@stynx-nyx/data';
import { AuditSqlReader, type AuditSqlListQuery } from '../../src/sql-adapter.js';
import { StynxAuditService } from '../../src/audit.service.js';
import type { AuditLogQuery } from '../../src/types.js';

const filters = ['tenantId', 'entity', 'operation', 'actorId', 'requestId', 'from', 'to'] as const;
const serviceFilters = ['tenantId', 'actorId', 'tableSchema', 'tableName', 'rowId', 'from', 'to'] as const;
const filterValues = ['tenant opaque', 'app.items', 'UPDATE', 'actor opaque', 'request opaque', 'raw lower', 'raw upper'];
const serviceValues = ['tenant opaque', 'actor opaque', 'app', 'items', 'row opaque', 'raw lower', 'raw upper'];
const cursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const physical = () => ({ id: '9007199254740993', occurred_at: 'raw timestamp', table_schema: 'app', table_name: 'items', row_id: null, operation: 'UPDATE', tenant_id: null, tenancy_id: null, actor_id: null, actor_role: null, entity: 'app.items', entity_id: null, request_id: null, session_id: null, tags: null, payload: null, pk: null, metadata: null, old_data: null, new_data: null, ip_address: null, previous_hash: null, row_hash: null, total: '1' });
function reader(mode: 'audit_log' | 'stynx_events', response?: unknown, options = {}) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => response);
  return { query, reader: new AuditSqlReader({ query }, { mode, ...options }) };
}
function service(response: unknown[] = []) {
  const events: string[] = [];
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => { events.push('query'); return { rows: response }; });
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard);
  const trx = { query, run, runGuarded };
  const tx = vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => { events.push('tx'); return fn(trx); });
  const withSystemContext = vi.fn(async (_label: string, fn: () => unknown) => { events.push('system'); return fn(); });
  const get = vi.fn(() => { events.push('database'); return { tx, withSystemContext }; });
  return { service: new StynxAuditService({ get } as never, {}, { now: () => new Date(0) }), query, tx, withSystemContext, get, events };
}
function configuredSql(mode: 'audit_log' | 'stynx_events', clauses: string[], binds: number) {
  const projection = mode === 'audit_log' ? ['occurred_at', 'tenant_id', 'actor_id', 'operation', 'table_schema', 'table_name', 'row_id', 'request_id', 'tags', 'payload'] : ['occurred_at', 'tenancy_id', 'actor_id', 'actor_role', 'operation', 'entity', 'entity_id', 'pk', 'request_id', 'ip_address', 'metadata', 'old_data', 'new_data', 'previous_hash', 'row_hash'];
  return `SELECT\n        ${projection.join(',\n        ')},\n        COUNT(*) OVER() AS total\n      FROM "audit"."${mode === 'audit_log' ? 'log' : 'events'}"\n      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}\n      ORDER BY occurred_at DESC${mode === 'audit_log' ? ', id DESC' : ''}\n      LIMIT $${binds + 1}\n      OFFSET $${binds + 2}`;
}
function logSql(clauses: string[], index: number) {
  return `
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
            order by occurred_at desc, id desc
            limit $${index}
          `;
}

describe('checked audit reader remaining 512 exact SQL variants', () => {
  for (const mode of ['audit_log', 'stynx_events'] as const) {
    for (let mask = 0; mask < 128; mask++) {
      it(`${mode} captures mask ${mask}`, async () => {
        const input: AuditSqlListQuery = { limit: 7, offset: 3 }; const binds: unknown[] = []; const clauses: string[] = [];
        const columns = [mode === 'audit_log' ? 'tenant_id::text' : 'tenancy_id::text', mode === 'audit_log' ? "(table_schema || '.' || table_name)" : 'entity', 'operation', 'actor_id::text', 'request_id', 'occurred_at', 'occurred_at'];
        filters.forEach((field, bit) => { if (mask & (1 << bit)) { input[field] = filterValues[bit]; binds.push(filterValues[bit]); clauses.push(`${columns[bit]} ${bit === 5 ? '>=' : bit === 6 ? '<=' : '='} $${binds.length}${bit >= 5 ? '::timestamptz' : ''}`); } });
        const sql = configuredSql(mode, clauses, binds.length); const h = reader(mode);
        expect(await h.reader.list(input)).toEqual({ items: [], total: 0 });
        expect(h.query).toHaveBeenCalledExactlyOnceWith(sql, [...binds, 7, 3]);
        console.log('AUDIT512_BASELINE ' + JSON.stringify({ family: mode, mask, sql, params: [...binds, 7, 3] }));
      });
    }
    it.each(filters)(`${mode} selected %s keeps first-read mask and second undefined binding`, async (field) => {
      let reads = 0; const h = reader(mode); const input = Object.defineProperty({}, field, { get() { return ++reads === 1 ? 'selected' : undefined; } });
      await h.reader.list(input); expect(reads).toBe(2); expect(h.query.mock.calls[0]?.[1]).toEqual([undefined, 100, 0]);
    });
    it(`${mode} preserves option, pagination and filter read order`, async () => {
      const order: string[] = []; const options = { get schema() { order.push('schema'); return 'audit'; }, get table() { order.push('table'); return mode === 'audit_log' ? 'log' : 'events'; } };
      // Preserve getters on actual constructor options, rather than spreading them in the fixture.
      const query = vi.fn(async () => []); const input = { get limit() { order.push('limit'); return 0.5; }, get offset() { order.push('offset'); return 9007199254740992; } };
      for (const field of filters) Object.defineProperty(input, field, { get() { order.push(field); return ''; } });
      const actual = new AuditSqlReader({ query }, Object.assign(Object.create(options), { mode }));
      await actual.list(input); expect(order).toEqual(['schema', 'table', 'limit', 'offset', ...filters]);
      expect(query).toHaveBeenCalledWith(expect.any(String), [0, 9007199254740992]);
    });
    it.each([undefined, null, 0, false, 'wrapper', {}, { rows: null }, { rows: {} }])(`${mode} preserves empty wrapper %#`, async (response) => {
      expect(await reader(mode, response).reader.list()).toEqual({ items: [], total: 0 });
    });
    it(`${mode} function rows getter is read once with original receiver and no rowCount`, async () => {
      const row = physical(); const rows = [row]; let reads = 0; function response() { throw new Error('not called'); }
      Object.defineProperty(response, 'rows', { get() { expect(this).toBe(response); reads++; return rows; } });
      Object.defineProperty(response, 'rowCount', { get() { throw new Error('unused metadata'); } });
      const result = await reader(mode, response).reader.list(); expect(reads).toBe(1); expect(result.items).toHaveLength(1);
    });
    it(`${mode} preserves rows getter and driver exception identity`, async () => {
      const error = new Error('rows'); const response = { get rows() { throw error; } }; await expect(reader(mode, response).reader.list()).rejects.toBe(error);
      const h = reader(mode); h.query.mockRejectedValueOnce(error); await expect(h.reader.list()).rejects.toBe(error);
    });
    it.each([NaN, Infinity, -Infinity, 0.5, 0, -1, 9007199254740992])(`${mode} preserves limit/offset sanitization %s`, async (value) => {
      const h = reader(mode); await h.reader.list({ limit: value, offset: value });
      const limit = !Number.isFinite(value) || !value || value <= 0 ? 100 : Math.min(Math.trunc(value), 500);
      const offset = !Number.isFinite(value) || !value || value < 0 ? 0 : Math.trunc(value);
      expect(h.query.mock.calls[0]?.[1]).toEqual([limit, offset]);
    });
  }
  for (let mask = 0; mask < 256; mask++) {
    it(`listLog captures mask ${mask}`, async () => {
      const input: AuditLogQuery = { limit: 7 }; const binds: unknown[] = []; const clauses: string[] = []; const columns = ['tenant_id::text', 'actor_id::text', 'table_schema', 'table_name', 'row_id', 'occurred_at', 'occurred_at'];
      serviceFilters.forEach((field, bit) => { if (mask & (1 << bit)) { input[field] = serviceValues[bit]; binds.push(serviceValues[bit]); clauses.push(`${columns[bit]} ${bit === 5 ? '>=' : bit === 6 ? '<=' : '='} $${binds.length}${bit >= 5 ? '::timestamptz' : ''}`); } });
      if (mask & 128) { input.cursor = cursor({ occurredAt: 'cursor timestamp', id: 91 }); clauses.push(`(occurred_at, id) < ($${binds.length + 1}::timestamptz, $${binds.length + 2}::bigint)`); binds.push('cursor timestamp', 91); }
      const sql = logSql(clauses, binds.length + 1); const h = service(); expect(await h.service.listLog(input)).toEqual({ items: [] });
      expect(h.query).toHaveBeenCalledExactlyOnceWith(sql, [...binds, 8]); expect(h.events).toEqual(['database', 'system', 'tx', 'query']);
      expect(h.withSystemContext).toHaveBeenCalledExactlyOnceWith('platform audit log read', expect.any(Function)); expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { role: 'owner' });
      console.log('AUDIT512_BASELINE ' + JSON.stringify({ family: 'listLog', mask, sql, params: [...binds, 8] }));
    });
  }
});

describe('audit result and mapper observations before remaining conversion', () => {
  for (const value of [undefined, null, 'text', 0, 1, false, true, [], { nested: [new Date(NaN), 4n, undefined] }]) {
    it(`audit_log payload primitive/array/object/nullish observation ${String(value)}`, async () => {
      const row = { ...physical(), payload: value }; const result = await reader('audit_log', [row]).reader.list();
      expect(result.items[0]?.oldData).toBe(null); expect(result.items[0]?.newData).toBe(null);
      const metadata = result.items[0]?.metadata;
      expect(metadata).toEqual({ tags: {}, payload: value ?? {} });
      if (metadata && typeof metadata === 'object' && 'payload' in metadata && value != null) expect(metadata.payload).toBe(value);
    });
  }
  it('audit_log inherited old/new getters preserve receiver, order and nested identities', async () => {
    const order: string[] = []; const old = { nested: [4n, undefined] }; const next: unknown[] = []; next.push(next);
    const proto = { get old() { expect(this).toBe(payload); order.push('old'); return old; }, get new() { expect(this).toBe(payload); order.push('new'); return next; } }; const payload = Object.create(proto);
    Object.defineProperty(payload, 'toJSON', { value() { throw new Error('no serialization'); } });
    const row = { ...physical(), get occurred_at() { order.push('time'); return 'timestamp'; }, get tags() { order.push('tags'); return null; }, get payload() { order.push('payload'); return payload; }, get total() { order.push('total'); return '1'; } };
    const result = await reader('audit_log', [row]).reader.list();
    expect(result.items[0]?.oldData).toBe(old); expect(result.items[0]?.newData).toBe(next);
    // Outer selected fields are validated eagerly; nested opaque getters remain lazy and ordered.
    expect(order.filter((entry) => entry === 'old' || entry === 'new')).toEqual(['old', 'new']);
    expect(order.indexOf('time')).toBeLessThan(order.indexOf('old'));
    expect(order.indexOf('tags')).toBeLessThan(order.indexOf('old'));
    expect(order.indexOf('payload')).toBeLessThan(order.indexOf('old'));
  });
  it('audit_log invalid Date fails before nested payload old/new work', async () => {
    const getter = vi.fn(() => { throw new Error('must not read'); });
    const row = { ...physical(), occurred_at: new Date(NaN), payload: { get old() { return getter(); }, get new() { return getter(); } } };
    await expect(reader('audit_log', [row]).reader.list()).rejects.toBeInstanceOf(RangeError); expect(getter).not.toHaveBeenCalled();
  });
  it('audit_log preserves a thrown inherited old getter before new', async () => {
    const error = new Error('opaque getter'); const after = vi.fn(); const payload = Object.create({ get old() { throw error; }, get new() { after(); return null; } });
    await expect(reader('audit_log', [{ ...physical(), payload }]).reader.list()).rejects.toBe(error); expect(after).not.toHaveBeenCalled();
  });
  it('audit_log absent tags/payload defaults are independent fresh objects', async () => {
    const result = await reader('audit_log', [physical(), physical()]).reader.list();
    const first = result.items[0]?.metadata; const second = result.items[1]?.metadata;
    expect(first).toEqual({ tags: {}, payload: {} }); expect(second).toEqual(first); expect(first).not.toBe(second);
    if (first && second && typeof first === 'object' && typeof second === 'object' && 'tags' in first && 'payload' in first && 'tags' in second) { expect(first.tags).not.toBe(first.payload); expect(first.tags).not.toBe(second.tags); }
  });
  for (const field of ['pk', 'metadata', 'old_data', 'new_data'] as const) {
    for (const value of [null, undefined, 'scalar', 3, false, [], { nested: [undefined, 9n] }]) {
      it(`events ${field} opaque ${String(value)}`, async () => {
        const row = { ...physical(), [field]: value }; const result = await reader('stynx_events', [row]).reader.list();
        const output = field === 'old_data' ? 'oldData' : field === 'new_data' ? 'newData' : field;
        expect(result.items[0]?.[output]).toBe(value ?? null);
      });
    }
  }
  for (const mode of ['audit_log', 'stynx_events'] as const) {
    it.each([NaN, Infinity, -Infinity, 'not numeric', 9007199254740993n])(`${mode} keeps total Number conversion %s`, async (total) => {
      const result = await reader(mode, [{ ...physical(), total }]).reader.list(); expect(result.total).toBe(Number(total));
    });
  }
});

describe('listLog cursor, pagination, ordering and opaque result baseline', () => {
  it.each(serviceFilters)('selected %s retains second undefined value', async (field) => {
    const h = service(); let count = 0; const input = Object.defineProperty({}, field, { get() { return ++count === 1 ? 'selected' : undefined; } });
    await h.service.listLog(input); expect(count).toBe(2); expect(h.query.mock.calls[0]?.[1]).toEqual([undefined, 51]);
  });
  it('reads database, limit, cursor twice, context and selected filters in original order', async () => {
    const h = service(); const encoded = cursor({ occurredAt: 'x', id: 4 });
    const input = { get limit() { h.events.push('limit'); return 2; }, get cursor() { h.events.push('cursor'); return encoded; }, get tenantId() { h.events.push('tenant'); return 't'; }, get actorId() { h.events.push('actor'); return ''; } };
    await h.service.listLog(input); expect(h.events).toEqual(['database', 'limit', 'cursor', 'cursor', 'system', 'tx', 'tenant', 'tenant', 'actor', 'query']);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 0.5, 1.5, 201])('preserves computed limit %s and native slicing', async (limit) => {
    const h = service([physical(), physical(), physical()]); const computed = Math.min(Math.max(limit, 1), 200); const page = await h.service.listLog({ limit });
    expect(h.query.mock.calls[0]?.[1]).toEqual([computed + 1]); expect(page.items).toHaveLength(Number.isNaN(computed) ? 0 : Math.min(Math.trunc(computed), 3));
    if (!Number.isInteger(computed)) expect(page.nextCursor).toBeUndefined();
  });
  for (const value of [null, false, 0, '', true, 7, 'text', [], {}, { occurredAt: null, id: null }, { occurredAt: { custom: 1 }, id: [] }]) {
    it(`preserves decoded cursor domain ${JSON.stringify(value)}`, async () => {
      const h = service(); await h.service.listLog({ cursor: cursor(value) });
      const fields: unknown[] = value ? [typeof value === 'object' && value !== null ? Reflect.get(value, 'occurredAt') : undefined, typeof value === 'object' && value !== null ? Reflect.get(value, 'id') : undefined] : [];
      expect(h.query.mock.calls[0]?.[1]).toEqual([...fields, 51]); expect(h.query).toHaveBeenCalledTimes(1);
    });
  }
  it('malformed cursor JSON fails before system context and SQL', async () => {
    const h = service(); await expect(h.service.listLog({ cursor: Buffer.from('{bad').toString('base64url') })).rejects.toBeInstanceOf(SyntaxError);
    expect(h.events).toEqual(['database']); expect(h.query).not.toHaveBeenCalled();
  });
  it('database absence takes precedence over limit/cursor getters', async () => {
    const getter = vi.fn(() => { throw new Error('later'); }); const s = new StynxAuditService({ get: () => undefined } as never, {}, { now: () => new Date(0) });
    await expect(s.listLog({ get limit() { return getter(); } })).rejects.toThrow('Database provider is unavailable'); expect(getter).not.toHaveBeenCalled();
  });
  it('preserves opaque result identities and distinct nullish defaults without serialization', async () => {
    const payload = { nested: [undefined, 4n], toJSON() { throw new Error('not wire'); } }; const tags = [payload];
    const h = service([{ ...physical(), tags, payload }, physical()]); const page = await h.service.listLog();
    expect(page.items[0]?.tags).toBe(tags); expect(page.items[0]?.payload).toBe(payload); expect(page.items[0]?.id).toBe(Number('9007199254740993'));
    expect(page.items[1]?.tags).toEqual({}); expect(page.items[1]?.payload).toEqual({}); expect(page.items[1]?.tags).not.toBe(page.items[1]?.payload);
  });
  it('tail cursor uses the row beyond the visible page and existing Infinity JSON conversion', async () => {
    const h = service([{ ...physical(), id: '1' }, { ...physical(), id: '9007199254740993', occurred_at: Infinity }]); const page = await h.service.listLog({ limit: 1 });
    expect(page.items).toHaveLength(1); expect(page.nextCursor).toBeDefined();
    expect(JSON.parse(Buffer.from(page.nextCursor!, 'base64url').toString())).toEqual({ occurredAt: null, id: Number('9007199254740993') });
  });
  it('preserves driver error identity inside owner/system scope', async () => {
    const h = service(); const error = new Error('query'); h.query.mockRejectedValueOnce(error); await expect(h.service.listLog()).rejects.toBe(error);
    expect(h.withSystemContext).toHaveBeenCalledOnce(); expect(h.tx).toHaveBeenCalledOnce(); expect(h.query).toHaveBeenCalledOnce();
  });
});

describe('remaining audit historical edge classifications', () => {
  for (const mode of ['audit_log', 'stynx_events'] as const) {
    it(`${mode} proxy wrapper uses one rows Get without HasProperty`, async () => {
      const gets: PropertyKey[] = []; const target = { rows: [physical()] };
      const wrapper = new Proxy(target, { get(t, key, receiver) { gets.push(key); return Reflect.get(t, key, receiver); }, has() { throw new Error('no has'); } });
      expect((await reader(mode, wrapper).reader.list()).items).toHaveLength(1); expect(gets).toEqual(['then', 'rows']);
    });
    it(`${mode} primitive wrapper inherited getter receives original primitive`, async () => {
      const before = Object.getOwnPropertyDescriptor(Number.prototype, 'rows'); const receivers: unknown[] = [];
      Object.defineProperty(Number.prototype, 'rows', { configurable: true, get() { receivers.push(this); return [physical()]; } });
      try { expect((await reader(mode, 42).reader.list()).items).toHaveLength(1); expect(receivers).toEqual([42]); }
      finally { if (before) Object.defineProperty(Number.prototype, 'rows', before); else Reflect.deleteProperty(Number.prototype, 'rows'); }
    });
    it(`${mode} second filter error prevents later getters and SQL`, async () => {
      const error = new Error('second filter'); const later = vi.fn(); let count = 0; const h = reader(mode);
      const input = { get tenantId() { if (++count === 2) throw error; return 'first'; }, get entity() { later(); return 'later'; } };
      await expect(h.reader.list(input)).rejects.toBe(error); expect(count).toBe(2); expect(later).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
    });
    it(`${mode} selected empty second filter remains a bound value`, async () => {
      let count = 0; const h = reader(mode); await h.reader.list({ get actorId() { return ++count === 1 ? 'first' : ''; } });
      expect(h.query.mock.calls[0]?.[1]).toEqual(['', 100, 0]); expect(count).toBe(2);
    });
  }
  for (const key of ['old', 'new'] as const) {
    for (const value of [() => 'historical function', Symbol('historical symbol')]) {
      it(`rejects historical out-of-domain payload.${key} ${typeof value} with redaction`, async () => {
        const h = reader('audit_log', [{ ...physical(), payload: { [key]: value } }]);
        const error = await h.reader.list().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(QueryRowValidationError);
        expect(error).toMatchObject({ query: 'configured.audit.read-log.mask.0', rowIndex: 0, issues: [{ path: ['payload', key], code: 'invalid_type' }] });
        expect(JSON.stringify(error)).not.toContain('historical function');
        expect(JSON.stringify(error)).not.toContain('historical symbol');
        expect(h.query).toHaveBeenCalledOnce();
      });
    }
  }
  it('listLog validates even rows beyond tail and preserves getter error identity', async () => {
    const error = new Error('unused row'); const marker = vi.fn(() => { throw error; }); const extra = { ...physical(), get occurred_at() { return marker(); } };
    const h = service([physical(), physical(), extra]);
    await expect(h.service.listLog({ limit: 1 })).rejects.toBe(error);
    expect(marker).toHaveBeenCalledOnce(); expect(h.query).toHaveBeenCalledOnce();
  });
  it('listLog tail InvalidDate retains mapping error after visible item', async () => {
    const h = service([physical(), { ...physical(), occurred_at: new Date(NaN) }]);
    await expect(h.service.listLog({ limit: 1 })).rejects.toBeInstanceOf(RangeError); expect(h.query).toHaveBeenCalledOnce();
  });
  it('listLog cursor second getter value is decoded without another truthiness check', async () => {
    const h = service(); let reads = 0;
    await expect(h.service.listLog({ get cursor() { return ++reads === 1 ? cursor({ id: 1 }) : ''; } })).rejects.toBeInstanceOf(SyntaxError);
    expect(reads).toBe(2); expect(h.events).toEqual(['database']); expect(h.query).not.toHaveBeenCalled();
  });
});


describe('audit fixed physical projections validate every selected row', () => {
  const families = [
    { mode: 'audit_log', fields: ['occurred_at', 'tenant_id', 'actor_id', 'operation', 'table_schema', 'table_name', 'row_id', 'request_id', 'tags', 'payload', 'total'], query: 'configured.audit.read-log.mask.0' },
    { mode: 'stynx_events', fields: ['occurred_at', 'tenancy_id', 'actor_id', 'actor_role', 'operation', 'entity', 'entity_id', 'pk', 'request_id', 'ip_address', 'metadata', 'old_data', 'new_data', 'previous_hash', 'row_hash', 'total'], query: 'configured.audit.read-events.mask.0' },
    { mode: 'listLog', fields: ['id', 'occurred_at', 'table_schema', 'table_name', 'row_id', 'operation', 'tenant_id', 'actor_id', 'request_id', 'session_id', 'tags', 'payload'], query: 'audit.listLog.mask.0' },
  ] as const;
  for (const family of families) {
    for (const field of family.fields) {
      it(`${family.mode} rejects malformed selected ${field} at index 1 without leaking values`, async () => {
        const secret = function driverSecret() { return 'driver-secret'; };
        const rows = [physical(), { ...physical(), [field]: secret }];
        const h = family.mode === 'listLog' ? service(rows) : reader(family.mode, rows);
        const promise = 'service' in h ? h.service.listLog() : h.reader.list();
        const error = await promise.catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(QueryRowValidationError);
        expect(error).toMatchObject({ query: family.query, rowIndex: 1 });
        if (error instanceof QueryRowValidationError) expect(error.issues.some((issue) => issue.path[0] === field)).toBe(true);
        expect(JSON.stringify(error)).not.toContain('driver-secret');
        expect(JSON.stringify(error)).not.toContain('driverSecret');
        expect(h.query).toHaveBeenCalledOnce();
      });
    }
    it(`${family.mode} rejects a sparse second row after one execution`, async () => {
      const rows = [physical()]; rows.length = 2;
      const h = family.mode === 'listLog' ? service(rows) : reader(family.mode, rows);
      const error = await ('service' in h ? h.service.listLog() : h.reader.list()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(QueryRowValidationError);
      expect(error).toMatchObject({ query: family.query, rowIndex: 1 });
      expect(h.query).toHaveBeenCalledOnce();
    });
  }
});
