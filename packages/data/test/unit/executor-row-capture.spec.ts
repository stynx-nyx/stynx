import { z } from 'zod';
import { createFakeTransaction } from '@stynx-nyx/testing';
import {
  executeGuardedQueryRows,
  executeLegacyArchive,
  executeTypedCommand,
  executeTypedQuery,
  executeTypedQueryResult,
} from '../../src/checked-executor.js';
import { QueryRowValidationError } from '../../src/errors.js';
import { defineQuery, sql } from '../../src/typed-query.js';

const many = defineQuery({ name: 'capture.many', text: sql`select id`, params: z.tuple([]), row: z.object({ id: z.string().transform((value) => value.toUpperCase()), flag: z.boolean().default(true) }), expects: 'many' });
const one = defineQuery({ name: 'capture.one', text: sql`select id`, params: z.tuple([]), row: z.object({ id: z.string() }), expects: 'one' });
const optional = defineQuery({ name: 'capture.optional', text: sql`select id`, params: z.tuple([]), row: z.object({ id: z.string() }), expects: 'zero-or-one' });
const command = defineQuery({ name: 'capture.command', text: sql`delete from capture`, params: z.tuple([]), row: z.object({}), expects: 'none' });
const isRow = (value: unknown): value is { id: string } => typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
const port = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) });
async function rejectsRow(promise: Promise<unknown>, index: number) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(QueryRowValidationError);
  expect(error).toMatchObject({ rowIndex: index });
  expect(JSON.stringify(error)).not.toContain('driver-secret');
}

describe('executor captures and validates every original row', () => {
  for (const index of [0, 1, 2]) {
    it(`typed many refuses sparse index ${index}`, async () => {
      const rows: unknown[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; delete rows[index];
      const client = port(rows);
      await rejectsRow(executeTypedQuery(client, many, []), index);
      expect(client.query).toHaveBeenCalledExactlyOnceWith(many.text, []);
    });
    for (const operation of ['count-blocking-children', 'select'] as const) {
      it(`archive ${operation} refuses sparse index ${index}`, async () => {
        const rows: unknown[] = [{ count: '1' }, { count: '2' }, { count: '3' }]; delete rows[index];
        const client = port(rows); const validate = vi.fn((row: Record<string, unknown>) => row);
        await rejectsRow(executeLegacyArchive(client, operation, 'archive sql', [], validate), index);
        expect(client.query).toHaveBeenCalledExactlyOnceWith('archive sql', []);
        expect(validate).toHaveBeenCalledTimes(operation === 'select' ? index : 0);
      });
    }
  }
  for (const definition of [one, optional]) {
    it(`${definition.expects} refuses a length-one hole`, async () => {
      await rejectsRow(executeTypedQuery(port(new Array<unknown>(1)), definition, []), 0);
    });
  }
  it('result rejects holes before reading metadata', async () => {
    const metadata = vi.fn(() => 1);
    const client = { query: vi.fn(async () => ({ rows: new Array<unknown>(1), get rowCount() { return metadata(); } })) };
    await rejectsRow(executeTypedQueryResult(client, many, []), 0);
    expect(metadata).not.toHaveBeenCalled();
  });
  for (const kind of ['typed', 'archive-count', 'archive-select'] as const) {
    it(`${kind} never delegates validation to own map`, async () => {
      const rows: unknown[] = ['driver-secret']; const map = vi.fn(() => []);
      Object.defineProperty(rows, 'map', { value: map });
      const client = port(rows); const validate = vi.fn((row: Record<string, unknown>) => row);
      const result = kind === 'typed' ? executeTypedQuery(client, many, []) : executeLegacyArchive(client, kind === 'archive-count' ? 'count-blocking-children' : 'select', 'archive sql', [], validate);
      await rejectsRow(result, 0);
      expect(map).not.toHaveBeenCalled(); expect(validate).not.toHaveBeenCalled();
    });
  }
  for (const mode of ['omit', 'substitute'] as const) {
    it(`guarded rows ignore own entries that ${mode} original values`, async () => {
      const original = { id: 'safe' }; const rows: unknown[] = [original];
      const entries = vi.fn(() => (mode === 'omit' ? [] : [[0, { id: 'replacement' }]]).values());
      Object.defineProperty(rows, 'entries', { value: entries });
      const guard = vi.fn(isRow); const result = await executeGuardedQueryRows(port(rows), many, [], guard);
      expect(result).toHaveLength(1); expect(result[0]).toBe(original);
      expect(guard).toHaveBeenCalledExactlyOnceWith(original); expect(entries).not.toHaveBeenCalled();
      expect(result).not.toBe(rows); expect(Object.isFrozen(result)).toBe(true);
    });
  }
  for (const kind of ['typed', 'guarded', 'archive'] as const) {
    for (const firstValid of [true, false]) {
      it(`${kind} captures result.rows once when first valid is ${firstValid}`, async () => {
        const original = { id: 'safe', count: '1' }; let reads = 0;
        const valid = [original]; const invalid = ['driver-secret'];
        const client = { query: vi.fn(async () => ({ get rows() { reads++; return (reads === 1) === firstValid ? valid : invalid; } })) };
        const result = kind === 'typed' ? executeTypedQuery(client, many, []) : kind === 'guarded' ? executeGuardedQueryRows(client, many, [], isRow) : executeLegacyArchive(client, 'count-blocking-children', 'archive sql');
        if (!firstValid) await rejectsRow(result, 0);
        else {
          const value = await result;
          if (kind === 'typed') expect(value).toEqual([{ id: 'SAFE', flag: true }]);
          if (kind === 'guarded') expect(value).toEqual([original]);
          if (kind === 'archive') expect(value).toEqual({ rows: [{ count: '1' }], rowCount: null });
        }
        expect(reads).toBe(1); expect(client.query).toHaveBeenCalledTimes(1);
      });
    }
  }
  it('independent guard sees the exact indexed value already schema-validated', async () => {
    const original = { id: 'first' }; const replacement = { id: 'later' }; let reads = 0;
    const rows: unknown[] = [];
    Object.defineProperty(rows, 0, { get() { return ++reads === 1 ? original : replacement; } });
    const guard = vi.fn(isRow); const value = await executeGuardedQueryRows(port(rows), many, [], guard);
    expect(reads).toBe(1); expect(value[0]).toBe(original); expect(guard).toHaveBeenCalledExactlyOnceWith(original);
  });
  it('does not invoke driver-owned iterator or species for parsed outputs', async () => {
    const rows: unknown[] = [{ id: 'a' }]; const iterator = vi.fn(() => { throw new Error('iterator'); }); const species = vi.fn(() => { throw new Error('species'); });
    Object.defineProperty(rows, Symbol.iterator, { value: iterator });
    Object.defineProperty(rows, 'constructor', { value: { get [Symbol.species]() { return species(); } } });
    expect(await executeTypedQuery(port(rows), many, [])).toEqual([{ id: 'A', flag: true }]);
    expect(iterator).not.toHaveBeenCalled(); expect(species).not.toHaveBeenCalled();
  });
  it('Transaction.run propagates sparse row refusal through the actual executor', async () => {
    const { transaction: tx } = createFakeTransaction([{ rows: new Array<Record<string, unknown>>(1), rowCount: 1 }], { role: 'app' });
    await rejectsRow(tx.run(many, []), 0);
  });
  it('Transaction.runGuarded retains original values despite own entries', async () => {
    const original = { id: 'a' }; const rows = [original]; const entries = vi.fn(() => [].values());
    Object.defineProperty(rows, 'entries', { value: entries });
    const { transaction: tx } = createFakeTransaction([{ rows, rowCount: 1 }], { role: 'app' });
    const value = await tx.runGuarded(many, [], isRow);
    expect(value[0]).toBe(original); expect(entries).not.toHaveBeenCalled();
  });
  it('dense parsed transformations and independent guarded identities remain distinct', async () => {
    const nested = {}; const original = { id: 'a', nested }; const rows = [original];
    const parsed = await executeTypedQuery(port(rows), many, []);
    expect(parsed).toEqual([{ id: 'A', flag: true }]); expect(Object.isFrozen(parsed)).toBe(true);
    const guarded = await executeGuardedQueryRows(port(rows), many, [], isRow);
    expect(guarded[0]).toBe(original); expect(original.nested).toBe(nested);
    expect(guarded).not.toBe(rows); expect(Object.isFrozen(guarded)).toBe(true);
  });
  it('row getter and driver errors retain exact identity', async () => {
    const error = new Error('driver'); const getter = vi.fn(() => { throw error; });
    await expect(executeTypedQuery({ query: async () => ({ get rows() { return getter(); } }) }, many, [])).rejects.toBe(error);
    expect(getter).toHaveBeenCalledTimes(1);
    await expect(executeTypedQuery({ query: async () => { throw error; } }, many, [])).rejects.toBe(error);
  });
  it('row-only paths never read metadata and metadata paths read it once', async () => {
    const metadata = vi.fn(() => 17); const client = { query: vi.fn(async () => ({ rows: [{ id: 'a' }], get rowCount() { return metadata(); } })) };
    await executeTypedQuery(client, many, []); await executeGuardedQueryRows(client, many, [], isRow);
    expect(metadata).not.toHaveBeenCalled();
    expect((await executeTypedQueryResult(client, many, [])).rowCount).toBe(17); expect(metadata).toHaveBeenCalledTimes(1);
    const commandMetadata = vi.fn(() => 23);
    expect(await executeTypedCommand({ query: async () => ({ rows: [], get rowCount() { return commandMetadata(); } }) }, command, [])).toBe(23);
    expect(commandMetadata).toHaveBeenCalledTimes(1);
  });
  it('archive callback retains order, errors and actual count', async () => {
    const validate = vi.fn((row: Record<string, unknown>, index: number) => ({ ...row, index }));
    const value = await executeLegacyArchive({ query: async () => ({ rows: [{ id: 'a' }, { id: 'b' }], rowCount: 7 }) }, 'select', 'archive sql', [], validate);
    expect(value).toEqual({ rows: [{ id: 'a', index: 0 }, { id: 'b', index: 1 }], rowCount: 7 });
    expect(validate.mock.calls.map((call) => call[1])).toEqual([0, 1]);
    const error = new Error('column');
    await expect(executeLegacyArchive(port([{ id: 'a' }]), 'select', 'archive sql', [], () => { throw error; })).rejects.toBe(error);
  });
});
