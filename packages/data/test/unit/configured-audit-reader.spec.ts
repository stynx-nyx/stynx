import { executeConfiguredQuery } from '../../src/checked-executor.js';
import { QueryRowValidationError } from '../../src/errors.js';

const identifiers = { schema: 'audit', table: 'logged_actions' };
const valid = () => ({ occurred_at: 'opaque timestamp', op: 'UPDATE', schema_name: 'app', table_name: 'items', total: '1' });
function run(response: unknown) {
  const query = vi.fn(async () => response);
  return { query, result: executeConfiguredQuery({ query }, 'audit.read-porm.mask.0', identifiers, [100, 0]) };
}

describe('closed configured audit reader result envelope', () => {
  it.each([undefined, null, {}, { rows: null }, { rows: undefined }, { rows: {} }, { rows: 'wrong' }, 3, 'value', false])('retains empty-wrapper fallback for %s', async (wrapper) => {
    const { result, query } = run(wrapper);
    await expect(result).resolves.toEqual({ rows: [], rowCount: null });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('short circuits bare arrays without looking up rows or rowCount', async () => {
    const rows = [valid()];
    const read = vi.fn(() => { throw new Error('unused metadata'); });
    Object.defineProperties(rows, { rows: { get: read }, rowCount: { get: read } });
    await expect(run(rows).result).resolves.toMatchObject({ rows: [valid()], rowCount: null });
    expect(read).not.toHaveBeenCalled();
  });

  it('uses an inherited getter once with its original function receiver and never reads rowCount', async () => {
    const rows = [valid()];
    const receivers: unknown[] = [];
    const wrapper = () => undefined;
    const rowCount = vi.fn(() => { throw new Error('unused count'); });
    Object.setPrototypeOf(wrapper, Object.create(Function.prototype, {
      rows: { get() { receivers.push(this); return rows; } },
      rowCount: { get: rowCount },
    }));
    await expect(run(wrapper).result).resolves.toMatchObject({ rows: [valid()], rowCount: null });
    expect(receivers).toEqual([wrapper]);
    expect(rowCount).not.toHaveBeenCalled();
  });

  it('performs one proxy Get and no Has operation', async () => {
    const reads: PropertyKey[] = [];
    const has = vi.fn(() => { throw new Error('unexpected has'); });
    const target = { rows: [valid()] };
    const wrapper = new Proxy(target, {
      get(object, key, receiver) { reads.push(key); expect(receiver).toBe(wrapper); return Reflect.get(object, key, receiver); },
      has,
    });
    await expect(run(wrapper).result).resolves.toMatchObject({ rows: [valid()], rowCount: null });
    // Promise resolution also checks then before the executor receives the value.
    expect(reads.filter((key) => key !== 'then')).toEqual(['rows']);
    expect(has).not.toHaveBeenCalled();
  });

  it('boxes a primitive while retaining the primitive receiver for the rows getter', async () => {
    const original = Object.getOwnPropertyDescriptor(Number.prototype, 'rows');
    const receivers: unknown[] = [];
    Object.defineProperty(Number.prototype, 'rows', { configurable: true, get() { receivers.push(this); return [valid()]; } });
    try {
      await expect(run(7).result).resolves.toMatchObject({ rows: [valid()], rowCount: null });
      expect(receivers).toEqual([7]);
    } finally {
      if (original) Object.defineProperty(Number.prototype, 'rows', original);
      else Reflect.deleteProperty(Number.prototype, 'rows');
    }
  });

  it('retains a throwing rows getter error and does not touch rowCount', async () => {
    const failure = new Error('rows getter sentinel');
    const rows = vi.fn(() => { throw failure; });
    const rowCount = vi.fn(() => { throw new Error('not read'); });
    await expect(run({ get rows() { return rows(); }, get rowCount() { return rowCount(); } }).result).rejects.toBe(failure);
    expect(rows).toHaveBeenCalledTimes(1);
    expect(rowCount).not.toHaveBeenCalled();
  });

  it.each([null, undefined, true, 3, 'private-driver-secret', [], {}, { ...valid(), occurred_at: {} }, { ...valid(), op: false }, { ...valid(), request_id: 3 }, { ...valid(), total: {} }, { ...valid(), old_data: () => undefined }])('rejects a malformed present second row: %s', async (bad) => {
    const query = vi.fn(async () => ({ rows: [valid(), bad] }));
    const failure = await executeConfiguredQuery({ query }, 'audit.read-porm.mask.0', identifiers, [100, 0]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryRowValidationError);
    expect(failure).toMatchObject({ rowIndex: 1 });
    expect(JSON.stringify(failure)).not.toContain('private-driver-secret');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves original nested opaque payloads through row validation', async () => {
    const payload = { nested: { date: new Date(NaN), big: 1n }, absent: undefined };
    const proto = { identity: true };
    Object.defineProperty(payload, '__proto__', { enumerable: true, value: proto });
    const result = await run({ rows: [{ ...valid(), old_data: payload, new_data: [payload] }] }).result;
    expect(result.rows[0]?.old_data).toBe(payload);
    const array = result.rows[0]?.new_data;
    expect(Array.isArray(array)).toBe(true);
    if (!Array.isArray(array)) throw new Error('Expected original array');
    expect(array[0]).toBe(payload);
    expect(Reflect.get(payload, '__proto__')).toBe(proto);
  });

  it('does not certify a sparse driver row array as fully validated', async () => {
    const rows = [valid()];
    rows.length = 2;
    const { query, result } = run({ rows });
    const failure = await result.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryRowValidationError);
    expect(failure).toMatchObject({ rowIndex: 1 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reads legitimate row element getters once in ascending order before returning', async () => {
    const order: number[] = [];
    const rows = [valid(), valid()];
    Object.defineProperty(rows, '0', { get() { order.push(0); return valid(); } });
    Object.defineProperty(rows, '1', { get() { order.push(1); return valid(); } });
    const { query, result } = run({ rows });
    await expect(result).resolves.toEqual({ rows: [valid(), valid()], rowCount: null });
    expect(order).toEqual([0, 1]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves element getter errors and stops before later rows or metadata', async () => {
    const failure = new Error('element getter sentinel');
    const order: number[] = [];
    const rows = [valid(), valid(), valid()];
    Object.defineProperty(rows, '0', { get() { order.push(0); return valid(); } });
    Object.defineProperty(rows, '1', { get() { order.push(1); throw failure; } });
    Object.defineProperty(rows, '2', { get() { order.push(2); return valid(); } });
    const metadata = vi.fn(() => { throw new Error('unused metadata'); });
    const { query, result } = run({ rows, get rowCount() { return metadata(); } });
    await expect(result).rejects.toBe(failure);
    expect(order).toEqual([0, 1]);
    expect(metadata).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('cannot bypass malformed-row validation using an overridden map method', async () => {
    const rows = [valid(), { occurred_at: { private: 'driver-secret' } }];
    const map = vi.fn(() => []);
    Object.defineProperty(rows, 'map', { value: map });
    const error = await run({ rows }).result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(map).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain('driver-secret');
  });

  it('cannot substitute valid rows using an overridden iterator', async () => {
    const rows = [valid(), { occurred_at: false }];
    const iterator = vi.fn(function* () { yield valid(); });
    Object.defineProperty(rows, Symbol.iterator, { value: iterator });
    const error = await run({ rows }).result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(iterator).not.toHaveBeenCalled();
  });

  it('does not let a Proxy has trap hide a malformed array index', async () => {
    const has = vi.fn(() => false);
    const rows = new Proxy([valid(), { occurred_at: false }], { has });
    const error = await run({ rows }).result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(has).not.toHaveBeenCalled();
  });

  it('uses a fresh validated array without consulting source array species', async () => {
    const rows = [valid()];
    const species = vi.fn(() => { throw new Error('source species must not run'); });
    Object.defineProperty(rows, 'constructor', { value: { get [Symbol.species]() { return species(); } } });
    const result = await run({ rows }).result;
    expect(result).toEqual({ rows: [valid()], rowCount: null });
    expect(result.rows).not.toBe(rows);
    expect(species).not.toHaveBeenCalled();
  });

  it('captures the original array length before invoking row getters', async () => {
    const rows: unknown[] = [valid()];
    const element = vi.fn(() => { rows.push({ occurred_at: false }); return valid(); });
    Object.defineProperty(rows, '0', { get: element });
    const result = await run({ rows }).result;
    expect(result).toEqual({ rows: [valid()], rowCount: null });
    expect(rows).toHaveLength(2);
    expect(element).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, {}, { rows: null }, { rows: 'wrong' }, () => undefined, 7])('does not grant audit empty-wrapper normalization to non-audit readers: %s', async (response) => {
    const query = vi.fn(async () => response);
    const result = executeConfiguredQuery({ query }, 'idempotency.lookup', {
      table: 'integration.idempotency_keys', tenantColumn: 'tenant_id', keyColumn: 'idem_key',
      fingerprintColumn: 'request_fingerprint', statusCodeColumn: 'status_code', bodyColumn: 'response_body', expiresAtColumn: 'expires_at',
    }, ['11111111-1111-1111-1111-111111111111', 'key']);
    await expect(result).rejects.toBeInstanceOf(QueryRowValidationError);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
