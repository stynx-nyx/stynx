import { AuditSqlReader, type AuditSqlListQuery } from '../../src/sql-adapter.js';
import { QueryRowValidationError } from '@stynx-nyx/data';

const fields = ['entity', 'operation', 'requestId', 'from', 'to'] as const;
const values = ['app.items', 'UPDATE', 'request-id', 'raw lower bound', 'raw upper bound'];
const predicates = ["(schema_name || '.' || table_name)", 'op', 'request_id', 'occurred_at', 'occurred_at'];
const physical = () => ({ occurred_at: 'opaque timestamp', op: 'UPDATE', schema_name: 'app', table_name: 'items', request_id: 'request-id', total: '1' });
function reader(response: unknown = []) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => response);
  return { query, reader: new AuditSqlReader({ query }, { mode: 'porm_logged_actions' }) };
}

describe('PORM static32 reader retains approved runtime behavior', () => {
  for (let mask = 0; mask < 32; mask += 1) {
    it(`preserves exact SQL and bind order for mask ${mask}`, async () => {
      const input: AuditSqlListQuery = { limit: 7, offset: 3, tenantId: 'ignored', actorId: 'ignored' };
      const params: string[] = [];
      const clauses: string[] = [];
      fields.forEach((field, bit) => {
        if (mask & (1 << bit)) {
          input[field] = values[bit];
          params.push(values[bit]!);
          clauses.push(`${predicates[bit]} ${bit === 3 ? '>=' : bit === 4 ? '<=' : '='} $${params.length}${bit >= 3 ? '::timestamptz' : ''}`);
        }
      });
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM "audit"."logged_actions"
      ${where}
      ORDER BY occurred_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}`;
      const fixture = reader();
      await expect(fixture.reader.list(input)).resolves.toEqual({ items: [], total: 0 });
      expect(fixture.query.mock.calls).toEqual([[sql, [...params, 7, 3]]]);
      console.log('AUDIT32_STATIC_SQL ' + JSON.stringify({ mask, sql, params: [...params, 7, 3] }));
    });
  }

  it.each(fields)('reads selected %s twice and binds its second value even when undefined', async (field) => {
    const reads: string[] = [];
    let count = 0;
    const input = Object.defineProperty({}, field, { get() { reads.push(field); return count++ === 0 ? 'selected' : undefined; } });
    const fixture = reader();
    await expect(fixture.reader.list(input)).resolves.toEqual({ items: [], total: 0 });
    expect(reads).toEqual([field, field]);
    expect(fixture.query.mock.calls[0]?.[1]).toEqual([undefined, 100, 0]);
    expect(fixture.query.mock.calls[0]?.[0]).toContain('WHERE ');
  });

  it('reads falsy filters once, retains overall property order and never reads ignored tenant/actor', async () => {
    const reads: string[] = [];
    const input = {
      get limit() { reads.push('limit'); return 3; },
      get offset() { reads.push('offset'); return 4; },
      get tenantId() { throw new Error('ignored tenant getter'); },
      get actorId() { throw new Error('ignored actor getter'); },
    };
    for (const field of fields) Object.defineProperty(input, field, { get() { reads.push(field); return ''; } });
    const fixture = reader();
    await fixture.reader.list(input);
    expect(reads).toEqual(['limit', 'offset', ...fields]);
    expect(fixture.query.mock.calls[0]?.[1]).toEqual([3, 4]);
  });

  it('retains original getter failure identity before executing SQL', async () => {
    const failure = new Error('second getter');
    let reads = 0;
    const fixture = reader();
    await expect(fixture.reader.list({ get entity() { if (++reads === 2) throw failure; return 'selected'; } })).rejects.toBe(failure);
    expect(reads).toBe(2);
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -Infinity, 'not numeric', 9n, '9007199254740993'])('retains Number(total) conversion for %s', async (total) => {
    const fixture = reader([{ ...physical(), total }]);
    const result = await fixture.reader.list();
    expect(result.total).toBe(Number(total));
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it.each(['raw date', Infinity, -Infinity, new Date('2026-10-24T00:00:00.123Z')])('retains timestamp mapper for %s', async (timestamp) => {
    const fixture = reader([{ ...physical(), occurred_at: timestamp }]);
    const result = await fixture.reader.list();
    expect(result.items[0]?.occurredAt).toBe(timestamp instanceof Date ? timestamp.toISOString() : timestamp);
  });

  it('retains InvalidDate RangeError from the existing mapper', async () => {
    const fixture = reader([{ ...physical(), occurred_at: new Date(NaN) }]);
    await expect(fixture.reader.list()).rejects.toBeInstanceOf(RangeError);
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it('retains shallow payload identities and nullish mapper defaults', async () => {
    const nested = { date: new Date(NaN), bigint: 4n, absent: undefined };
    const payload = { nested };
    const proto = { retained: true };
    Object.defineProperty(payload, '__proto__', { enumerable: true, value: proto });
    const array = [payload];
    const fixture = reader([{ ...physical(), old_data: payload, new_data: array }, { occurred_at: 'raw', op: null }]);
    const result = await fixture.reader.list();
    expect(result.items[0]?.oldData).toBe(payload);
    expect(result.items[0]?.newData).toBe(array);
    expect(Reflect.get(payload, '__proto__')).toBe(proto);
    expect(result.items[1]).toEqual({ occurredAt: 'raw', operation: 'UNKNOWN', entity: 'unknown.unknown', requestId: null, oldData: null, newData: null });
  });

  it('refuses a malformed declared row before any mapped result is exposed', async () => {
    const fixture = reader([physical(), { ...physical(), occurred_at: { private: 'driver-secret' } }]);
    const error = await fixture.reader.list().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(JSON.stringify(error)).not.toContain('driver-secret');
    expect(fixture.query).toHaveBeenCalledTimes(1);
  });
});
