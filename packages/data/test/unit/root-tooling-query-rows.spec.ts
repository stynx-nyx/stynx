import { z } from 'zod';
import { executeRootToolingQueryRows, executeGuardedQueryRows, executeRootDatabaseOperation } from '../../src/checked-executor.js';
import { QueryArgumentError, QueryRowValidationError } from '../../src/errors.js';
import { defineQuery, sql } from '../../src/typed-query.js';

const many = defineQuery({ name: 'root-tooling.snapshot', text: sql`select id where name = $1`, params: z.tuple([z.string()]), row: z.object({ id: z.string().transform((value) => value.toUpperCase()), flag: z.boolean().default(true) }), expects: 'many' });
const one = defineQuery({ name: 'root-tooling.one', text: sql`select id where name = $1`, params: z.tuple([z.string()]), row: z.object({ id: z.string() }), expects: 'one' });
const isRow = (value: unknown): value is { id: string } => typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value && typeof value.id === 'string';
const port = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) });
async function rejectsRow(promise: Promise<unknown>, rowIndex: number) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(QueryRowValidationError);
  expect(error).toMatchObject({ rowIndex });
  expect(JSON.stringify(error)).not.toContain('driver-secret');
}

describe('private root-tooling captured evidence and independently guarded snapshot', () => {
  it('preserves original array, raw row and opaque keys while freezing only a new dense snapshot', async () => {
    const nested = {}; const original = { id: 'lower', nested }; Object.defineProperty(original, '__proto__', { value: nested, enumerable: true });
    const rows = [original]; const client = port(rows); const guard = vi.fn(isRow);
    const result = await executeRootToolingQueryRows(client, many, ['bind'], guard);
    expect(result.originalRows).toBe(rows); expect(result.rows).not.toBe(rows); expect(result.rows[0]).toBe(original);
    expect(result.rows[0]).toHaveProperty('id', 'lower'); expect(Object.hasOwn(result.rows[0]!, 'flag')).toBe(false);
    expect(Object.getOwnPropertyDescriptor(result.rows[0]!, '__proto__')?.value).toBe(nested);
    expect(Object.isFrozen(result.rows)).toBe(true); expect(Object.isFrozen(rows)).toBe(false);
    expect(guard).toHaveBeenCalledExactlyOnceWith(original); expect(client.query).toHaveBeenCalledExactlyOnceWith(many.text, ['bind']);
    rows.push({ id: 'later', nested }); expect(result.originalRows).toHaveLength(2); expect(result.rows).toHaveLength(1);
  });
  for (const index of [0, 1, 2]) it(`rejects sparse row ${index} before independent guard`, async () => {
    const rows: unknown[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; delete rows[index]; const guard = vi.fn(isRow); const client = port(rows);
    await rejectsRow(executeRootToolingQueryRows(client, many, ['bind'], guard), index);
    expect(guard).not.toHaveBeenCalled(); expect(client.query).toHaveBeenCalledTimes(1);
  });
  for (const firstValid of [true, false]) it(`captures rows once with first valid ${firstValid}`, async () => {
    const original = { id: 'a' }; const valid = [original]; const invalid = ['driver-secret']; let reads = 0;
    const client = { query: vi.fn(async () => ({ get rows() { return (++reads === 1) === firstValid ? valid : invalid; } })) };
    const pending = executeRootToolingQueryRows(client, many, ['bind'], isRow);
    if (firstValid) { const result = await pending; expect(result.originalRows).toBe(valid); expect(result.rows[0]).toBe(original); }
    else await rejectsRow(pending, 0);
    expect(reads).toBe(1); expect(client.query).toHaveBeenCalledTimes(1);
  });
  it('uses the same once-read indexed reference for schema and raw guard, while evidence stays honestly mutable', async () => {
    const original = { id: 'first' }; const later = { id: 'later' }; let reads = 0; const rows: unknown[] = [];
    Object.defineProperty(rows, 0, { get() { return ++reads === 1 ? original : later; } });
    const guard = vi.fn(isRow); const result = await executeRootToolingQueryRows(port(rows), many, ['bind'], guard);
    expect(reads).toBe(1); expect(result.rows[0]).toBe(original); expect(guard).toHaveBeenCalledExactlyOnceWith(original);
    expect(result.originalRows).toBe(rows); expect(result.originalRows[0]).toBe(later); expect(reads).toBe(2);
  });
  it('never invokes driver-owned map, entries, iterator or species', async () => {
    const rows: unknown[] = [{ id: 'a' }]; const forbidden = vi.fn(() => { throw new Error('driver methods'); });
    for (const key of ['map', 'entries', Symbol.iterator]) Object.defineProperty(rows, key, { value: forbidden });
    Object.defineProperty(rows, 'constructor', { value: { get [Symbol.species]() { return forbidden(); } } });
    const result = await executeRootToolingQueryRows(port(rows), many, ['bind'], isRow);
    expect(result.rows).toEqual([{ id: 'a' }]); expect(result.originalRows).toBe(rows); expect(forbidden).not.toHaveBeenCalled();
  });
  it('rejects a malformed real row despite a malicious map returning safe rows', async () => {
    const rows: unknown[] = ['driver-secret']; const map = vi.fn(() => [{ id: 'safe' }]); Object.defineProperty(rows, 'map', { value: map });
    await rejectsRow(executeRootToolingQueryRows(port(rows), many, ['bind'], isRow), 0); expect(map).not.toHaveBeenCalled();
  });
  it('does not let Proxy has hide an invalid present index', async () => {
    const has = vi.fn(() => false); const rows = new Proxy<unknown[]>([{ id: 'a' }, 'driver-secret'], { has });
    await rejectsRow(executeRootToolingQueryRows(port(rows), many, ['bind'], isRow), 1); expect(has).not.toHaveBeenCalled();
  });
  it('captures initial length and ascending indices once', async () => {
    const order: string[] = []; const original = { id: 'a' }; const rows: unknown[] = [];
    Object.defineProperty(rows, 0, { get() { order.push('0'); rows.push({ id: 'appended' }); return original; } });
    const proxy = new Proxy(rows, { get(target, key, receiver) { if (key === 'length') order.push('length'); return Reflect.get(target, key, receiver); } });
    const result = await executeRootToolingQueryRows(port(proxy), many, ['bind'], isRow);
    expect(result.rows).toEqual([original]); expect(order).toEqual(['length', '0']); expect(result.originalRows).toBe(proxy);
  });
  it('keeps row-only metadata untouched and getter/driver failure identity', async () => {
    const error = new Error('metadata'); const metadata = vi.fn(() => { throw error; });
    const client = { query: vi.fn(async () => ({ rows: [{ id: 'a' }], get rowCount() { return metadata(); } })) };
    expect((await executeRootToolingQueryRows(client, many, ['bind'], isRow)).rows).toHaveLength(1); expect(metadata).not.toHaveBeenCalled();
    await expect(executeRootToolingQueryRows({ query: async () => ({ get rows() { throw error; } }) }, many, ['bind'], isRow)).rejects.toBe(error);
    await expect(executeRootToolingQueryRows({ query: async () => { throw error; } }, many, ['bind'], isRow)).rejects.toBe(error);
  });
  it('retains complete independent guard rejection and exception identity', async () => {
    const guard = vi.fn((_value: unknown): _value is { id: string } => false); const client = port([{ id: 'a' }]);
    await rejectsRow(executeRootToolingQueryRows(client, many, ['bind'], guard), 0); expect(guard).toHaveBeenCalledTimes(1);
    const error = new Error('guard'); await expect(executeRootToolingQueryRows(client, many, ['bind'], (_value: unknown): _value is { id: string } => { throw error; })).rejects.toBe(error);
  });
  it('rejects wrong cardinality and invalid parameters before SQL', async () => {
    const client = port([]);
    // @ts-expect-error Private root tooling accepts only many cardinality.
    await expect(executeRootToolingQueryRows(client, one, ['bind'], isRow)).rejects.toBeInstanceOf(TypeError);
    // @ts-expect-error Runtime refusal is required for malformed untyped callers too.
    await expect(executeRootToolingQueryRows(client, many, [12], isRow)).rejects.toBeInstanceOf(QueryArgumentError);
    expect(client.query).not.toHaveBeenCalled();
  });
  it('retains empty evidence identity and leaves public guarded output a frozen copy', async () => {
    const rows: unknown[] = []; const result = await executeRootToolingQueryRows(port(rows), many, ['bind'], isRow);
    expect(result.originalRows).toBe(rows); expect(result.rows).toEqual([]); expect(Object.isFrozen(result.rows)).toBe(true);
    const publicRows = await executeGuardedQueryRows(port(rows), many, ['bind'], isRow); expect(publicRows).not.toBe(rows); expect(Object.isFrozen(publicRows)).toBe(true);
  });
});

describe('closed root database lifecycle operations', () => {
  const database = 'stynx_storage_generation_0123456789abcdef0123456789abcdef';
  const cases = [
    ['offline-catalog-create', database, `create database "${database}"`],
    ['outbox-catalog-create', database, `create database "${database}"`],
    ['offline-catalog-drop-force', database, `drop database if exists "${database}" with (force)`],
    ['outbox-catalog-drop-force', database, `drop database if exists "${database}" with (force)`],
    ['integration-template-drop', 'test_template', 'drop database if exists "test_template"'],
    ['integration-template-create', 'test_template', 'create database "test_template"'],
  ] as const;
  for (const [operation, name, text] of cases) {
    it(`executes exactly the original one-argument SQL for ${operation}`, async () => {
      const result = { get rows() { throw new Error('unused rows'); }, get rowCount() { throw new Error('unused count'); } };
      const client = { query: vi.fn(async function (this: unknown) { expect(this).toBe(client); return result; }) };
      await expect(executeRootDatabaseOperation(client, operation, name)).resolves.toBeUndefined();
      expect(client.query).toHaveBeenCalledExactlyOnceWith(text);
      const sentinel = new Error('native driver'); client.query.mockRejectedValueOnce(sentinel);
      await expect(executeRootDatabaseOperation(client, operation, name)).rejects.toBe(sentinel);
      expect(client.query).toHaveBeenCalledTimes(2);
    });
    it(`rejects invalid database text before ${operation}`, async () => {
      const client = port([]);
      for (const value of ['', 'x";drop database postgres;--', 'UPPER', null, undefined, 1, {}]) {
        await expect(Reflect.apply(executeRootDatabaseOperation, undefined, [client, operation, value])).rejects.toBeInstanceOf(TypeError);
      }
      expect(client.query).not.toHaveBeenCalled();
    });
  }
  it('rejects an unknown operation before any native client call', async () => {
    const client = port([]);
    await expect(Reflect.apply(executeRootDatabaseOperation, undefined, [client, 'arbitrary-operation', database])).rejects.toThrow('Unknown root database lifecycle operation');
    expect(client.query).not.toHaveBeenCalled();
  });
  it('keeps template trailing-argument String(undefined) separate from an undefined API argument', async () => {
    const client = port([]);
    await executeRootDatabaseOperation(client, 'integration-template-create', 'undefined');
    expect(client.query).toHaveBeenCalledExactlyOnceWith('create database "undefined"');
    await expect(Reflect.apply(executeRootDatabaseOperation, undefined, [client, 'integration-template-create', undefined])).rejects.toBeInstanceOf(TypeError);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
