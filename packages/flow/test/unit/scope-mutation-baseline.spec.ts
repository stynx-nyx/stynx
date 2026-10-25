import { BadRequestException, NotFoundException } from '@nestjs/common';
import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowDesignService } from '../../src/flow-design.service.js';

const fields = ['code', 'label', 'adapterKey', 'adapterConfig', 'meta'] as const;
const columns = ['code', 'label', 'adapter_key', 'adapter_config', 'meta'];
const now = new Date('2026-10-24T12:34:56.789Z');
function fixture(rows: Record<string, unknown>[] = [{ scope_id: 'opaque-result' }]) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows }));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) =>
    executeGuardedQueryRows({ query }, statement, params, guard);
  const trx = { query, run, runGuarded };
  const tx = vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => fn(trx));
  const context = { tenantId: 'opaque-tenant', actorId: 'opaque-actor' as string | null | undefined };
  return { query, tx, context, service: new FlowDesignService({ tx } as never, context as never) };
}
function values() {
  const opaque = { nested: { date: new Date(NaN), bigint: 9n }, array: [undefined] };
  return { code: 'scope', label: 'Label', adapterKey: 'adapter', adapterConfig: opaque, meta: opaque };
}
describe('Scope public parser and thirty-five mutation shapes', () => {
  afterEach(() => vi.useRealTimers());
  for (let mask = 0; mask < 4; mask++) {
    it(`captures create optional mask ${mask} with original column and bind order`, async () => {
      const source = values();
      const input: Record<string, unknown> = { code: ' scope ', label: ' Label ', adapterKey: ' adapter ' };
      const selected = [0, 1, 2];
      if (mask & 1) { input.adapterConfig = source.adapterConfig; selected.push(3); }
      if (mask & 2) { input.meta = source.meta; selected.push(4); }
      const h = fixture();
      expect(await h.service.createScope(input)).toEqual({ scopeId: 'opaque-result' });
      const names = ['tenant_id', ...selected.map(index => columns[index]), 'created_by', 'updated_by'];
      const sql = `insert into flow.scopes (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning *`;
      const params = ['opaque-tenant', ...selected.map(index => source[fields[index]!]), 'opaque-actor', 'opaque-actor'];
      expect(h.query).toHaveBeenCalledExactlyOnceWith(sql, params);
      expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
      if (mask & 1) expect(Reflect.get(h.query.mock.calls[0]![1]![4]!, 'nested')).toBe(source.adapterConfig.nested);
      console.log('FLOW_SCOPE35_BASELINE ' + JSON.stringify({ operation: 'create', mask, sql, columns: names }));
    });
  }
  for (let mask = 1; mask < 32; mask++) {
    it(`captures update mask ${mask} including audit fields and opaque identifier`, async () => {
      vi.useFakeTimers(); vi.setSystemTime(now);
      const source = values(); const input: Record<string, unknown> = {};
      const selected = fields.map((_, index) => index).filter(index => Boolean(mask & (1 << index)));
      for (const index of [...selected].reverse()) input[fields[index]!] = source[fields[index]!];
      const h = fixture(); expect(await h.service.updateScope('opaque-id', input)).toEqual({ scopeId: 'opaque-result' });
      const names = [...selected.map(index => columns[index]), 'updated_by', 'updated_at'];
      const sql = `update flow.scopes set ${names.map((name, index) => `${name} = $${index + 2}`).join(', ')} where id = $1::uuid returning *`;
      const params = ['opaque-id', ...selected.map(index => source[fields[index]!]), 'opaque-actor', now];
      expect(h.query).toHaveBeenCalledExactlyOnceWith(sql, params);
      expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
      console.log('FLOW_SCOPE35_BASELINE ' + JSON.stringify({ operation: 'update', mask, sql, columns: names }));
    });
  }
  it.each([{}, { code: undefined, meta: undefined }, { extra: true }])('retains empty parsed update refusal without SQL: %j', async input => {
    const h = fixture(); const error = await h.service.updateScope('opaque-id', input).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(BadRequestException); expect(error).toMatchObject({ message: 'At least one update field is required' });
    expect(h.tx).toHaveBeenCalledTimes(1); expect(h.query).not.toHaveBeenCalled();
  });
  it('drops own undefined and unknown fields while trimming present text', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const h = fixture(); await h.service.updateScope('id', { code: ' code ', label: undefined, meta: undefined, ignored: 'value' });
    expect(h.query).toHaveBeenCalledExactlyOnceWith('update flow.scopes set code = $2, updated_by = $3, updated_at = $4 where id = $1::uuid returning *', ['id', 'code', 'opaque-actor', now]);
    const create = fixture(); await create.service.createScope({ code: 'a', label: 'b', adapterKey: 'c', adapterConfig: undefined, meta: undefined, extra: true });
    expect(create.query).toHaveBeenCalledExactlyOnceWith('insert into flow.scopes (tenant_id, code, label, adapter_key, created_by, updated_by) values ($1, $2, $3, $4, $5, $6) returning *', ['opaque-tenant', 'a', 'b', 'c', 'opaque-actor', 'opaque-actor']);
  });
  it.each([null, [], '', { code: '' }, { code: 4 }, { adapterConfig: null }, { meta: [] }])('rejects malformed update before transaction: %j', input => {
    const h = fixture(); expect(() => h.service.updateScope('id', input)).toThrow(BadRequestException);
    expect(h.tx).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
  });
  it('requires the three create fields before transaction', () => {
    const h = fixture(); expect(() => h.service.createScope({ code: 'a', label: 'b' })).toThrow(BadRequestException);
    expect(h.tx).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
  });
  it('preserves context read order, nullish actors and tenant refusal', async () => {
    const h = fixture(); const reads: string[] = [];
    Object.defineProperty(h.context, 'tenantId', { get() { reads.push('tenant'); return 'tenant'; } });
    Object.defineProperty(h.context, 'actorId', { get() { reads.push('actor'); return undefined; } });
    await h.service.createScope({ code: 'a', label: 'b', adapterKey: 'c' });
    expect(reads).toEqual(['tenant', 'actor']); expect(h.query.mock.calls[0]?.[1]).toEqual(['tenant', 'a', 'b', 'c', null, null]);
    const missing = fixture(); missing.context.tenantId = '';
    await expect(missing.service.createScope({ code: 'a', label: 'b', adapterKey: 'c' })).rejects.toMatchObject({ message: 'Tenant context is required' });
    expect(missing.query).not.toHaveBeenCalled();
  });
  it('retains first row, own-key and nested identity with unused metadata untouched', async () => {
    const nested = { opaque: 1n }; const row = { nested_value: nested };
    Object.defineProperty(row, '__proto__', { enumerable: true, value: nested });
    const h = fixture([row, { ignored: true }]); const count = vi.fn(() => { throw new Error('unused'); });
    h.query.mockResolvedValueOnce({ rows: [row, { ignored: true }], get rowCount() { return count(); } });
    const result = await h.service.createScope({ code: 'a', label: 'b', adapterKey: 'c' });
    expect(result.nestedValue).toBe(nested); expect(Object.hasOwn(result, '_Proto__')).toBe(true); expect(result._Proto__).toBe(nested); expect(count).not.toHaveBeenCalled();
  });
  it('retains distinct empty-row domain errors and driver rejection identity', async () => {
    const create = fixture([]); await expect(create.service.createScope({ code: 'a', label: 'b', adapterKey: 'c' })).rejects.toMatchObject({ message: 'Flow insert did not return a row' });
    const update = fixture([]); await expect(update.service.updateScope('id', { label: 'b' })).rejects.toBeInstanceOf(NotFoundException);
    const error = new Error('driver'); const h = fixture(); h.query.mockRejectedValueOnce(error);
    await expect(h.service.updateScope('id', { label: 'b' })).rejects.toBe(error); expect(h.query).toHaveBeenCalledTimes(1);
  });
});
