import { createFakeTransaction } from '@stynx-nyx/testing';
import { z } from 'zod';
import {
  executeGuardedQueryRows,
  executeTypedQuery,
  type CheckedQueryClient,
} from '../../src/checked-executor.js';
import { QueryArgumentError, QueryRowValidationError, TransactionRequiredError } from '../../src/errors.js';
import { defineQuery, sql } from '../../src/typed-query.js';
import * as publicData from '../../src/index.js';

const selection = defineQuery({
  name: 'unit.guarded.selection',
  text: sql`select id from sample.record where group_id = $1`,
  params: z.tuple([z.string().trim().min(1).max(8)]),
  row: z.object({ id: z.string() }),
  expects: 'many',
});

function isIdentified(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

function connection(rows: unknown[]) {
  const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows }));
  const release = vi.fn();
  const client = { query, release } satisfies CheckedQueryClient & { release: typeof release };
  return { client, query, release };
}

describe('independently guarded original query rows', () => {
  it('exports the helper and returns a frozen new collection containing the original proven objects', async () => {
    const opaque = { nested: [undefined, new Date(Number.NaN), Buffer.from('opaque')] };
    const first = Object.freeze({ id: 'one', opaque });
    const second = Object.freeze({ id: 'two' });
    const original = [first, second];
    const { client, query, release } = connection(original);
    const seen: unknown[] = [];
    const guard = (row: unknown): row is { id: string } => {
      seen.push(row);
      return isIdentified(row);
    };
    expect(publicData.executeGuardedQueryRows).toBe(executeGuardedQueryRows);
    const rows = await executeGuardedQueryRows(client, selection, [' group '], guard);
    expect(rows).not.toBe(original);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows[0]).toBe(first);
    expect(rows[1]).toBe(second);
    expect(seen).toEqual(original);
    expect(seen[0]).toBe(first);
    expect(first.opaque).toBe(opaque);
    expect(original).toEqual([first, second]);
    expect(query).toHaveBeenCalledExactlyOnceWith(selection.text, ['group']);
    expect(release).not.toHaveBeenCalled();
  });

  it('admits empty many without inventing a row or invoking its guard', async () => {
    const { client, query } = connection([]);
    const guard = vi.fn(isIdentified);
    const rows = await executeGuardedQueryRows(client, selection, ['group'], guard);
    expect(rows).toEqual([]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(guard).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid arguments before SQL and before any independent guard', async () => {
    const { client, query } = connection([{ id: 'one' }]);
    const guard = vi.fn(isIdentified);
    await expect(executeGuardedQueryRows(client, selection, [''], guard)).rejects.toBeInstanceOf(QueryArgumentError);
    expect(query).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it.each(['one', 'zero-or-one', 'none'] as const)('refuses runtime %s cardinality before touching the driver', async (expects) => {
    const other = defineQuery({ name: 'unit.guarded.other', text: sql`select 1`, params: z.tuple([]), row: z.object({}), expects });
    const { client, query } = connection([]);
    const guard = vi.fn(isIdentified);
    // Deliberate hostile runtime invocation; the public generic must also reject this shape.
    await expect(executeGuardedQueryRows(client, other as never, [], guard)).rejects.toBeInstanceOf(TypeError);
    expect(query).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it('validates all schema rows before exposing any original row to the independent guard', async () => {
    const { client, query } = connection([{ id: 'one' }, { id: { secret: 'driver-secret' } }]);
    const guard = vi.fn(isIdentified);
    const error: unknown = await executeGuardedQueryRows(client, selection, ['group'], guard).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(JSON.stringify(error)).not.toContain('driver-secret');
    expect(guard).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects an independently invalid later row without returning a valid prefix', async () => {
    const first = { id: 'one' };
    const second = { id: 'secret-row' };
    const { client, query } = connection([first, second]);
    const seen: unknown[] = [];
    const guard = (row: unknown): row is { id: string } => {
      seen.push(row);
      return isIdentified(row) && row.id === 'one';
    };
    const exposed = vi.fn();
    const error: unknown = await executeGuardedQueryRows(client, selection, ['group'], guard).then(exposed).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1, issues: [{ path: [], code: 'invalid_type' }] });
    expect(JSON.stringify(error)).not.toContain('secret-row');
    expect(seen).toEqual([first, second]);
    expect(exposed).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retains normal schema transforms and defaults without attributing their output to raw guarded rows', async () => {
    const transformed = defineQuery({
      name: 'unit.guarded.transformed', text: sql`select quantity, status from sample.record`,
      params: z.tuple([]), row: z.object({ quantity: z.string().transform(Number), status: z.string().default('new') }), expects: 'many',
    });
    const raw = { quantity: '12' };
    const normal = connection([raw]);
    const parsed = await executeTypedQuery(normal.client, transformed, []);
    expect(parsed).toEqual([{ quantity: 12, status: 'new' }]);
    expect(parsed[0]).not.toBe(raw);
    expect(raw).toEqual({ quantity: '12' });
    const parsedGuard = (value: unknown): value is { quantity: number; status: string } =>
      typeof value === 'object' && value !== null && 'quantity' in value && typeof value.quantity === 'number' && 'status' in value && typeof value.status === 'string';
    const guarded = connection([raw]);
    await expect(executeGuardedQueryRows(guarded.client, transformed, [], parsedGuard)).rejects.toBeInstanceOf(QueryRowValidationError);
    expect(guarded.query).toHaveBeenCalledTimes(1);
    const rawGuard = (value: unknown): value is { quantity: string } =>
      typeof value === 'object' && value !== null && 'quantity' in value && typeof value.quantity === 'string';
    const originals = await executeGuardedQueryRows(guarded.client, transformed, [], rawGuard);
    expect(originals[0]).toBe(raw);
    expect(originals[0]?.quantity).toBe('12');
    expect(raw).not.toHaveProperty('status');
  });

  it('preserves a driver failure object and never invokes the row guard', async () => {
    const original = new Error('driver failure');
    const query = vi.fn(async () => { throw original; });
    const guard = vi.fn(isIdentified);
    await expect(executeGuardedQueryRows({ query }, selection, ['group'], guard)).rejects.toBe(original);
    expect(query).toHaveBeenCalledTimes(1);
    expect(guard).not.toHaveBeenCalled();
  });

  it('preserves a thrown independent-guard error and never returns a partial collection', async () => {
    const { client, query, release } = connection([{ id: 'one' }, { id: 'two' }]);
    const original = new Error('guard infrastructure failure');
    const guard = vi.fn((_row: unknown): _row is { id: string } => { throw original; });
    const exposed = vi.fn();
    await expect(executeGuardedQueryRows(client, selection, ['group'], guard).then(exposed)).rejects.toBe(original);
    expect(query).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(exposed).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('checks the real Transaction lifetime before even invalid arguments', async () => {
    const fake = createFakeTransaction([{ rows: [{ id: 'one' }], rowCount: 1 }], { role: 'app' });
    const guard = vi.fn(isIdentified);
    fake.transaction.close();
    for (const value of ['', 'group']) {
      await expect(fake.transaction.runGuarded(selection, [value], guard)).rejects.toBeInstanceOf(TransactionRequiredError);
    }
    expect(fake.queries).toEqual([]);
    expect(guard).not.toHaveBeenCalled();
  });

  it('uses the same live Transaction client with checked parameters and original row identity', async () => {
    const row = { id: 'one' };
    const fake = createFakeTransaction([{ rows: [row], rowCount: 1 }], { role: 'app' });
    const guard = vi.fn(isIdentified);
    await expect(fake.transaction.runGuarded(selection, [''], guard)).rejects.toBeInstanceOf(QueryArgumentError);
    expect(fake.queries).toEqual([]);
    expect(guard).not.toHaveBeenCalled();
    const result = await fake.transaction.runGuarded(selection, [' group '], guard);
    expect(result[0]).toBe(row);
    expect(fake.queries).toEqual([{ text: selection.text, values: ['group'] }]);
    expect(guard).toHaveBeenCalledExactlyOnceWith(row);
    fake.transaction.close();
  });
});
