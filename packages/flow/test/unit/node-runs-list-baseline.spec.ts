import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowRuntimeService } from '../../src/flow-runtime.service.js';

const RUN = '0190abcd-1234-7abc-89ab-000000000002';
type Result = { rows: Record<string, unknown>[]; readonly rowCount?: number };
type Step = Result | Error | (() => Promise<Result>);

function makeService(steps: Step[] = [{ rows: [] }, { rows: [] }]) {
  let position = 0;
  const query = vi.fn(async (_text: string, _values?: unknown[]): Promise<Result> => {
    const next = steps[position++];
    if (next === undefined) throw new Error('Unexpected additional query');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard);
  const trx = { query, run, runGuarded };
  const tx = vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => fn(trx));
  const service = new FlowRuntimeService({ tx } as never, {} as never, {} as never);
  return { service, query, tx };
}

function expectedSql(where: string, bindCount: number) {
  return `
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
          ${where}
          order by nr.opened_at desc, nr.id desc
          limit $${bindCount + 1} offset $${bindCount + 2}
        `;
}

describe('NodeRuns four-mask preconversion behavior', () => {
  for (let mask = 0; mask < 4; mask += 1) {
    it(`captures exact data/count SQL, binds and reader transaction for mask ${mask}`, async () => {
      const filters: Record<string, unknown> = { page: 2, pageSize: 3 };
      const values: string[] = [];
      const clauses: string[] = [];
      if (mask & 1) {
        filters.runId = RUN;
        values.push(RUN);
        clauses.push(`nr.run_id = $${values.length}::uuid`);
      }
      if (mask & 2) {
        filters.status = 'open';
        values.push('open');
        clauses.push(`nr.status = $${values.length}`);
      }
      const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
      const { service, query, tx } = makeService([{ rows: [{ node_code: 'code' }] }, { rows: [{ total: '7' }] }]);
      expect(await service.listNodeRuns(filters)).toEqual({ data: [{ nodeCode: 'code' }], meta: { page: 2, pageSize: 3, total: 7 } });
      expect(query.mock.calls).toEqual([
        [expectedSql(where, values.length), [...values, 3, 3]],
        [`select count(*)::text as total from flow.node_runs nr${where}`, values],
      ]);
      expect(tx).toHaveBeenCalledTimes(1);
      expect(tx).toHaveBeenCalledWith(expect.any(Function), { role: 'reader', readonly: true });
      console.log('NODE_RUNS_SQL_BASELINE ' + JSON.stringify({ mask, calls: query.mock.calls }));
    });
  }

  it.each([undefined, null, '', false, 0, [], {}])('omits non-string or empty filters: %s', async (value) => {
    const { service, query } = makeService();
    await service.listNodeRuns({ runId: value, status: value });
    expect(query.mock.calls).toEqual([[expectedSql('', 0), [50, 0]], ['select count(*)::text as total from flow.node_runs nr', []]]);
  });

  it('preserves whitespace and wildcard strings without trimming either filter', async () => {
    const { service, query } = makeService();
    await service.listNodeRuns({ runId: ' ', status: ' %_ ' });
    const where = ' where nr.run_id = $1::uuid and nr.status = $2';
    expect(query.mock.calls).toEqual([[expectedSql(where, 2), [' ', ' %_ ', 50, 0]], [`select count(*)::text as total from flow.node_runs nr${where}`, [' ', ' %_ ']]]);
  });

  it.each([
    { input: {}, page: 1, size: 50, offset: 0 },
    { input: { page: 2.5, pageSize: 3.5 }, page: 2.5, size: 3.5, offset: 5.25 },
    { input: { page: Infinity, pageSize: Infinity }, page: Infinity, size: 100, offset: Infinity },
    { input: { page: -Infinity, pageSize: -Infinity }, page: 1, size: 1, offset: 0 },
    { input: { page: 0, pageSize: 0 }, page: 1, size: 50, offset: 0 },
    { input: { page: NaN, pageSize: NaN }, page: 1, size: 50, offset: 0 },
    { input: { page: '3', pageSize: '4' }, page: 3, size: 4, offset: 8 },
    { input: { page: null, pageSize: null }, page: 1, size: 50, offset: 0 },
    { input: { page: 9007199254740992, pageSize: 101 }, page: 9007199254740992, size: 100, offset: (9007199254740992 - 1) * 100 },
  ])('retains pagination coercion/binds for $input', async ({ input, page, size, offset }) => {
    const { service, query } = makeService();
    expect(await service.listNodeRuns(input)).toEqual({ data: [], meta: { page, pageSize: size, total: 0 } });
    expect(query.mock.calls[0]).toEqual([expectedSql('', 0), [size, offset]]);
    expect(query.mock.calls[1]).toEqual(['select count(*)::text as total from flow.node_runs nr', []]);
  });

  it('reads pagination then filters exactly once before starting the transaction', async () => {
    const reads: string[] = [];
    const { service, query, tx } = makeService();
    const filters = {
      get page() { reads.push('page'); return 2; },
      get pageSize() { reads.push('pageSize'); return 4; },
      get runId() { reads.push('runId'); return RUN; },
      get status() { reads.push('status'); return 'open'; },
    };
    tx.mockImplementationOnce(async (fn) => { reads.push('tx'); return fn({ query, run: (statement, params) => executeTypedQuery({ query }, statement, params), runGuarded: (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard) }); });
    await service.listNodeRuns(filters);
    expect(reads).toEqual(['page', 'pageSize', 'runId', 'status', 'tx']);
  });

  it('keeps opaque nested values and own keys through the existing camelization', async () => {
    const nested = { date: new Date(0), big: 1n, absent: undefined };
    const array = [nested];
    const protoValue = { opaque: true };
    const row = { node_code: 'code', nested_value: nested, array_value: array };
    Object.defineProperty(row, '__proto__', { value: protoValue, enumerable: true });
    const { service } = makeService([{ rows: [row] }, { rows: [{ total: '1' }] }]);
    const result = await service.listNodeRuns();
    expect(result.data).toEqual([{ nodeCode: 'code', nestedValue: nested, arrayValue: array, _Proto__: protoValue }]);
    expect(result.data).toEqual([expect.objectContaining({ nestedValue: expect.any(Object) })]);
    if (!Array.isArray(result.data)) throw new Error('Expected data array');
    const first: unknown = result.data[0];
    if (first === null || typeof first !== 'object') throw new Error('Expected mapped object');
    expect(Reflect.get(first, 'nestedValue')).toBe(nested);
    expect(Reflect.get(first, 'arrayValue')).toBe(array);
    expect(Object.hasOwn(first, '_Proto__')).toBe(true);
    expect(Reflect.get(first, '_Proto__')).toBe(protoValue);
    expect(Reflect.get(row, '__proto__')).toBe(protoValue);
  });

  it.each([
    { rows: [], expected: 0 },
    { rows: [{}], expected: 0 },
    { rows: [{ total: null }], expected: 0 },
    { rows: [{ total: undefined }], expected: 0 },
    { rows: [{ total: '12' }, { total: '999' }], expected: 12 },
    { rows: [{ total: '1.5' }], expected: 1.5 },
    { rows: [{ total: 'Infinity' }], expected: Infinity },
    { rows: [{ total: 'unparsed' }], expected: NaN },
  ])('preserves first/nullish count and Number conversion: $rows', async ({ rows, expected }) => {
    const { service, query } = makeService([{ rows: [] }, { rows }]);
    expect(await service.listNodeRuns()).toEqual({ data: [], meta: { page: 1, pageSize: 50, total: expected } });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('never reads unused rowCount metadata on either query', async () => {
    const unused = vi.fn(() => { throw new Error('unused rowCount'); });
    const data = { rows: [{ node_name: 'name' }], get rowCount(): number { return unused(); } };
    const count = { rows: [{ total: '1' }], get rowCount(): number { return unused(); } };
    const { service, query } = makeService([data, count]);
    expect(await service.listNodeRuns()).toEqual({ data: [{ nodeName: 'name' }], meta: { page: 1, pageSize: 50, total: 1 } });
    expect(unused).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('awaits data before starting count', async () => {
    let release: (value: Result) => void = () => { throw new Error('Not initialized'); };
    const pending = new Promise<Result>((resolve) => { release = resolve; });
    const { service, query } = makeService([() => pending, { rows: [{ total: '0' }] }]);
    const outcome = service.listNodeRuns();
    expect(query).toHaveBeenCalledTimes(1);
    release({ rows: [] });
    await expect(outcome).resolves.toEqual({ data: [], meta: { page: 1, pageSize: 50, total: 0 } });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1])('preserves query error identity and stops at phase %i', async (phase) => {
    const failure = new Error('original driver failure');
    const { service, query } = makeService(phase === 0 ? [failure] : [{ rows: [] }, failure]);
    await expect(service.listNodeRuns()).rejects.toBe(failure);
    expect(query).toHaveBeenCalledTimes(phase + 1);
  });

  it('does not start a transaction when a filter getter throws', () => {
    const failure = new Error('filter getter');
    const { service, tx, query } = makeService();
    expect(() => service.listNodeRuns({ get runId() { throw failure; } })).toThrow(failure);
    expect(tx).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
